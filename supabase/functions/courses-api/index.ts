/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";





const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin") || req.headers.get("origin");
  const allowedOrigin = origin || "http://localhost:5173"; 

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
};

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, ""); 
    const segments = path.split("/").filter(Boolean);

    // Find where the routing should start (after the function name)
    const functionName = "courses-api";
    const funcIdx = segments.indexOf(functionName);
    const routeParts = funcIdx !== -1 ? segments.slice(funcIdx + 1) : segments.slice(1);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. List Courses: GET /
    if (req.method === "GET" && routeParts.length === 0) {
      const { data: courses, error } = await supabase
        .from("course")
        .select("*")
        .order("order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({ items: (courses || []).map(mapSupabaseCourse) }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const firstArg = routeParts[0];

    // 2. Progress: GET /progress/:slug
    if (req.method === "GET" && firstArg === "progress") {
       const slug = routeParts.slice(1).join("/");
       const authHeader = req.headers.get("Authorization");
       if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
       
       try {
          const token = authHeader.replace("Bearer ", "");
          let userId: string | null = null;
          
          // Try Supabase auth first (for Google/Supabase signins)
          const { data: { user: sbUser } } = await supabase.auth.getUser(token);
          if (sbUser) {
            userId = sbUser.id;
          } else {
            // Fallback to legacy JWT
            // JWT_SECRET is already global

            const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
            const payload = await verify(token, key);
            userId = payload.id as string;
          }

          if (!userId) throw new Error("Invalid token");

          // Find course
          const { data: course, error: cErr } = await supabase.from("course").select("id").eq("slug", slug).single();
          if (cErr || !course) return new Response(JSON.stringify({ error: "Course not found" }), { status: 404, headers: cors });

          // Find enrollment
          const { data: enr } = await supabase.from("enrollments").select("progress").eq("user_id", userId).eq("course_id", course.id).eq("status", "ACTIVE").maybeSingle();
          
          return new Response(JSON.stringify({ progress: enr?.progress || {} }), { headers: { ...cors, "Content-Type": "application/json" } });

       } catch (e) {
         console.error("Progress fetch error:", e);
         return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
       }
    }

    // 2.1 Progress: POST /progress/:slug
    if (req.method === "POST" && firstArg === "progress") {
       const slug = routeParts.slice(1).join("/");
       const authHeader = req.headers.get("Authorization");
       if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

       try {
          const token = authHeader.replace("Bearer ", "");
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);

          if (authError || !user) throw new Error("Invalid token");
          const userId = user.id;

          const body = await req.json().catch(() => ({}));
          const lectureId = body.lectureId || body.lecture_id;
          if (!lectureId) {
            return new Response(JSON.stringify({ error: "lectureId is required" }), { status: 400, headers: cors });
          }

          const currentTime = Number(body.currentTime ?? body.current_time ?? 0);
          const duration = Number(body.duration ?? body.durationSeconds ?? 0);
          const safeCurrent = Number.isFinite(currentTime) ? currentTime : 0;
          const safeDuration = Number.isFinite(duration) ? duration : 0;

          const { data: course, error: cErr } = await supabase.from("course").select("id").eq("slug", slug).single();
          if (cErr || !course) return new Response(JSON.stringify({ error: "Course not found" }), { status: 404, headers: cors });

          const { data: enr, error: eErr } = await supabase
            .from("enrollments")
            .select("id, progress")
            .eq("user_id", userId)
            .eq("course_id", course.id)
            .eq("status", "ACTIVE")
            .maybeSingle();

          if (eErr || !enr) {
            return new Response(JSON.stringify({ error: "Not Enrolled" }), { status: 403, headers: cors });
          }

          let progress: Record<string, any> = {};
          if (enr.progress && typeof enr.progress === "object") {
            progress = enr.progress;
          } else if (typeof enr.progress === "string") {
            try {
              progress = JSON.parse(enr.progress);
            } catch {
              progress = {};
            }
          }

          const previous = progress[lectureId] || {};
          const explicitComplete = body.completed === true || body.attended === true;
          const completionRatio = safeDuration > 0 ? Math.min(safeCurrent / safeDuration, 1) : 0;
          const markComplete = explicitComplete || (safeDuration <= 0 && safeCurrent <= 0);
          const attended = Boolean(previous.attended) || markComplete || completionRatio >= 0.9;
          const finalRatio = markComplete ? Math.max(completionRatio, 1) : completionRatio;

          progress[lectureId] = {
            ...previous,
            lastPositionSeconds: safeCurrent,
            durationSeconds: safeDuration,
            completionRatio: finalRatio,
            attended,
            updatedAt: new Date().toISOString(),
          };

          const { error: uErr } = await supabase
            .from("enrollments")
            .update({ progress })
            .eq("id", enr.id);

          if (uErr) throw uErr;

          return new Response(JSON.stringify({ progress }), { headers: { ...cors, "Content-Type": "application/json" } });
       } catch (e) {
          console.error("Progress update error:", e);
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
       }
    }

    // 3. Modules: GET /modules/:slug
    if (req.method === "GET" && firstArg === "modules") {
       const slug = routeParts.slice(1).join("/");
       const authHeader = req.headers.get("Authorization");
       
       let userId: string | null = null;
       let isEnrolled = false;
       
       // Try to authenticate user (optional)
       if (authHeader) {
         try {
           const token = authHeader.replace("Bearer ", "");
           const JWT_SECRET = Deno.env.get("JWT_SECRET");
           if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");
           
           // Try Supabase auth first
           const { data: { user: sbUser } } = await supabase.auth.getUser(token);
           if (sbUser) {
             userId = sbUser.id;
           } else {
             // Try legacy JWT
             const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
             const payload = await verify(token, key);
             userId = payload.id as string;
           }
         } catch (e) {
           // Auth failed but continue as guest
           console.warn("Auth failed for modules view, continuing as guest:", e);
         }
       }
       
       // Fetch course basic info
       const { data: course, error: cErr } = await supabase.from("course").select("id").eq("slug", slug).single();
       if (cErr || !course) return new Response(JSON.stringify({ error: "Course not found" }), { status: 404, headers: cors });

       // Check enrollment if user is logged in
       if (userId) {
         const { data: enr } = await supabase.from("enrollments").select("id").eq("user_id", userId).eq("course_id", course.id).eq("status", "ACTIVE").maybeSingle();
         isEnrolled = !!enr;
       }

          // Fetch detailed modules from course_details
          let modules = [];
          const { data: details } = await supabase.from("course_details").select("modules").eq("course_slug", slug).maybeSingle();
          
          if (details && Array.isArray(details.modules) && details.modules.length > 0) {
              modules = details.modules;
          } else {
              // Fallback to course table
               const { data: courseWithMod } = await supabase.from("course").select("doc").eq("id", course.id).single();
               modules = courseWithMod?.doc?.modules || [];
          }

          return new Response(JSON.stringify({ modules, isEnrolled }), { headers: { ...cors, "Content-Type": "application/json" } });
    }


    // 5. Live Sessions: GET /live/sessions/course/:slug/active
    if (req.method === "GET" && firstArg === "live") {
       // URL structure: /courses-api/live/sessions/course/:slug/active
       // routeParts: ["live", "sessions", "course", ...slug parts..., "active"]
       
       const courseIdx = routeParts.indexOf("course");
       const activeIdx = routeParts.lastIndexOf("active");
       
       if (courseIdx !== -1 && activeIdx !== -1 && activeIdx > courseIdx + 1) {
          // Decode URL components
          const rawSlug = routeParts.slice(courseIdx + 1, activeIdx).join("/");
          const slug = decodeURIComponent(rawSlug);
          console.log(`[CoursesAPI] Live Session Request - RawSlug: ${rawSlug}, DecodedSlug: ${slug}`);
          
          try {
              // Verify token if present (optional but recommended)
              // We won't block public access for now unless specified, 
              // but purely to retrieve the session we just need course_id.
              
              // Find course by slug or ID
              let courseQuery = supabase.from("course").select("id");
              if (slug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                  courseQuery = courseQuery.eq("id", slug);
              } else {
                  // Try exact slug or suffix match (e.g. "agentic-ai-engineering-flagship" matching "gradus-x/agentic-ai-engineering-flagship")
                  courseQuery = courseQuery.or(`slug.eq."${slug}",slug.ilike."%/${slug}"`);
              }
              let { data: course, error: cErr } = await courseQuery.maybeSingle();

              if (cErr) {
                  console.error("Course lookup error:", cErr);
                  return new Response(JSON.stringify({ error: "Database error" }), { status: 500, headers: cors });
              }

              if (!course) {
                  // Fallback: search manually if .or didn't work as expected
                   const { data: allCourses } = await supabase.from("course").select("id, slug");
                   const found = allCourses?.find(c => c.slug === slug || c.slug?.endsWith(`/${slug}`));
                   if (found) {
                       course = found;
                   } else {
                       return new Response(JSON.stringify({ error: "Course not found", slug }), { status: 404, headers: cors });
                   }
              }
              
              // Fetch active session
              const { data: session, error: sErr } = await supabase
                 .from("live_sessions")
                 .select("*")
                 .eq("course_id", course.id)
                 .eq("status", "ACTIVE") // Assuming enum or string 'ACTIVE'
                 .maybeSingle();
              
               if (sErr) {
                  console.error("Live session fetch error:", sErr);
                  return new Response(JSON.stringify({ error: "Database error" }), { status: 500, headers: cors });
               }

               // Return session or null (200 OK)
               return new Response(JSON.stringify(session || null), { headers: { ...cors, "Content-Type": "application/json" } });
               
          } catch (e) {
             console.error("Live fetch error:", e);
             return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: cors });
          }
       }
    }

    // 4. Enroll: POST /enroll/:slug
    if (req.method === "POST" && firstArg === "enroll") {
      const slug = routeParts.slice(1).join("/");
      
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      
      if (authError || !user) {
         return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
      }

      // Check course
      const { data: course, error: cErr } = await supabase
        .from("course")
        .select("id, slug, name, price")
        .eq("slug", slug)
        .single();
      
      if (cErr || !course) {
        return new Response(JSON.stringify({ error: "Course not found" }), { status: 404, headers: cors });
      }

      // Check enrollment
      const { data: existing } = await supabase
        .from("enrollments")
        .select("*")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .single();

      if (existing) {
         if (existing.status === "ACTIVE" && existing.payment_status === "PAID") {
            return new Response(JSON.stringify({ error: "Already enrolled" }), { status: 409, headers: cors });
         }
         // Reactivate logic
         await supabase.from("enrollments").update({ status: "ACTIVE", payment_status: "PAID", paid_at: new Date() }).eq("id", existing.id);
         return new Response(JSON.stringify({ message: "Re-enrolled", enrollment: existing }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      // New enrollment
      const { data: newEnrollment, error: iErr } = await supabase
        .from("enrollments")
        .insert([{
          user_id: user.id,
          course_id: course.id,
          status: "ACTIVE",
          payment_status: "PAID",
          price_total: course.price || 0
        }])
        .select()
        .single();

       if (iErr) throw iErr;

       return new Response(JSON.stringify({ message: "Enrolled", enrollment: newEnrollment }), { status: 201, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // 6. Lecture Notes: GET /:slug/lectures/:lectureId/notes
    // We detect this by checking if "lectures" and "notes" segments exist
    const lecturesIdx = routeParts.indexOf("lectures");
    const notesIdx = routeParts.lastIndexOf("notes");

    if (req.method === "GET" && lecturesIdx !== -1 && notesIdx !== -1 && notesIdx > lecturesIdx) {
        const rawSlug = routeParts.slice(0, lecturesIdx).join("/");
        const slug = decodeURIComponent(rawSlug);
        const lectureId = routeParts.slice(lecturesIdx + 1, notesIdx).join("/");

        console.log(`[CoursesAPI] Notes Request - Slug: ${slug}, LectureId: ${lectureId}`);

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

        try {
            const token = authHeader.replace("Bearer ", "");
            // JWT_SECRET is already global

            const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
            const payload = await verify(token, key);
            const userId = payload.id;
            if (!userId) throw new Error("Invalid token");

            // Verify enrollment
            const { data: course, error: cErr } = await supabase.from("course").select("id").eq("slug", slug).single();
            if (cErr || !course) return new Response(JSON.stringify({ error: "Course not found", slug }), { status: 404, headers: cors });

            const { data: enr } = await supabase.from("enrollments").select("id").eq("user_id", userId).eq("course_id", course.id).eq("status", "ACTIVE").maybeSingle();
            if (!enr) return new Response(JSON.stringify({ error: "Not Enrolled" }), { status: 403, headers: cors });

            // Fetch course details for notes
            const { data: details } = await supabase.from("course_details").select("modules").eq("course_slug", slug).maybeSingle();
            
            // Search for lecture notes in the modules
            let foundNote = null;
            if (details && Array.isArray(details.modules)) {
                for (const mod of details.modules) {
                    if (mod.sections) {
                        for (const sec of mod.sections) {
                            if (sec.lectures) {
                                const lecture = sec.lectures.find((l: any) => l.lectureId === lectureId);
                                if (lecture && lecture.notes) {
                                    foundNote = lecture.notes;
                                    break;
                                }
                            }
                        }
                    }
                    if (foundNote) break;
                }
            }

            if (!foundNote) {
                console.log(`[CoursesAPI] Notes Not Found - Course: ${slug}, LectureId: ${lectureId}`);
                return new Response(JSON.stringify({ error: "Notes not found for this lecture" }), { status: 404, headers: cors });
            }

            console.log(`[CoursesAPI] Found Note Object:`, JSON.stringify(foundNote));

            // Check various possible fields for the file
            let fileUrl = foundNote.fileUrl || foundNote.url || foundNote.path || foundNote.filePath || foundNote.secureUrl || foundNote.secure_url;
            
            // Fallback: Construct Cloudinary URL if publicId and format exist
            if (!fileUrl && foundNote.publicId && foundNote.format) {
                const cloudName = "dnp3j8xb1"; // Hardcoded from observed video URLs
                fileUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${foundNote.publicId}.${foundNote.format}`;
                console.log(`[CoursesAPI] Constructed Cloudinary URL: ${fileUrl}`);
            }

            if (fileUrl) {
                console.log(`[CoursesAPI] Fetching Note File: ${fileUrl}`);
                if (fileUrl.includes("supabase.co/storage")) {
                    const resp = await fetch(fileUrl);
                    const blob = await resp.blob();
                    return new Response(blob, {
                        headers: {
                            ...cors,
                            "Content-Type": resp.headers.get("Content-Type") || "application/pdf"
                        }
                    });
                }
                // Otherwise return metadata and let frontend handle it? 
                // But the frontend used apiClient.get(..., { responseType: 'blob' })
                // So we MUST return binary content here.
                const resp = await fetch(fileUrl);
                const blob = await resp.blob();
                return new Response(blob, {
                    headers: {
                        ...cors,
                        "Content-Type": resp.headers.get("Content-Type") || "application/pdf"
                    }
                });
            }

            console.log(`[CoursesAPI] Note source not found in object:`, JSON.stringify(foundNote));
            return new Response(JSON.stringify({ error: "Note source not found", note: foundNote }), { status: 404, headers: cors });

        } catch (e) {
            console.error("Notes fetch error:", e);
            return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: cors });
        }
    }

    // 6.1 Lecture Stream: GET /:slug/lectures/:lectureId/stream
    const streamIdx = routeParts.lastIndexOf("stream");
    if (req.method === "GET" && lecturesIdx !== -1 && streamIdx !== -1 && streamIdx > lecturesIdx) {
        const rawSlug = routeParts.slice(0, lecturesIdx).join("/");
        const slug = decodeURIComponent(rawSlug);
        const lectureId = routeParts.slice(lecturesIdx + 1, streamIdx).join("/");

        console.log(`[CoursesAPI] Stream Request - Slug: ${slug}, LectureId: ${lectureId}`);

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

        try {
            const token = authHeader.replace("Bearer ", "");
            // JWT_SECRET is already global

            const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
            const payload = await verify(token, key);
            const userId = payload.id;
            if (!userId) throw new Error("Invalid token");

            const { data: course, error: cErr } = await supabase.from("course").select("id").eq("slug", slug).single();
            if (cErr || !course) return new Response(JSON.stringify({ error: "Course not found", slug }), { status: 404, headers: cors });

            const { data: enr } = await supabase.from("enrollments").select("id").eq("user_id", userId).eq("course_id", course.id).eq("status", "ACTIVE").maybeSingle();
            if (!enr) return new Response(JSON.stringify({ error: "Not Enrolled" }), { status: 403, headers: cors });

            const { data: details } = await supabase.from("course_details").select("modules").eq("course_slug", slug).maybeSingle();

            let lectureData: any = null;
            if (details && Array.isArray(details.modules)) {
                for (const mod of details.modules) {
                    if (mod.sections) {
                        for (const sec of mod.sections) {
                            if (sec.lectures) {
                                const found = sec.lectures.find((l: any) => l.lectureId === lectureId || l.id === lectureId);
                                if (found) {
                                    lectureData = found;
                                    break;
                                }
                            }
                        }
                    }
                    if (lectureData) break;
                }
            }

            if (!lectureData) {
                return new Response(JSON.stringify({ error: "Lecture not found", lectureId }), { status: 404, headers: cors });
            }

            const video = lectureData.video || {};
            let fileUrl =
                video.url ||
                video.secureUrl ||
                video.secure_url ||
                video.fileUrl ||
                lectureData.videoUrl ||
                lectureData.video_url ||
                lectureData.url;

            if (!fileUrl && video.publicId && video.format) {
                const cloudName = "dnp3j8xb1";
                fileUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${video.publicId}.${video.format}`;
            }

            if (!fileUrl) {
                return new Response(JSON.stringify({ error: "Video source not found" }), { status: 404, headers: cors });
            }

            return new Response(null, {
                status: 302,
                headers: { ...cors, Location: fileUrl },
            });
        } catch (e) {
            console.error("Stream fetch error:", e);
            return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: cors });
        }
    }

    // 7. Get Details: GET /:slug (CATCH-ALL for courses)
    if (req.method === "GET" && routeParts.length > 0) {
       // Since this is the catch-all, we assume the whole remains of routeParts is the slug
       const rawSlug = routeParts.join("/");
       const slug = decodeURIComponent(rawSlug);
       console.log(`[CoursesAPI] Catch-all Request - Slug: ${slug}`);
       
       const { data: course, error } = await supabase
        .from("course")
        .select("*")
        .eq("slug", slug)
        .single();

       if (error || !course) {
          return new Response(JSON.stringify({ error: "Course not found", slug, path, routeParts }), { status: 404, headers: cors });
       }

       const url = new URL(req.url);
       const debugDetails = url.searchParams.get("debug_details") === "true";
       if (debugDetails) {
           const { data: details, error: dErr } = await supabase.from("course_details").select("*").eq("course_slug", slug).maybeSingle();
           return new Response(JSON.stringify({ course, details, dErr }), { headers: { ...cors, "Content-Type": "application/json" } });
       }

       let isEnrolled = false;
       let enrollment = null;
       const authHeader = req.headers.get("Authorization");
       if (authHeader) {
          try {
             const token = authHeader.replace("Bearer ", "");
             // JWT_SECRET is already global

             const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
             const payload = await verify(token, key);
             const userId = payload.id;

             if (userId) {
                // Fetch full enrollment details, not just ID
                const { data: enr } = await supabase.from("enrollments").select("*").eq("user_id", userId).eq("course_id", course.id).maybeSingle();
                if (enr) {
                   enrollment = enr;
                   if (enr.status === "ACTIVE" && enr.payment_status === "PAID") {
                      isEnrolled = true;
                   }
                }
             }
          } catch (e) {
             console.error("Token verification failed:", e);
          }
       }

       const mapped = mapSupabaseCourse(course);
       return new Response(JSON.stringify({ course: { ...mapped, isEnrolled, enrollment } }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not Found", debug_path: path, debug_parts: routeParts, first_arg: firstArg }), { status: 404, headers: cors });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  }
});

const mapSupabaseCourse = (course: any) => {
  if (!course) return null;
  
  // If we have a 'doc' field, it contains the full original document
  // We prioritize it to ensure no data is lost from the migration
  const base = course.doc || {};
  
  return {
    _id: course.id || base._id?.$oid || base.id,
    slug: course.slug || base.slug,
    name: course.name || base.name,
    imageUrl: course.image?.url || base.image?.url || (base.image && base.image.secure_url) || null,
    modulesCount: course.stats?.modules || base.stats?.modules || (base.modules ? base.modules.length : 0),
    enrolledCount: (() => {
        const val = course.stats?.learners || base.stats?.learners;
        if (val) return val;
        
        // Fallback: parse from hero.enrolledText
        const text = course.hero?.enrolledText || base.hero?.enrolledText || course.hero?.enrolled_text || base.hero?.enrolled_text;
        if (text) {
            const match = text.match(/([\d,\.]+[kK]?)/);
            if (match) {
                 let numStr = match[1].replace(/,/g, "");
                 if (numStr.toLowerCase().endsWith("k")) {
                     return parseFloat(numStr) * 1000;
                 }
                 return parseFloat(numStr);
            }
        }
        return 0;
    })(),
    programme: course.programme || base.programme,
    programmeSlug: course.programme_slug || base.programmeSlug,
    courseSlug: course.course_slug || base.courseSlug,
    subtitle: course.subtitle || base.subtitle || base.hero?.subtitle,
    focus: course.focus || base.focus,
    placementRange: course.placement_range || base.placementRange,
    price: course.price || base.price,
    priceINR: course.price_inr || base.priceINR || base.hero?.priceINR || 0,
    level: course.level || base.level || base.stats?.level,
    duration: course.duration || base.duration || base.stats?.duration,
    mode: course.mode || base.mode || base.stats?.mode,
    outcomeSummary: course.outcome_summary || base.outcomeSummary,
    finalAward: course.final_award || base.finalAward,
    assessmentMaxAttempts: course.assessment_max_attempts || base.assessmentMaxAttempts || 3,
    isVisible: course.is_visible !== undefined ? course.is_visible : (base.isVisible !== undefined ? base.isVisible : true),
    order: course.order || course.sort_order || base.order,
    weeks: course.weeks || base.weeks || [],
    partners: course.partner_schema || base.partners || [],
    certifications: course.certifications || base.certifications || [],
    hero: course.hero || base.hero || {},
    stats: course.stats || base.stats || {},
    aboutProgram: course.about_program || base.aboutProgram || [],
    learn: course.learn || base.learn || [],
    skills: course.skills || base.skills || [],
    approvals: course.approvals || base.approvals || [],
    deliverables: course.deliverables || base.deliverables || [],
    outcomes: course.outcomes || base.outcomes || [],
    capstonePoints: course.capstone_points || base.capstonePoints || [],
    careerOutcomes: course.career_outcomes || base.careerOutcomes || [],
    toolsFrameworks: course.tools_frameworks || base.toolsFrameworks || [],
    targetAudience: course.target_audience || base.targetAudience || [],
    prereqsList: course.prereqs_list || base.prereqsList || [],
    modules: course.modules || base.modules || [],
    instructors: course.instructors || base.instructors || [],
    offeredBy: course.offered_by || base.offeredBy || {},
    capstone: course.capstone || base.capstone || {},
    image: course.image || base.image || {},
    media: course.media || base.media || {},
    createdAt: course.created_at || base.createdAt?.$date || base.createdAt,
    updatedAt: course.updated_at || base.updatedAt?.$date || base.updatedAt,
    details: base.details || {}, 
  };
};
