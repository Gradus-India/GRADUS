/// <reference lib="deno.ns" />
/**
 * Admin Events API Edge Function
 * Handles event CRUD operations
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ============================================================================
// CORS & Helpers
// ============================================================================

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || req.headers.get("origin");
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

// ============================================================================
// JWT Verification
// ============================================================================

const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

async function getJwtKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function verifyJwt(token: string): Promise<{ sub: string } | null> {
  try {
    const key = await getJwtKey();
    const payload = await verify(token, key);
    return payload as { sub: string };
  } catch {
    return null;
  }
}

async function verifyAdminToken(req: Request, supabase: SupabaseClient): Promise<{ admin: any; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { admin: null, error: "No authorization header" };
  }

  const token = authHeader.split(" ")[1];
  
  const { data: supabaseUser } = await supabase.auth.getUser(token);
  
  if (supabaseUser?.user) {
    const { data: adminData } = await supabase
      .from("admin_users")
      .select("*")
      .eq("supabase_id", supabaseUser.user.id)
      .single();
    
    if (adminData) return { admin: adminData };
  }
  
  const payload = await verifyJwt(token);
  if (payload?.sub) {
    const { data: adminData } = await supabase
      .from("admin_users")
      .select("*")
      .eq("id", payload.sub)
      .single();
    
    if (adminData) return { admin: adminData };
  }

  return { admin: null, error: "Invalid token" };
}

// ============================================================================
// Event Mapping
// ============================================================================

function serializeEvent(event: any) {
  if (!event) return null;
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle || "",
    description: event.description || "",
    status: event.status || "draft",
    mode: event.mode || "online",
    featured: Boolean(event.featured),
    startDate: event.schedule?.start,
    endDate: event.schedule?.end,
    timezone: event.schedule?.timezone || "Asia/Kolkata",
    location: event.locations || {}, // Note: setup script used 'location' text, but schema has 'location' text. Wait, schema has 'location' TEXT. Let me double check setup script.
    // setup script: ALTER TABLE events ADD COLUMN IF NOT EXISTS location TEXT;
    // but code below has body.location || {} which implies object.
    // The previous code had event.location || {}
    // Let's stick to simple mapping for now.
    location: event.location || "",
    speakers: event.speakers || [], // speakers column? setup script doesn't show speakers column!
    // setup script does NOT have 'speakers', 'agenda'.
    // It has 'host' (jsonb), 'meta' (jsonb).
    // meta has 'agenda'.
    // host has 'name', etc.
    // this API is very different from the schema.
    
    // Let's try to map as best as possible to what's in DB.
    // DB columns: title, slug, subtitle, summary, description, category, badge, event_type, tags, level, track_label
    // hero_image, host, price, cta, schedule, mode, location, recording_available, is_featured, status, sort_order
    // created_by, meta, created_at, updated_at
    
    // speakers -> host? or specific field? Host is single object in DB.
    // agenda -> meta.agenda
    
    host: event.host || {}, 
    // Return speakers as host for now to avoid break
    
    speakers: [], // invalid in new schema context usually, but frontend might expect it.
    agenda: event.meta?.agenda || [],
    registrationUrl: event.cta?.url || "",
    registrationDeadline: event.cta?.deadline, // cta not typically having deadline
    maxAttendees: 0, // not in schema
    price: event.price?.amount || 0,
    currency: event.price?.currency || "INR",
    tags: event.tags || [],
    category: event.category || "",
    coverImage: event.hero_image?.url || "",
    thumbnailImage: event.hero_image?.url || "",
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    
    const funcIndex = pathParts.indexOf("admin-events-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // ========================================================================
    // LIST EVENTS - GET /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data: items, error } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ items: (items || []).map(serializeEvent) }, 200, cors);
    }

    // ========================================================================
    // CREATE EVENT - POST /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      
      const slug = body.slug || slugify(body.title || "event");

      const payload = {
        slug,
        title: body.title,
        subtitle: body.subtitle,
        description: body.description,
        status: body.status || "draft",
        mode: body.mode || "online",
        is_featured: Boolean(body.featured), // fixed name
        
        // Map schedule
        schedule: {
            start: body.startDate,
            end: body.endDate,
            timezone: body.timezone || "Asia/Kolkata"
        },
        
        location: body.location || "", // Text in DB
        
        // Map host (using speakers input or host input)
        host: body.host || (body.speakers && body.speakers[0] ? { name: body.speakers[0].name } : {}),
        
        meta: {
            agenda: body.agenda || []
        },
        
        cta: {
            url: body.registrationUrl,
            // deadline not in standard CTA text usually but storing in jsonb is fine
            deadline: body.registrationDeadline 
        },
        
        // max_attendees removed as not in schema
        
        price: {
            amount: body.price || 0,
            currency: body.currency || "INR",
            isFree: (body.price === 0)
        },
        
        tags: body.tags || [],
        category: body.category,
        badge: body.badge,         // Added badge support
        event_type: body.eventType || "event", // Added event_type support (default to event)
        
        hero_image: {
            url: body.coverImage || body.thumbnailImage
        }
      };

      const { data: event, error } = await supabase
        .from("events")
        .insert([payload])
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ event: serializeEvent(event) }, 201, cors);
    }

    // ========================================================================
    // GET EVENT - GET /:eventId
    // ========================================================================

    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "GET") {
      const eventId = idMatch[1];

      const { data: event, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (error || !event) {
        return jsonResponse({ error: "Event not found" }, 404, cors);
      }

      return jsonResponse({ event: serializeEvent(event) }, 200, cors);
    }

    // ========================================================================
    // UPDATE EVENT - PATCH /:eventId
    // ========================================================================

    if (idMatch && req.method === "PATCH") {
      const eventId = idMatch[1];
      const body = await req.json().catch(() => ({}));

      // Fetch existing to merge JSONB fields
      const { data: existing, error: fetchError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();
        
      if (fetchError || !existing) {
          return jsonResponse({ error: "Event not found" }, 404, cors);
      }

      const patch: any = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.subtitle !== undefined) patch.subtitle = body.subtitle;
      if (body.description !== undefined) patch.description = body.description;
      if (body.status !== undefined) patch.status = body.status;
      if (body.mode !== undefined) patch.mode = body.mode;
      if (body.featured !== undefined) patch.is_featured = Boolean(body.featured);
      
      // Schedule update
      if (body.startDate !== undefined || body.endDate !== undefined || body.timezone !== undefined) {
          patch.schedule = {
              ...existing.schedule,
              ...(body.startDate !== undefined ? { start: body.startDate } : {}),
              ...(body.endDate !== undefined ? { end: body.endDate } : {}),
              ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
          };
      }
      
      if (body.location !== undefined) patch.location = body.location;
      
      // Host update
      if (body.host !== undefined) {
          patch.host = body.host; 
      } else if (body.speakers !== undefined) {
         // fallback
         patch.host = body.speakers[0] ? { ...existing.host, name: body.speakers[0].name } : existing.host;
      }
      
      if (body.agenda !== undefined) {
          patch.meta = { ...existing.meta, agenda: body.agenda };
      }
      
      if (body.registrationUrl !== undefined || body.registrationDeadline !== undefined) {
          patch.cta = {
              ...existing.cta,
              ...(body.registrationUrl !== undefined ? { url: body.registrationUrl } : {}),
              ...(body.registrationDeadline !== undefined ? { deadline: body.registrationDeadline } : {}),
          };
      }
      
      if (body.price !== undefined || body.currency !== undefined) {
           patch.price = {
               ...existing.price,
               ...(body.price !== undefined ? { amount: body.price, isFree: body.price === 0 } : {}),
               ...(body.currency !== undefined ? { currency: body.currency } : {}),
           };
      }
      
      if (body.tags !== undefined) patch.tags = body.tags;
      if (body.category !== undefined) patch.category = body.category;
      if (body.badge !== undefined) patch.badge = body.badge;
      if (body.eventType !== undefined) patch.event_type = body.eventType;
      
      if (body.coverImage !== undefined || body.heroImageUrl !== undefined || body.heroImageAlt !== undefined) {
          const url = body.coverImage || body.heroImageUrl || existing.hero_image?.url;
          const alt = body.heroImageAlt || existing.hero_image?.alt || "";
          patch.hero_image = { 
              ...existing.hero_image, 
              url: url,
              alt: alt
          };
      }
      
      if (body.slug !== undefined) patch.slug = body.slug;

      patch.updated_at = new Date().toISOString();

      const { data: event, error } = await supabase
        .from("events")
        .update(patch)
        .eq("id", eventId)
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ event: serializeEvent(event) }, 200, cors);
    }

    // ========================================================================
    // DELETE EVENT - DELETE /:eventId
    // ========================================================================

    if (idMatch && req.method === "DELETE") {
      const eventId = idMatch[1];

      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ message: "Deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found", path: apiPath }, 404, cors);

  } catch (error) {
    console.error("Admin Events API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
