/// <reference lib="deno.ns" />
/**
 * Admin Page Meta API Edge Function
 * Handles SEO metadata CRUD
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
  /* ... simplified for brevity ... */
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
    const funcIndex = pathParts.indexOf("admin-page-meta-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET /
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
       const { data, error } = await supabase.from("page_metas").select("*").order("page_path", { ascending: true });
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       return jsonResponse({ items: data }, 200, cors);
    }

    // POST /
    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
       const body = await req.json().catch(() => ({}));
       const { route, title, description, keywords, ogImage, robots } = body;
       // We map frontend 'route' or 'path' to 'page_path' AND 'path'
       const pagePath = route || body.path;
       
       const { data, error } = await supabase.from("page_metas").insert([{
          page_path: pagePath,
          path: pagePath, // seems redundant but user provided data has both
          title, 
          description, 
          keywords, 
          og_image_url: ogImage,
          robots: robots || 'index, follow',
          is_active: true
       }]).select().single();
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       return jsonResponse({ item: data }, 201, cors);
    }

    // PATCH /:id
    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "PATCH") {
      const id = idMatch[1];
      const body = await req.json().catch(() => ({}));
      const patch: any = {};
      
      const pagePath = body.route || body.path;
      if (pagePath) {
          patch.page_path = pagePath;
          patch.path = pagePath;
      }
      if (body.title !== undefined) patch.title = body.title;
      if (body.description !== undefined) patch.description = body.description;
      if (body.keywords !== undefined) patch.keywords = body.keywords;
      if (body.ogImage !== undefined) patch.og_image_url = body.ogImage;
      if (body.robots !== undefined) patch.robots = body.robots;
      if (body.isActive !== undefined) patch.is_active = body.isActive;

      const { data, error } = await supabase.from("page_metas").update(patch).eq("id", id).select().single();
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({ item: data }, 200, cors);
    }

    // DELETE /:id
    if (idMatch && req.method === "DELETE") {
      const id = idMatch[1];
      const { error } = await supabase.from("page_metas").delete().eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({ message: "Deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
