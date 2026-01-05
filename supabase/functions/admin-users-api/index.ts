/**
 * Admin Users API Edge Function
 * Handles management of Admin Accounts
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

const ROLE_PROGRAMMER_ADMIN = "programmer_admin";
const ROLE_ADMIN = "admin";

function normalizeRole(role: string) {
  return role ? role.toLowerCase() : ROLE_ADMIN;
}

function canManageTarget(actorRole: string, targetRole: string) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);

  if (target === ROLE_PROGRAMMER_ADMIN) return actor === ROLE_PROGRAMMER_ADMIN;
  if (actor === ROLE_PROGRAMMER_ADMIN) return true;
  if (actor === ROLE_ADMIN) return target !== ROLE_PROGRAMMER_ADMIN;
  return false;
}

function mapAdminUser(user: any) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status || "active",
    username: user.username,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-users-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET / - List Admins
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
       const status = url.searchParams.get("status");
       const search = url.searchParams.get("search");
       
       let query = supabase.from("admin_users").select("*").neq("email", "deleted@example.com"); // Assuming soft delete logic or just list all
       if (status) query = query.eq("status", status.toLowerCase());
       if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

       const { data, error } = await query;
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       
       return jsonResponse({ users: (data || []).map(mapAdminUser) }, 200, cors);
    }

    // PATCH /:id/status
    const statusMatch = apiPath.match(/^\/([0-9a-f-]+)\/status$/i);
    if (statusMatch && req.method === "PATCH") {
       const targetId = statusMatch[1];
       const { status } = await req.json().catch(() => ({}));
       if (!status || !["active", "inactive"].includes(status)) return jsonResponse({ error: "Invalid status" }, 400, cors);
       
       const { data: target } = await supabase.from("admin_users").select("*").eq("id", targetId).single();
       if (!target) return jsonResponse({ error: "User not found" }, 404, cors);
       
       if (!canManageTarget(admin.role, target.role)) return jsonResponse({ error: "Permission denied" }, 403, cors);
       if (target.id === admin.id) return jsonResponse({ error: "Cannot change own status" }, 400, cors);

       const { data: updated, error } = await supabase.from("admin_users").update({ status }).eq("id", targetId).select().single();
       if (error) return jsonResponse({ error: error.message }, 500, cors);
       
       return jsonResponse({ message: `Admin marked as ${status}`, admin: mapAdminUser(updated) }, 200, cors);
    }

    // PATCH /:id/role
    const roleMatch = apiPath.match(/^\/([0-9a-f-]+)\/role$/i);
    if (roleMatch && req.method === "PATCH") {
       if (normalizeRole(admin.role) !== ROLE_PROGRAMMER_ADMIN) return jsonResponse({ error: "Only Programmer(Admin) can update roles" }, 403, cors);
       
       const targetId = roleMatch[1];
       const { role } = await req.json().catch(() => ({}));
       if (!role) return jsonResponse({ error: "Role required" }, 400, cors);

       const { data: target } = await supabase.from("admin_users").select("*").eq("id", targetId).single();
       if (!target) return jsonResponse({ error: "User not found" }, 404, cors);

       const { data: updated, error } = await supabase.from("admin_users").update({ role: normalizeRole(role) }).eq("id", targetId).select().single();
       if (error) return jsonResponse({ error: error.message }, 500, cors);

       return jsonResponse({ message: `Role updated`, admin: mapAdminUser(updated) }, 200, cors);
    }

    // DELETE /:id
    const deleteMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (deleteMatch && req.method === "DELETE") {
       const targetId = deleteMatch[1];
       const { data: target } = await supabase.from("admin_users").select("*").eq("id", targetId).single();
       if (!target) return jsonResponse({ error: "User not found" }, 404, cors);
       
       if (!canManageTarget(admin.role, target.role)) return jsonResponse({ error: "Permission denied" }, 403, cors);
       if (target.id === admin.id) return jsonResponse({ error: "Cannot remove own account" }, 400, cors);
       
       const { error } = await supabase.from("admin_users").delete().eq("id", targetId);
       if (error) return jsonResponse({ error: error.message }, 500, cors);

       return jsonResponse({ message: "Admin removed" }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
