/// <reference lib="deno.ns" />
/**
 * Admin Assignments API Edge Function
 * Handles assignment creation and grading
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

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-assignments-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET / - List
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
        const { data: items, error } = await supabase.from("assignments").select("*").order("due_date", { ascending: true });
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ items }, 200, cors);
    }
    
    // POST / - Create
    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        // Basic insert
        const { data, error } = await supabase.from("assignments").insert([{
           title: body.title,
           course_slug: body.courseSlug,
           description: body.description,
           max_points: body.maxPoints || 100,
           due_date: body.dueDate,
           instructions: body.instructions || "",
           tags: body.tags || [],
           created_by: admin.id
        }]).select().single();
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ assignment: data }, 201, cors);
    }

    // GET /:id/submissions
    if (apiPath.endsWith("/submissions") && req.method === "GET") {
        const id = apiPath.split("/")[1];
        const { data: subs, error } = await supabase.from("assignment_submissions").select("*").eq("assignment_id", id);
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ items: subs || [] }, 200, cors);
    }

    // PUT /submissions/:id/grade
    if (apiPath.startsWith("/submissions/") && apiPath.endsWith("/grade") && req.method === "PUT") {
        const match = apiPath.match(/\/submissions\/([0-9a-f-]+)\/grade/);
        if (!match) return jsonResponse({ error: "Invalid path" }, 400, cors);
        const submissionId = match[1];
        const { score, feedback } = await req.json().catch(() => ({}));
        
        const { data: updated, error } = await supabase.from("assignment_submissions").update({
           score,
           feedback,
           status: "graded",
           graded_at: new Date(),
           graded_by: admin.id
        }).eq("id", submissionId).select().single();
        
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ submission: updated }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
