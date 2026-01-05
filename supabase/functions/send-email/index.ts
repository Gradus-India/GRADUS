/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Simple SMTP Client for Deno Edge
async function sendSmtp(hostname: string, port: number, user: string, pass: string, from: string, to: string, subject: string, html: string) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Helper to write
    const write = async (conn: Deno.Conn, str: string) => {
        await conn.write(encoder.encode(str + "\r\n"));
    };
    
    // Helper to read response
    const read = async (conn: Deno.Conn) => {
        const buf = new Uint8Array(1024);
        const n = await conn.read(buf);
        return n ? decoder.decode(buf.subarray(0, n)) : "";
    };

    console.log(`Connecting to ${hostname}:${port}...`);
    const conn = await Deno.connectTls({ hostname, port });
    
    try {
        let res = await read(conn); // Greeting
        if (!res.includes("220")) throw new Error("SMTP Handshake failed: " + res);

        await write(conn, "EHLO localhost");
        res = await read(conn);

        await write(conn, "AUTH LOGIN");
        res = await read(conn); // 334 VXNlcm5hbWU6
        
        await write(conn, btoa(user));
        res = await read(conn); // 334 UGFzc3dvcmQ6
        
        await write(conn, btoa(pass));
        res = await read(conn); 
        if (!res.includes("2.3.5") && !res.includes("235")) throw new Error("SMTP Auth failed: " + res);

        await write(conn, `MAIL FROM: <${from}>`);
        await read(conn);

        await write(conn, `RCPT TO: <${to}>`);
        await read(conn);

        await write(conn, "DATA");
        await read(conn); // 354

        // Construct Body
        const boundary = "foo_bar_baz";
        const body = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            ``,
            `--${boundary}`,
            `Content-Type: text/plain; charset=utf-8`,
            ``,
            html.replace(/<[^>]*>?/gm, ''), // Crude text fallback
            ``,
            `--${boundary}`,
            `Content-Type: text/html; charset=utf-8`,
            ``,
            html,
            ``,
            `--${boundary}--`,
            `.` // End of data
        ].join("\r\n");

        await write(conn, body);
        res = await read(conn); 
        if (!res.includes("250")) throw new Error("SMTP Send failed: " + res);

        await write(conn, "QUIT");
        // await read(conn); 
        
    } finally {
        conn.close();
    }
}

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

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors as any });
  }

  // Manual Auth Check (Bypassing platform verify_jwt which was failing)
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  // Allow only Service Key (Internal use only)
  const isValid = authHeader === `Bearer ${serviceKey}`;
  
  if (!isValid) {
     return new Response(JSON.stringify({ error: "Unauthorized: Service Key Required" }), { status: 401, headers: cors as any });
  }

  try {
    const { to, subject, html, text, from, auth } = await req.json();

    if (!to || !subject) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const SMTP_USER = auth?.user || Deno.env.get("SMTP_LOGIN_USER") || Deno.env.get("SMTP_USER");
    const SMTP_PASS = auth?.pass || Deno.env.get("SMTP_PASS");

    if (!SMTP_USER || !SMTP_PASS) {
      throw new Error("Missing SMTP Credentials");
    }
    
    const displayFrom = from || SMTP_USER;
    
    await sendSmtp("smtp.gmail.com", 465, SMTP_USER, SMTP_PASS, displayFrom, to, subject, html || text);

    return new Response(JSON.stringify({ success: true, message: "Sent via Raw SMTP" }), {
      headers: { ...cors as any, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req) as any, "Content-Type": "application/json" },
    });
  }
});
