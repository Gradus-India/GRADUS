/// <reference lib="deno.ns" />
/**
 * Admin Course Details API Edge Function
 * Handles course detailed content and lecture uploads
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

async function uploadToCloudinary(file: File, folder: string, resourceType: "video" | "raw" = "video") {
  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramsToSign = { timestamp, folder };
  
  const keys = Object.keys(paramsToSign).sort();
  const signString = keys.map((key) => `${key}=${(paramsToSign as any)[key]}`).join("&") + API_SECRET;
  const encoder = new TextEncoder();
  
  const data = encoder.encode(signString);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const signature = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, { method: "POST", body: formData });
  if (!response.ok) throw new Error("Cloudinary upload failed");
  return await response.json();
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-course-details-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET /?slug=...
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
        const slug = url.searchParams.get("slug");
        if (!slug) return jsonResponse({ error: "Stub required" }, 400, cors);

        // Get Course first
        const { data: course } = await supabase.from("course").select("*").eq("slug", slug).single();
        if (!course) return jsonResponse({ error: "Course not found" }, 404, cors);

        // Get Details
        const { data: details } = await supabase.from("course_details").select("*").eq("course_slug", slug).single();
        
        return jsonResponse({
           course: { id: course.id, name: course.name, slug: course.slug },
           detail: { courseSlug: slug, modules: details?.modules || course.modules, updatedAt: details?.updated_at || course.updated_at }
        }, 200, cors);
    }
    
    // PUT /?slug=...
    if ((apiPath === "/" || apiPath === "") && req.method === "PUT") {
        const slug = url.searchParams.get("slug");
        if (!slug) return jsonResponse({ error: "Stub required" }, 400, cors);
        
        const body = await req.json().catch(() => ({}));
        const { modules } = body;
        
        // Upsert Details
        const { data: saved, error } = await supabase.from("course_details").upsert({
           course_slug: slug,
           modules: modules,
           updated_at: new Date().toISOString()
        }, { onConflict: "course_slug" }).select().single();

        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ message: "Saved", detail: saved }, 200, cors);
    }

    // POST /lectures/upload?slug=...
    if (apiPath === "/lectures/upload" && req.method === "POST") {
       const slug = url.searchParams.get("slug");
       if (!slug) return jsonResponse({ error: "Stub required" }, 400, cors);

       const formData = await req.formData();
       const file = formData.get("file") as File;
       if (!file) return jsonResponse({ error: "File required" }, 400, cors);

       const result = await uploadToCloudinary(file, "gradus/lectures", "video");
       return jsonResponse({
          secure_url: result.secure_url,
          public_id: result.public_id,
          duration: result.duration,
          format: result.format
       }, 201, cors);
    }

    // POST /lectures/upload-notes?slug=...
    if (apiPath === "/lectures/upload-notes" && req.method === "POST") {
       const slug = url.searchParams.get("slug");
       if (!slug) return jsonResponse({ error: "Stub required" }, 400, cors);

       const formData = await req.formData();
       const file = formData.get("file") as File;
       if (!file) return jsonResponse({ error: "File required" }, 400, cors);

       const result = await uploadToCloudinary(file, "gradus/notes", "raw");
       return jsonResponse({
          secure_url: result.secure_url,
          public_id: result.public_id,
          format: result.format
       }, 201, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
