/// <reference lib="deno.ns" />
/**
 * Admin Blogs API Edge Function
 * Handles blog CRUD and comments with Cloudinary image uploads
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

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}

// ============================================================================
// JWT Verification
// ============================================================================

const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

async function getJwtKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey("raw", encoder.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
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
    const { data: adminData } = await supabase.from("admin_users").select("*").eq("supabase_id", supabaseUser.user.id).single();
    if (adminData) return { admin: adminData };
  }

  const payload = await verifyJwt(token);
  if (payload?.sub) {
    const { data: adminData } = await supabase.from("admin_users").select("*").eq("id", payload.sub).single();
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
const BLOG_FOLDER = "gradus/blogs";

async function generateSignature(params: Record<string, string>, secret: string) {
  const keys = Object.keys(params).sort();
  const signString = keys.map((key) => `${key}=${params[key]}`).join("&") + secret;
  const encoder = new TextEncoder();
  const data = encoder.encode(signString);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function uploadToCloudinary(file: File, folder: string = BLOG_FOLDER) {
  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramsToSign: Record<string, string> = { timestamp, folder };
  const signature = await generateSignature(paramsToSign, API_SECRET);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });

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
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, { method: "POST", body: formData });
  } catch (e) {
    console.error("Cloudinary delete error:", e);
  }
}

// ============================================================================
// Blog Mapping & Helpers
// ============================================================================

function mapBlog(doc: any) {
  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    category: doc.category,
    author: doc.author,
    tags: doc.tags || [],
    excerpt: doc.excerpt,
    content: doc.content,
    featuredImage: doc.featured_image,
    featuredImagePublicId: doc.featured_image_public_id,
    meta: { views: doc.meta?.views || 0, comments: doc.meta?.comments || 0 },
    publishedAt: doc.published_at,
    createdAt: doc.created_at,
  };
}

function normalizeTags(input: any): string[] {
  if (!input) return [];
  let rawTags = input;
  if (typeof rawTags === "string") {
    const trimmed = rawTags.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try { rawTags = JSON.parse(trimmed); } catch { rawTags = trimmed.split(","); }
    } else {
      rawTags = trimmed.split(",");
    }
  }
  if (!Array.isArray(rawTags)) return [];
  return rawTags.map((tag: any) => String(tag || "").trim()).filter((tag: string) => tag.length > 0).map((tag: string) => tag.startsWith("#") ? tag : `#${tag}`);
}

async function buildUniqueSlug(title: string, currentId: string | null, supabase: any): Promise<string> {
  const baseSlug = slugify(title);
  if (!baseSlug) throw new Error("Unable to generate slug from title");

  let uniqueSlug = baseSlug;
  let suffix = 1;

  while (suffix < 1000) {
    let query = supabase.from("blogs").select("id").eq("slug", uniqueSlug);
    if (currentId) query = query.neq("id", currentId);
    const { data: existing } = await query.maybeSingle();
    if (!existing) return uniqueSlug;
    uniqueSlug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  throw new Error("Unable to generate a unique slug");
}

function buildCommentTree(comments: any[], includeEmail = false, includeStatus = false): any[] {
  const commentMap = new Map();
  const roots: any[] = [];

  comments.forEach((c) => {
    commentMap.set(c.id, { id: c.id, name: c.name, email: includeEmail ? c.email : undefined, status: includeStatus ? c.status : undefined, content: c.content, createdAt: c.created_at, parentCommentId: c.parent_comment_id, replies: [] });
  });

  commentMap.forEach((c) => {
    if (c.parentCommentId && commentMap.has(c.parentCommentId)) {
      commentMap.get(c.parentCommentId).replies.push(c);
    } else {
      roots.push(c);
    }
  });

  return roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);

    const funcIndex = pathParts.indexOf("admin-blogs-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // ========================================================================
    // LIST BLOGS - GET /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const search = url.searchParams.get("search");
      const category = url.searchParams.get("category");

      let query = supabase.from("blogs").select("*");
      if (search) query = query.ilike("title", `%${search}%`);
      if (category) query = query.ilike("category", category);
      // Fetch with initial order by created_at for performance
      query = query.order("created_at", { ascending: false });

      const { data: blogs, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500, cors);

      // Sort by published_at if available, otherwise created_at (newest first)
      const sortedBlogs = (blogs || []).sort((a, b) => {
        const dateA = new Date(a.published_at || a.created_at).getTime();
        const dateB = new Date(b.published_at || b.created_at).getTime();
        return dateB - dateA; // Descending (newest first)
      });

      return jsonResponse({ items: sortedBlogs.map(mapBlog) }, 200, cors);
    }

    // ========================================================================
    // CREATE BLOG - POST / (multipart or JSON)
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      let title = "", category = "", content = "", excerpt = "", author = "", publishedAt = "", tags: any = [];
      let imageFile: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        title = formData.get("title") as string || "";
        category = formData.get("category") as string || "";
        content = formData.get("content") as string || "";
        excerpt = formData.get("excerpt") as string || "";
        author = formData.get("author") as string || "";
        publishedAt = formData.get("publishedAt") as string || "";
        tags = formData.get("tags");
        imageFile = formData.get("featuredImage") as File;
      } else {
        const body = await req.json().catch(() => ({}));
        title = body.title || "";
        category = body.category || "";
        content = body.content || "";
        excerpt = body.excerpt || "";
        author = body.author || "";
        publishedAt = body.publishedAt || "";
        tags = body.tags;
      }

      if (!title.trim()) return jsonResponse({ error: "Title is required" }, 400, cors);
      if (!category.trim()) return jsonResponse({ error: "Category is required" }, 400, cors);
      if (!content.trim()) return jsonResponse({ error: "Content is required" }, 400, cors);

      const slug = await buildUniqueSlug(title, null, supabase);
      let featuredImage = null;
      let featuredImagePublicId = null;

      if (imageFile && imageFile instanceof File && imageFile.size > 0) {
        const uploadResult = await uploadToCloudinary(imageFile);
        featuredImage = uploadResult.secure_url;
        featuredImagePublicId = uploadResult.public_id;
      }

      const { data: blog, error } = await supabase.from("blogs").insert([{
        title: title.trim(),
        slug,
        category: category.trim(),
        excerpt: excerpt?.trim() || null,
        content,
        featured_image: featuredImage,
        featured_image_public_id: featuredImagePublicId,
        author: author?.trim() || null,
        tags: normalizeTags(tags),
        published_at: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
      }]).select().single();

      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse(mapBlog(blog), 201, cors);
    }

    // ========================================================================
    // GET BLOG - GET /:blogId
    // ========================================================================

    const blogIdMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    const commentsMatch = apiPath.match(/^\/([0-9a-f-]+)\/comments$/i);
    const commentDeleteMatch = apiPath.match(/^\/([0-9a-f-]+)\/comments\/([0-9a-f-]+)$/i);

    if (blogIdMatch && !commentsMatch && req.method === "GET") {
      const blogId = blogIdMatch[1];
      const { data: blog, error } = await supabase.from("blogs").select("*").eq("id", blogId).single();
      if (error || !blog) return jsonResponse({ error: "Blog not found" }, 404, cors);
      return jsonResponse({ blog: mapBlog(blog) }, 200, cors);
    }

    // ========================================================================
    // UPDATE BLOG - PUT /:blogId
    // ========================================================================

    if (blogIdMatch && !commentsMatch && req.method === "PUT") {
      const blogId = blogIdMatch[1];
      const { data: existing, error: fetchError } = await supabase.from("blogs").select("*").eq("id", blogId).single();
      if (fetchError || !existing) return jsonResponse({ error: "Blog not found" }, 404, cors);

      const contentType = req.headers.get("content-type") || "";
      let title = "", category = "", content = "", excerpt = "", author = "", publishedAt = "", tags: any = [], removeFeaturedImage = false;
      let imageFile: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        title = formData.get("title") as string || "";
        category = formData.get("category") as string || "";
        content = formData.get("content") as string || "";
        excerpt = formData.get("excerpt") as string || "";
        author = formData.get("author") as string || "";
        publishedAt = formData.get("publishedAt") as string || "";
        tags = formData.get("tags");
        removeFeaturedImage = formData.get("removeFeaturedImage") === "true";
        imageFile = formData.get("featuredImage") as File;
      } else {
        const body = await req.json().catch(() => ({}));
        title = body.title || "";
        category = body.category || "";
        content = body.content || "";
        excerpt = body.excerpt || "";
        author = body.author || "";
        publishedAt = body.publishedAt || "";
        tags = body.tags;
        removeFeaturedImage = body.removeFeaturedImage === true;
      }

      if (!title.trim()) return jsonResponse({ error: "Title is required" }, 400, cors);
      if (!category.trim()) return jsonResponse({ error: "Category is required" }, 400, cors);
      if (!content.trim()) return jsonResponse({ error: "Content is required" }, 400, cors);

      const slug = await buildUniqueSlug(title, existing.id, supabase);
      let featuredImage = existing.featured_image;
      let featuredImagePublicId = existing.featured_image_public_id;

      if (imageFile && imageFile instanceof File && imageFile.size > 0) {
        const uploadResult = await uploadToCloudinary(imageFile);
        await deleteFromCloudinary(existing.featured_image_public_id);
        featuredImage = uploadResult.secure_url;
        featuredImagePublicId = uploadResult.public_id;
      } else if (removeFeaturedImage) {
        await deleteFromCloudinary(existing.featured_image_public_id);
        featuredImage = null;
        featuredImagePublicId = null;
      }

      const { data: blog, error } = await supabase.from("blogs").update({
        title: title.trim(),
        slug,
        category: category.trim(),
        excerpt: excerpt?.trim() || null,
        content,
        featured_image: featuredImage,
        featured_image_public_id: featuredImagePublicId,
        author: author?.trim() || null,
        tags: normalizeTags(tags),
        published_at: publishedAt ? new Date(publishedAt).toISOString() : (existing.published_at || new Date().toISOString()),
      }).eq("id", existing.id).select().single();

      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({ blog: mapBlog(blog) }, 200, cors);
    }

    // ========================================================================
    // DELETE BLOG - DELETE /:blogId
    // ========================================================================

    if (blogIdMatch && !commentsMatch && req.method === "DELETE") {
      const blogId = blogIdMatch[1];
      const { data: existing } = await supabase.from("blogs").select("featured_image_public_id").eq("id", blogId).single();
      if (existing?.featured_image_public_id) {
        await deleteFromCloudinary(existing.featured_image_public_id);
      }

      // Delete comments first
      await supabase.from("blog_comments").delete().eq("blog_id", blogId);

      const { error } = await supabase.from("blogs").delete().eq("id", blogId);
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({ message: "Deleted" }, 200, cors);
    }

    // ========================================================================
    // LIST COMMENTS - GET /:blogId/comments
    // ========================================================================

    if (commentsMatch && req.method === "GET") {
      const blogId = commentsMatch[1];
      const { data: comments, error } = await supabase.from("blog_comments").select("*").eq("blog_id", blogId).order("created_at", { ascending: false });
      if (error) return jsonResponse({ items: [] }, 200, cors);
      return jsonResponse({ items: buildCommentTree(comments || [], true, true) }, 200, cors);
    }

    // ========================================================================
    // CREATE COMMENT - POST /:blogId/comments
    // ========================================================================

    if (commentsMatch && req.method === "POST") {
      const blogId = commentsMatch[1];
      const body = await req.json().catch(() => ({}));

      if (!body.content?.trim()) return jsonResponse({ error: "Comment content is required" }, 400, cors);

      const { data: blog } = await supabase.from("blogs").select("id, meta").eq("id", blogId).single();
      if (!blog) return jsonResponse({ error: "Blog not found" }, 404, cors);

      const { data: comment, error } = await supabase.from("blog_comments").insert([{
        blog_id: blogId,
        name: admin.full_name || admin.email || "Admin",
        email: admin.email || "admin@gradus.local",
        content: body.content.trim(),
        parent_comment_id: body.parentCommentId || null,
        status: "approved",
      }]).select().single();

      if (error) return jsonResponse({ error: error.message }, 500, cors);

      // Update comment count
      try {
        const currentComments = blog.meta?.comments || 0;
        await supabase.from("blogs").update({ meta: { ...blog.meta, comments: currentComments + 1 } }).eq("id", blogId);
      } catch { /* ignore */ }

      return jsonResponse({ id: comment.id, name: comment.name, email: comment.email, content: comment.content, createdAt: comment.created_at, parentCommentId: comment.parent_comment_id, replies: [] }, 201, cors);
    }

    // ========================================================================
    // DELETE COMMENT - DELETE /:blogId/comments/:commentId
    // ========================================================================

    if (commentDeleteMatch && req.method === "DELETE") {
      const blogId = commentDeleteMatch[1];
      const commentId = commentDeleteMatch[2];

      // Delete comment and its replies recursively
      const { data: allComments } = await supabase.from("blog_comments").select("id, parent_comment_id").eq("blog_id", blogId);

      const childrenMap = new Map<string, string[]>();
      (allComments || []).forEach((c: any) => {
        const pid = c.parent_comment_id;
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(c.id);
      });

      const collectIds = (id: string): string[] => {
        const ids = [id];
        const kids = childrenMap.get(id) || [];
        kids.forEach((kid) => ids.push(...collectIds(kid)));
        return ids;
      };

      const idsToDelete = collectIds(commentId);
      const { error } = await supabase.from("blog_comments").delete().in("id", idsToDelete);

      if (error) return jsonResponse({ error: error.message }, 500, cors);

      // Update comment count
      try {
        const { data: blog } = await supabase.from("blogs").select("meta").eq("id", blogId).single();
        if (blog) {
          const newCount = Math.max(0, (blog.meta?.comments || 0) - idsToDelete.length);
          await supabase.from("blogs").update({ meta: { ...blog.meta, comments: newCount } }).eq("id", blogId);
        }
      } catch { /* ignore */ }

      return jsonResponse({ message: "Deleted", count: idsToDelete.length }, 200, cors);
    }

    return jsonResponse({ error: "Not found", path: apiPath }, 404, cors);

  } catch (error) {
    console.error("Admin Blogs API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
