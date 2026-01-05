/// <reference lib="deno.ns" />
/**
 * Admin Tickets API Edge Function
 * Handles support ticket management
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

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

const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

async function verifyAdminToken(req: Request, supabase: SupabaseClient): Promise<{ admin: any; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { admin: null, error: "No authorization header" };
  const token = authHeader.split(" ")[1];
  const { data: supabaseUser } = await supabase.auth.getUser(token);
  if (supabaseUser?.user) {
    const { data: adminData } = await supabase.from("admin_users").select("*").eq("supabase_id", supabaseUser.user.id).single();
    if (adminData) return { admin: adminData };
  }
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

function mapTicket(t: any) {
  return {
    ...t,
    user: t.users ? {
       id: t.users.id,
       firstName: t.users.first_name,
       lastName: t.users.last_name,
       email: t.users.email
    } : null,
    assignee: t.admin_users ? {
       id: t.admin_users.id,
       fullName: t.admin_users.full_name
    } : null
  };
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-tickets-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET / - List Tickets
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
        const { data: tickets, error } = await supabase
           .from("tickets")
           .select("*")
           .order("created_at", { ascending: false });
        
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ items: tickets || [] }, 200, cors);
    }

    // GET /:id - Get Details
    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "GET") {
        const id = idMatch[1];
        const { data: ticket, error } = await supabase
           .from("tickets")
           .select("*")
           .eq("id", id)
           .single();

        if (error || !ticket) return jsonResponse({ error: "Ticket not found" }, 404, cors);

        // Fetch messages
        const { data: messages } = await supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true });

        // Update opened status if necessary
        return jsonResponse({ item: ticket, messages: messages || [] }, 200, cors);
    }
    
    // POST /:id/reply
    if (apiPath.endsWith("/reply") && req.method === "POST") {
        const id = apiPath.split("/")[1];
        const { body } = await req.json().catch(() => ({}));
        if (!body) return jsonResponse({ error: "Body required" }, 400, cors);
        
        const { data: msg, error } = await supabase.from("ticket_messages").insert([{
           ticket_id: id,
           message: body,
           sender_config: { authorType: "admin", authorAdmin: admin.id },
           created_at: new Date()
        }]).select().single();
        
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        
        // Update ticket status
        await supabase.from("tickets").update({ 
           status: "in_progress", 
           last_message_at: new Date() 
        }).eq("id", id);
        
        return jsonResponse({ message: "Reply posted", item: msg }, 201, cors);
    }
    
    // PATCH /:id
    if (idMatch && req.method === "PATCH") {
       const id = idMatch[1];
       const updates = await req.json().catch(() => ({}));
       // Sanitise updates keys
       const payload: any = {};
       if (updates.status) payload.status = updates.status;
       if (updates.priority) payload.priority = updates.priority;
       if (updates.assignedTo) payload.assigned_to = updates.assignedTo;
       payload.updated_at = new Date(); // ALWAYS update updated_at

       const { data, error } = await supabase.from("tickets").update(payload).eq("id", id).select().single();
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       return jsonResponse({ message: "Updated", item: mapTicket(data) }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
