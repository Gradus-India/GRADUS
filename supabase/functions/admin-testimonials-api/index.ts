/**
 * Admin Testimonials API Edge Function
 * Handles testimonial CRUD with Supabase Storage uploads
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
// Supabase Storage Helper
// ============================================================================

const TESTIMONIALS_BUCKET = "testimonials";

async function uploadToStorage(supabase: SupabaseClient, file: File, folder: string) {
  const timestamp = Date.now();
  const fileExt = file.name.split('.').pop() || 'tmp';
  const fileName = `${folder}/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(TESTIMONIALS_BUCKET)
    .upload(fileName, file, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(TESTIMONIALS_BUCKET)
    .getPublicUrl(fileName);

  return { publicUrl, path: fileName };
}

async function deleteFromStorage(supabase: SupabaseClient, path: string) {
  if (!path) return;
  const { error } = await supabase.storage
    .from(TESTIMONIALS_BUCKET)
    .remove([path]);
  if (error) console.error("Storage delete error:", error);
}

// ============================================================================
// Testimonial Mapping
// ============================================================================

function mapTestimonial(doc: any) {
  return {
    id: doc.id,
    name: doc.name || "",
    role: doc.role || "",
    company: doc.company || "",
    quote: doc.quote || "",
    rating: doc.rating || 5,
    imageUrl: doc.image_url || "",
    videoUrl: doc.video_url || "",
    publicId: doc.public_id || "", // This stores "video_path|thumbnail_path"
    featured: Boolean(doc.featured),
    order: doc.sort_order || 0,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    // Add legacy support for frontend expectations if any
    secureUrl: doc.video_url || "",
    thumbnailUrl: doc.image_url || "",
    active: Boolean(doc.featured), // Assuming active maps to featured or similar
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
    
    const funcIndex = pathParts.indexOf("admin-testimonials-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // ========================================================================
    // LIST TESTIMONIALS - GET /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data: items, error } = await supabase
        .from("testimonials")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ items: (items || []).map(mapTestimonial) }, 200, cors);
    }

    // ========================================================================
    // CREATE TESTIMONIAL - POST / (multipart or JSON)
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      let payload: any = {};
      let videoFile: File | null = null;
      let thumbnailFile: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        payload = {
          name: formData.get("name") as string,
          role: formData.get("role") as string,
          company: formData.get("company") as string,
          quote: formData.get("quote") as string,
          rating: Number(formData.get("rating")) || 5,
          featured: formData.get("active") === "true", // Aligning frontend 'active' with 'featured'
          sort_order: Number(formData.get("order")) || 0,
        };
        videoFile = formData.get("video") as File;
        thumbnailFile = formData.get("thumbnail") as File;
      } else {
        const body = await req.json().catch(() => ({}));
        payload = {
          name: body.name,
          role: body.role,
          company: body.company,
          quote: body.quote,
          rating: body.rating || 5,
          featured: Boolean(body.active !== undefined ? body.active : body.featured),
          sort_order: body.order || 0,
          video_url: body.videoUrl,
          image_url: body.imageUrl,
          public_id: body.publicId,
        };
      }

      let videoPath = "";
      let thumbPath = "";

      if (videoFile && videoFile instanceof File && videoFile.size > 0) {
        const { publicUrl, path } = await uploadToStorage(supabase, videoFile, "videos");
        payload.video_url = publicUrl;
        videoPath = path;
      }

      if (thumbnailFile && thumbnailFile instanceof File && thumbnailFile.size > 0) {
        const { publicUrl, path } = await uploadToStorage(supabase, thumbnailFile, "thumbnails");
        payload.image_url = publicUrl;
        thumbPath = path;
      }

      if (videoPath || thumbPath) {
        payload.public_id = `${videoPath}|${thumbPath}`;
      }

      const { data: doc, error } = await supabase
        .from("testimonials")
        .insert([payload])
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ item: mapTestimonial(doc) }, 201, cors);
    }

    // ========================================================================
    // UPDATE TESTIMONIAL - PATCH /:id
    // ========================================================================

    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "PATCH") {
      const id = idMatch[1];

      const { data: doc, error: fetchError } = await supabase
        .from("testimonials")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !doc) {
        return jsonResponse({ error: "Testimonial not found" }, 404, cors);
      }

      const contentType = req.headers.get("content-type") || "";
      let patch: any = {};
      let videoFile: File | null = null;
      let thumbnailFile: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        if (formData.has("name")) patch.name = formData.get("name") as string;
        if (formData.has("role")) patch.role = formData.get("role") as string;
        if (formData.has("company")) patch.company = formData.get("company") as string;
        if (formData.has("quote")) patch.quote = formData.get("quote") as string;
        if (formData.has("rating")) patch.rating = Number(formData.get("rating"));
        if (formData.has("active")) patch.featured = formData.get("active") === "true";
        if (formData.has("featured")) patch.featured = formData.get("featured") === "true";
        if (formData.has("order")) patch.sort_order = Number(formData.get("order"));
        
        videoFile = formData.get("video") as File;
        thumbnailFile = formData.get("thumbnail") as File;
      } else {
        const body = await req.json().catch(() => ({}));
        if (body.name !== undefined) patch.name = body.name;
        if (body.role !== undefined) patch.role = body.role;
        if (body.company !== undefined) patch.company = body.company;
        if (body.quote !== undefined) patch.quote = body.quote;
        if (body.rating !== undefined) patch.rating = body.rating;
        if (body.active !== undefined) patch.featured = Boolean(body.active);
        if (body.featured !== undefined) patch.featured = Boolean(body.featured);
        if (body.order !== undefined) patch.sort_order = body.order;
        if (body.videoUrl !== undefined) patch.video_url = body.videoUrl;
        if (body.imageUrl !== undefined) patch.image_url = body.imageUrl;
      }

      const [oldVideoPath, oldThumbPath] = (doc.public_id || "").split("|");
      let newVideoPath = oldVideoPath || "";
      let newThumbPath = oldThumbPath || "";

      if (videoFile && videoFile instanceof File && videoFile.size > 0) {
        if (oldVideoPath) await deleteFromStorage(supabase, oldVideoPath);
        const { publicUrl, path } = await uploadToStorage(supabase, videoFile, "videos");
        patch.video_url = publicUrl;
        newVideoPath = path;
      }

      if (thumbnailFile && thumbnailFile instanceof File && thumbnailFile.size > 0) {
        if (oldThumbPath) await deleteFromStorage(supabase, oldThumbPath);
        const { publicUrl, path } = await uploadToStorage(supabase, thumbnailFile, "thumbnails");
        patch.image_url = publicUrl;
        newThumbPath = path;
      }

      if (newVideoPath !== oldVideoPath || newThumbPath !== oldThumbPath) {
        patch.public_id = `${newVideoPath}|${newThumbPath}`;
      }

      patch.updated_at = new Date().toISOString();

      const { data: updated, error: updateError } = await supabase
        .from("testimonials")
        .update(patch)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500, cors);
      }

      return jsonResponse({ item: mapTestimonial(updated) }, 200, cors);
    }

    // ========================================================================
    // DELETE TESTIMONIAL - DELETE /:id
    // ========================================================================

    if (idMatch && req.method === "DELETE") {
      const id = idMatch[1];

      const { data: doc } = await supabase
        .from("testimonials")
        .select("public_id")
        .eq("id", id)
        .single();

      if (doc?.public_id) {
        const [vPath, tPath] = doc.public_id.split("|");
        if (vPath) await deleteFromStorage(supabase, vPath);
        if (tPath) await deleteFromStorage(supabase, tPath);
      }

      const { error } = await supabase
        .from("testimonials")
        .delete()
        .eq("id", id);

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ message: "Deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found", path: apiPath }, 404, cors);

  } catch (error) {
    console.error("Admin Testimonials API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
