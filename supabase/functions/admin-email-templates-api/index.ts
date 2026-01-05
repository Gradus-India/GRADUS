/// <reference lib="deno.ns" />
/**
 * Admin Email Templates API Edge Function
 * Handles transactional email templates
 */
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  // Default to admin domain if no origin (e.g. strict mode), or localhost
  const allowedOrigin = origin || "https://admin.gradusindia.in"; 

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

// Hardcoded definitions since we cannot import from other files easily in Edge Functions without deno.land URL
const TEMPLATE_DEFINITIONS: Record<string, any> = {
  "welcome_email": { key: "welcome_email", name: "Welcome Email", variables: [{ token: "{{name}}" }] },
  "reset_password": { key: "reset_password", name: "Reset Password", variables: [{ token: "{{link}}" }] },
  "event_registration": { key: "event_registration", name: "Event Registration", variables: [{ token: "{{name}}" }, { token: "{{event_name}}" }] },
  // Add others as needed or fetch dynamically
};

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");
    
    // Robust routing: Match suffix regardless of function name
    // e.g. .../event_registration -> key=event_registration
    const pathParts = path.split("/");
    const lastPart = pathParts[pathParts.length - 1]; // could be key or 'admin-email-templates-api'

    // If path ends with specific key
    const potentialKey = lastPart;
    
    // Auth check
    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // GET / (List) - check if path ends with function name or is root
    // Simplistic check: if match found in templates, return item, else list
    // OR: check if path contains "admin-email-templates-api" and nothing after
    
    // Let's rely on TEMPLATE_DEFINITIONS presence
    if (TEMPLATE_DEFINITIONS[potentialKey]) {
        // GET /:key, PUT /:key
        const key = potentialKey;
        if (req.method === "GET") {
            const { data: record } = await supabase.from("email_templates").select("*").eq("key", key).single();
            const def = TEMPLATE_DEFINITIONS[key];
            return jsonResponse({ item: {
               key,
               name: def?.name || key,
               subject: record?.subject || "",
               html: record?.html || "",
               text: record?.text || ""
            }}, 200, cors);
        }
        if (req.method === "PUT") {
            const { subject, html, text } = await req.json().catch(() => ({}));
            const { data, error } = await supabase.from("email_templates").upsert({
               key,
               subject,
               html,
               text,
               updated_by: admin.id,
               updated_at: new Date().toISOString()
            }, { onConflict: "key" }).select().single();
            
            if (error) return jsonResponse({ error: error.message }, 500, cors);
            return jsonResponse({ message: "Saved", item: data }, 200, cors);
        }
    }

    // Default List if typical list path or empty suffix
    if (req.method === "GET") {
        const { data: records } = await supabase.from("email_templates").select("*");
        const items = Object.values(TEMPLATE_DEFINITIONS).map(def => {
            const rec = records?.find((r: any) => r.key === def.key);
            return {
               key: def.key,
               name: def.name,
               isCustomized: !!rec,
               updatedAt: rec?.updated_at
            };
        });
        return jsonResponse({ items }, 200, cors);
    }
    
    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
