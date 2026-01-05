/// <reference lib="deno.ns" />
/**
 * Admin Courses API Edge Function
 * Handles all admin course management endpoints:
 * - CRUD for courses
 * - Progress tracking for admin
 * - Enrollments management
 * - Raw JSON course APIs
 */
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

function ensureArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

// ============================================================================
// JWT Verification
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

// ============================================================================
// Admin Auth Helper
// ============================================================================

async function verifyAdminToken(req: Request, supabase: SupabaseClient): Promise<{ admin: any; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { admin: null, error: "No authorization header" };
  }

  const token = authHeader.split(" ")[1];
  
  // Try Supabase token first
  const { data: supabaseUser } = await supabase.auth.getUser(token);
  
  if (supabaseUser?.user) {
    const { data: adminData } = await supabase
      .from("admin_users")
      .select("*")
      .eq("supabase_id", supabaseUser.user.id)
      .single();
    
    if (adminData) {
      return { admin: adminData };
    }
  }
  
  // Try legacy JWT
  const payload = await verifyJwt(token);
  if (payload?.sub) {
    const { data: adminData } = await supabase
      .from("admin_users")
      .select("*")
      .eq("id", payload.sub)
      .single();
    
    if (adminData) {
      return { admin: adminData };
    }
  }

  return { admin: null, error: "Invalid token or admin not found" };
}

// ============================================================================
// Course Mapping Helpers
// ============================================================================

function mapSupabaseCourse(course: any) {
  if (!course) return null;
  
  // Prioritize data from the 'doc' JSONB column
  const base = course.doc || {};
  
  return {
    ...base,
    id: course.id || base.id || base._id?.$oid,
    _id: course.id || base.id || base._id?.$oid,
    slug: course.slug || base.slug,
    name: course.name || base.name,
    programme: course.programme || base.programme,
    programmeSlug: course.programme_slug || base.programmeSlug,
    courseSlug: course.course_slug || base.courseSlug,
    isVisible: course.is_visible !== undefined ? course.is_visible : (base.isVisible !== undefined ? base.isVisible : true),
    createdAt: course.created_at || base.createdAt?.$date || base.createdAt,
    updatedAt: course.updated_at || base.updatedAt?.$date || base.updatedAt,
  };
}

function mapCourseToSupabase(course: any) {
  if (!course) return {};
  
  // Extract flat columns for indexing and searching
  return {
    id: course.id || course._id || (course._id && course._id.$oid),
    slug: course.slug,
    name: course.name,
    programme: course.programme,
    programme_slug: course.programmeSlug || (course.slug ? course.slug.split('/')[0] : ''),
    course_slug: course.courseSlug || (course.slug ? course.slug.split('/').pop() : ''),
    is_visible: course.isVisible !== undefined ? course.isVisible : true,
    price: course.price || course.doc?.price || course.hero?.price,
    price_inr: course.priceINR || course.hero?.priceINR || course.doc?.hero?.priceINR || course.doc?.priceINR,
    updated_at: new Date().toISOString(),
    doc: course, // Store the full original document in doc
  };
}

