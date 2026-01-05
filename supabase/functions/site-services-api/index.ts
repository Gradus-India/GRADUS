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

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (!error && user) return user;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const payload = await verify(token, key);
    const userId = payload.id;
    if (!userId) return null;

    const { data: dbUser, error: dbErr } = await supabase
      .from("users")
      .select("id, email")
      .eq("id", userId)
      .maybeSingle();

    if (dbErr || !dbUser) return null;
    return { id: dbUser.id, email: dbUser.email };
  } catch (_error) {
    return null;
  }
}

async function hashIp(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
             req.headers.get("cf-connecting-ip") || 
             "127.0.0.1";
  const salt = Deno.env.get("ANALYTICS_SALT") || "gradus_analytics_salt";
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req) as any;
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, ""); 
    const segments = path.split("/").filter(Boolean);
    const functionName = "site-services-api"; const funcIdx = segments.indexOf(functionName); const routeParts = funcIdx !== -1 ? segments.slice(funcIdx + 1) : segments.slice(1);

    const resource = routeParts[0];

    // 1. Analytics: POST /visits
    if (req.method === "POST" && resource === "visits") {
      const body = await req.json();
      const user = await getAuthUser(req);
      const ipHash = await hashIp(req);
      
      const { error } = await supabase.from("site_visits").insert([{
        path: body.path || "/",
        page_title: body.pageTitle,
        referrer: body.referrer || req.headers.get("referer"),
        user_agent: req.headers.get("user-agent"),
        visited_at: new Date(),
        session_id: body.sessionId,
        user_id: user?.id,
        ip_hash: ipHash,
        country: req.headers.get("cf-ipcountry"),
        region: req.headers.get("x-region"),
        city: req.headers.get("x-city")
      }]);

      if (error) console.error("Analytics error:", error);
      return new Response(JSON.stringify({ recorded: !error }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 201
      });
    }

    // 1.1 Callback Requests: POST /callback-requests
    if (req.method === "POST" && resource === "callback-requests") {
      const body = await req.json();
      const user = await getAuthUser(req);

      const { data, error } = await supabase
        .from("callback_requests")
        .insert([{
          user_id: user?.id || null,
          name: body.name?.trim(),
          email: body.email?.trim(),
          phone: body.phone?.trim(),
          status: "pending",
        }])
        .select()
        .single();

      if (error) throw error;

      // Send Email Notification
      try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL");
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
          
          if (supabaseUrl && anonKey) {
            // 1. Send Admin Notification
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${anonKey}`
                },
                body: JSON.stringify({
                    to: "contact@gradusindia.in",
                    subject: `New Callback Request: ${data.name}`,
                    html: `
                        <h2>New Callback Request</h2>
                        <p><strong>Name:</strong> ${data.name}</p>
                        <p><strong>Phone:</strong> ${data.phone}</p>
                        <p><strong>Email:</strong> ${data.email}</p>
                        <p><strong>User ID:</strong> ${data.user_id || "Guest"}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    `,
                })
            });

            // 2. Send User Confirmation
            if (data.email) {
                await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${anonKey}`
                    },
                    body: JSON.stringify({
                        to: data.email,
                        subject: `We Received Your Request - Gradus`,
                        html: `
                            <h2>Hello ${data.name},</h2>
                            <p>We have received your callback request.</p>
                            <p>Our team will contact you soon!</p>
                            <br/>
                            <p>Best Regards,</p>
                            <p><strong>Team Gradus</strong></p>
                        `,
                    })
                });
            }
          }
      } catch (emailErr) {
          console.error("Failed to send callback email:", emailErr);
          // Don't fail the request if email fails, just log it
      }

      return new Response(JSON.stringify({
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        status: data.status,
        createdAt: data.created_at,
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 201
      });
    }

    // 2. Page Meta: GET /page-meta
    if (req.method === "GET" && resource === "page-meta") {
        const { data, error } = await supabase
            .from("page_metas")
            .select("*")
            .eq("is_active", true)
            .order("is_default", { ascending: false });
        
        if (error) throw error;

        const defaultMetaDoc = data.find((doc) => doc.is_default) || null;
        const items = data.filter((doc) => !doc.is_default);

        return new Response(JSON.stringify({
            defaultMeta: defaultMetaDoc ? mapPublicMeta(defaultMetaDoc) : { title: "Gradus", description: "" },
            items: items.map(mapPublicMeta)
        }), {
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }

    // 3. Jobs: /jobs
    if (resource === "jobs") {
        // GET /jobs - List
        if (req.method === "GET" && !routeParts[1]) {
            const { data, error } = await supabase
                .from("jobs")
                .select("*")
                .eq("is_active", true)
                .order("is_featured", { ascending: false })
                .order("posted_at", { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify((data || []).map(mapJob)), {
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // GET /jobs/applications/me
        if (req.method === "GET" && routeParts[1] === "applications" && routeParts[2] === "me") {
            const user = await getAuthUser(req);
            if (!user) return new Response("Unauthorized", { status: 401, headers: cors });

            const { data, error } = await supabase
                .from("job_applications")
                .select("*, jobs(title, company)")
                .eq("user_id", user.id)
                .order("applied_at", { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify((data || []).map(mapApplication)), {
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // GET /jobs/:id
        if (req.method === "GET" && routeParts[1]) {
            const { data, error } = await supabase
                .from("jobs")
                .select("*")
                .eq("id", routeParts[1])
                .single();

            if (error) return new Response("Not found", { status: 404, headers: cors });
            return new Response(JSON.stringify(mapJob(data)), {
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // POST /jobs/:id/apply
        if (req.method === "POST" && routeParts[1] && routeParts[2] === "apply") {
            const user = await getAuthUser(req);
            if (!user) return new Response("Unauthorized", { status: 401, headers: cors });

            const jobId = routeParts[1];
            const body = await req.json();

            // Check existing
            const { data: existing } = await supabase
                .from("job_applications")
                .select("id")
                .eq("job_id", jobId)
                .eq("user_id", user.id)
                .maybeSingle();
            
            if (existing) return new Response(JSON.stringify({ error: "Already applied" }), { status: 400, headers: cors });

            const { data: userData } = await supabase
                .from("users")
                .select("first_name, last_name, email, mobile")
                .eq("id", user.id)
                .single();

            const { data, error } = await supabase
                .from("job_applications")
                .insert([{
                    job_id: jobId,
                    user_id: user.id,
                    applicant_name: `${userData?.first_name || ""} ${userData?.last_name || ""}`.trim(),
                    applicant_email: userData?.email,
                    applicant_phone: userData?.mobile,
                    resume_snapshot: body.resumeData || {},
                    resume_url: body.resumeData?.url || null,
                    cover_letter: body.coverLetter,
                    status: "submitted",
                    applied_at: new Date(),
                }])
                .select()
                .single();

            if (error) throw error;
            return new Response(JSON.stringify(mapApplication(data)), {
                headers: { ...cors, "Content-Type": "application/json" },
                status: 201
            });
        }
    }

    // 4. Tickets: /tickets
    if (resource === "tickets") {
        const user = await getAuthUser(req);
        if (!user) return new Response("Unauthorized", { status: 401, headers: cors });

        // GET /tickets - List my tickets
        if (req.method === "GET" && !routeParts[1]) {
            let query = supabase
                .from("tickets")
                .select("*")
                .eq("user_id", user.id)
                .order("last_message_at", { ascending: false });

            const status = url.searchParams.get("status");
            if (status) query = query.eq("status", status);

            const { data, error } = await query;
            if (error) throw error;
            return new Response(JSON.stringify({ items: (data || []).map(mapTicket), total: data?.length || 0 }), {
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // POST /tickets - Create
        if (req.method === "POST" && !routeParts[1]) {
            const { subject, description } = await req.json();
            
            const { data: ticket, error: tErr } = await supabase
                .from("tickets")
                .insert([{
                    user_id: user.id,
                    subject: subject.trim(),
                    status: "not_opened",
                    last_message_at: new Date(),
                    message_count: 1,
                }])
                .select()
                .single();

            if (tErr) throw tErr;

            await supabase.from("ticket_messages").insert([{
                ticket_id: ticket.id,
                message: description.trim(),
                sender_config: { authorType: "user", authorUser: user.id },
            }]);

            return new Response(JSON.stringify({ message: "Ticket created", item: mapTicket(ticket) }), {
                headers: { ...cors, "Content-Type": "application/json" },
                status: 201
            });
        }

        // GET /tickets/:id - Details
        if (req.method === "GET" && routeParts[1] && !routeParts[2]) {
            const ticketId = routeParts[1];
            const { data: ticket, error: tErr } = await supabase
                .from("tickets")
                .select("*")
                .eq("id", ticketId)
                .eq("user_id", user.id)
                .single();

            if (tErr) return new Response("Not found", { status: 404, headers: cors });

            const { data: messages, error: mErr } = await supabase
                .from("ticket_messages")
                .select("*")
                .eq("ticket_id", ticketId)
                .order("created_at", { ascending: true });

            if (mErr) throw mErr;

            return new Response(JSON.stringify({
                item: mapTicket(ticket),
                messages: (messages || []).map(mapTicketMessage)
            }), {
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // POST /tickets/:id/messages - Add message
        if (req.method === "POST" && routeParts[1] && routeParts[2] === "messages") {
            const ticketId = routeParts[1];
            const { body: msgBody } = await req.json();

            const { data: ticket, error: vErr } = await supabase
                .from("tickets")
                .select("*")
                .eq("id", ticketId)
                .eq("user_id", user.id)
                .single();

            if (vErr) return new Response("Not found", { status: 404, headers: cors });
            if (ticket.status === "closed") return new Response(JSON.stringify({ error: "Ticket is closed" }), { status: 400, headers: cors });

            const { data: message, error: mErr } = await supabase
                .from("ticket_messages")
                .insert([{
                    ticket_id: ticketId,
                    message: msgBody.trim(),
                    sender_config: { authorType: "user", authorUser: user.id },
                }])
                .select()
                .single();

            if (mErr) throw mErr;

            const updates: any = {
                message_count: (ticket.message_count || 0) + 1,
                last_message_at: message.created_at,
            };
            if (ticket.status !== "pending_confirmation") {
                updates.status = "in_progress";
            }

            await supabase.from("tickets").update(updates).eq("id", ticketId);

            return new Response(JSON.stringify({ message: "Message added", item: mapTicketMessage(message) }), {
                headers: { ...cors, "Content-Type": "application/json" },
                status: 201
            });
        }

        // PUT /tickets/:id/close - Close
        if (req.method === "PUT" && routeParts[1] && routeParts[2] === "close") {
            const { error } = await supabase
                .from("tickets")
                .update({ status: "closed", updated_at: new Date() })
                .eq("id", routeParts[1])
                .eq("user_id", user.id);

            if (error) throw error;
            return new Response(JSON.stringify({ message: "Ticket closed" }), {
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }
    }

    // 5. Resume: /resume
    if (resource === "resume") {
        const user = await getAuthUser(req);
        if (!user) return new Response("Unauthorized", { status: 401, headers: cors });

        // GET /resume/me
        if (req.method === "GET" && routeParts[1] === "me") {
            const { data } = await supabase
                .from("resumes")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle();

            return new Response(JSON.stringify({
                resume: data ? {
                    id: data.id,
                    template: data.template,
                    data: data.data,
                    isPublished: data.is_published,
                    updatedAt: data.updated_at,
                } : { template: "classic", data: {}, isPublished: false }
            }), { headers: { ...cors, "Content-Type": "application/json" } });
        }

        // POST /resume/upsert
        if (req.method === "POST" && (routeParts[1] === "upsert" || routeParts[1] === "upload")) {
            const body = await req.json();
            const payload = {
                user_id: user.id,
                template: body.template?.trim() || "classic",
                data: body.data || {},
                is_published: !!body.isPublished,
                updated_at: new Date(),
            };

            const { data, error } = await supabase
                .from("resumes")
                .upsert(payload, { onConflict: "user_id" })
                .select()
                .single();

            if (error) throw error;
            return new Response(JSON.stringify({
                resume: {
                    id: data.id,
                    template: data.template,
                    data: data.data,
                    isPublished: data.is_published,
                    updatedAt: data.updated_at,
                }
            }), { headers: { ...cors, "Content-Type": "application/json" } });
        }
    }

    return new Response(JSON.stringify({ error: "Not found", resource }), { status: 404, headers: cors });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  }
});

// Mappers
const mapPublicMeta = (doc: any) => ({
    path: doc.path || undefined,
    title: doc.title || "",
    description: doc.description || "",
    keywords: doc.keywords || "",
    robots: doc.robots || "",
});

const mapJob = (doc: any) => ({
    id: doc.id,
    title: doc.title,
    company: doc.company,
    location: doc.location,
    salary: doc.salary,
    type: doc.type,
    description: doc.description,
    isFeatured: doc.is_featured,
    postedAt: doc.posted_at || doc.created_at,
});

const mapApplication = (doc: any) => ({
    id: doc.id,
    job: doc.job_id,
    status: doc.status,
    appliedAt: doc.applied_at || doc.created_at,
    jobData: doc.jobs ? { title: doc.jobs.title, company: doc.jobs.company } : null,
});

const mapTicket = (doc: any) => ({
    id: doc.id,
    subject: doc.subject,
    status: doc.status,
    lastMessageAt: doc.last_message_at,
    messageCount: doc.message_count || 0,
    createdAt: doc.created_at,
});

const mapTicketMessage = (doc: any) => ({
    id: doc.id,
    authorType: doc.sender_config?.authorType || "user",
    body: doc.message,
    createdAt: doc.created_at,
});
