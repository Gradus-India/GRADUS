/**
 * Admin Website Users API Edge Function
 * Handles management of Public Website Users (Learners)
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

function normalizeDetails(details: any) {
  const d = details || {};
  return d;
}

function mapUser(user: any, enrollments: any[], logs: any[]) {
  // Compute basic stats
  const totalLogins = logs.filter(l => l.type && l.type.includes("LOGIN")).length;
  const lastLogin = logs.find(l => l.type && l.type.includes("LOGIN"))?.created_at || null;

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    mobile: user.mobile,
    personalDetails: normalizeDetails(user.personal_details),
    educationDetails: normalizeDetails(user.education_details),
    emailVerified: user.email_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    loginStats: {
      totalLogins,
      lastLoginAt: lastLogin,
    },
    enrollments: enrollments.map(e => ({
      id: e.id,
      courseName: e.courses?.name,
      status: e.status,
      paymentStatus: e.payment_status,
      enrolledAt: e.created_at
    })),
  };
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const funcIndex = pathParts.indexOf("admin-website-users-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET / - List users
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const search = url.searchParams.get("search");
      
      let query = supabase.from("users").select("*");
      if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);

      const { data: users, error } = await query.order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500, cors);

      const userIds = (users || []).map((u: any) => u.id);
      if (userIds.length === 0) return jsonResponse({ users: [] }, 200, cors);

      // Fetch enrollments
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("*, courses(name)")
        .in("user_id", userIds);

      // Fetch logs
      const { data: logs } = await supabase
        .from("user_auth_logs")
        .select("*")
        .in("user_id", userIds)
        .order("created_at", { ascending: false });

      const mappedUsers = (users || []).map((u: any) => {
         const userEnrollments = (enrollments || []).filter((e: any) => e.user_id === u.id);
         const userLogs = (logs || []).filter((l: any) => l.user_id === u.id);
         return mapUser(u, userEnrollments, userLogs);
      });

      return jsonResponse({ users: mappedUsers }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