// ============================================================================
// Main Handler
// ============================================================================

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
    
    // Remove "admin-courses-api" prefix from path
    const funcIndex = pathParts.indexOf("admin-courses-api");
    const rawPath = "/" + pathParts.slice(funcIndex + 1).join("/");
    // For routing, we decode the path once, but be careful with slashes in slugs
    const apiPath = decodeURIComponent(rawPath).replace(/\/$/, "");

    // ========================================================================
    // All endpoints require admin auth
    // ========================================================================

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    if (admin.status && admin.status !== "active") {
      return jsonResponse({ error: "Admin account is inactive" }, 403, cors);
    }

    // ========================================================================
    // LIST COURSES - GET /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data: courses, error } = await supabase
        .from("course")
        .select("*")
        .order("order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({
        items: (courses || []).map((c: any) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          programme: c.programme_slug || c.programme || "Gradus X",
          price: c.price_inr || c.price || "",
          imageUrl: c.image_url || "",
          assessmentMaxAttempts: c.assessment_max_attempts ?? 3,
          updatedAt: c.updated_at,
          isVisible: c.is_visible,
        })),
      }, 200, cors);
    }

    // ========================================================================
    // CREATE COURSE - POST /
    // ========================================================================

    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const payload = mapCourseToSupabase(body);
      
      const { data: course, error } = await supabase
        .from("course")
        .insert([payload])
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ course: mapSupabaseCourse(course) }, 201, cors);
    }

    // ========================================================================
    // RAW ENDPOINTS
    // ========================================================================

    // GET /raw - List all courses with full data
    if (apiPath === "/raw" && req.method === "GET") {
      const { data: courses, error } = await supabase
        .from("course")
        .select("*")
        .order("order", { ascending: true });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({
        items: (courses || []).map(mapSupabaseCourse),
      }, 200, cors);
    }

    // POST /raw - Upsert course
    if (apiPath === "/raw" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const slug = body.slug;

      if (!slug) {
        return jsonResponse({ error: "slug is required for upsert" }, 400, cors);
      }

      const payload = mapCourseToSupabase(body);

      const { data: course, error } = await supabase
        .from("course")
        .upsert([{ ...payload, slug }], { onConflict: "slug" })
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ course: mapSupabaseCourse(course) }, 200, cors);
    }

    // GET /raw/:slug - Get course by slug with full data
    if (apiPath.startsWith("/raw/") && req.method === "GET") {
      const slug = decodeURIComponent(apiPath.replace("/raw/", ""));

      const { data: course, error } = await supabase
        .from("course")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error || !course) {
        return jsonResponse({ error: "Course not found" }, 404, cors);
      }

      return jsonResponse({ course: mapSupabaseCourse(course) }, 200, cors);
    }

    // ========================================================================
    // ENROLLMENTS - GET /enrollments
    // ========================================================================

    if (apiPath === "/enrollments" && req.method === "GET") {
      const slug = url.searchParams.get("slug");
      const status = url.searchParams.get("status");
      const paymentStatus = url.searchParams.get("paymentStatus");
      const userId = url.searchParams.get("userId");

      let query = supabase
        .from("enrollments")
        .select("*, users!inner(id, first_name, last_name, email, mobile, personal_details, education_details), course:course!inner(id, name, slug, programme)");

      if (slug) {
        query = query.eq("course.slug", slug);
      }
      if (status) {
        query = query.eq("status", status);
      }
      if (paymentStatus) {
        query = query.eq("payment_status", paymentStatus);
      }
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data: enrollments, error } = await query.order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      // Group by course
      const courseMap: Record<string, any> = {};

      ensureArray(enrollments).forEach((e: any) => {
        const cSlug = e.course.slug;
        if (!courseMap[cSlug]) {
          courseMap[cSlug] = {
            slug: cSlug,
            name: e.course.name,
            programme: e.course.programme || "Gradus X",
            totalEnrollments: 0,
            paidEnrollments: 0,
            learners: [],
          };
        }

        const m = courseMap[cSlug];
        m.totalEnrollments++;
        if (e.payment_status === "PAID") m.paidEnrollments++;

        const pDetails = e.users.personal_details || {};
        const eDetails = e.users.education_details || {};
        m.learners.push({
          userId: e.users.id,
          name: `${e.users.first_name} ${e.users.last_name}`.trim(),
          email: e.users.email,
          phone: e.users.mobile || pDetails.mobile || "",
          institution: eDetails.institutionName || "",
          city: pDetails.city || "",
          state: pDetails.state || "",
          status: e.status,
          paymentStatus: e.payment_status,
          createdAt: e.created_at,
        });
      });

      return jsonResponse({ items: Object.values(courseMap) }, 200, cors);
    }

    // GET /enrollments/:courseSlug
    if (apiPath.startsWith("/enrollments/") && req.method === "GET") {
      const courseSlug = apiPath.replace("/enrollments/", "");
      
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("*, users!inner(id, first_name, last_name, email, mobile, personal_details, education_details), course:course!inner(id, name, slug, programme)")
        .eq("course.slug", courseSlug)
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      const course = enrollments?.[0]?.course || null;
      const learners = ensureArray(enrollments).map((e: any) => {
        const pDetails = e.users.personal_details || {};
        const eDetails = e.users.education_details || {};
        return {
          userId: e.users.id,
          name: `${e.users.first_name} ${e.users.last_name}`.trim(),
          email: e.users.email,
          phone: e.users.mobile || pDetails.mobile || "",
          institution: eDetails.institutionName || "",
          city: pDetails.city || "",
          state: pDetails.state || "",
          status: e.status,
          paymentStatus: e.payment_status,
          createdAt: e.created_at,
        };
      });

      return jsonResponse({
        items: [{
          slug: courseSlug,
          name: course?.name || courseSlug,
          programme: course?.programme || "Gradus X",
          totalEnrollments: learners.length,
          paidEnrollments: learners.filter((l: any) => l.paymentStatus === "PAID").length,
          learners,
        }],
      }, 200, cors);
    }

    // ========================================================================
    // PROGRESS - GET /progress/:courseSlug
    // ========================================================================

    // ========================================================================
    // PROGRESS - GET /progress?slug= or /progress/:courseSlug
    // ========================================================================

    if (apiPath.startsWith("/progress") && req.method === "GET") {
      let courseSlug = "";
      
      if (apiPath === "/progress") {
          courseSlug = url.searchParams.get("slug") || "";
      } else if (apiPath.startsWith("/progress/")) {
          courseSlug = decodeURIComponent(apiPath.replace("/progress/", ""));
      }

      const userId = url.searchParams.get("userId");

      if (!courseSlug) {
          return jsonResponse({ error: "Slug is required" }, 400, cors);
      }

      console.log(`[Progress Debug] apiPath: ${apiPath}, courseSlug: ${courseSlug}`);

      // Get course
      const { data: course, error: cErr } = await supabase
        .from("course")
        .select("id, name, slug, modules, programme")
        .eq("slug", courseSlug)
        .single();
      
      if (cErr || !course) {
        console.error(`[Progress Debug] Course lookup failed for slug: ${courseSlug}`, cErr);
        return jsonResponse({ error: "Course not found", details: cErr, slug: courseSlug }, 404, cors);
      }

      // Flatten lectures from course structure
      const allLectures: any[] = [];
      const idCounts: Record<string, number> = {};

      ensureArray(course.modules).forEach((mod: any) => {
        ensureArray(mod.weeklyStructure).forEach((week: any) => {
          ensureArray(week.lectures).forEach((lec: any) => {
            let baseId = lec.id || lec.title || "lecture";
            if (idCounts[baseId]) {
              idCounts[baseId]++;
              baseId = `${baseId}-${idCounts[baseId]}`;
            } else {
              idCounts[baseId] = 1;
            }

            allLectures.push({
              lectureId: baseId,
              lectureTitle: lec.title,
              moduleId: mod.id || mod.title,
              moduleTitle: mod.title,
              moduleLabel: mod.weeksLabel || "",
              sectionLabel: week.title || "",
            });
          });
        });
      });

      // Fetch progress
      let query = supabase
        .from("course_progresses")
        .select("*, users!inner(id, first_name, last_name, email)")
        .eq("course_id", course.id);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data: progresses, error: pErr } = await query;
      if (pErr) {
        return jsonResponse({ error: pErr.message }, 500, cors);
      }

      // Map results
      const progressList = (progresses || []).map((p: any) => {
        const completed = p.completed_modules?.completedLectures || [];
        const lectures = allLectures.map((lec) => ({
          ...lec,
          completionRatio: completed.includes(lec.lectureId) ? 1 : 0,
          completedAt: completed.includes(lec.lectureId) ? p.updated_at : null,
          updatedAt: p.updated_at,
        }));

        return {
          userId: p.users.id,
          userName: `${p.users.first_name} ${p.users.last_name}`.trim(),
          userEmail: p.users.email,
          totalLectures: allLectures.length,
          completedLectures: lectures.filter((l: any) => l.completionRatio === 1).length,
          lectures,
        };
      });

      // Aggregate lecture summary
      const lectureSummary = allLectures.map((lec) => {
        const completions = progressList.filter((p: any) =>
          p.lectures.some((l: any) => l.lectureId === lec.lectureId && l.completionRatio === 1)
        ).length;
        const learners = progressList.length;

        return {
          ...lec,
          learners,
          completed: completions,
          avgCompletion: learners > 0 ? completions / learners : 0,
        };
      });

      return jsonResponse({ progress: progressList, lectureSummary }, 200, cors);
    }

    // ========================================================================
    // UPDATE COURSE - PATCH /:courseId
    // ========================================================================

    // Matches /:courseId (UUID format)
    const courseIdMatch = apiPath.match(/^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (courseIdMatch && req.method === "PATCH") {
      const courseId = courseIdMatch[1];
      const body = await req.json().catch(() => ({}));
      const payload = mapCourseToSupabase(body);

      const { data: course, error } = await supabase
        .from("course")
        .update(payload)
        .eq("id", courseId)
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ course: mapSupabaseCourse(course) }, 200, cors);
    }

    // ========================================================================
    // DELETE COURSE - DELETE /:courseId
    // ========================================================================

    if (courseIdMatch && req.method === "DELETE") {
      const courseId = courseIdMatch[1];

      const { error } = await supabase
        .from("course")
        .delete()
        .eq("id", courseId);

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ message: "Course deleted" }, 200, cors);
    }

    // ========================================================================
    // DELETE COURSE BY SLUG - DELETE /slug/:slug
    // ========================================================================

    if (apiPath.startsWith("/slug/") && req.method === "DELETE") {
      const slug = decodeURIComponent(apiPath.replace("/slug/", ""));

      const { error } = await supabase
        .from("course")
        .delete()
        .eq("slug", slug);

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ message: "Course deleted" }, 200, cors);
    }

    return jsonResponse({ error: "Not found", path: apiPath, rawPath }, 404, cors);

  } catch (error) {
    console.error("Admin Courses API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
