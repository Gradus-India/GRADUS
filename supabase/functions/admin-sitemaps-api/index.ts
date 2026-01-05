/// <reference lib="deno.ns" />
/**
 * Admin Sitemaps API Edge Function
 * Handles sitemap CRUD using Supabase 'sitemaps' table
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

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-sitemaps-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET / - List sitemaps
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      // Assuming 'sitemaps' table. If not exists, this functionality requires migration.
      // We return list of filenames.
      const { data: items, error } = await supabase.from("sitemaps").select("filename");
      if (error) {
        // Fallback: return default if table missing? or error.
        // If table doesn't exist, we can't do much. 
        return jsonResponse({ error: error.message }, 500, cors);
      }
      return jsonResponse(items.map((i: any) => i.filename), 200, cors);
    }

    // GET /:filename - Get content
    const fileMatch = apiPath.match(/^\/([\w.-]+)$/i);
    if (fileMatch && req.method === "GET") {
      const filename = fileMatch[1];
      const { data, error } = await supabase.from("sitemaps").select("*").eq("filename", filename).single();
      if (error || !data) {
        // Fallback: default XML if sitemap.xml
        if (filename === "sitemap.xml") {
           return jsonResponse({
              filename: "sitemap.xml",
              content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://gradusindia.in/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>`
           }, 200, cors);
        }
        return jsonResponse({ error: "Sitemap not found" }, 404, cors);
      }
      return jsonResponse({ filename: data.filename, content: data.content }, 200, cors);
    }

    // PUT /:filename - Update content
    if (fileMatch && req.method === "PUT") {
      const filename = fileMatch[1];
      const { content } = await req.json().catch(() => ({}));
      if (!content) return jsonResponse({ error: "Content required" }, 400, cors);

      const { data, error } = await supabase.from("sitemaps").upsert({
         filename, content, updated_at: new Date().toISOString()
      }, { onConflict: "filename" }).select().single();
      
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      
      return jsonResponse({ message: "Sitemap updated", filename }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
