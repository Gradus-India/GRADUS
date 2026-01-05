/// <reference lib="deno.ns" />

/**
 * Event Registrations API Edge Function
 * Handles Public Registration and Admin Management
 */
/// <reference lib="deno.ns" />

/**
 * Event Registrations API Edge Function
 * Handles Public Registration and Admin Management
 */
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  // Allow localhost or admin domain. Since credentials are included, explicit origin is required.
  const allowedOrigin = origin || "http://localhost:5173"; 

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

function jsonResponse(data: any, status = 200, cors: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

async function verifyAdminToken(req: Request, supabase: SupabaseClient): Promise<{ admin: any; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { admin: null, error: "No authorization header" };
  const token = authHeader.split(" ")[1];
  
  // 1. Check Supabase Auth
  const { data: supabaseUser } = await supabase.auth.getUser(token);
  if (supabaseUser?.user) {
    const { data: adminData } = await supabase.from("admin_users").select("*").eq("supabase_id", supabaseUser.user.id).single();
    if (adminData) return { admin: adminData };
  }
  
  // 2. Check Legacy JWT
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  try {
    const payload = await verify(token, key);
    if ((payload as any)?.sub) {
      const { data: adminData } = await supabase.from("admin_users").select("*").eq("id", (payload as any).sub).single();
      if (adminData) return { admin: adminData };
    }
  } catch {}
  return { admin: null, error: "Invalid token" };
}

async function verifyUser(req: Request, supabase: SupabaseClient): Promise<{ user: any; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
      console.log("[verifyUser] No Authorization header found");
      return { user: null, error: "No authorization header" };
  }
  
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  console.log("[verifyUser] Token extracted (prefix):", token.substring(0, 10));
  
  // 1. Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (user) {
      console.log("[verifyUser] Supabase Auth Success:", user.id);
      return { user };
  }
  
  if (error) console.log("[verifyUser] Supabase Auth Error:", error.message);
  
  // 2. Custom JWT (Legacy)
  try {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
          "raw", 
          encoder.encode(JWT_SECRET), 
          { name: "HMAC", hash: "SHA-256" }, 
          false, 
          ["verify"]
      );
      const payload = await verify(token, key);
      const legacyId = (payload as any).id || (payload as any).sub;
      console.log("[verifyUser] Custom JWT Success:", legacyId);
      return { user: { id: legacyId } };
  } catch (e) {
      console.log("[verifyUser] Custom JWT Error:", (e as any).message);
      return { user: null, error: "Invalid token" };
  }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("event-registrations-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    // GET /check - Check if user is already registered for an event
    if (apiPath.startsWith("/check") && req.method === "GET") {
        const { user: identifiedUser } = await verifyUser(req, supabase);
        if (!identifiedUser) {
            return jsonResponse({ registered: false }, 200, cors);
        }

        const eventId = url.searchParams.get("eventId");
        const eventSlug = url.searchParams.get("eventSlug");

        if (!eventId && !eventSlug) {
            return jsonResponse({ error: "eventId or eventSlug required" }, 400, cors);
        }

        let finalEventId = eventId;
        if (!finalEventId && eventSlug) {
            const { data: event } = await supabase.from("events").select("id").eq("slug", eventSlug).single();
            if (event) finalEventId = event.id;
        }

        if (!finalEventId) {
            return jsonResponse({ error: "Event not found" }, 404, cors);
        }

        // Check Masterclass registrations
        const { data: mcEntry } = await supabase.from("masterclass_registrations")
            .select("id")
            .eq("event_id", finalEventId)
            .eq("user_id", identifiedUser.id)
            .maybeSingle();

        if (mcEntry) return jsonResponse({ registered: true }, 200, cors);

        // Check standard registrations
        const { data: stdEntry } = await supabase.from("event_registrations")
            .select("id")
            .eq("event_id", finalEventId)
            .eq("user_id", identifiedUser.id)
            .maybeSingle();

        return jsonResponse({ registered: !!stdEntry }, 200, cors);
    }

    // GET / - Admin List OR User's Own Registrations
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
        // 1. Try Admin
        const { admin } = await verifyAdminToken(req, supabase);
        if (admin) {
             const search = url.searchParams.get("search");
             
             // Fetch from Legacy Table ONLY (User request: "only fetch data from the table event-registrations")
             const { data, error } = await supabase.from("event_registrations").select("*")
                 .or(`name.ilike.%${search || ""}%`, `email.ilike.%${search || ""}%`)
                 .order("created_at", { ascending: false });

             if (error) return jsonResponse({ error: error.message }, 500, cors);
             return jsonResponse({ items: data }, 200, cors);
        }

        // 2. Try User
        const { user } = await verifyUser(req, supabase);
        if (user) {
             const { data, error } = await supabase
                .from("masterclass_registrations")
                .select("*")
                .eq("user_id", user.id);
             
             if (error) return jsonResponse({ error: error.message }, 500, cors);
             return jsonResponse({ items: data }, 200, cors);
        }

        return jsonResponse({ error: "Unauthorized" }, 401, cors);
    }
    
    // POST / - Public Register
    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        
        // Attempt auth but do not enforce it
        const { user: identifiedUser } = await verifyUser(req, supabase);
        const userId = identifiedUser?.id || null;
        console.log("[RegistrationAPI] Identified userId:", userId);

        const eventIdFromPayload = body.eventId || body.eventDetails?.id;
        const eventSlugFromPayload = body.eventSlug || body.eventDetails?.slug;

        if (!eventSlugFromPayload && !eventIdFromPayload) {
             return jsonResponse({ error: "Event ID or Slug required" }, 400, cors);
        }

        let eventId = eventIdFromPayload;
        let isMasterclass = false;

        // Fetch Event Details to check Masterclass status
        if (eventId) {
            const { data: event } = await supabase.from("events").select("id, is_masterclass").eq("id", eventId).single();
            if (event) isMasterclass = event.is_masterclass;
        } else if (eventSlugFromPayload) {
             const { data: event } = await supabase.from("events").select("id, is_masterclass").eq("slug", eventSlugFromPayload).single();
             if (!event) return jsonResponse({ error: "Event not found" }, 404, cors);
             eventId = event.id;
             isMasterclass = event.is_masterclass;
        }

        // Logic 1: Masterclass Table (Only if Masterclass)
        if (isMasterclass) {
            const { data: existing } = await supabase.from("masterclass_registrations")
                .select("id")
                .eq("event_id", eventId)
                // Only check for duplicate if we have a userId or email
                .or(userId ? `user_id.eq.${userId}` : `registration_email.eq.${body.email}`)
                .maybeSingle();

            if (existing) {
                 return jsonResponse({ message: "Already registered", alreadyRegistered: true }, 200, cors);
            }

            const { data: newReg, error: regError } = await supabase.from("masterclass_registrations").insert([{
                event_id: eventId,
                user_id: userId, // Can be null
                status: "registered",
                registration_fullname: body.name || body.fullname || null,
                registration_email: body.email || null,
                registration_phone: body.phone || null,
                registration_state: body.state || null,
                registration_city: body.city || null,
                registration_college: body.college || null,
                registration_qualification: body.qualification || null
            }]).select().single();
            
            if (regError) return jsonResponse({ error: regError.message }, 500, cors);
            return jsonResponse({ success: true, item: newReg }, 201, cors);
        }
        
        // Logic 2: Standard Event Registration (Fallback for non-Masterclass)
        // ... (Existing logic for standard events would go here if needed, but for now we focus on Masterclass as requested)
         const { data: newReg, error: regError } = await supabase.from("event_registrations").insert([{
            event_id: eventId,
            user_id: userId,
            name: body.name,
            email: body.email,
            phone: body.phone,
            state: body.state,
            qualification: body.qualification,
            message: body.message
        }]).select().single();

        if (regError) return jsonResponse({ error: regError.message }, 500, cors);
        return jsonResponse({ success: true, item: newReg }, 201, cors);
    }
    
    // POST /send-join-link
    if (apiPath.includes("/send-join-link") && req.method === "POST") {
         const { admin } = await verifyAdminToken(req, supabase);
         if (!admin) return jsonResponse({ error: "Unauthorized" }, 401, cors);
         return jsonResponse({ message: "Emails mocked: Sent join link" }, 200, cors);
    }

    // GET /:id
    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "GET") {
        const { admin } = await verifyAdminToken(req, supabase);
        if (!admin) return jsonResponse({ error: "Unauthorized" }, 401, cors);
        
        // Try both tables
        const id = idMatch[1];
        let { data, error } = await supabase.from("event_registrations").select("*").eq("id", id).single();
        if (!data) {
            const { data: newData, error: newError } = await supabase.from("landing_page_registrations").select("*").eq("id", id).single();
            if (newData) {
                data = { ...newData, course: newData.program_name };
            }
        }
        
        if (data) return jsonResponse({ item: data }, 200, cors);
        return jsonResponse({ error: "Not found" }, 404, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
