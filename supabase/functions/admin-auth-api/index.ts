/// <reference lib="deno.ns" />
/**
 * Admin Auth API Edge Function
 * Handles all admin authentication endpoints:
 * - Login, profile, password management
 * - Signup flow with OTP + approval
 * - Password reset flow
 * - Email change flow
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { create, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
// Use default import for CJS module
import bcrypt from "npm:bcryptjs@2.4.3";

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

function htmlResponse(html: string, status = 200, cors: any) {
  return new Response(html, {
    status,
    headers: { ...cors, "Content-Type": "text/html" },
  });
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(length = 24): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// JWT Helper
// ============================================================================

const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET environment variable");
}

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

async function generateJwt(adminId: string): Promise<string> {
  const key = await getJwtKey();
  const payload = {
    sub: adminId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };
  return await create({ alg: "HS256", typ: "JWT" }, payload, key);
}

async function verifyJwt(token: string): Promise<{ sub: string } | null> {
  try {
    const key = await getJwtKey();
    const payload = await verify(token, key);
    return payload as { sub: string };
  } catch (err) {
    console.error("JWT Verification Error:", err);
    return null;
  }
}

// ============================================================================
// DB Helpers
// ============================================================================

function toCamelCaseAdmin(admin: any) {
  if (!admin) return null;
  return {
    id: admin.id,
    fullName: admin.full_name,
    email: admin.email,
    phoneNumber: admin.phone_number,
    department: admin.department,
    designation: admin.designation,
    languages: admin.languages || [],
    bio: admin.bio,
    status: admin.status,
    role: admin.role,
    emailVerified: admin.email_verified,
    supabaseId: admin.supabase_id,
    authProvider: admin.auth_provider,
    createdAt: admin.created_at,
    updatedAt: admin.updated_at,
    password: admin.password_hash,
  };
}

function toSnakeCaseAdmin(data: any) {
  const mapped: any = {};
  if (data.fullName !== undefined) mapped.full_name = data.fullName;
  if (data.email !== undefined) mapped.email = data.email;
  if (data.phoneNumber !== undefined) mapped.phone_number = data.phoneNumber;
  if (data.department !== undefined) mapped.department = data.department;
  if (data.designation !== undefined) mapped.designation = data.designation;
  if (data.languages !== undefined) mapped.languages = data.languages;
  if (data.bio !== undefined) mapped.bio = data.bio;
  if (data.status !== undefined) mapped.status = data.status;
  if (data.role !== undefined) mapped.role = data.role;
  if (data.password !== undefined) mapped.password_hash = data.password;
  if (data.emailVerified !== undefined) mapped.email_verified = data.emailVerified;
  return mapped;
}

function toCamelCaseSession(data: any) {
  if (!data) return null;
  return {
    id: data.id,
    type: data.type,
    email: data.email,
    userId: data.user_id,
    adminId: data.admin_id,
    otpHash: data.otp_hash,
    otpExpiresAt: data.otp_expires_at ? new Date(data.otp_expires_at) : null,
    verificationToken: data.verification_token,
    status: data.status,
    payload: data.payload || {},
    createdAt: data.created_at ? new Date(data.created_at) : null,
    updatedAt: data.updated_at ? new Date(data.updated_at) : null,
  };
}

function normaliseLanguages(languages: any): string[] {
  if (!languages) return [];
  if (Array.isArray(languages)) {
    return languages.map((lang: string) => lang.trim()).filter(Boolean);
  }
  if (typeof languages === "string") {
    return languages.split(",").map((lang) => lang.trim()).filter(Boolean);
  }
  return [];
}

// ============================================================================
// Email Helper - Uses existing send-email Edge Function
// ============================================================================

async function sendEmail(to: string, subject: string, html: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  
  const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ to, subject, html }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to send email: ${await response.text()}`);
  }
  
  return await response.json();
}

async function sendOtpEmail(to: string, otp: string, context: { title: string; action: string }) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${context.title}</h2>
      <p>Your verification code for ${context.action} is:</p>
      <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code expires in 10 minutes.</p>
      <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;
  return await sendEmail(to, context.title, html);
}

// ============================================================================
// Constants
// ============================================================================

const ADMIN_ROLE_OPTIONS: Record<string, string> = {
  admin: "Admin",
  programmer_admin: "Programmer(Admin)",
  seo: "SEO",
  sales: "Sales",
};

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
    
    // Remove "admin-auth-api" prefix from path
    const apiPath = "/" + pathParts.slice(pathParts.indexOf("admin-auth-api") + 1).join("/");

    // ========================================================================
    // PUBLIC ENDPOINTS (No auth required)
    // ========================================================================

    // POST /check-auth-type
    if (apiPath === "/check-auth-type" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { email } = body;

      if (!email) {
        return jsonResponse({ error: "Email is required" }, 400, cors);
      }

      const normalizedEmail = email.toLowerCase().trim();
      const { data: admin } = await supabase
        .from("admin_users")
        .select("supabase_id, auth_provider")
        .eq("email", normalizedEmail)
        .single();

      if (admin && (admin.supabase_id || admin.auth_provider === "supabase")) {
        return jsonResponse({ type: "supabase" }, 200, cors);
      }
      return jsonResponse({ type: "legacy" }, 200, cors);
    }

    // POST /login
    if (apiPath === "/login" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { email, password } = body;

      if (!email || !password) {
        return jsonResponse({ error: "Email and password are required" }, 400, cors);
      }

      const normalizedEmail = email.toLowerCase().trim();
      const { data: adminData, error: adminError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("email", normalizedEmail)
        .single();

      if (adminError || !adminData) {
        return jsonResponse({ error: "Invalid email or password." }, 401, cors);
      }

      const admin = toCamelCaseAdmin(adminData);
      if (!admin?.password) {
        return jsonResponse({ error: "Invalid email or password." }, 401, cors);
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return jsonResponse({ error: "Invalid email or password." }, 401, cors);
      }

      if (admin.status && admin.status !== "active") {
        return jsonResponse({ error: "Your admin account is inactive. Please contact a Programmer(Admin)." }, 403, cors);
      }

      // Update emailVerified if needed
      if (!admin.emailVerified) {
        await supabase.from("admin_users").update({ email_verified: true }).eq("id", admin.id);
      }

      const token = await generateJwt(admin.id);
      const safeAdmin = { ...admin };
      delete safeAdmin.password;

      return jsonResponse({ token, admin: safeAdmin }, 200, cors);
    }

    // ========================================================================
    // SIGNUP FLOW ENDPOINTS
    // ========================================================================

    // POST /signup/start
    if (apiPath === "/signup/start" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { fullName, email, phoneNumber, department, designation, languages, bio } = body;

      if (!fullName || !email || !phoneNumber) {
        return jsonResponse({ error: "Full name, email, and phone number are required" }, 400, cors);
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if admin already exists
      const { data: existingAdmin } = await supabase
        .from("admin_users")
        .select("id")
        .eq("email", normalizedEmail)
        .single();

      if (existingAdmin) {
        return jsonResponse({ error: "An account with this email already exists. Try signing in instead." }, 409, cors);
      }

      // Delete any existing sessions
      await supabase
        .from("verification_sessions")
        .delete()
        .eq("type", "ADMIN_SIGNUP")
        .eq("email", normalizedEmail);

      const approvalToken = generateToken(24);
      const payload = {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        department: department?.trim() || "",
        designation: designation?.trim() || "",
        languages: normaliseLanguages(languages),
        bio: bio?.trim() || "",
        approvalToken,
      };

      const { data: session, error: sessionError } = await supabase
        .from("verification_sessions")
        .insert([{
          type: "ADMIN_SIGNUP",
          email: normalizedEmail,
          status: "APPROVAL_PENDING",
          payload,
        }])
        .select()
        .single();

      if (sessionError || !session) {
        return jsonResponse({ error: "Failed to create session" }, 500, cors);
      }

      // Send approval email to approver
      const approverEmail = Deno.env.get("ADMIN_APPROVER_EMAIL") || "admin@gradus.com";
      const adminBaseUrl = Deno.env.get("ADMIN_PORTAL_URL") || "https://admin.gradus.com";
      const decisionBase = `/api/admin/auth/signup/decision?sessionId=${session.id}&token=${approvalToken}`;

      const approvalOptions = Object.entries(ADMIN_ROLE_OPTIONS).map(([roleKey, label]) => ({
        label,
        url: `${adminBaseUrl}${decisionBase}&decision=approve&role=${roleKey}`,
      }));

      const rejectionUrl = `${adminBaseUrl}${decisionBase}&decision=reject`;

      const approvalHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Admin Signup Request</h2>
          <p><strong>Name:</strong> ${payload.fullName}</p>
          <p><strong>Email:</strong> ${normalizedEmail}</p>
          <p><strong>Phone:</strong> ${payload.phoneNumber}</p>
          <p><strong>Department:</strong> ${payload.department || "N/A"}</p>
          <p><strong>Designation:</strong> ${payload.designation || "N/A"}</p>
          <h3>Approve with Role:</h3>
          ${approvalOptions.map((opt) => `<p><a href="${opt.url}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; margin: 5px; display: inline-block;">${opt.label}</a></p>`).join("")}
          <h3>Or Reject:</h3>
          <p><a href="${rejectionUrl}" style="background: #f44336; color: white; padding: 10px 20px; text-decoration: none;">Reject Request</a></p>
        </div>
      `;

      try {
        await sendEmail(approverEmail, "New Admin Signup Request - Gradus Portal", approvalHtml);
      } catch (error) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "We could not start the approval process. Please try again later." }, 500, cors);
      }

      return jsonResponse({
        sessionId: session.id,
        email: normalizedEmail,
        status: session.status,
        approverEmail,
      }, 200, cors);
    }

    // GET /signup/decision (for approver clicking links)
    if (apiPath === "/signup/decision" && req.method === "GET") {
      const sessionId = url.searchParams.get("sessionId");
      const token = url.searchParams.get("token");
      const decision = (url.searchParams.get("decision") || "").toLowerCase();
      const roleKey = (url.searchParams.get("role") || "").toLowerCase();

      if (!sessionId) {
        return htmlResponse("<h2>Invalid approval link</h2><p>The approval link appears to be invalid or expired.</p>", 400, cors);
      }

      if (!["approve", "reject"].includes(decision)) {
        return htmlResponse("<h2>Invalid decision</h2><p>The requested action is not recognised.</p>", 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_SIGNUP") {
        return htmlResponse("<h2>Request not found</h2><p>This signup request could not be located.</p>", 404, cors);
      }

      const storedToken = session.payload?.approvalToken;
      if (storedToken !== token) {
        return htmlResponse("<h2>Link mismatch</h2><p>The approval token does not match this request.</p>", 403, cors);
      }

      if (session.status === "REJECTED") {
        return htmlResponse("<h2>Already rejected</h2><p>This signup request has already been rejected.</p>", 200, cors);
      }

      if (["OTP_PENDING", "OTP_VERIFIED", "COMPLETED"].includes(session.status)) {
        return htmlResponse("<h2>Already approved</h2><p>This signup request has already been approved.</p>", 200, cors);
      }

      if (decision === "reject") {
        await supabase.from("verification_sessions").update({
          status: "REJECTED",
          payload: { ...session.payload, approvalRespondedAt: new Date().toISOString() },
        }).eq("id", session.id);
        return htmlResponse("<h2>Request rejected</h2><p>No verification email was sent to the requester.</p>", 200, cors);
      }

      if (!ADMIN_ROLE_OPTIONS[roleKey]) {
        return htmlResponse("<h2>Missing role</h2><p>Please select a valid role for this admin.</p>", 400, cors);
      }

      const updatedPayload = {
        ...session.payload,
        role: roleKey,
        roleLabel: ADMIN_ROLE_OPTIONS[roleKey],
        approvalRespondedAt: new Date().toISOString(),
      };

      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      try {
        await supabase.from("verification_sessions").update({
          payload: updatedPayload,
          otp_hash: otpHash,
          otp_expires_at: otpExpiresAt,
          status: "OTP_PENDING",
        }).eq("id", session.id);

        await sendOtpEmail(session.email, otp, {
          title: "Verify your Gradus admin email",
          action: "your Gradus admin portal registration",
        });
      } catch (error) {
        await supabase.from("verification_sessions").update({
          status: "APPROVAL_PENDING",
          otp_hash: null,
          otp_expires_at: null,
        }).eq("id", session.id);
        return htmlResponse("<h2>Delivery issue</h2><p>We could not deliver the verification code to the requester. Please try again later.</p>", 500, cors);
      }

      return htmlResponse("<h2>Approved</h2><p>The requester has been emailed a one-time code to continue registration.</p>", 200, cors);
    }

    // GET /signup/session/:sessionId
    if (apiPath.startsWith("/signup/session/") && req.method === "GET") {
      const sessionId = apiPath.split("/").pop();

      if (!sessionId) {
        return jsonResponse({ error: "Invalid session identifier." }, 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_SIGNUP") {
        return jsonResponse({ error: "Signup session not found." }, 404, cors);
      }

      return jsonResponse({
        sessionId: session.id,
        email: session.email,
        status: session.status,
        createdAt: session.createdAt,
      }, 200, cors);
    }

    // POST /signup/verify-otp
    if (apiPath === "/signup/verify-otp" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { sessionId, otp } = body;

      if (!sessionId) {
        return jsonResponse({ error: "Invalid session identifier." }, 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_SIGNUP") {
        return jsonResponse({ error: "Session could not be found. Please restart the sign-up." }, 400, cors);
      }

      if (session.status === "REJECTED") {
        return jsonResponse({ error: "Your signup request was not approved." }, 403, cors);
      }

      if (session.status === "APPROVAL_PENDING") {
        return jsonResponse({ error: "Your signup request is still awaiting approval." }, 403, cors);
      }

      if (!session.otpHash || !session.otpExpiresAt) {
        return jsonResponse({ error: "No verification code is available for this session." }, 400, cors);
      }

      if (new Date(session.otpExpiresAt).getTime() < Date.now()) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "The verification code has expired. Please restart the sign-up." }, 410, cors);
      }

      const isMatch = await bcrypt.compare(otp, session.otpHash);
      if (!isMatch) {
        return jsonResponse({ error: "Invalid verification code." }, 401, cors);
      }

      const verificationToken = generateToken(24);
      await supabase.from("verification_sessions").update({
        verification_token: verificationToken,
        status: "OTP_VERIFIED",
      }).eq("id", session.id);

      return jsonResponse({ sessionId: session.id, verificationToken }, 200, cors);
    }

    // POST /signup/complete
    if (apiPath === "/signup/complete" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { sessionId, verificationToken, password } = body;

      if (!sessionId) {
        return jsonResponse({ error: "Invalid session identifier." }, 400, cors);
      }

      if (!password || password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters long." }, 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_SIGNUP") {
        return jsonResponse({ error: "Session could not be found. Please restart the sign-up." }, 400, cors);
      }

      if (session.status === "REJECTED") {
        return jsonResponse({ error: "Your signup request was not approved." }, 403, cors);
      }

      if (session.status !== "OTP_VERIFIED") {
        return jsonResponse({ error: "Email verification is still pending." }, 400, cors);
      }

      if (!verificationToken || session.verificationToken !== verificationToken) {
        return jsonResponse({ error: "Verification token mismatch. Please restart the sign-up." }, 400, cors);
      }

      // Check if admin already exists
      const { data: existingAdmin } = await supabase
        .from("admin_users")
        .select("id")
        .eq("email", session.email)
        .single();

      if (existingAdmin) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "An account with this email already exists." }, 409, cors);
      }

      const hashedPassword = await bcrypt.hash(password);
      const sessionPayload = session.payload || {};
      const assignedRole = sessionPayload.role && ADMIN_ROLE_OPTIONS[sessionPayload.role] ? sessionPayload.role : "admin";

      const { data: newAdmin, error: createError } = await supabase
        .from("admin_users")
        .insert([{
          full_name: sessionPayload.fullName,
          email: session.email,
          phone_number: sessionPayload.phoneNumber,
          department: sessionPayload.department,
          designation: sessionPayload.designation,
          languages: sessionPayload.languages || [],
          bio: sessionPayload.bio,
          role: assignedRole,
          password_hash: hashedPassword,
          email_verified: true,
          status: "active",
        }])
        .select()
        .single();

      if (createError || !newAdmin) {
        return jsonResponse({ error: "Failed to create admin account." }, 500, cors);
      }

      await supabase.from("verification_sessions").delete().eq("id", session.id);

      const admin = toCamelCaseAdmin(newAdmin);
      const token = await generateJwt(admin!.id);
      delete admin!.password;

      return jsonResponse({ token, admin }, 201, cors);
    }

    // ========================================================================
    // PASSWORD RESET FLOW
    // ========================================================================

    // POST /password/reset/start
    if (apiPath === "/password/reset/start" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { email } = body;

      if (!email) {
        return jsonResponse({ error: "An email address is required." }, 400, cors);
      }

      const normalizedEmail = email.toLowerCase().trim();
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("id, email")
        .eq("email", normalizedEmail)
        .single();

      // Always return success to prevent email enumeration
      if (!adminData) {
        return jsonResponse({
          sessionId: null,
          email: normalizedEmail,
          message: "If an account with this email exists, we have sent a verification code.",
        }, 200, cors);
      }

      // Delete existing sessions
      await supabase
        .from("verification_sessions")
        .delete()
        .eq("type", "ADMIN_PASSWORD_RESET")
        .eq("admin_id", adminData.id);

      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { data: session, error: sessionError } = await supabase
        .from("verification_sessions")
        .insert([{
          type: "ADMIN_PASSWORD_RESET",
          email: normalizedEmail,
          admin_id: adminData.id,
          otp_hash: otpHash,
          otp_expires_at: otpExpiresAt,
          status: "OTP_PENDING",
        }])
        .select()
        .single();

      if (sessionError || !session) {
        return jsonResponse({ error: "Failed to create session" }, 500, cors);
      }

      try {
        await sendOtpEmail(normalizedEmail, otp, {
          title: "Reset your Gradus admin password",
          action: "resetting your Gradus admin account password",
        });
      } catch (error) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "We could not send a verification code. Please try again later." }, 500, cors);
      }

      return jsonResponse({
        sessionId: session.id,
        email: normalizedEmail,
      }, 200, cors);
    }

    // POST /password/reset/verify-otp
    if (apiPath === "/password/reset/verify-otp" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { sessionId, otp } = body;

      if (!sessionId) {
        return jsonResponse({ error: "Invalid session identifier." }, 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_PASSWORD_RESET") {
        return jsonResponse({ error: "Password reset session could not be found." }, 400, cors);
      }

      if (session.status !== "OTP_PENDING") {
        return jsonResponse({ error: "Password reset verification has already been completed." }, 400, cors);
      }

      if (!session.otpHash || !session.otpExpiresAt || session.otpExpiresAt.getTime() < Date.now()) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "The verification code has expired. Please restart the password reset." }, 410, cors);
      }

      const isMatch = await bcrypt.compare(otp, session.otpHash);
      if (!isMatch) {
        return jsonResponse({ error: "Invalid verification code." }, 401, cors);
      }

      const verificationToken = generateToken(24);
      await supabase.from("verification_sessions").update({
        verification_token: verificationToken,
        status: "OTP_VERIFIED",
      }).eq("id", session.id);

      return jsonResponse({ sessionId: session.id, verificationToken }, 200, cors);
    }

    // POST /password/reset/complete
    if (apiPath === "/password/reset/complete" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { sessionId, verificationToken, password } = body;

      if (!sessionId) {
        return jsonResponse({ error: "Invalid session identifier." }, 400, cors);
      }

      if (!password || password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters long." }, 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_PASSWORD_RESET") {
        return jsonResponse({ error: "Password reset session could not be found." }, 400, cors);
      }

      if (session.status !== "OTP_VERIFIED") {
        return jsonResponse({ error: "Email verification is still pending." }, 400, cors);
      }

      if (!verificationToken || session.verificationToken !== verificationToken) {
        return jsonResponse({ error: "Verification token mismatch. Please restart the password reset." }, 400, cors);
      }

      const { data: adminData } = await supabase
        .from("admin_users")
        .select("id")
        .eq("id", session.adminId)
        .single();

      if (!adminData) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "Admin account not found." }, 404, cors);
      }

      const hashedPassword = await bcrypt.hash(password);
      await supabase.from("admin_users").update({ password_hash: hashedPassword }).eq("id", adminData.id);
      await supabase.from("verification_sessions").delete().eq("id", session.id);

      return jsonResponse({ message: "Password reset successfully." }, 200, cors);
    }

    // ========================================================================
    // PROTECTED ENDPOINTS (Require auth)
    // ========================================================================

    // Extract and verify token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "No authorization header" }, 401, cors);
    }

    const token = authHeader.split(" ")[1];
    
    // Try to detect token type (Supabase vs Legacy JWT)
    let admin: any = null;
    
    // First try Supabase token verification
    const { data: supabaseUser, error: supabaseError } = await supabase.auth.getUser(token);
    
    if (supabaseUser?.user) {
      // Supabase token - find admin by supabase_id
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("*")
        .eq("supabase_id", supabaseUser.user.id)
        .single();
      
      if (adminData) {
        admin = toCamelCaseAdmin(adminData);
      }
    }
    
    // If Supabase auth failed, try legacy JWT
    if (!admin) {
      const payload = await verifyJwt(token);
      if (payload?.sub) {
        const { data: adminData } = await supabase
          .from("admin_users")
          .select("*")
          .eq("id", payload.sub)
          .single();
        
        if (adminData) {
          admin = toCamelCaseAdmin(adminData);
        }
      }
    }

    if (!admin) {
      return jsonResponse({ error: "Invalid token or admin not found" }, 401, cors);
    }

    if (admin.status && admin.status !== "active") {
      return jsonResponse({ error: "Your admin account is inactive. Please contact a Programmer(Admin)." }, 403, cors);
    }

    // Remove password from admin object
    delete admin.password;

    // GET /me - Get admin profile
    if (apiPath === "/me" && req.method === "GET") {
      return jsonResponse(admin, 200, cors);
    }

    // PUT /me - Update admin profile
    if (apiPath === "/me" && req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const { fullName, phoneNumber, department, designation, languages, bio } = body;

      const updates: any = {};
      if (typeof fullName === "string") updates.full_name = fullName.trim();
      if (typeof phoneNumber === "string") updates.phone_number = phoneNumber.trim();
      if (typeof department === "string") updates.department = department.trim();
      if (typeof designation === "string") updates.designation = designation.trim();
      if (typeof bio === "string") updates.bio = bio.trim();
      if (languages !== undefined) updates.languages = normaliseLanguages(languages);

      if (Object.keys(updates).length === 0) {
        return jsonResponse(admin, 200, cors);
      }

      const { data: updatedData, error } = await supabase
        .from("admin_users")
        .update(updates)
        .eq("id", admin.id)
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: "Failed to update profile" }, 500, cors);
      }

      const updatedAdmin = toCamelCaseAdmin(updatedData);
      delete updatedAdmin!.password;

      return jsonResponse(updatedAdmin, 200, cors);
    }

    // PUT /me/password - Update admin password
    if (apiPath === "/me/password" && req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const { currentPassword, newPassword } = body;

      if (!currentPassword || !newPassword) {
        return jsonResponse({ error: "Current password and new password are required" }, 400, cors);
      }

      if (newPassword.length < 8) {
        return jsonResponse({ error: "New password must be at least 8 characters long." }, 400, cors);
      }

      // Get admin with password
      const { data: adminWithPwd } = await supabase
        .from("admin_users")
        .select("*")
        .eq("id", admin.id)
        .single();

      if (!adminWithPwd?.password_hash) {
        return jsonResponse({ error: "Admin account not found." }, 404, cors);
      }

      const isMatch = await bcrypt.compare(currentPassword, adminWithPwd.password_hash);
      if (!isMatch) {
        return jsonResponse({ error: "Your current password is incorrect." }, 401, cors);
      }

      const hashedPassword = await bcrypt.hash(newPassword);
      await supabase.from("admin_users").update({ password_hash: hashedPassword }).eq("id", admin.id);

      return jsonResponse({ message: "Password updated successfully." }, 200, cors);
    }

    // ========================================================================
    // EMAIL CHANGE FLOW (Protected)
    // ========================================================================

    // POST /email/change/start
    if (apiPath === "/email/change/start" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { newEmail } = body;

      if (!newEmail) {
        return jsonResponse({ error: "A new email address is required." }, 400, cors);
      }

      const normalizedNewEmail = newEmail.toLowerCase().trim();

      if (normalizedNewEmail === admin.email) {
        return jsonResponse({ error: "You are already using this email address." }, 400, cors);
      }

      // Check if email is already used
      const { data: existingAdmin } = await supabase
        .from("admin_users")
        .select("id")
        .eq("email", normalizedNewEmail)
        .single();

      if (existingAdmin) {
        return jsonResponse({ error: "Another admin already uses this email address." }, 409, cors);
      }

      // Delete existing sessions
      await supabase
        .from("verification_sessions")
        .delete()
        .eq("type", "ADMIN_EMAIL_CHANGE")
        .eq("admin_id", admin.id);

      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { data: session, error: sessionError } = await supabase
        .from("verification_sessions")
        .insert([{
          type: "ADMIN_EMAIL_CHANGE",
          email: admin.email,
          admin_id: admin.id,
          otp_hash: otpHash,
          otp_expires_at: otpExpiresAt,
          status: "CURRENT_OTP_PENDING",
          payload: { newEmail: normalizedNewEmail },
        }])
        .select()
        .single();

      if (sessionError || !session) {
        return jsonResponse({ error: "Failed to create session" }, 500, cors);
      }

      try {
        await sendOtpEmail(admin.email, otp, {
          title: "Confirm your current email",
          action: "changing your Gradus admin email address",
        });
      } catch (error) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "We could not send a verification code to your current email. Please try again later." }, 500, cors);
      }

      return jsonResponse({
        sessionId: session.id,
        currentEmail: admin.email,
      }, 200, cors);
    }

    // POST /email/change/verify-current
    if (apiPath === "/email/change/verify-current" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { sessionId, otp } = body;

      if (!sessionId) {
        return jsonResponse({ error: "Invalid session identifier." }, 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_EMAIL_CHANGE") {
        return jsonResponse({ error: "Email change session could not be found." }, 400, cors);
      }

      if (session.adminId !== admin.id) {
        return jsonResponse({ error: "You are not allowed to access this session." }, 403, cors);
      }

      if (session.status !== "CURRENT_OTP_PENDING") {
        return jsonResponse({ error: "Current email verification has already been completed." }, 400, cors);
      }

      if (!session.otpHash || !session.otpExpiresAt || session.otpExpiresAt.getTime() < Date.now()) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "The verification code has expired. Please restart the email change process." }, 410, cors);
      }

      const isMatch = await bcrypt.compare(otp, session.otpHash);
      if (!isMatch) {
        return jsonResponse({ error: "Invalid verification code." }, 401, cors);
      }

      const newEmail = session.payload?.newEmail;
      if (!newEmail) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "New email information is missing. Please restart the process." }, 400, cors);
      }

      const newOtp = generateOtp();
      const newOtpHash = await bcrypt.hash(newOtp);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      try {
        await sendOtpEmail(newEmail, newOtp, {
          title: "Verify your new email address",
          action: "changing your Gradus admin email address",
        });
      } catch (error) {
        return jsonResponse({ error: "We could not send a verification code to the new email. Please try again later." }, 500, cors);
      }

      await supabase.from("verification_sessions").update({
        otp_hash: newOtpHash,
        otp_expires_at: otpExpiresAt,
        status: "NEW_OTP_PENDING",
        payload: { ...session.payload, currentVerifiedAt: new Date().toISOString() },
      }).eq("id", session.id);

      return jsonResponse({ sessionId: session.id, newEmail }, 200, cors);
    }

    // POST /email/change/verify-new
    if (apiPath === "/email/change/verify-new" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { sessionId, otp } = body;

      if (!sessionId) {
        return jsonResponse({ error: "Invalid session identifier." }, 400, cors);
      }

      const { data: sessionData } = await supabase
        .from("verification_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      const session = toCamelCaseSession(sessionData);

      if (!session || session.type !== "ADMIN_EMAIL_CHANGE") {
        return jsonResponse({ error: "Email change session could not be found." }, 400, cors);
      }

      if (session.adminId !== admin.id) {
        return jsonResponse({ error: "You are not allowed to access this session." }, 403, cors);
      }

      if (session.status !== "NEW_OTP_PENDING") {
        return jsonResponse({ error: "New email verification is not ready yet." }, 400, cors);
      }

      if (!session.otpHash || !session.otpExpiresAt || session.otpExpiresAt.getTime() < Date.now()) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "The verification code has expired. Please restart the email change process." }, 410, cors);
      }

      const isMatch = await bcrypt.compare(otp, session.otpHash);
      if (!isMatch) {
        return jsonResponse({ error: "Invalid verification code." }, 401, cors);
      }

      const newEmail = session.payload?.newEmail;
      if (!newEmail) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "New email information is missing. Please restart the process." }, 400, cors);
      }

      // Check for conflicting email again
      const { data: conflictingAdmin } = await supabase
        .from("admin_users")
        .select("id")
        .eq("email", newEmail)
        .neq("id", admin.id)
        .single();

      if (conflictingAdmin) {
        await supabase.from("verification_sessions").delete().eq("id", session.id);
        return jsonResponse({ error: "Another admin already uses this email address." }, 409, cors);
      }

      await supabase.from("admin_users").update({
        email: newEmail,
        email_verified: true,
      }).eq("id", admin.id);

      await supabase.from("verification_sessions").delete().eq("id", session.id);

      return jsonResponse({ message: "Admin email updated successfully", email: newEmail }, 200, cors);
    }

    // ========================================================================
    // No route matched
    // ========================================================================

    return jsonResponse({ error: "Not found", path: apiPath }, 404, cors);

  } catch (error) {
    console.error("Admin Auth API Error:", error);
    return jsonResponse({ error: String(error) }, 500, getCorsHeaders(req));
  }
});
