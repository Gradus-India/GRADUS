/**
 * Admin Permissions API Edge Function
 * Handles CRUD for Admin Roles & Permissions
 */
/// <reference lib="deno.ns" />
// Force deploy
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

const ADMIN_ROLES = [
  { value: "programmer_admin", label: "Programmer(Admin)" },
  { value: "admin", label: "Admin" },
  { value: "seo", label: "SEO" },
  { value: "sales", label: "Sales" },
];
const ADMIN_PAGE_DEFINITIONS = [
   { key: "dashboard", label: "Dashboard" },
   { key: "courses", label: "Courses" },
   // ... others, list can be long, simpler to just allow passing strings
];

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-permissions-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET /me - Get current admin permissions
    if (apiPath === "/me" && req.method === "GET") {
       const role = admin.role || "admin";
       if (role === "programmer_admin") return jsonResponse({ role, allowedPages: ["*"] }, 200, cors);

       const { data: perm } = await supabase.from("admin_permissions").select("allowed_pages").eq("role", role).maybeSingle();
       return jsonResponse({ role, allowedPages: perm?.allowed_pages || [] }, 200, cors);
    }

    // GET / - Get all permissions (Programmer Admin only)
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
       if (admin.role !== "programmer_admin") return jsonResponse({ error: "Access denied" }, 403, cors);

       const { data: perms } = await supabase.from("admin_permissions").select("*");
       const paramsMap: Record<string, string[]> = {};
       
       ADMIN_ROLES.forEach(r => {
          if (r.value === "programmer_admin") {
             paramsMap[r.value] = ["*"];
          } else {
             const p = perms?.find((x: any) => x.role === r.value);
             paramsMap[r.value] = p?.allowed_pages || [];
          }
       });

       return jsonResponse({
          roles: ADMIN_ROLES,
          pages: ADMIN_PAGE_DEFINITIONS, // In simplified form or hardcoded list
          permissions: paramsMap
       }, 200, cors);
    }

    // PUT /:role - Update role permissions
    const roleMatch = apiPath.match(/^\/([a-z_]+)$/i);
    if (roleMatch && req.method === "PUT") {
       if (!["programmer_admin", "admin"].includes(admin.role)) return jsonResponse({ error: "Access denied" }, 403, cors);
       const targetRole = roleMatch[1];
       if (targetRole === "programmer_admin") return jsonResponse({ error: "Cannot limit Programmer Admin" }, 400, cors);

       const { allowedPages } = await req.json().catch(() => ({}));
       if (!Array.isArray(allowedPages)) return jsonResponse({ error: "Invalid allowedPages" }, 400, cors);

       const { data, error } = await supabase.from("admin_permissions").upsert({
          role: targetRole,
          allowed_pages: allowedPages,
          updated_at: new Date().toISOString()
       }, { onConflict: "role" }).select().single();

       if (error) return jsonResponse({ error: error.message }, 500, cors);

       return jsonResponse({
          message: `${targetRole} permissions updated`,
          role: targetRole,
          allowedPages: data.allowed_pages
       }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
