/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";



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
    const routeParts = segments.slice(1); // args

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. List Events: GET /
    if (req.method === "GET" && routeParts.length === 0) {
        const timeframe = url.searchParams.get("timeframe");
        const limit = Number(url.searchParams.get("limit")) || 10;
        const isMasterclass = url.searchParams.get("isMasterclass") === "true";

        const excludeMasterclass = url.searchParams.get("excludeMasterclass") === "true";

        let query = supabase.from("events").select("*");
        
        if (isMasterclass) {
           // Filter by status AND (badge='Masterclass' OR event_type='masterclass')
           query = query.eq("status", "published").or("badge.eq.Masterclass,event_type.eq.masterclass,event_type.eq.Masterclass");
        } else if (excludeMasterclass) {
           // Filter OUT masterclasses
           query = query.eq("status", "published").neq("badge", "Masterclass").neq("event_type", "masterclass");
        }

        const nowStr = new Date().toISOString();

        if (timeframe === "upcoming") {
           query = query.gte("schedule->>start", nowStr).eq("status", "published");
        } else if (timeframe === "past") {
           query = query.lt("schedule->>start", nowStr).eq("status", "published");
        } else {
           query = query.eq("status", "published");
        }

        query = query.order("schedule->>start", { ascending: timeframe === "upcoming" }).limit(limit);

        const { data: events, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ items: (events || []).map(mapEvent) }), {
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }

    // 2. Get Event: GET /:slug
    if (req.method === "GET" && routeParts.length === 1) {
        const slug = routeParts[0];
        const { data: event, error } = await supabase
            .from("events")
            .select("*")
            .eq("slug", slug)
            .single();
        
        if (error || !event) {
            return new Response(JSON.stringify({ error: "Event not found" }), { status: 404, headers: cors });
        }

        return new Response(JSON.stringify(mapEvent(event)), {
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: cors });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  }
});

const mapEvent = (event: any) => {
  if (!event) return null;
  const displayName = event.name || event.title || "Untitled Event";
  return {
    id: event.id,
    slug: event.slug,
    name: displayName,
    title: displayName,
    subtitle: event.subtitle || "",
    summary: event.summary || "",
    description: event.description || "",
    eventType: event.event_type || "Masterclass",
    badge: event.badge || "",
    category: event.category || "",
    isMasterclass: Boolean(event.is_masterclass),
    heroImage: event.hero_image || {},
    featuredImage: event.featured_image || {},
    schedule: event.schedule || {},
    location: event.location || {},
    host: event.host || {},
    price: event.price || {},
    cta: event.cta || {}, // Crucial for registration link
    meta: event.meta || {}, // Crucial for highlights, agenda, support
    masterclassDetails: event.masterclass_details || {}, // Crucial for Masterclass Template
    stats: event.stats || {},
    status: event.status,
    speakers: event.speakers || [],
    registration: event.registration || {},
    isFeatured: Boolean(event.is_featured),
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
};
