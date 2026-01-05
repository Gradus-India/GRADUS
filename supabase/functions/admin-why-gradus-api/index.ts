/// <reference lib="deno.ns" />
/**
 * Admin Why Gradus Video API Edge Function
 * Handles CRUD for "Why Gradus" video section
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
// Cloudinary Helper
// ============================================================================

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";
const WHY_GRADUS_FOLDER = "gradus/why-gradus-videos";

async function generateSignature(params: Record<string, string>, secret: string) {
  const keys = Object.keys(params).sort();
  const signString = keys.map((key) => `${key}=${params[key]}`).join("&") + secret;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(signString);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function uploadToCloudinary(file: File, folder: string = WHY_GRADUS_FOLDER) {
  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramsToSign: Record<string, string> = { timestamp, folder };
  const signature = await generateSignature(paramsToSign, API_SECRET);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", folder);

  const resourceType = "video";
  
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed`);
  }

  return await response.json();
}

async function deleteFromCloudinary(publicId: string) {
  if (!publicId) return;
  
  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramsToSign: Record<string, string> = { public_id: publicId, timestamp };
  const signature = await generateSignature(paramsToSign, API_SECRET);

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  try {
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/destroy`, {
      method: "POST",
      body: formData
    });
  } catch (e) {
    console.error("Cloudinary delete error:", e);
  }
}

// ============================================================================
// Mapping
// ============================================================================

function mapItem(doc: any) {
  const rawUrl = doc.video_url || doc.secure_url;
  const isPlaceholder = rawUrl && rawUrl.includes("placeholder.com");

  return {
    id: doc.id,
    title: doc.title,
    subtitle: doc.subtitle,
    description: doc.description,
    ctaLabel: doc.cta_label,
    ctaHref: doc.cta_href,
    videoUrl: isPlaceholder ? "" : rawUrl,
    thumbnailUrl: doc.thumbnail_url?.includes("placeholder.com") ? "" : doc.thumbnail_url,
    duration: doc.duration,
    width: doc.width,
    height: doc.height,
    active: Boolean(doc.is_active),
    order: doc.sort_order,
    publicId: doc.public_id,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;

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
    
    const funcIndex = pathParts.indexOf("admin-why-gradus-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // ========================================================================
    // GET UPLOAD SIGNATURE - POST /upload/signature
    // ========================================================================

    if (apiPath === "/upload/signature" && req.method === "POST") {
      const timestamp = Math.round(Date.now() / 1000).toString();
      const folder = WHY_GRADUS_FOLDER;
      
      const paramsToSign = { timestamp, folder };
      const signature = await generateSignature(paramsToSign, API_SECRET);

      return jsonResponse({
        cloudName: CLOUD_NAME,
        apiKey: API_KEY,
        timestamp,
        folder,
        signature,
        uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`
      }, 200, cors);
    }

    // ========================================================================
    // LIST VIDEOS - GET /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data: items, error } = await supabase
        .from("why_gradus_videos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ items: (items || []).map(mapItem) }, 200, cors);
    }

    // ========================================================================
    // CREATE VIDEO - POST /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      let payload: any = {};
      
      if (contentType.includes("multipart/form-data")) {
         const formData = await req.formData();
         const videoFile = formData.get("video") as File;
         
         if (videoFile && videoFile instanceof File) {
            const uploadResult = await uploadToCloudinary(videoFile);
            const posterUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/f_jpg,so_0/${uploadResult.public_id}.jpg`;
            
            payload = {
               video_url: uploadResult.secure_url,
               thumbnail_url: posterUrl,
               public_id: uploadResult.public_id,
               duration: uploadResult.duration,
               folder: uploadResult.folder,
               resource_type: "video",
               format: uploadResult.format,
               width: uploadResult.width,
               height: uploadResult.height,
               bytes: uploadResult.bytes,
               title: (formData.get("title") as string)?.trim() || null,
               subtitle: (formData.get("subtitle") as string)?.trim() || null,
               description: (formData.get("description") as string)?.trim() || null,
               cta_label: (formData.get("ctaLabel") as string)?.trim() || null,
               cta_href: (formData.get("ctaHref") as string)?.trim() || null,
               is_active: formData.get("active") !== "false",
               sort_order: Number(formData.get("order")) || 0,
            };
         }
      } else {
         // Direct upload metadata
         const body = await req.json().catch(() => ({}));
         const { upload, title, subtitle, description, ctaLabel, ctaHref, active, order } = body;
         
         if (upload && upload.secure_url) {
            const posterUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/f_jpg,so_0/${upload.public_id}.jpg`;
            payload = {
               video_url: upload.secure_url,
               thumbnail_url: posterUrl,
               public_id: upload.public_id,
               duration: upload.duration,
               folder: upload.folder || WHY_GRADUS_FOLDER,
               resource_type: "video",
               format: upload.format,
               width: upload.width,
               height: upload.height,
               bytes: upload.bytes,
               title: title?.trim() || null,
               subtitle: subtitle?.trim() || null,
               description: description?.trim() || null,
               cta_label: ctaLabel?.trim() || null,
               cta_href: ctaHref?.trim() || null,
               is_active: active !== false,
               sort_order: Number(order) || 0,
            };
         } else {
             return jsonResponse({ error: "No video provided" }, 400, cors);
         }
      }

      const { data: doc, error } = await supabase
        .from("why_gradus_videos")
        .insert([payload])
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ item: mapItem(doc) }, 201, cors);
    }

    // ========================================================================
    // UPDATE - PATCH /:id
    // ========================================================================

    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "PATCH") {
      const id = idMatch[1];
      const body = await req.json().catch(() => ({}));
      const patch: any = {};

      if (body.title !== undefined) patch.title = body.title?.trim();
      if (body.subtitle !== undefined) patch.subtitle = body.subtitle?.trim();
      if (body.description !== undefined) patch.description = body.description?.trim();
      if (body.ctaLabel !== undefined) patch.cta_label = body.ctaLabel?.trim();
      if (body.ctaHref !== undefined) patch.cta_href = body.ctaHref?.trim();
      if (body.active !== undefined) patch.is_active = Boolean(body.active);
      if (body.order !== undefined) patch.sort_order = Number(body.order);

      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        const { data: updated, error } = await supabase
          .from("why_gradus_videos")
          .update(patch)
          .eq("id", id)
          .select()
          .single();

        if (error) {
          return jsonResponse({ error: error.message }, 500, cors);
        }
        return jsonResponse({ item: mapItem(updated) }, 200, cors);
      }
      return jsonResponse({ message: "Nothing to update" }, 200, cors);
    }

    // ========================================================================
    // DELETE - DELETE /:id
    // ========================================================================

    if (idMatch && req.method === "DELETE") {
      const id = idMatch[1];

      const { data: doc } = await supabase
        .from("why_gradus_videos")
        .select("public_id")
        .eq("id", id)
        .single();

      if (doc?.public_id) {
        await deleteFromCloudinary(doc.public_id);
      }

      const { error } = await supabase
        .from("why_gradus_videos")
        .delete()
        .eq("id", id);

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ message: "Deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found", path: apiPath }, 404, cors);

  } catch (error) {
    console.error("Admin Why Gradus API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
