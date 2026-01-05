/// <reference lib="deno.ns" />
/**
 * Admin Gallery API Edge Function
 * Handles gallery CRUD with Cloudinary support
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
const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";

async function verifyAdminToken(req: Request, supabase: SupabaseClient): Promise<{ admin: any; error?: string }> {
  /* ... simplified for brevity, same logic ... */
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

async function deleteFromCloudinary(publicId: string) {
  if (!publicId) return;
  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramsToSign = { public_id: publicId, timestamp };
  
  const keys = Object.keys(paramsToSign).sort();
  const signString = keys.map((key) => `${key}=${(paramsToSign as any)[key]}`).join("&") + API_SECRET;
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-1", encoder.encode(signString));
  const signature = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  try {
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, { method: "POST", body: formData });
  } catch (e) {
    console.error("Cloudinary delete error:", e);
  }
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-gallery-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET /
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
       const category = url.searchParams.get("category");
       let query = supabase.from("gallery_items").select("*");
       if (category) query = query.eq("category", category);
       query = query.order("created_at", { ascending: false });
       const { data, error } = await query;
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       
       return jsonResponse({
          success: true,
          items: (data || []).map((item: any) => ({
             id: item.id,
             title: item.title,
             category: item.category,
             imageUrl: item.image_url,
             publicId: item.public_id,
             isActive: item.is_active,
             createdAt: item.created_at
          }))
       }, 200, cors);
    }

    // POST /
    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
       const { title, category, imageUrl, publicId } = await req.json().catch(() => ({}));
       const { data, error } = await supabase.from("gallery_items").insert([{
          title, category, image_url: imageUrl, public_id: publicId, is_active: true
       }]).select().single();
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       return jsonResponse({
          success: true,
          item: {
             id: data.id,
             title: data.title,
             category: data.category,
             imageUrl: data.image_url,
             publicId: data.public_id,
             createdAt: data.created_at
          }
       }, 201, cors);
    }

    // DELETE /:id
    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "DELETE") {
       const id = idMatch[1];
       const { data: doc } = await supabase.from("gallery_items").select("public_id").eq("id", id).single();
       if (doc?.public_id) await deleteFromCloudinary(doc.public_id);
       
       const { error } = await supabase.from("gallery_items").delete().eq("id", id);
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       return jsonResponse({ success: true, message: "Deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
