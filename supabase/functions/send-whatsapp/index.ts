/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || req.headers.get("origin");
  if (origin) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Credentials": "true",
    };
  }
  return {
    "Access-Control-Allow-Origin": "http://localhost:5174",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * Send WhatsApp message via Twilio
 * @param to - Phone number in E.164 format (e.g., +919876543210)
 * @param message - Message text (plain text, no HTML)
 * @param from - Twilio WhatsApp number (e.g., whatsapp:+14155238886 for sandbox)
 */
async function sendTwilioWhatsApp(
  to: string,
  message: string,
  from?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioWhatsAppFrom = from || Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886"; // Default sandbox number

  if (!accountSid || !authToken) {
    throw new Error("Missing Twilio credentials. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.");
  }

  // Normalize phone number to E.164 format
  // Remove all non-digit characters except +
  let normalizedTo = to.replace(/[^\d+]/g, "");
  
  // If it doesn't start with +, assume it's an Indian number and add +91
  if (!normalizedTo.startsWith("+")) {
    // Remove leading 0 if present
    normalizedTo = normalizedTo.replace(/^0+/, "");
    // Add +91 if it's a 10-digit number
    if (normalizedTo.length === 10) {
      normalizedTo = `+91${normalizedTo}`;
    } else if (normalizedTo.length === 12 && normalizedTo.startsWith("91")) {
      normalizedTo = `+${normalizedTo}`;
    } else {
      throw new Error(`Invalid phone number format: ${to}. Please provide a 10-digit Indian number or E.164 format.`);
    }
  }

  // Convert to WhatsApp format
  const whatsappTo = `whatsapp:${normalizedTo}`;

  // Twilio API endpoint
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams({
    From: twilioWhatsAppFrom,
    To: whatsappTo,
    Body: message,
  });

  // Basic Auth for Twilio
  const credentials = btoa(`${accountSid}:${authToken}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Twilio API error: ${response.statusText}`);
    }

    return {
      success: true,
      messageId: data.sid,
    };
  } catch (error: any) {
    console.error("Twilio WhatsApp Error:", error);
    return {
      success: false,
      error: error.message || "Failed to send WhatsApp message",
    };
  }
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors as any });
  }

  // Manual Auth Check
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  
  // Allow if it matches Service Key or Anon Key
  const isValid = authHeader === `Bearer ${serviceKey}` || authHeader === `Bearer ${anonKey}`;
  
  if (!isValid) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid API Key" }), { 
      status: 401, 
      headers: cors as any 
    });
  }

  try {
    const { to, message, from } = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields: 'to' and 'message' are required" }), { 
        status: 400,
        headers: { ...cors as any, "Content-Type": "application/json" },
      });
    }

    const result = await sendTwilioWhatsApp(to, message, from);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error || "Failed to send WhatsApp message" }), {
        status: 500,
        headers: { ...cors as any, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "WhatsApp message sent successfully",
      messageId: result.messageId 
    }), {
      headers: { ...cors as any, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Function Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req) as any, "Content-Type": "application/json" },
    });
  }
});

