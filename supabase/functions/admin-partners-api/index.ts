/// <reference lib="deno.ns" />
/**
 * Admin Partners API Edge Function
 * Handles partner logo CRUD with Cloudinary image uploads
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
const PARTNER_FOLDER = "gradus/partners";

async function generateSignature(params: Record<string, string>, secret: string) {
  const keys = Object.keys(params).sort();
  const signString = keys.map((key) => `${key}=${params[key]}`).join("&") + secret;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(signString);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function uploadToCloudinary(file: File, folder: string = PARTNER_FOLDER) {
  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramsToSign: Record<string, string> = { timestamp, folder };
  const signature = await generateSignature(paramsToSign, API_SECRET);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
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
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
      method: "POST",
      body: formData
    });
  } catch (e) {
    console.error("Cloudinary delete error:", e);
  }
}

// ============================================================================
// Partner Mapping
// ============================================================================

function mapPartner(doc: any) {
  return {
    id: doc.id,
    name: doc.name || "",
    logoUrl: doc.logo_url || "",
    websiteUrl: doc.website_url || "",
    publicId: doc.public_id || "",
    category: doc.category || "",
    order: doc.sort_order || 0,
    active: Boolean(doc.is_active),
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
    
    const funcIndex = pathParts.indexOf("admin-partners-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // ========================================================================
    // LIST PARTNERS - GET /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data: items, error } = await supabase
        .from("partners")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ items: (items || []).map(mapPartner) }, 200, cors);
    }

    // ========================================================================
    // CREATE PARTNER(S) - POST / (multipart, supports bulk)
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      
      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        
        // Check for bulk upload
        const logos = formData.getAll("logos") as File[];
        const singleLogo = formData.get("logo") as File;
        
        if (logos.length > 0) {
          // Bulk upload
          const items: any[] = [];
          for (const logo of logos) {
            if (logo instanceof File && logo.size > 0) {
              const uploadResult = await uploadToCloudinary(logo);
              const name = logo.name.replace(/\.[^/.]+$/, "");
              
              const { data: doc, error } = await supabase
                .from("partners")
                .insert([{
                  name,
                  logo_url: uploadResult.secure_url,
                  public_id: uploadResult.public_id,
                  is_active: true,
                }])
                .select()
                .single();
              
              if (!error && doc) {
                items.push(mapPartner(doc));
              }
            }
          }
          return jsonResponse({ items, count: items.length }, 201, cors);
        } else if (singleLogo && singleLogo instanceof File && singleLogo.size > 0) {
          // Single upload
          const uploadResult = await uploadToCloudinary(singleLogo);
          
          const payload = {
            name: (formData.get("name") as string) || singleLogo.name.replace(/\.[^/.]+$/, ""),
            logo_url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
            website_url: formData.get("websiteUrl") as string,
            category: formData.get("category") as string,
            sort_order: Number(formData.get("order")) || 0,
            is_active: formData.get("active") !== "false",
          };

          const { data: doc, error } = await supabase
            .from("partners")
            .insert([payload])
            .select()
            .single();

          if (error) {
            return jsonResponse({ error: error.message }, 500, cors);
          }

          return jsonResponse({ item: mapPartner(doc) }, 201, cors);
        }
        
        return jsonResponse({ error: "No logo provided" }, 400, cors);
      } else {
        // JSON body (no image upload)
        const body = await req.json().catch(() => ({}));
        
        const payload = {
          name: body.name,
          logo_url: body.logoUrl,
          website_url: body.websiteUrl,
          category: body.category,
          sort_order: body.order || 0,
          is_active: body.active !== false,
        };

        const { data: doc, error } = await supabase
          .from("partners")
          .insert([payload])
          .select()
          .single();

        if (error) {
          return jsonResponse({ error: error.message }, 500, cors);
        }

        return jsonResponse({ item: mapPartner(doc) }, 201, cors);
      }
    }

    // ========================================================================
    // UPDATE PARTNER - PATCH /:id
    // ========================================================================

    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "PATCH") {
      const id = idMatch[1];

      const { data: doc, error: fetchError } = await supabase
        .from("partners")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !doc) {
        return jsonResponse({ error: "Partner not found" }, 404, cors);
      }

      const contentType = req.headers.get("content-type") || "";
      let patch: any = {};
      let logoFile: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        if (formData.has("name")) patch.name = formData.get("name") as string;
        if (formData.has("websiteUrl")) patch.website_url = formData.get("websiteUrl") as string;
        if (formData.has("category")) patch.category = formData.get("category") as string;
        if (formData.has("order")) patch.sort_order = Number(formData.get("order"));
        if (formData.has("active")) patch.is_active = formData.get("active") === "true";
        logoFile = formData.get("logo") as File;
      } else {
        const body = await req.json().catch(() => ({}));
        if (body.name !== undefined) patch.name = body.name;
        if (body.websiteUrl !== undefined) patch.website_url = body.websiteUrl;
        if (body.logoUrl !== undefined) patch.logo_url = body.logoUrl;
        if (body.category !== undefined) patch.category = body.category;
        if (body.order !== undefined) patch.sort_order = body.order;
        if (body.active !== undefined) patch.is_active = Boolean(body.active);
      }

      if (logoFile && logoFile instanceof File && logoFile.size > 0) {
        const uploadResult = await uploadToCloudinary(logoFile);
        patch.logo_url = uploadResult.secure_url;
        patch.public_id = uploadResult.public_id;
        await deleteFromCloudinary(doc.public_id);
      }

      patch.updated_at = new Date().toISOString();

      const { data: updated, error: updateError } = await supabase
        .from("partners")
        .update(patch)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500, cors);
      }

      return jsonResponse({ item: mapPartner(updated) }, 200, cors);
    }

    // ========================================================================
    // DELETE PARTNER - DELETE /:id
    // ========================================================================

    if (idMatch && req.method === "DELETE") {
      const id = idMatch[1];

      const { data: doc } = await supabase
        .from("partners")
        .select("public_id")
        .eq("id", id)
        .single();

      if (doc?.public_id) {
        await deleteFromCloudinary(doc.public_id);
      }

      const { error } = await supabase
        .from("partners")
        .delete()
        .eq("id", id);

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ message: "Deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found", path: apiPath }, 404, cors);

  } catch (error) {
    console.error("Admin Partners API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
