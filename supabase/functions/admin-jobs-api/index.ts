/// <reference lib="deno.ns" />
/**
 * Admin Jobs API Edge Function
 * Handles jobs and applications CRUD
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

function mapJob(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    salary: row.salary,
    type: row.type,
    description: row.description,
    isFeatured: row.is_featured,
    postedAt: row.posted_at || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApplication(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    job: row.job_id,
    user: row.user_id,
    applicantName: row.applicant_name,
    applicantEmail: row.applicant_email,
    applicantPhone: row.applicant_phone,
    resumeSnapshot: row.resume_snapshot || {},
    resumeUrl: row.resume_url,
    coverLetter: row.cover_letter,
    status: row.status,
    appliedAt: row.applied_at || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobData: row.jobs ? { title: row.jobs.title, company: row.jobs.company } : null,
    userData: row.users ? { firstName: row.users.first_name, lastName: row.users.last_name, email: row.users.email, personalDetails: row.users.personal_details } : null,
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
    const funcIndex = pathParts.indexOf("admin-jobs-api");
    const apiPath = "/" + pathParts.slice(funcIndex + 1).join("/");

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);

    // LIST JOBS
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data, error } = await supabase.from("jobs").select("*").order("updated_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({ items: (data || []).map(mapJob) }, 200, cors);
    }

    // CREATE/UPDATE JOB
    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { id, title, company, location, salary, type, description, isFeatured } = body;
      
      const payload: any = {
        title, company, location, salary, type, description,
        is_featured: isFeatured !== undefined ? isFeatured : false,
        updated_at: new Date().toISOString()
      };

      let result;
      if (id) {
         const { data, error } = await supabase.from("jobs").update(payload).eq("id", id).select().single();
         if (error) return jsonResponse({ error: error.message }, 500, cors);
         result = data;
      } else {
         payload.posted_at = new Date().toISOString();
         const { data, error } = await supabase.from("jobs").insert([payload]).select().single();
         if (error) return jsonResponse({ error: error.message }, 500, cors);
         result = data;
      }
      return jsonResponse(mapJob(result), 201, cors);
    }
    
    // UPDATE JOB PUT
    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    if (idMatch && req.method === "PUT") {
      const id = idMatch[1];
      const body = await req.json().catch(() => ({}));
      const payload: any = { ...body, updated_at: new Date().toISOString() }; // Basic spread, refine if needed
      // Map body camelCase to snake_case if strictly needed or rely on body matching db cols?
      // Better be safe:
      const dbPayload: any = { updated_at: new Date().toISOString() };
      if (body.title) dbPayload.title = body.title;
      if (body.company) dbPayload.company = body.company;
      if (body.location) dbPayload.location = body.location;
      if (body.salary) dbPayload.salary = body.salary;
      if (body.type) dbPayload.type = body.type;
      if (body.description) dbPayload.description = body.description;
      if (body.isFeatured !== undefined) dbPayload.is_featured = body.isFeatured;

      const { data, error } = await supabase.from("jobs").update(dbPayload).eq("id", id).select().single();
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse(mapJob(data), 200, cors);
    }

    // LIST APPLICATIONS
    const appsMatch = apiPath.match(/^\/([0-9a-f-]+)\/applications$/i);
    if (appsMatch && req.method === "GET") {
      const jobId = appsMatch[1];
      const { data, error } = await supabase
        .from("job_applications")
        .select("*, jobs(title, company), users(first_name, last_name, email, personal_details)")
        .eq("job_id", jobId)
        .order("applied_at", { ascending: false });
      
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({ items: (data || []).map(mapApplication) }, 200, cors);
    }

    // UPDATE APPLICATION STATUS
    const statusMatch = apiPath.match(/^\/applications\/([0-9a-f-]+)\/status$/i);
    if (statusMatch && req.method === "PUT") {
      const appId = statusMatch[1];
      const { status } = await req.json().catch(() => ({}));
      if (!status || !["submitted", "review", "accepted", "rejected"].includes(status)) {
        return jsonResponse({ error: "Invalid status" }, 400, cors);
      }
      const { data, error } = await supabase
        .from("job_applications")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", appId)
        .select()
        .single();
      
      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse(mapApplication(data), 200, cors);
    }

    // METRICS
    if (apiPath === "/metrics/summary" && req.method === "GET") {
       // Simple counts
       const { count: jobsCount } = await supabase.from("jobs").select("*", { count: "exact", head: true });
       const { count: appsCount } = await supabase.from("job_applications").select("*", { count: "exact", head: true });
       return jsonResponse({ totalJobs: jobsCount || 0, totalApplications: appsCount || 0 }, 200, cors);
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
