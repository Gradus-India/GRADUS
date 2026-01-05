/// <reference lib="deno.ns" />
/**
 * Admin Assessments API Edge Function
 * Handles Assessment listing and management
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

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-assessments-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET /:courseSlug or /:programme/:courseSlug (list)
    // Actually path can be /?courseSlug=... or /:courseSlug
    if (req.method === "GET") {
        const rawSlug = url.searchParams.get("courseSlug") || apiPath.replace(/^\//, "");
        const slug = decodeURIComponent(rawSlug);
        
        let query = supabase.from("assessment_sets").select("*");
        if (slug && slug !== "/") query = query.eq("course_slug", slug);
        
        const { data: items, error } = await query.order("updated_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ items }, 200, cors);
    }
    
    // POST /:courseSlug/generate
    if (apiPath.endsWith("/generate") && req.method === "POST") {
        return jsonResponse({ error: "AI Generation not migrated yet. Use old backend or implement OpenAI calls here." }, 501, cors);
    }

    // DELETE /set/:id
    const deleteMatch = apiPath.match(/\/set\/([0-9a-f-]+)$/);
    if (deleteMatch && req.method === "DELETE") {
        const id = deleteMatch[1];
        const { error } = await supabase.from("assessment_sets").delete().eq("id", id);
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ message: "Assessment set deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
