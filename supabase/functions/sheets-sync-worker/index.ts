/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { google } from "npm:googleapis@126";

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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Configuration
    const BATCH_SIZE = 10; // Process up to 10 jobs per invocation
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MINUTES = [2, 5, 15]; // Exponential backoff

    // Fetch pending jobs
    const { data: jobs, error: fetchError } = await supabase
      .from("sheets_sync_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("[sheets-worker] Failed to fetch jobs", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
        status: 500,
        headers: { ...cors as any, "Content-Type": "application/json" },
      });
    }

    const results: {
      processed: number;
      succeeded: number;
      failed: number;
      rescheduled: number;
      jobs: any[];
    } = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      rescheduled: 0,
      jobs: [],
    };

    console.log(`[sheets-worker] Found ${jobs?.length || 0} pending jobs`);

    for (const job of jobs || []) {
      try {
        // Mark as processing
        await supabase
          .from("sheets_sync_queue")
          .update({ status: "processing" })
          .eq("id", job.id);

        // Process based on entity type
        let success = false;
        if (job.entity_type === "event_registration") {
          success = await processEventRegistration(job.payload);
        } else if (job.entity_type === "contact_inquiry") {
          success = await processContactInquiry(job.payload);
        } else if (job.entity_type === "landing_page_registration") {
          success = await processLandingPageRegistration(job.payload);
        } else {
          console.warn(`[sheets-worker] Unknown entity type: ${job.entity_type}`);
        }

        if (success) {
          // Mark as completed
          await supabase
            .from("sheets_sync_queue")
            .update({
              status: "completed",
              processed_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          results.succeeded++;
          results.jobs.push({ id: job.id, status: "success" });
        } else {
          throw new Error("Sync function returned false");
        }
      } catch (error) {
        console.error(`[sheets-worker] Failed to process job ${job.id}`, error);

        const newRetryCount = job.retry_count + 1;

        if (newRetryCount < MAX_RETRIES) {
          // Reschedule with exponential backoff
          const delayMinutes = RETRY_DELAY_MINUTES[newRetryCount - 1] || 15;
          const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

          await supabase
            .from("sheets_sync_queue")
            .update({
              status: "pending",
              retry_count: newRetryCount,
              last_error: (error as any)?.message || "Unknown error",
              scheduled_at: scheduledAt.toISOString(),
            })
            .eq("id", job.id);

          results.rescheduled++;
          results.jobs.push({ id: job.id, status: "rescheduled", retryCount: newRetryCount });
        } else {
          // Max retries reached, mark as failed
          await supabase
            .from("sheets_sync_queue")
            .update({
              status: "failed",
              last_error: (error as any)?.message || "Max retries reached",
              processed_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          results.failed++;
          results.jobs.push({ id: job.id, status: "failed_permanent" });
        }
      }

      results.processed++;
    }

    console.log("[sheets-worker] Batch complete", results);

    return new Response(JSON.stringify(results), {
      headers: { ...cors as any, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sheets-worker] Unexpected error", error);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { ...getCorsHeaders(req) as any, "Content-Type": "application/json" },
    });
  }
});

/**
 * Process event registration sync
 * This replicates the logic from backend's googleSheetsRegistrationSync.js
 */
async function processEventRegistration(payload: any) {
  console.log("[sheets-worker] Processing event registration", payload);
  
  const clients = getGoogleClients();
  if (!clients) {
    console.error("[sheets-worker] Google clients not initialized. Check environment variables.");
    return false;
  }

  const eventName = payload.course || payload.eventDetails?.title || "Event Registrations";
  
  try {
    const { spreadsheetId, sheetName } = await ensureSheetForEvent(eventName, clients, payload.eventDetails);
    
    const row = [
      payload.name || "",
      payload.email || "",
      payload.phone || "",
      payload.state || "",
      payload.qualification || "",
      payload.course || "",
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    ];

    await clients.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:G`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });

    return true;
  } catch (error) {
    console.error(`[sheets-worker] Registration sync failed for ${eventName}:`, error);
    return false;
  }
}

/**
 * Process contact inquiry sync
 */
async function processContactInquiry(payload: any) {
  console.log("[sheets-worker] Processing contact inquiry", payload);
  
  const clients = getGoogleClients();
  if (!clients) return false;

  const sheetName = "Contact Inquiries";
  
  try {
     // Find or create "Global inquiries" sheet
     const { spreadsheetId } = await ensureSheetByName("Global Inquiries", clients);
     
     const row = [
       payload.name || "",
       payload.email || "",
       payload.phone || "",
       payload.subject || "",
       payload.message || "",
       new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
     ];

     await clients.sheets.spreadsheets.values.append({
       spreadsheetId,
       range: `Sheet1!A:F`,
       valueInputOption: "RAW",
       insertDataOption: "INSERT_ROWS",
       requestBody: {
         values: [row],
       },
     });

     return true;
  } catch (error) {
    console.error("[sheets-worker] Contact inquiry sync failed:", error);
    return false;
  }
}

/**
 * Process landing page registration sync
 */
async function processLandingPageRegistration(payload: any) {
  console.log("[sheets-worker] Processing landing page registration", payload);
  
  const clients = getGoogleClients();
  if (!clients) {
    console.error("[sheets-worker] Google clients not initialized. Check environment variables.");
    return false;
  }

  // Use program_name or landing page title as sheet name
  const programName = payload.program_name || payload.landing_pages?.title || "Landing Page Registrations";
  const sheetName = programName.replace(/[\\/]+/g, " - ").trim();
  
  try {
    // Find or create spreadsheet for this program/landing page
    const { spreadsheetId, tabName } = await ensureSheetForLandingPage(sheetName, clients);
    
    const row = [
      payload.name || "",
      payload.email || "",
      payload.phone || "",
      payload.qualification || "",
      payload.state || "",
      payload.program_name || "",
      payload.landing_pages?.title || "",
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    ];

    await clients.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:H`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });

    return true;
  } catch (error) {
    console.error(`[sheets-worker] Landing page registration sync failed for ${sheetName}:`, error);
    return false;
  }
}

