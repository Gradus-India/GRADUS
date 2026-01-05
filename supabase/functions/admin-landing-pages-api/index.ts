
/// <reference lib="deno.ns" />
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ===========================================
// CORS & Helpers
// ===========================================

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

// ===========================================
// JWT Verification
// ===========================================

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

// ===========================================
// Main Handler
// ===========================================

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

    // /admin-landing-pages-api/landing-pages or just /admin-landing-pages-api
    const funcIndex = pathParts.indexOf("admin-landing-pages-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // LIST
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data, error } = await supabase
        .from("landing_pages")
        .select("id, slug, title, hero, mentor, created_at, updated_at, is_published")
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500, cors);

      // Map to frontend expectation (_id as id)
      const mapped = (data || []).map(p => ({
        _id: p.id,
        slug: p.slug,
        title: p.title,
        hero: p.hero,
        mentor: p.mentor,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        isPublished: p.is_published
      }));

      return jsonResponse(mapped, 200, cors);
    }

    // REGISTRATIONS LIST
    if (apiPath === "/registrations" && req.method === "GET") {
      const { data, error } = await supabase
        .from("landing_page_registrations")
        .select(`
          *,
          landing_pages (
             title,
             slug
          )
        `)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500, cors);

      return jsonResponse({ items: data }, 200, cors);
    }

    // CREATE
    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const body = await req.json();
      const payload = {
        slug: body.slug,
        title: body.title,
        hero: body.hero,
        middle_section: body.middleSection,
        mentor: body.mentor,
        certificate: body.certificate,
        faq: body.faq,
        sticky_footer: body.stickyFooter,
        meta_title: body.metaTitle,
        meta_description: body.metaDescription,
        is_published: body.isPublished,
      };

      const { data, error } = await supabase
        .from("landing_pages")
        .insert([payload])
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({
        _id: data.id,
        ...data
      }, 201, cors);
    }

    // GET by ID or Slug? Frontend seems to use ID for edit?
    // Wait, ListLayer uses `deletePage(page._id)`.
    // FormLayer `apiClient(\`/landing-pages/\${slug}\`)` (Step 2094 line 57).
    // FormLayer `apiClient(\`/landing-pages/\${data._id}\`, { method: 'PUT', ... })` (Step 2094 line 88).
    // So GET uses slug, PUT/DELETE use ID.
    // I need to handle both if possible, or detect UUID vs Slug.

    // Check if ID param is UUID
    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    // Or slug (anything not UUID)
    const slugMatch = apiPath.match(/^\/([^/]+)$/);

    if (apiPath !== "/" && apiPath !== "") {
      const param = apiPath.slice(1); // remove leading slash
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

      // DELETE /:id
      if (req.method === "DELETE") {
        if (!isUuid) return jsonResponse({ error: "Invalid ID" }, 400, cors);
        const { error } = await supabase.from("landing_pages").delete().eq("id", param);
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ message: "Deleted" }, 200, cors);
      }

      // PUT /:id
      if (req.method === "PUT") {
        if (!isUuid) return jsonResponse({ error: "Invalid ID" }, 400, cors);
        const body = await req.json();
        const payload = {
          slug: body.slug,
          title: body.title,
          hero: body.hero,
          middle_section: body.middleSection,
          mentor: body.mentor,
          certificate: body.certificate,
          faq: body.faq,
          sticky_footer: body.stickyFooter,
          meta_title: body.metaTitle,
          meta_description: body.metaDescription,
          is_published: body.isPublished,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from("landing_pages")
          .update(payload)
          .eq("id", param)
          .select()
          .single();

        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ _id: data.id, ...data }, 200, cors);
      }

      // GET /:slug OR /:id
      // Frontend calls GET /landing-pages/:slug
      if (req.method === "GET") {
        let query = supabase.from("landing_pages").select("*");
        if (isUuid) {
          query = query.eq("id", param);
        } else {
          query = query.eq("slug", param);
        }
        const { data, error } = await query.single();

        if (error || !data) return jsonResponse({ error: "Not found" }, 404, cors);

        // Map for frontend form
        const mapped = {
          _id: data.id,
          id: data.id,
          slug: data.slug,
          title: data.title,
          hero: data.hero,
          middleSection: data.middle_section,
          mentor: data.mentor,
          certificate: data.certificate,
          faq: data.faq,
          stickyFooter: data.sticky_footer,
          metaTitle: data.meta_title,
          metaDescription: data.meta_description,
          isPublished: data.is_published,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
        return jsonResponse(mapped, 200, cors);
      }
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, cors);
  }
});
