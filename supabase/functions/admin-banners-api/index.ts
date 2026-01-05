/// <reference lib="deno.ns" />
/**
 * Admin Banners API Edge Function
 * Handles banner CRUD with Cloudinary image uploads
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

// ============================================================================
// Admin Auth Helper
// ============================================================================

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
    
    if (adminData) {
      return { admin: adminData };
    }
  }
  
  const payload = await verifyJwt(token);
  if (payload?.sub) {
    const { data: adminData } = await supabase
      .from("admin_users")
      .select("*")
      .eq("id", payload.sub)
      .single();
    
    if (adminData) {
      return { admin: adminData };
    }
  }

  return { admin: null, error: "Invalid token or admin not found" };
}

// ============================================================================
// Cloudinary Helper
// ============================================================================

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";
const BANNER_FOLDER = "gradus/banners";

async function generateSignature(params: Record<string, string>, secret: string) {
  const keys = Object.keys(params).sort();
  const signString = keys.map((key) => `${key}=${params[key]}`).join("&") + secret;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(signString);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function uploadToCloudinary(file: File, folder: string = BANNER_FOLDER) {
  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramsToSign: Record<string, string> = { timestamp, folder };
  const signature = await generateSignature(paramsToSign, API_SECRET);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", folder);

  const resourceType = file.type.startsWith("video") ? "video" : "image";
  
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Cloudinary upload failed: ${JSON.stringify(errorData)}`);
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
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
      method: "POST",
      body: formData
    });
  } catch (e) {
    console.error("Cloudinary delete error:", e);
  }
}

// ============================================================================
// Banner Mapping
// ============================================================================

function mapSupabaseBanner(doc: any) {
  return {
    id: doc.id,
    title: doc.title || "",
    subtitle: doc.subtitle || "",
    description: doc.description || "",
    ctaLabel: doc.cta_label || "",
    ctaUrl: doc.cta_url || "",
    active: Boolean(doc.is_active),
    order: doc.sort_order || 0,
    imageUrl: doc.image_url,
    desktopImageUrl: doc.image_url,
    mobileImageUrl: doc.mobile_image_url || "",
    publicId: doc.public_id,
    mobilePublicId: doc.mobile_public_id,
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
    
    const funcIndex = pathParts.indexOf("admin-banners-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    // All endpoints require admin auth
    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // ========================================================================
    // LIST BANNERS - GET /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data: items, error } = await supabase
        .from("banners")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ items: (items || []).map(mapSupabaseBanner) }, 200, cors);
    }

    // ========================================================================
    // CREATE BANNER - POST / (multipart/form-data)
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const formData = await req.formData();
      
      const title = formData.get("title") as string;
      const subtitle = formData.get("subtitle") as string;
      const description = formData.get("description") as string;
      const ctaLabel = formData.get("ctaLabel") as string;
      const ctaUrl = formData.get("ctaUrl") as string;
      const order = formData.get("order") as string;
      const active = formData.get("active") as string;
      
      const desktopImage = formData.get("desktopImage") as File;
      const mobileImage = formData.get("mobileImage") as File;

      if (!desktopImage || !(desktopImage instanceof File)) {
        return jsonResponse({ error: "Desktop banner image is required" }, 400, cors);
      }

      // Upload to Cloudinary
      const desktopUpload = await uploadToCloudinary(desktopImage);
      let mobileUpload = null;
      if (mobileImage && mobileImage instanceof File) {
        mobileUpload = await uploadToCloudinary(mobileImage);
      }

      const { data: doc, error } = await supabase
        .from("banners")
        .insert([{
          title: title?.trim() || null,
          subtitle: subtitle?.trim() || null,
          description: description?.trim() || null,
          cta_label: ctaLabel?.trim() || null,
          cta_url: ctaUrl?.trim() || null,
          sort_order: order ? Number(order) : 0,
          is_active: active === "true" || active === undefined,
          image_url: desktopUpload.secure_url,
          public_id: desktopUpload.public_id,
          folder: desktopUpload.folder,
          format: desktopUpload.format,
          width: desktopUpload.width,
          height: desktopUpload.height,
          bytes: desktopUpload.bytes,
          mobile_image_url: mobileUpload?.secure_url || null,
          mobile_public_id: mobileUpload?.public_id || null,
          mobile_format: mobileUpload?.format || null,
          mobile_width: mobileUpload?.width || null,
          mobile_height: mobileUpload?.height || null,
          mobile_bytes: mobileUpload?.bytes || null,
        }])
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ item: mapSupabaseBanner(doc) }, 201, cors);
    }

    // ========================================================================
    // UPDATE BANNER - PATCH /:id
    // ========================================================================

    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "PATCH") {
      const id = idMatch[1];

      // Get existing banner
      const { data: doc, error: fetchError } = await supabase
        .from("banners")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !doc) {
        return jsonResponse({ error: "Banner not found" }, 404, cors);
      }

      const contentType = req.headers.get("content-type") || "";
      let patch: any = {};
      let desktopImage: File | null = null;
      let mobileImage: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        
        if (formData.has("title")) patch.title = (formData.get("title") as string)?.trim();
        if (formData.has("subtitle")) patch.subtitle = (formData.get("subtitle") as string)?.trim();
        if (formData.has("description")) patch.description = (formData.get("description") as string)?.trim();
        if (formData.has("ctaLabel")) patch.cta_label = (formData.get("ctaLabel") as string)?.trim();
        if (formData.has("ctaUrl")) patch.cta_url = (formData.get("ctaUrl") as string)?.trim();
        if (formData.has("order")) patch.sort_order = Number(formData.get("order")) || 0;
        if (formData.has("active")) patch.is_active = formData.get("active") === "true";
        
        desktopImage = formData.get("desktopImage") as File;
        mobileImage = formData.get("mobileImage") as File;
      } else {
        const body = await req.json().catch(() => ({}));
        if (body.title !== undefined) patch.title = body.title?.trim();
        if (body.subtitle !== undefined) patch.subtitle = body.subtitle?.trim();
        if (body.description !== undefined) patch.description = body.description?.trim();
        if (body.ctaLabel !== undefined) patch.cta_label = body.ctaLabel?.trim();
        if (body.ctaUrl !== undefined) patch.cta_url = body.ctaUrl?.trim();
        if (body.order !== undefined) patch.sort_order = Number(body.order) || 0;
        if (body.active !== undefined) patch.is_active = body.active === true || body.active === "true";
      }

      // Handle desktop image upload
      if (desktopImage && desktopImage instanceof File && desktopImage.size > 0) {
        const uploadResult = await uploadToCloudinary(desktopImage);
        patch.image_url = uploadResult.secure_url;
        patch.public_id = uploadResult.public_id;
        patch.folder = uploadResult.folder;
        patch.format = uploadResult.format;
        patch.width = uploadResult.width;
        patch.height = uploadResult.height;
        patch.bytes = uploadResult.bytes;
        
        // Delete old image
        await deleteFromCloudinary(doc.public_id);
      }

      // Handle mobile image upload
      if (mobileImage && mobileImage instanceof File && mobileImage.size > 0) {
        const uploadResult = await uploadToCloudinary(mobileImage);
        patch.mobile_image_url = uploadResult.secure_url;
        patch.mobile_public_id = uploadResult.public_id;
        patch.mobile_format = uploadResult.format;
        patch.mobile_width = uploadResult.width;
        patch.mobile_height = uploadResult.height;
        patch.mobile_bytes = uploadResult.bytes;
        
        await deleteFromCloudinary(doc.mobile_public_id);
      }

      if (Object.keys(patch).length === 0) {
        return jsonResponse({ item: mapSupabaseBanner(doc) }, 200, cors);
      }

      const { data: updated, error: updateError } = await supabase
        .from("banners")
        .update(patch)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500, cors);
      }

      return jsonResponse({ item: mapSupabaseBanner(updated) }, 200, cors);
    }

    // ========================================================================
    // DELETE BANNER - DELETE /:id
    // ========================================================================

    if (idMatch && req.method === "DELETE") {
      const id = idMatch[1];

      const { data: doc, error: fetchError } = await supabase
        .from("banners")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !doc) {
        return jsonResponse({ error: "Banner not found" }, 404, cors);
      }

      // Delete images from Cloudinary
      await deleteFromCloudinary(doc.public_id);
      await deleteFromCloudinary(doc.mobile_public_id);

      const { error: deleteError } = await supabase
        .from("banners")
        .delete()
        .eq("id", id);

      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 500, cors);
      }

      return jsonResponse({ message: "Deleted" }, 200, cors);
    }

    // No route matched
    return jsonResponse({ error: "Not found", path: apiPath }, 404, cors);

  } catch (error) {
    console.error("Admin Banners API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