// ============================================================================
// Google Sheets Internal Helpers (Simplified Port)
// ============================================================================

function getGoogleAuth() {
  const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) return null;

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

function getGoogleClients() {
  const auth = getGoogleAuth();
  if (!auth) return null;

  return {
    drive: google.drive({ version: "v3", auth }),
    sheets: google.sheets({ version: "v4", auth }),
  };
}

async function ensureSheetForEvent(eventName: string, clients: any, eventData?: any) {
  const desiredName = eventName.replace(/[\\/]+/g, " - ").trim() || "Event Registrations";
  
  // Search for existing
  const res = await clients.drive.files.list({
    q: `name='${desiredName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1
  });

  let spreadsheetId = res.data.files?.[0]?.id;
  const sheetName = "Registrations";

  if (!spreadsheetId) {
    // Create new
    const created = await clients.sheets.spreadsheets.create({
      requestBody: {
        properties: { title: desiredName },
        sheets: [{ properties: { title: sheetName, gridProperties: { frozenRowCount: 1 } } }]
      }
    });
    spreadsheetId = created.data.spreadsheetId;
    
    // Set headers
    await clients.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Name", "Email", "Phone", "State", "Qualification", "Event", "Submitted"]],
      },
    });
  }

  return { spreadsheetId, sheetName };
}

async function ensureSheetByName(name: string, clients: any) {
  const res = await clients.drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1
  });

  let spreadsheetId = res.data.files?.[0]?.id;

  if (!spreadsheetId) {
    const created = await clients.sheets.spreadsheets.create({
      requestBody: {
        properties: { title: name },
      }
    });
    spreadsheetId = created.data.spreadsheetId;
  }

  return { spreadsheetId };
}

async function ensureSheetForLandingPage(programName: string, clients: any) {
  const desiredName = programName || "Landing Page Registrations";
  
  // Search for existing spreadsheet
  const res = await clients.drive.files.list({
    q: `name='${desiredName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1
  });

  let spreadsheetId = res.data.files?.[0]?.id;
  const tabName = "Registrations";

  if (!spreadsheetId) {
    // Create new spreadsheet
    const created = await clients.sheets.spreadsheets.create({
      requestBody: {
        properties: { title: desiredName },
        sheets: [{ properties: { title: tabName, gridProperties: { frozenRowCount: 1 } } }]
      }
    });
    spreadsheetId = created.data.spreadsheetId;
    
    // Set headers
    await clients.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Name", "Email", "Phone", "Qualification", "State", "Program Name", "Source Page", "Registration Date"]],
      },
    });
  } else {
    // Check if headers exist, if not add them
    const headerCheck = await clients.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:H1`,
    });
    
    if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
      await clients.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Name", "Email", "Phone", "Qualification", "State", "Program Name", "Source Page", "Registration Date"]],
        },
      });
    }
  }

  return { spreadsheetId, tabName };
}
