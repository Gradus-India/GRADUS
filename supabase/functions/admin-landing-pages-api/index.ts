
/// <reference lib="deno.ns" />
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ===========================================
// CORS & Helpers
// ===========================================

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

// Capitalize name helper - converts to Title Case
function capitalizeName(name: string): string {
  if (!name || typeof name !== "string") return name;
  return name
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return word;
      // Handle special cases like "Mc", "O'", etc.
      if (word.length > 1 && word[1] === "'" && word.length > 2) {
        return word[0].toUpperCase() + word[1] + word[2].toUpperCase() + word.slice(3).toLowerCase();
      }
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// ===========================================
// JWT Verification
// ===========================================

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

// ===========================================
// Main Handler
// ===========================================

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

    // /admin-landing-pages-api/landing-pages or just /admin-landing-pages-api
    const funcIndex = pathParts.indexOf("admin-landing-pages-api");
    const apiPath = funcIndex >= 0 
      ? "/" + pathParts.slice(funcIndex + 1).join("/")
      : "/" + pathParts.join("/"); // Fallback if function name not in path
    
    console.log("[admin-landing-pages-api] Path:", path, "apiPath:", apiPath, "Method:", req.method);

    const { admin, error: authError } = await verifyAdminToken(req, supabase);
    if (!admin) {
      return jsonResponse({ error: authError || "Unauthorized" }, 401, cors);
    }

    // LIST
    if ((apiPath === "/" || apiPath === "") && req.method === "GET") {
      const { data, error } = await supabase
        .from("landing_pages")
        .select("id, slug, title, hero, mentor, created_at, updated_at, is_published")
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500, cors);

      // Map to frontend expectation (_id as id)
      const mapped = (data || []).map(p => ({
        _id: p.id,
        slug: p.slug,
        title: p.title,
        hero: p.hero,
        mentor: p.mentor,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        isPublished: p.is_published
      }));

      return jsonResponse(mapped, 200, cors);
    }

    // REGISTRATIONS LIST
    if (apiPath === "/registrations" && req.method === "GET") {
      const { data, error } = await supabase
        .from("landing_page_registrations")
        .select(`
          *,
          landing_pages (
             title,
             slug
          )
        `)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500, cors);

      return jsonResponse({ items: data }, 200, cors);
    }

    // UPDATE REGISTRATION - PATCH /registrations/:id
    const registrationIdMatch = apiPath.match(/^\/registrations\/([0-9a-f-]+)$/i);
    if (registrationIdMatch && req.method === "PATCH") {
      const registrationId = registrationIdMatch[1];
      const body = await req.json();

      // Build update payload (only include provided fields)
      const updateData: any = {};
      if (body.name !== undefined) updateData.name = capitalizeName(body.name);
      if (body.email !== undefined) updateData.email = body.email?.toLowerCase().trim();
      if (body.phone !== undefined) {
        // Normalize phone number
        const phoneDigits = body.phone.replace(/\D/g, "").replace(/^91/, "");
        if (phoneDigits.length === 10) {
          updateData.phone = body.phone.startsWith("+") ? body.phone : `+91${phoneDigits}`;
        } else {
          return jsonResponse({ error: "Phone number must be exactly 10 digits" }, 400, cors);
        }
      }
      if (body.state !== undefined) updateData.state = body.state;
      if (body.qualification !== undefined) updateData.qualification = body.qualification;
      if (body.program_name !== undefined) updateData.program_name = body.program_name;
      if (body.landing_page_id !== undefined) updateData.landing_page_id = body.landing_page_id;

      const { data: updated, error } = await supabase
        .from("landing_page_registrations")
        .update(updateData)
        .eq("id", registrationId)
        .select(`
          *,
          landing_pages (
            title,
            slug
          )
        `)
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      if (!updated) {
        return jsonResponse({ error: "Registration not found" }, 404, cors);
      }

      return jsonResponse({ item: updated }, 200, cors);
    }

    // DELETE REGISTRATION - DELETE /registrations/:id
    if (registrationIdMatch && req.method === "DELETE") {
      const registrationId = registrationIdMatch[1];

      const { error } = await supabase
        .from("landing_page_registrations")
        .delete()
        .eq("id", registrationId);

      if (error) {
        return jsonResponse({ error: error.message }, 500, cors);
      }

      return jsonResponse({ message: "Registration deleted successfully" }, 200, cors);
    }

    // SYNC REGISTRATIONS TO GOOGLE SHEETS
    if (apiPath === "/registrations/sync-sheet" && req.method === "POST") {
      const body = await req.json();
      const registrationIds = body.registrationIds || [];

      // Fetch registrations to sync
      let query = supabase
        .from("landing_page_registrations")
        .select(`
          *,
          landing_pages (
             title,
             slug
          )
        `);

      if (registrationIds.length > 0) {
        query = query.in("id", registrationIds);
      }

      const { data: registrations, error: fetchError } = await query;

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 500, cors);
      }

      if (!registrations || registrations.length === 0) {
        return jsonResponse({ 
          message: "No registrations found to sync.",
          synced: 0 
        }, 200, cors);
      }

      // Queue sync jobs for each registration
      const syncJobs = registrations.map((reg) => ({
        entity_type: "landing_page_registration",
        entity_id: reg.id,
        payload: {
          id: reg.id,
          name: reg.name,
          email: reg.email,
          phone: reg.phone,
          state: reg.state,
          qualification: reg.qualification,
          program_name: reg.program_name,
          landing_page_id: reg.landing_page_id,
          landing_pages: reg.landing_pages,
        },
        status: "pending",
        scheduled_at: new Date().toISOString(),
      }));

      const { error: queueError } = await supabase
        .from("sheets_sync_queue")
        .insert(syncJobs);

      if (queueError) {
        return jsonResponse({ 
          error: `Failed to queue sync jobs: ${queueError.message}` 
        }, 500, cors);
      }

      return jsonResponse({
        message: `Queued ${registrations.length} registration(s) for Google Sheets sync. They will be processed shortly.`,
        synced: registrations.length,
      }, 200, cors);
    }

    // SEND REMINDER EMAILS
    if ((apiPath === "/registrations/send-reminder" || apiPath.endsWith("/registrations/send-reminder")) && req.method === "POST") {
      const body = await req.json();
      const registrationIds = body.registrationIds || [];

      // Fetch registrations with landing page details
      let query = supabase
        .from("landing_page_registrations")
        .select(`
          *,
          landing_pages (
            id,
            title,
            hero,
            mentor
          )
        `);

      if (registrationIds.length > 0) {
        query = query.in("id", registrationIds);
      }

      const { data: registrations, error: fetchError } = await query;

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 500, cors);
      }

      if (!registrations || registrations.length === 0) {
        return jsonResponse({ 
          message: "No registrations found to send reminders.",
          sent: 0 
        }, 200, cors);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const functionsUrl = `${supabaseUrl}/functions/v1/send-email`;

      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const skipped: string[] = [];

      // Email validation helper
      const isValidEmail = (email: string): boolean => {
        if (!email || typeof email !== "string") return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
      };

      // Process each registration
      for (const reg of registrations) {
        // Skip if email is invalid or missing
        const hasValidEmail = reg.email && isValidEmail(reg.email);
        if (!hasValidEmail) {
          skippedCount++;
          skipped.push(`${reg.name || "Unknown"} (${reg.email || "no email"}): Invalid or missing email address`);
          console.log(`[reminder] Skipping ${reg.name} - invalid email: ${reg.email}`);
          continue; // Skip entire registration if no valid email
        }

        try {
          const landingPage = reg.landing_pages;
          const hero = landingPage?.hero as any;
          const mentor = landingPage?.mentor as any;
          
          // Extract data from landing page
          const date = hero?.date || "TBD";
          const time = hero?.time || "TBD";
          const mentorName = hero?.mentorName || mentor?.name || "our expert";
          const programName = reg.program_name || landingPage?.title || "Masterclass";
          
          // Determine Zoom Link and Banner Image based on Mentor Name
          let zoomLink = "#";
          let bannerImage = "";
          const normalizedMentorName = (mentorName || "").toLowerCase().trim();
          const baseUrl = "https://gradusindia.in";

          if (normalizedMentorName.includes("vaibhav batra")) {
            zoomLink = "https://us06web.zoom.us/j/84317772672?pwd=adYOZ0oj0FAeEAvYiaZeUGPQLGZOe2.1";
            bannerImage = "email-banner-vaibhav.png";
          } else if (normalizedMentorName.includes("akhil") || normalizedMentorName.includes("akhil pandey")) {
            zoomLink = "https://us06web.zoom.us/j/86287028489?pwd=Irc39waKbrffBsIWyUtnwb2n9iQIZm.1";
            bannerImage = "email-banner-akhil.png";
          }

          const bannerHtml = bannerImage 
            ? `<div style="text-align: center; margin-bottom: 20px;">
                 <img src="${baseUrl}/assets/${bannerImage}" alt="${mentorName} Masterclass" style="max-width: 100%; height: auto; border-radius: 8px;" />
               </div>`
            : "";

          const emailBody = `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
                ${bannerHtml}
                <p>Hi ${reg.name},</p>
                <p><strong>This is a friendly reminder!</strong> You're invited to attend our FREE Masterclass.</p>
                
                <p><strong>📅 Date:</strong> ${date}<br>
                <strong>⏰ Time:</strong> ${time}</p>
                
                <p>In this session, <strong>${mentorName}</strong> will share valuable insights and practical takeaways.</p>
                
                <p>🎟 Seats are limited—don't miss out!</p>
                <p>👉 Joining Link : <a href="${zoomLink}">${zoomLink}</a></p>
                
                <p>We look forward to having you join us.</p>
                <p>Best Regards,<br>Team Gradus</p>
            </div>
          `;

          // Only send email if email is valid
          if (hasValidEmail) {
            try {
              const emailResponse = await fetch(functionsUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  to: reg.email.trim(),
                  subject: `Reminder: ${programName} Masterclass`,
                  html: emailBody,
                }),
              });

              if (!emailResponse.ok) {
                const errorText = await emailResponse.text();
                // Check if it's an SMTP error indicating invalid/non-existent email
                if (errorText.includes("550") || errorText.includes("553") || 
                    errorText.toLowerCase().includes("invalid") || 
                    errorText.toLowerCase().includes("not found") ||
                    errorText.toLowerCase().includes("does not exist") ||
                    errorText.toLowerCase().includes("user unknown") ||
                    errorText.toLowerCase().includes("mailbox")) {
                  skippedCount++;
                  skipped.push(`${reg.name} (${reg.email}): Email address does not exist or is invalid`);
                  console.log(`[reminder] Email address invalid/non-existent for ${reg.name}: ${reg.email}`);
                } else {
                  throw new Error(`Email send failed: ${errorText}`);
                }
              } else {
                sentCount++;
              }
            } catch (emailError: any) {
              // Check if error indicates invalid/non-existent email
              const errorMsg = emailError.message || String(emailError);
              if (errorMsg.includes("550") || errorMsg.includes("553") || 
                  errorMsg.toLowerCase().includes("invalid") || 
                  errorMsg.toLowerCase().includes("not found") || 
                  errorMsg.toLowerCase().includes("does not exist") ||
                  errorMsg.toLowerCase().includes("user unknown") ||
                  errorMsg.toLowerCase().includes("mailbox")) {
                skippedCount++;
                skipped.push(`${reg.name} (${reg.email}): Email address does not exist`);
                console.log(`[reminder] Email address does not exist for ${reg.name}: ${reg.email}`);
              } else {
                failedCount++;
                errors.push(`${reg.name} (${reg.email}): ${errorMsg}`);
                console.error(`[reminder] Failed to send email to ${reg.email}:`, emailError);
              }
            }
          }

        } catch (error: any) {
          failedCount++;
          errors.push(`${reg.name} (${reg.email}): ${error.message}`);
          console.error(`Failed to send reminder to ${reg.email}:`, error);
        }
      }

      let message = `Reminder emails sent to ${sentCount} registration(s).`;
      if (skippedCount > 0) {
        message += ` ${skippedCount} email(s) skipped (invalid or non-existent addresses).`;
      }
      if (failedCount > 0) {
        message += ` ${failedCount} email(s) failed.`;
      }

      return jsonResponse({
        message,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors : undefined,
        skippedEmails: skipped.length > 0 ? skipped : undefined,
      }, 200, cors);
    }

    // RESEND JOIN LINKS - POST /registrations/resend-links
    if (apiPath === "/registrations/resend-links" && req.method === "POST") {
      const body = await req.json();
      const registrationIds = body.registrationIds || [];

      // Fetch registrations with landing page details
      let query = supabase
        .from("landing_page_registrations")
        .select(`
          *,
          landing_pages (
            id,
            title,
            hero,
            mentor
          )
        `);

      if (registrationIds.length > 0) {
        query = query.in("id", registrationIds);
      }

      const { data: registrations, error: fetchError } = await query;

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 500, cors);
      }

      if (!registrations || registrations.length === 0) {
        return jsonResponse({ 
          message: "No registrations found to resend links.",
          sent: 0 
        }, 200, cors);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const functionsUrl = `${supabaseUrl}/functions/v1/send-email`;

      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const skipped: string[] = [];

      // Email validation helper
      const isValidEmail = (email: string): boolean => {
        if (!email || typeof email !== "string") return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
      };

      // Process each registration
      for (const reg of registrations) {
        // Skip if email is invalid or missing
        const hasValidEmail = reg.email && isValidEmail(reg.email);
        if (!hasValidEmail) {
          skippedCount++;
          skipped.push(`${reg.name || "Unknown"} (${reg.email || "no email"}): Invalid or missing email address`);
          console.log(`[resend-links] Skipping ${reg.name} - invalid email: ${reg.email}`);
          continue;
        }

        try {
          const landingPage = reg.landing_pages;
          const hero = landingPage?.hero as any;
          const mentor = landingPage?.mentor as any;
          
          // Extract data from landing page
          const date = hero?.date || "TBD";
          const time = hero?.time || "TBD";
          const mentorName = hero?.mentorName || mentor?.name || "our expert";
          const programName = reg.program_name || landingPage?.title || "Masterclass";
          
          // Determine Zoom Link and Banner Image based on Mentor Name
          let zoomLink = "#";
          let bannerImage = "";
          const normalizedMentorName = (mentorName || "").toLowerCase().trim();
          const baseUrl = "https://gradusindia.in";

          if (normalizedMentorName.includes("vaibhav batra")) {
            zoomLink = "https://us06web.zoom.us/j/84317772672?pwd=adYOZ0oj0FAeEAvYiaZeUGPQLGZOe2.1";
            bannerImage = "email-banner-vaibhav.png";
          } else if (normalizedMentorName.includes("akhil") || normalizedMentorName.includes("akhil pandey")) {
            zoomLink = "https://us06web.zoom.us/j/86287028489?pwd=Irc39waKbrffBsIWyUtnwb2n9iQIZm.1";
            bannerImage = "email-banner-akhil.png";
          }

          const bannerHtml = bannerImage 
            ? `<div style="text-align: center; margin-bottom: 20px;">
                 <img src="${baseUrl}/assets/${bannerImage}" alt="${mentorName} Masterclass" style="max-width: 100%; height: auto; border-radius: 8px;" />
               </div>`
            : "";

          const emailBody = `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
                ${bannerHtml}
                <p>Hi ${reg.name},</p>
                <p><strong>Updated Masterclass Link!</strong></p>
                
                <p><strong>📅 Date:</strong> ${date}<br>
                <strong>⏰ Time:</strong> ${time}</p>
                
                <p>In this session, <strong>${mentorName}</strong> will share valuable insights and practical takeaways.</p>
                
                <p>🎟 Seats are limited—don't miss out!</p>
                <p>👉 <strong>Join Zoom Meeting:</strong> <a href="${zoomLink}" style="color: #0066cc; text-decoration: underline;">${zoomLink}</a></p>
                
                <p><strong>Meeting Details:</strong></p>
                <ul>
                  <li><strong>Meeting ID:</strong> 862 8702 8489</li>
                  <li><strong>Passcode:</strong> 235108</li>
                </ul>
                
                <p>We look forward to having you join us.</p>
                <p>Best Regards,<br>Team Gradus</p>
            </div>
          `;

          // Send email with updated link
          try {
            const emailResponse = await fetch(functionsUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                to: reg.email.trim(),
                subject: `Updated: ${programName} Masterclass - Join Link`,
                html: emailBody,
              }),
            });

            if (!emailResponse.ok) {
              const errorText = await emailResponse.text();
              if (errorText.includes("550") || errorText.includes("553") || 
                  errorText.toLowerCase().includes("invalid") || 
                  errorText.toLowerCase().includes("not found") ||
                  errorText.toLowerCase().includes("does not exist") ||
                  errorText.toLowerCase().includes("user unknown") ||
                  errorText.toLowerCase().includes("mailbox")) {
                skippedCount++;
                skipped.push(`${reg.name} (${reg.email}): Email address does not exist or is invalid`);
              } else {
                throw new Error(`Email send failed: ${errorText}`);
              }
            } else {
              sentCount++;
            }
          } catch (emailError: any) {
            const errorMsg = emailError.message || String(emailError);
            if (errorMsg.includes("550") || errorMsg.includes("553") || 
                errorMsg.toLowerCase().includes("invalid") || 
                errorMsg.toLowerCase().includes("not found") || 
                errorMsg.toLowerCase().includes("does not exist") ||
                errorMsg.toLowerCase().includes("user unknown") ||
                errorMsg.toLowerCase().includes("mailbox")) {
              skippedCount++;
              skipped.push(`${reg.name} (${reg.email}): Email address does not exist`);
            } else {
              failedCount++;
              errors.push(`${reg.name} (${reg.email}): ${errorMsg}`);
              console.error(`[resend-links] Failed to send email to ${reg.email}:`, emailError);
            }
          }
        } catch (error: any) {
          failedCount++;
          errors.push(`${reg.name} (${reg.email}): ${error.message}`);
          console.error(`Failed to resend link to ${reg.email}:`, error);
        }
      }

      let message = `Join links resent to ${sentCount} registration(s).`;
      if (skippedCount > 0) {
        message += ` ${skippedCount} email(s) skipped (invalid or non-existent addresses).`;
      }
      if (failedCount > 0) {
        message += ` ${failedCount} email(s) failed.`;
      }

      return jsonResponse({
        message,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors : undefined,
        skippedEmails: skipped.length > 0 ? skipped : undefined,
      }, 200, cors);
    }

    // CREATE
    if ((apiPath === "/" || apiPath === "") && req.method === "POST") {
      const body = await req.json();
      const payload = {
        slug: body.slug,
        title: body.title,
        hero: body.hero,
        middle_section: body.middleSection,
        mentor: body.mentor,
        certificate: body.certificate,
        faq: body.faq,
        sticky_footer: body.stickyFooter,
        meta_title: body.metaTitle,
        meta_description: body.metaDescription,
        is_published: body.isPublished,
      };

      const { data, error } = await supabase
        .from("landing_pages")
        .insert([payload])
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500, cors);
      return jsonResponse({
        _id: data.id,
        ...data
      }, 201, cors);
    }

    // GET by ID or Slug? Frontend seems to use ID for edit?
    // Wait, ListLayer uses `deletePage(page._id)`.
    // FormLayer `apiClient(\`/landing-pages/\${slug}\`)` (Step 2094 line 57).
    // FormLayer `apiClient(\`/landing-pages/\${data._id}\`, { method: 'PUT', ... })` (Step 2094 line 88).
    // So GET uses slug, PUT/DELETE use ID.
    // I need to handle both if possible, or detect UUID vs Slug.

    // Check if ID param is UUID
    const idMatch = apiPath.match(/^\/([0-9a-f-]+)$/i);
    // Or slug (anything not UUID)
    const slugMatch = apiPath.match(/^\/([^/]+)$/);

    if (apiPath !== "/" && apiPath !== "") {
      const param = apiPath.slice(1); // remove leading slash
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

      // DELETE /:id
      if (req.method === "DELETE") {
        if (!isUuid) return jsonResponse({ error: "Invalid ID" }, 400, cors);
        const { error } = await supabase.from("landing_pages").delete().eq("id", param);
        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ message: "Deleted" }, 200, cors);
      }

      // PUT /:id
      if (req.method === "PUT") {
        if (!isUuid) return jsonResponse({ error: "Invalid ID" }, 400, cors);
        const body = await req.json();
        const payload = {
          slug: body.slug,
          title: body.title,
          hero: body.hero,
          middle_section: body.middleSection,
          mentor: body.mentor,
          certificate: body.certificate,
          faq: body.faq,
          sticky_footer: body.stickyFooter,
          meta_title: body.metaTitle,
          meta_description: body.metaDescription,
          is_published: body.isPublished,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from("landing_pages")
          .update(payload)
          .eq("id", param)
          .select()
          .single();

        if (error) return jsonResponse({ error: error.message }, 500, cors);
        return jsonResponse({ _id: data.id, ...data }, 200, cors);
      }

      // GET /:slug OR /:id
      // Frontend calls GET /landing-pages/:slug
      if (req.method === "GET") {
        let query = supabase.from("landing_pages").select("*");
        if (isUuid) {
          query = query.eq("id", param);
        } else {
          query = query.eq("slug", param);
        }
        const { data, error } = await query.single();

        if (error || !data) return jsonResponse({ error: "Not found" }, 404, cors);

        // Map for frontend form
        const mapped = {
          _id: data.id,
          id: data.id,
          slug: data.slug,
          title: data.title,
          hero: data.hero,
          middleSection: data.middle_section,
          mentor: data.mentor,
          certificate: data.certificate,
          faq: data.faq,
          stickyFooter: data.sticky_footer,
          metaTitle: data.meta_title,
          metaDescription: data.meta_description,
          isPublished: data.is_published,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
        return jsonResponse(mapped, 200, cors);
      }
    }

    return jsonResponse({ error: "Not found" }, 404, cors);

  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, cors);
  }
});
