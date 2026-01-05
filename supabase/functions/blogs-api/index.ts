/// <reference lib="deno.ns" />

import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";



const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin") || req.headers.get("origin");
  const allowedOrigin = origin || "http://localhost:5173";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
};

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);
    const routeParts = segments.slice(1);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. List Blogs: GET /
    if (req.method === "GET" && routeParts.length === 0) {
      const limit = Number(url.searchParams.get("limit")) || 20;
      const category = url.searchParams.get("category");



      // Fetch a larger batch to handle mixing of published/created dates in memory sorting
      // We sort by created_at in DB as a rough initial order to get recent items
      const fetchLimit = 100;
      let query = supabase.from("blogs").select("*");
      if (category) {
        query = query.ilike("category", category);
      }
      query = query.order("created_at", { ascending: false }).limit(fetchLimit);

      const { data: blogs, error } = await query;
      if (error) throw error;

      // Robust Sort: Use published_at if available, otherwise created_at
      const sortedBlogs = (blogs || []).sort((a, b) => {
        const dateA = new Date(a.published_at || a.created_at).getTime();
        const dateB = new Date(b.published_at || b.created_at).getTime();
        return dateB - dateA; // Descending
      });

      // Pagination slice if needed, though we only support simple limit for now
      const pagedBlogs = sortedBlogs.slice(0, limit);

      return new Response(JSON.stringify({ items: pagedBlogs.map(mapSupabaseBlog) }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const slug = routeParts[0];

    // 2. Get Blog Details: GET /:slug
    if (req.method === "GET" && routeParts.length === 1) {
      const { data: blog, error } = await supabase
        .from("blogs")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error || !blog) {
        return new Response(JSON.stringify({ error: "Blog not found" }), { status: 404, headers: cors });
      }

      // Increment View (Fire & Forget)
      incrementView(supabase, blog);

      return new Response(JSON.stringify(mapSupabaseBlog(blog)), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 3. List Comments: GET /:slug/comments
    if (req.method === "GET" && routeParts.length === 2 && routeParts[1] === "comments") {
      const { data: blog } = await supabase.from("blogs").select("id").eq("slug", slug).maybeSingle();
      if (!blog) {
        return new Response(JSON.stringify({ items: [] }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      const { data: comments } = await supabase
        .from("blog_comments")
        .select("*")
        .eq("blog_id", blog.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({ items: buildCommentTreeData(comments || []) }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 4. Create Comment: POST /:slug/comments
    if (req.method === "POST" && routeParts.length === 2 && routeParts[1] === "comments") {
      const body = await req.json();
      const { name, email, content, parentCommentId } = body;

      if (!name || !email || !content) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: cors });
      }

      const { data: blog } = await supabase.from("blogs").select("id, meta").eq("slug", slug).maybeSingle();
      if (!blog) {
        return new Response(JSON.stringify({ error: "Blog not found" }), { status: 404, headers: cors });
      }

      const { data: comment, error } = await supabase
        .from("blog_comments")
        .insert([{
          blog_id: blog.id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          content: content.trim(),
          parent_comment_id: parentCommentId || null,
          status: "pending"
        }])
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({
        id: comment.id,
        name: comment.name,
        content: comment.content,
        createdAt: comment.created_at,
        parentCommentId: comment.parent_comment_id,
        replies: []
      }), { status: 201, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  }
});

// Helpers
const incrementView = async (supabase: any, blog: any) => {
  try {
    const current = blog.meta?.views || 0;
    const newMeta = { ...blog.meta, views: current + 1 };
    await supabase.from("blogs").update({ meta: newMeta }).eq("id", blog.id);
  } catch (e) { }
};

const mapSupabaseBlog = (doc: any) => ({
  id: doc.id,
  title: doc.title,
  slug: doc.slug,
  category: doc.category,
  author: doc.author,
  tags: doc.tags || [],
  excerpt: doc.excerpt,
  content: doc.content,
  featuredImage: doc.featured_image,
  meta: {
    views: doc.meta?.views || 0,
    comments: doc.meta?.comments || 0,
  },
  publishedAt: doc.published_at,
  createdAt: doc.created_at,
});

const buildCommentTreeData = (comments: any[]) => {
  const map = new Map();
  const roots: any[] = [];

  comments.forEach(c => {
    const mapped = {
      id: c.id,
      name: c.name,
      content: c.content,
      createdAt: c.created_at,
      parentCommentId: c.parent_comment_id,
      replies: []
    };
    map.set(c.id, mapped);
  });

  map.forEach(c => {
    if (c.parentCommentId && map.has(c.parentCommentId)) {
      map.get(c.parentCommentId).replies.push(c);
    } else {
      roots.push(c);
    }
  });

  roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return roots;
};
