/// <reference lib="deno.ns" />
/// <reference lib="deno.ns" />
// Force deploy
/**
 * Admin Analytics API Edge Function
 * Handles reporting and stats
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
    const funcIndex = pathParts.indexOf("admin-analytics-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET /visitors/summary
    if (apiPath === "/visitors/summary" && req.method === "GET") {
        const now = new Date();
        const startDay = new Date(now.setHours(0,0,0,0));
        const dayIso = startDay.toISOString();
        
        // Count today
        const { count: todayVisits } = await supabase.from("site_visits").select("*", { count: "exact", head: true }).gte("visited_at", dayIso);
        
        // Count total
        const { count: totalVisits } = await supabase.from("site_visits").select("*", { count: "exact", head: true });
        
        return jsonResponse({
            totalVisits: totalVisits || 0,
            todayVisits: todayVisits || 0,
            uniqueVisitors: 0, // Approximate
            weekVisits: 0,
            monthVisits: 0
        }, 200, cors);
    }
    
    // GET /blog/engagement
    if (apiPath === "/blogs/engagement" && req.method === "GET") {
        // Mocked or simple implementation
        return jsonResponse([], 200, cors);
    }

    // GET /page-views
    if (apiPath === "/page-views" && req.method === "GET") {
        const { data: visits } = await supabase.from("site_visits").select("*").order("visited_at", { ascending: false }).limit(100);
        return jsonResponse({
            summary: { totalVisits: visits?.length || 0 },
            pages: []
        }, 200, cors);
    }

    // GET /visitors/monthly
    if (apiPath === "/visitors/monthly" && req.method === "GET") {
        return jsonResponse({
            months: [],
            visits: [] 
        }, 200, cors);
    }

    // GET /visitors/locations
    if (apiPath === "/visitors/locations" && req.method === "GET") {
        return jsonResponse([], 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
