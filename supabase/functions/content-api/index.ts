/// <reference lib="deno.ns" />
import { createClient } from "jsr:@supabase/supabase-js@2";

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin || "http://localhost:5173"; 

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
};

Deno.serve(async (req) => {
  // Handle CORS for OPTIONS requests explicitly and early
  if (req.method === "OPTIONS") {
     return new Response("ok", { headers: getCorsHeaders(req) });
  }

  const cors = getCorsHeaders(req);

  try {
    const url = new URL(req.url); // e.g. https://.../functions/v1/content-api/resource
    const path = url.pathname.replace(/\/$/, ""); 
    
    // Helper to match resource regardless of prefix nesting
    const match = (method: string, suffix: string) => req.method === method && path.endsWith(`/${suffix}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Banners: GET /banners
    if (match("GET", "banners")) {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      
      if (error) throw error;
      return new Response(JSON.stringify({ items: (data || []).map(mapBanner) }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 2. Why Gradus Video: GET /why-gradus-video
    if (match("GET", "why-gradus-video")) {
      const { data, error } = await supabase
        .from("why_gradus_videos")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return new Response(JSON.stringify({ item: data ? mapWhyGradusVideo(data) : null }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 3. Partners: GET /partners
    if (match("GET", "partners")) {
      const { data, error } = await supabase
        .from("partner_logos")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ items: (data || []).map(mapPartner) }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 4. Testimonials: GET /testimonials
    if (match("GET", "testimonials")) {
      const { data, error } = await supabase
        .from("testimonials")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ items: (data || []).map(mapTestimonial) }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 5. Expert Videos: GET /expert-videos
    if (match("GET", "expert-videos")) {
      const { data, error } = await supabase
        .from("expert_videos")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ items: (data || []).map(mapExpertVideo) }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 6. Contact Inquiries: POST /inquiries
    if (match("POST", "inquiries")) {
      const body = await req.json();
      const { data, error } = await supabase
        .from("contact_inquiries")
        .insert([body])
        .select()
        .single();
      
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 7. Event Registrations: POST /event-registrations (Legacy/Backup)
    if (match("POST", "event-registrations")) {
      const body = await req.json();
      const { data, error } = await supabase
        .from("event_registrations")
        .insert([body])
        .select()
        .single();
      
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 7.1 Landing Page Registrations: POST /landing-page-registrations
    if (match("POST", "landing-page-registrations")) {
      const body = await req.json();
      const { data, error } = await supabase
        .from("landing_page_registrations")
        .insert([body])
        .select()
        .single();
      
      if (error) {
           console.error("Insert Error:", error);
           throw error;
      }
      return new Response(JSON.stringify(data), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 8. Gallery: GET /gallery
    if (match("GET", "gallery")) {
      const category = url.searchParams.get("category");
      const limit = url.searchParams.get("limit");

      let query = supabase.from("gallery_items").select("*").eq("is_active", true);
      if (category) query = query.eq("category", category);
      query = query.order("created_at", { ascending: false });
      if (limit) query = query.limit(parseInt(limit, 10));

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        count: data.length,
        items: (data || []).map(mapGalleryItem)
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 9. Landing Pages: GET /landing-pages/:slug OR /landing-pages/:id
    // This requires slightly more complex matching
    if (req.method === "GET" && path.includes("/landing-pages/")) {
      // url path: .../content-api/landing-pages/SOME-ID
      const parts = path.split("/");
      const param = parts[parts.length - 1]; // Last part is the ID/Slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

      let query = supabase.from("landing_pages").select("*");
      if (isUuid) {
        query = query.eq("id", param);
      } else {
        query = query.eq("slug", param);
      }

      const { data, error } = await query.single();
      
      if (error || !data) return new Response(JSON.stringify({ message: "Landing page not found" }), { status: 404, headers: cors });
      return new Response(JSON.stringify(mapLandingPage(data)), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 10. List Landing Pages (minimal): GET /landing-pages
    if (match("GET", "landing-pages")) {
      const { data, error } = await supabase
        .from("landing_pages")
        .select("id, slug, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify((data || []).map(row => ({
        _id: row.id,
        id: row.id,
        slug: row.slug,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found", path }), { status: 404, headers: cors });

  } catch (error) {
    console.error("Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  }
});

// Mappers (kept same as before)
const mapBanner = (doc: any) => ({
  id: doc.id,
  title: doc.title || "",
  subtitle: doc.subtitle || "",
  description: doc.description || "",
  ctaLabel: doc.cta_label || "",
  ctaUrl: doc.cta_url || "",
  active: Boolean(doc.is_active),
  order: doc.sort_order || 0,
  imageUrl: doc.image_url,
  desktopImageUrl: doc.image_url,
  mobileImageUrl: doc.mobile_image_url || "",
});

const mapWhyGradusVideo = (doc: any) => {
  const videoUrl = doc.video_url || "";
  return {
    id: doc.id,
    title: doc.title,
    subtitle: doc.subtitle,
    description: doc.description,
    ctaLabel: doc.cta_label,
    ctaHref: doc.cta_href,
    playbackUrl: videoUrl,
    videoUrl: videoUrl,
    secureUrl: videoUrl,
    thumbnailUrl: doc.thumbnail_url,
    duration: doc.duration,
    active: Boolean(doc.is_active),
    order: doc.sort_order,
  };
};

const mapPartner = (doc: any) => ({
  id: doc.id,
  name: doc.name || "",
  website: doc.website_url || "",
  programs: Array.isArray(doc.programs) ? doc.programs : [],
  active: Boolean(doc.is_active),
  order: doc.sort_order || 0,
  logoUrl: doc.logo_url,
});

const mapTestimonial = (doc: any) => {
  const videoUrl = doc.video_url || "";
  return {
    id: doc.id,
    name: doc.name,
    role: doc.role,
    company: doc.company,
    quote: doc.quote,
    playbackUrl: videoUrl,
    videoUrl: videoUrl,
    secureUrl: videoUrl,
    thumbnailUrl: doc.image_url,
    active: true,
    order: doc.sort_order,
    isFeatured: doc.featured,
  };
};

const mapExpertVideo = (doc: any) => {
  const videoUrl = doc.video_url || "";
  return {
    id: doc.id,
    title: doc.title,
    subtitle: doc.subtitle,
    description: doc.description,
    order: doc.sort_order,
    active: doc.is_active,
    playbackUrl: videoUrl,
    videoUrl: videoUrl,
    secureUrl: videoUrl,
    thumbnailUrl: doc.thumbnail_url,
    duration: doc.duration,
  };
};

const mapGalleryItem = (item: any) => ({
  id: item.id,
  title: item.title,
  category: item.category,
  imageUrl: item.image_url,
  publicId: item.public_id,
  isActive: item.is_active,
  createdAt: item.created_at,
});

const mapLandingPage = (row: any) => ({
  _id: row.id,
  id: row.id,
  slug: row.slug,
  title: row.title,
  hero: row.hero || {},
  middleSection: row.middle_section || {},
  mentor: row.mentor || {},
  certificate: row.certificate || {},
  faq: row.faq || [],
  stickyFooter: row.sticky_footer || {},
  metaTitle: row.meta_title,
  metaDescription: row.meta_description,
  isPublished: row.is_published,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
