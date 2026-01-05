/**
 * Admin Uploads API Edge Function
 * Handles image/file uploads via Cloudinary
 */
/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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
  /* ... simplified ... */
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
    const funcIndex = pathParts.indexOf("admin-uploads-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // POST /image
    if (apiPath === "/image" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) return jsonResponse({ error: "File required" }, 400, cors);

        // Upload to Cloudinary
        const timestamp = Math.round(Date.now() / 1000).toString();
        const folder = "gradus/course_images";
        const paramsToSign = { timestamp, folder };
  
        const keys = Object.keys(paramsToSign).sort();
        const signString = keys.map((key) => `${key}=${(paramsToSign as any)[key]}`).join("&") + API_SECRET;
        const encoder = new TextEncoder();
  
        const data = encoder.encode(signString);
        const hash = await crypto.subtle.digest("SHA-1", data);
        const signature = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");

        const uploadFormData = new FormData();
        uploadFormData.append("file", file);
        uploadFormData.append("api_key", API_KEY);
        uploadFormData.append("timestamp", timestamp);
        uploadFormData.append("signature", signature);
        uploadFormData.append("folder", folder);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: uploadFormData });
        if (!response.ok) {
           const errText = await response.text();
           throw new Error("Cloudinary upload failed: " + errText);
        }
        const result = await response.json();

        return jsonResponse({
           ok: true,
           item: {
             url: result.secure_url,
             publicId: result.public_id,
             width: result.width,
             height: result.height,
             format: result.format,
             folder: result.folder
           }
        }, 201, cors);
    }

    // POST /landing-page-image - Upload to Supabase storage landing_page bucket
    if (apiPath === "/landing-page-image" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) return jsonResponse({ error: "File required" }, 400, cors);

        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `hero-images/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from("landing_page")
            .upload(fileName, file, {
                contentType: file.type || 'image/jpeg',
                upsert: false
            });

        if (uploadError) {
            console.error("Storage upload error:", uploadError);
            return jsonResponse({ error: uploadError.message }, 500, cors);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from("landing_page")
            .getPublicUrl(fileName);

        return jsonResponse({
            ok: true,
            item: {
                url: publicUrl,
                path: fileName
            }
        }, 201, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
