/// <reference lib="deno.ns" />
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
// JWT & Auth
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
// Serialization
// ============================================================================

function serializeSession(session: any) {
    if (!session) return null;
    return {
        id: session.id,
        title: session.title,
        scheduledFor: session.scheduled_for,
        status: session.status || "scheduled",
        courseName: session.course_name || "Course",
        
        participantCount: 0,
        meetingToken: null, 
        hostSecret: null, // Security
        
        instructor: {
            name: session.host_display_name || "Instructor",
            id: session.host_admin_id
        },
        
        createdAt: session.created_at
    };
}

// ============================================================================
// Handler
// ============================================================================

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }
    
    if (req.method === "GET") {
        const { data: sessions, error } = await supabase
            .from("live_sessions")
            .select("*")
            .order("created_at", { ascending: false });
            
        if (error) {
            return jsonResponse({ error: error.message }, 500, cors);
        }
        
        const list = (sessions || []).map(serializeSession);
        return jsonResponse({ sessions: list }, 200, cors);
    }

    return jsonResponse({ error: "Method not supported yet" }, 405, cors);

  } catch (error) {
    console.error("Admin Live Sessions API Error:", error);
    return jsonResponse({ error: String(error) }, 500, cors);
  }
});
