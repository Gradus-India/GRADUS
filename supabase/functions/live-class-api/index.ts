/// <reference lib="deno.ns" />
/**
 * Live Class API Edge Function
 * Handles 100ms room creation, token generation, and room codes
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { create, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

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

// ============================================================================
// 100ms Helper Functions
// ============================================================================

const HMS_ACCESS_KEY = Deno.env.get("HMS_ACCESS_KEY") || "";
const HMS_SECRET = Deno.env.get("HMS_SECRET") || "";
const HMS_TEMPLATE_ID = Deno.env.get("HMS_TEMPLATE_ID") || "";

async function generateManagementToken(): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(HMS_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        access_key: HMS_ACCESS_KEY,
        type: "management",
        version: 2,
        iat: now,
        nbf: now,
        exp: now + 86400, // 24 hours
        jti: crypto.randomUUID(),
    };

    return await create({ alg: "HS256", typ: "JWT" }, payload, key);
}

async function generateAuthToken(roomId: string, userId: string, role: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(HMS_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        access_key: HMS_ACCESS_KEY,
        type: "app",
        version: 2,
        room_id: roomId,
        user_id: userId,
        role: role,
        iat: now,
        nbf: now,
        exp: now + 86400, // 24 hours
        jti: crypto.randomUUID(),
    };

    return await create({ alg: "HS256", typ: "JWT" }, payload, key);
}

async function createRoom(name: string, description?: string): Promise<any> {
    const managementToken = await generateManagementToken();
    const safeName = name.replace(/[^a-zA-Z0-9.\-_:]/g, '_').substring(0, 60);

    const response = await fetch("https://api.100ms.live/v2/rooms", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${managementToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: safeName,
            description: description || "Live Class Session",
            template_id: HMS_TEMPLATE_ID,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create room: ${error}`);
    }

    return await response.json();
}

async function createRoomCodes(roomId: string): Promise<any> {
    const managementToken = await generateManagementToken();
    const response = await fetch(`https://api.100ms.live/v2/room-codes/room/${roomId}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${managementToken}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create room codes: ${error}`);
    }

    return await response.json();
}

async function listRooms(): Promise<any> {
    const managementToken = await generateManagementToken();
    const response = await fetch("https://api.100ms.live/v2/rooms?enabled=true", {
        method: "GET",
        headers: { "Authorization": `Bearer ${managementToken}` },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to list rooms: ${error}`);
    }

    return await response.json();
}

async function disableRoom(roomId: string): Promise<any> {
    const managementToken = await generateManagementToken();
    const response = await fetch(`https://api.100ms.live/v2/rooms/${roomId}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${managementToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to disable room: ${error}`);
    }

    return await response.json();
}

async function getRoomCodes(roomId: string): Promise<any> {
    const managementToken = await generateManagementToken();
    const response = await fetch(`https://api.100ms.live/v2/room-codes/room/${roomId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${managementToken}` },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get room codes: ${error}`);
    }

    return await response.json();
}

// ============================================================================
// Recording Functions
// ============================================================================

async function startRecording(roomId: string, resolution?: { width: number; height: number }): Promise<any> {
    const managementToken = await generateManagementToken();
    const response = await fetch(`https://api.100ms.live/v2/recordings/room/${roomId}/start`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${managementToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            resolution: resolution || { width: 1280, height: 720 },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to start recording: ${error}`);
    }

    return await response.json();
}

async function stopRecording(roomId: string, recordingId?: string): Promise<any> {
    const managementToken = await generateManagementToken();
    const url = recordingId 
        ? `https://api.100ms.live/v2/recordings/${recordingId}/stop`
        : `https://api.100ms.live/v2/recordings/room/${roomId}/stop`;
    
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${managementToken}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to stop recording: ${error}`);
    }

    return await response.json();
}

async function getRecordingStatus(roomId: string): Promise<any> {
    const managementToken = await generateManagementToken();
    const response = await fetch(`https://api.100ms.live/v2/recordings/room/${roomId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${managementToken}` },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get recording status: ${error}`);
    }

    return await response.json();
}

async function getRecording(recordingId: string): Promise<any> {
    const managementToken = await generateManagementToken();
    const response = await fetch(`https://api.100ms.live/v2/recordings/${recordingId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${managementToken}` },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get recording: ${error}`);
    }

    return await response.json();
}

// ============================================================================
// Notification Helper
// ============================================================================

async function sendLiveClassNotifications(
    courseSlug: string,
    roomId: string,
    courseName: string,
    codes: Record<string, string>
): Promise<void> {
    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        
        if (!supabaseUrl || !supabaseServiceKey) {
            console.warn("[Notifications] Supabase credentials not configured");
            return;
        }

        // Create Supabase client
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Find course by slug
        const { data: course, error: courseError } = await supabase
            .from("course")
            .select("id, name")
            .eq("slug", courseSlug)
            .single();

        if (courseError || !course) {
            console.error(`[Notifications] Course not found: ${courseSlug}`, courseError);
            return;
        }

        // 2. Find all active enrollments for this course
        const { data: enrollments, error: enrollError } = await supabase
            .from("enrollments")
            .select(`
                user_id,
                users!inner(
                    id,
                    email,
                    push_token
                )
            `)
            .eq("course_id", course.id)
            .eq("status", "ACTIVE")
            .eq("payment_status", "PAID");

        if (enrollError) {
            console.error(`[Notifications] Failed to fetch enrollments:`, enrollError);
            return;
        }

        if (!enrollments || enrollments.length === 0) {
            console.log(`[Notifications] No enrolled students found for course: ${courseSlug}`);
            return;
        }

        // 3. Get student code for join link
        const studentCode = codes.student || codes.guest || codes.viewer || null;
        const domainConfig = Deno.env.get("HMS_SYSTEM_SUBDOMAIN") || "gradus.app.100ms.live";
        const fullDomain = domainConfig.includes(".") ? domainConfig : `${domainConfig}.app.100ms.live`;
        const joinUrl = studentCode ? `https://${fullDomain}/meeting/${studentCode}` : null;

        // 4. Create notifications for each enrolled student
        const notifications = enrollments.map((enrollment: any) => ({
            user_id: enrollment.user_id || enrollment.users?.id,
            title: "🎥 Live Class Started!",
            body: `${courseName} - Join now!`,
            data: {
                type: "live_class",
                roomId: roomId,
                courseSlug: courseSlug,
                courseName: courseName,
                joinUrl: joinUrl,
            },
            read: false,
        })).filter((n: any) => n.user_id);

        if (notifications.length > 0) {
            const { error: notifError } = await supabase
                .from("notifications")
                .insert(notifications);

            if (notifError) {
                console.error(`[Notifications] Failed to create notifications:`, notifError);
            } else {
                console.log(`[Notifications] Created ${notifications.length} notifications for course: ${courseSlug}`);
            }
        }

        // 5. Send push notifications via Expo (if configured)
        const expoPushTokens = enrollments
            .map((e: any) => e.users?.push_token)
            .filter((token: string) => token && token.startsWith("ExponentPushToken"));

        if (expoPushTokens.length > 0) {
            try {
                const expoUrl = "https://exp.host/--/api/v2/push/send";
                const messages = expoPushTokens.map((token: string) => ({
                    to: token,
                    sound: "default",
                    title: "🎥 Live Class Started!",
                    body: `${courseName} - Join now!`,
                    data: {
                        type: "live_class",
                        roomId: roomId,
                        courseSlug: courseSlug,
                        courseName: courseName,
                        joinUrl: joinUrl,
                    },
                }));

                // Send in chunks of 100
                for (let i = 0; i < messages.length; i += 100) {
                    const chunk = messages.slice(i, i + 100);
                    await fetch(expoUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                        },
                        body: JSON.stringify(chunk),
                    });
                }

                console.log(`[Notifications] Sent ${expoPushTokens.length} push notifications`);
            } catch (pushError) {
                console.error(`[Notifications] Push notification error:`, pushError);
            }
        }

    } catch (error) {
        console.error("[Notifications] Error sending live class notifications:", error);
    }
}

// ============================================================================
// Admin Auth Helper
// ============================================================================

const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function verifyJwt(token: string): Promise<{ sub: string } | null> {
    if (!JWT_SECRET) return null;
    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(JWT_SECRET),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );
        const { verify } = await import("https://deno.land/x/djwt@v2.8/mod.ts");
        const payload = await verify(token, key);
        return payload as { sub: string };
    } catch {
        return null;
    }
}

async function verifyAdminToken(req: Request): Promise<{ admin: any; error?: string }> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { admin: null, error: "No authorization header" };
    }

    const token = authHeader.split(" ")[1];
    
    if (!supabaseUrl || !supabaseServiceKey) {
        return { admin: null, error: "Supabase not configured" };
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
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

function normalizeRole(role: string): string {
    return role ? String(role).toLowerCase() : "";
}

function isTeacherRole(role: string): boolean {
    const normalized = normalizeRole(role);
    // Allow teacher role and programmer_admin (full access)
    return normalized === "teacher" || normalized === "programmer_admin";
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req: Request) => {
    const cors = getCorsHeaders(req) as any;

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    // Check if 100ms is configured
    if (!HMS_ACCESS_KEY || !HMS_SECRET) {
        return jsonResponse({ error: "100ms not configured", success: false }, 503, cors);
    }

    try {
        const url = new URL(req.url);
        const path = url.pathname.replace(/\/$/, "");
        const pathParts = path.split("/").filter(Boolean);

        // Remove "live-class-api" prefix from path
        const apiPath = "/" + pathParts.slice(pathParts.indexOf("live-class-api") + 1).join("/");

        // 1. POST /create-room - Requires teacher role
        if (apiPath === "/create-room" && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            // Verify admin authentication and teacher role
            const { admin, error: authError } = await verifyAdminToken(req);
            if (!admin) {
                return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
            }
            
            // Check if user has teacher role
            if (!isTeacherRole(admin.role)) {
                return jsonResponse({ 
                    error: "Access denied. Only teachers can create live classes.", 
                    success: false 
                }, 403, cors);
            }
            
            const body = await req.json().catch(() => ({}));
            const { name, description, courseSlug, courseName } = body;
            const roomName = name || `live-class-${Date.now()}`;

            const room = await createRoom(roomName, description);
            let codesData = [];
            try {
                const codesRes = await createRoomCodes(room.id);
                codesData = codesRes.data || [];
            } catch (err) {
                console.error("Failed to create room codes (ignoring):", err);
            }

            const codesMap: Record<string, string> = {};
            codesData.forEach((c: any) => { codesMap[c.role] = c.code; });

            // Force teacher role - find teacher role code or fallback to host/broadcaster
            const teacherRole = Object.keys(codesMap).find(r => 
                ['teacher', 'instructor', 'host', 'broadcaster', 'presenter', 'moderator'].includes(r.toLowerCase())
            ) || Object.keys(codesMap)[0];
            
            // Ensure we use teacher role code for host
            const hostCode = codesMap[teacherRole] || codesMap.host || codesMap.broadcaster || Object.values(codesMap)[0];
            const guestCode = codesMap.student || codesMap.guest || codesMap.viewer;

            // Store room-to-course mapping in database for reliable matching
            if (courseSlug) {
                try {
                    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                    
                    if (supabaseUrl && supabaseServiceKey) {
                        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                        const supabase = createClient(supabaseUrl, supabaseServiceKey);
                        
                        // Find course by slug
                        const { data: course, error: courseErr } = await supabase
                            .from("course")
                            .select("id, slug, name")
                            .eq("slug", courseSlug)
                            .single();
                        
                        if (course && !courseErr) {
                            // Store in live_sessions table
                            const { error: sessionErr } = await supabase
                                .from("live_sessions")
                                .upsert({
                                    title: courseName || "Live Class",
                                    status: "live",
                                    started_at: new Date().toISOString(),
                                    course_id: course.id,
                                    course_slug: courseSlug,
                                    course_name: course.name,
                                    meeting_token: room.id, // Store room ID in meeting_token field
                                    host_display_name: "Instructor",
                                    host_secret: room.id, // Use room ID as secret for uniqueness
                                }, {
                                    onConflict: "meeting_token", // Update if room already exists
                                });
                            
                            if (sessionErr) {
                                console.error(`[live-class-api] Failed to store live session:`, sessionErr);
                            } else {
                                console.log(`[live-class-api] Stored live session for room ${room.id}, course ${courseSlug}`);
                            }
                        } else {
                            console.error(`[live-class-api] Course not found for slug: ${courseSlug}`, courseErr);
                        }
                    }
                } catch (mapErr) {
                    console.error("[live-class-api] Failed to store room mapping:", mapErr);
                }
                
                // Send notifications to enrolled students
                try {
                    await sendLiveClassNotifications(courseSlug, room.id, courseName || roomName, codesMap);
                } catch (notifErr) {
                    console.error("[live-class-api] Notification error (non-blocking):", notifErr);
                }
            }

            return jsonResponse({
                success: true,
                room: {
                    id: room.id,
                    name: room.name,
                    enabled: room.enabled,
                    createdAt: room.created_at,
                    codes: codesMap,
                    courseSlug: courseSlug || null, // Include in response for reference
                    teacherRole: teacherRole, // Include teacher role for reference
                },
            }, 200, cors);
        }

        // 2. POST /get-token - Requires teacher role for teacher tokens, verifies enrollment for students
        if (apiPath === "/get-token" && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const body = await req.json().catch(() => ({}));
            const { roomId, userId, role } = body;

            if (!roomId || !userId || !role) {
                return jsonResponse({ error: "roomId, userId, and role are required", success: false }, 400, cors);
            }

            // Check if requesting teacher role - requires admin authentication
            const teacherRoles = ['teacher', 'instructor', 'host', 'broadcaster', 'presenter', 'moderator'];
            if (teacherRoles.includes(role.toLowerCase())) {
                const { admin, error: authError } = await verifyAdminToken(req);
                if (!admin) {
                    return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
                }
                
                if (!isTeacherRole(admin.role)) {
                    return jsonResponse({ 
                        error: "Access denied. Only teachers can generate teacher tokens.", 
                        success: false 
                    }, 403, cors);
                }
            } else {
                // For student roles, verify enrollment
                const token = authHeader.replace("Bearer ", "");
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
                const JWT_SECRET = Deno.env.get("JWT_SECRET");
                
                if (!supabaseUrl || !supabaseAnonKey || !JWT_SECRET) {
                    return jsonResponse({ error: "Server configuration error", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseAnonKey);
                const supabaseService = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey);

                // Get user ID
                let studentUserId: string | null = null;
                const { data: { user: sbUser } } = await supabase.auth.getUser(token);
                if (sbUser) {
                    const { data: userData } = await supabaseService
                        .from("users")
                        .select("id")
                        .eq("supabase_id", sbUser.id)
                        .single();
                    if (userData) studentUserId = userData.id;
                } else {
                    try {
                        const encoder = new TextEncoder();
                        const key = await crypto.subtle.importKey(
                            "raw",
                            encoder.encode(JWT_SECRET),
                            { name: "HMAC", hash: "SHA-256" },
                            false,
                            ["verify"]
                        );
                        const payload = await verify(token, key);
                        const userIdFromToken = (payload as any).id || (payload as any).sub;
                        if (userIdFromToken) {
                            const { data: userData } = await supabaseService
                                .from("users")
                                .select("id")
                                .eq("id", userIdFromToken)
                                .single();
                            if (userData) studentUserId = userData.id;
                        }
                    } catch (jwtErr) {
                        console.error("[live-class-api] JWT verification failed:", jwtErr);
                    }
                }

                if (!studentUserId) {
                    return jsonResponse({ error: "User not found", success: false }, 401, cors);
                }

                // Find live session by room ID
                const { data: session } = await supabaseService
                    .from("live_sessions")
                    .select("course_id, course_slug")
                    .eq("meeting_token", roomId)
                    .eq("status", "live")
                    .single();

                if (!session || !session.course_id) {
                    return jsonResponse({ 
                        error: "Live class session not found or has ended", 
                        success: false 
                    }, 404, cors);
                }

                // Verify enrollment - must be ACTIVE and PAID
                const { data: enrollment, error: enrollCheckError } = await supabaseService
                    .from("enrollments")
                    .select("id")
                    .eq("user_id", studentUserId)
                    .eq("course_id", session.course_id)
                    .eq("payment_status", "PAID")
                    .eq("status", "ACTIVE")
                    .maybeSingle();

                if (enrollCheckError || !enrollment) {
                    return jsonResponse({ 
                        error: "Access denied. You are not enrolled in this course or your enrollment is not active.", 
                        success: false 
                    }, 403, cors);
                }
            }

            const token = await generateAuthToken(roomId, userId, role);
            return jsonResponse({ success: true, token: token, roomId: roomId }, 200, cors);
        }

        // 3. GET /rooms - Requires teacher role
        if (apiPath === "/rooms" && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            // Verify admin authentication and teacher role
            const { admin, error: authError } = await verifyAdminToken(req);
            if (!admin) {
                return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
            }
            
            // Check if user has teacher role
            if (!isTeacherRole(admin.role)) {
                return jsonResponse({ 
                    error: "Access denied. Only teachers can view rooms.", 
                    success: false 
                }, 403, cors);
            }
            
            const result = await listRooms();
            return jsonResponse({ success: true, rooms: result.data || [] }, 200, cors);
        }

        // 4. GET /get-room-codes/:roomId - Requires teacher role OR verified enrollment
        if (apiPath.startsWith("/get-room-codes/") && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const roomId = apiPath.split("/").pop();
            if (!roomId) return jsonResponse({ error: "roomId is required", success: false }, 400, cors);

            // Try teacher authentication first
            const { admin } = await verifyAdminToken(req);
            let isAuthorized = false;

            if (admin && isTeacherRole(admin.role)) {
                // Teacher access - allowed
                isAuthorized = true;
            } else {
                // Student access - verify enrollment
                const token = authHeader.replace("Bearer ", "");
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
                const JWT_SECRET = Deno.env.get("JWT_SECRET");
                
                if (supabaseUrl && supabaseAnonKey && JWT_SECRET) {
                    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                    const supabase = createClient(supabaseUrl, supabaseAnonKey);
                    const supabaseService = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey);

                    // Get user ID
                    let studentUserId: string | null = null;
                    const { data: { user: sbUser } } = await supabase.auth.getUser(token);
                    if (sbUser) {
                        const { data: userData } = await supabaseService
                            .from("users")
                            .select("id")
                            .eq("supabase_id", sbUser.id)
                            .single();
                        if (userData) studentUserId = userData.id;
                    } else {
                        try {
                            const encoder = new TextEncoder();
                            const key = await crypto.subtle.importKey(
                                "raw",
                                encoder.encode(JWT_SECRET),
                                { name: "HMAC", hash: "SHA-256" },
                                false,
                                ["verify"]
                            );
                            const payload = await verify(token, key);
                            const userIdFromToken = (payload as any).id || (payload as any).sub;
                            if (userIdFromToken) {
                                const { data: userData } = await supabaseService
                                    .from("users")
                                    .select("id")
                                    .eq("id", userIdFromToken)
                                    .single();
                                if (userData) studentUserId = userData.id;
                            }
                        } catch (jwtErr) {
                            console.error("[live-class-api] JWT verification failed:", jwtErr);
                        }
                    }

                    if (studentUserId) {
                        // Find live session by room ID
                        const { data: session } = await supabaseService
                            .from("live_sessions")
                            .select("course_id")
                            .eq("meeting_token", roomId)
                            .eq("status", "live")
                            .maybeSingle();

                        if (session && session.course_id) {
                            // Verify enrollment
                            const { data: enrollment } = await supabaseService
                                .from("enrollments")
                                .select("id")
                                .eq("user_id", studentUserId)
                                .eq("course_id", session.course_id)
                                .eq("payment_status", "PAID")
                                .eq("status", "ACTIVE")
                                .maybeSingle();

                            if (enrollment) {
                                isAuthorized = true;
                            }
                        }
                    }
                }
            }

            if (!isAuthorized) {
                return jsonResponse({ 
                    error: "Access denied. Only enrolled students or teachers can access room codes.", 
                    success: false 
                }, 403, cors);
            }

            const codesRes = await getRoomCodes(roomId);
            const codesData = codesRes.data || [];
            const codesMap: Record<string, string> = {};
            codesData.forEach((c: any) => { codesMap[c.role] = c.code; });

            return jsonResponse({ success: true, codes: codesMap }, 200, cors);
        }

        // 5. POST /end-room/:roomId - Requires teacher role
        if (apiPath.startsWith("/end-room/") && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            // Verify admin authentication and teacher role
            const { admin, error: authError } = await verifyAdminToken(req);
            if (!admin) {
                return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
            }
            
            // Check if user has teacher role
            if (!isTeacherRole(admin.role)) {
                return jsonResponse({ 
                    error: "Access denied. Only teachers can end rooms.", 
                    success: false 
                }, 403, cors);
            }
            
            const roomId = apiPath.split("/").pop();
            if (!roomId) return jsonResponse({ error: "roomId is required", success: false }, 400, cors);

            await disableRoom(roomId);
            return jsonResponse({ success: true, message: "Room session ended" }, 200, cors);
        }

        // 6. GET /active-classes - Get active live classes for enrolled students
        if (apiPath === "/active-classes" && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return jsonResponse({ error: "Authorization required", success: false }, 401, cors);
            }

            try {
                const token = authHeader.replace("Bearer ", "");
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
                const JWT_SECRET = Deno.env.get("JWT_SECRET");
                if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");
                
                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseAnonKey);

                // Get user ID - try Supabase auth first, then JWT
                let userId: string | null = null;
                
                // Try Supabase Auth
                const { data: { user: sbUser }, error: authError } = await supabase.auth.getUser(token);
                if (sbUser) {
                    userId = sbUser.id;
                } else {
                    // Try Custom JWT Verification
                    try {
                        const encoder = new TextEncoder();
                        const key = await crypto.subtle.importKey(
                            "raw",
                            encoder.encode(JWT_SECRET),
                            { name: "HMAC", hash: "SHA-256" },
                            false,
                            ["verify"]
                        );
                        const payload = await verify(token, key);
                        userId = (payload as any).id || (payload as any).sub;
                    } catch (jwtErr) {
                        console.error("[live-class-api] Auth failed:", authError, jwtErr);
                        return jsonResponse({ error: "Unauthorized", success: false }, 401, cors);
                    }
                }

                if (!userId) {
                    return jsonResponse({ error: "Unauthorized", success: false }, 401, cors);
                }

                // Get user's enrollments - SIMPLIFIED: Direct query from public schema
                const supabaseService = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey);
                console.log(`[live-class-api] Fetching enrollments for user ${userId}`);
                
                // Simple query: enrollments -> course (public schema)
                // Only get ACTIVE enrollments with PAID status - students can only see classes for courses they're enrolled in
                const { data: enrollments, error: enrollError } = await supabaseService
                    .from("enrollments")
                    .select("course_id")
                    .eq("user_id", userId)
                    .eq("payment_status", "PAID")
                    .eq("status", "ACTIVE");

                if (enrollError) {
                    console.error(`[live-class-api] Enrollment query error:`, enrollError);
                    return jsonResponse({ success: true, classes: [] }, 200, cors);
                }

                if (!enrollments || enrollments.length === 0) {
                     console.log(`[live-class-api] No PAID enrollments found for user ${userId}`);
                     return jsonResponse({ success: true, classes: [] }, 200, cors);
                }

                const courseIds = enrollments.map((e: any) => e.course_id).filter(Boolean);
                
                // Fetch courses manually to avoid strict FK join issues
                const { data: courses, error: courseError } = await supabaseService
                    .from("course")
                    .select("id, slug, name, image")
                    .in("id", courseIds);
                
                if (courseError) {
                    console.error(`[live-class-api] Course fetch error:`, courseError);
                    return jsonResponse({ success: true, classes: [] }, 200, cors);
                }

                // Attach course objects to enrollment-like structure for downstream logic
                enrollments.forEach((e: any) => {
                    e.course = courses?.find((c: any) => c.id === e.course_id);
                });

                console.log(`[live-class-api] Found ${enrollments.length} enrollments, mapped to ${courses?.length} courses`);
                console.log(`[live-class-api] User enrolled in courses:`, courseIds);
                
                // Method 1: Query live_sessions table (most reliable)
                console.log(`[live-class-api] Querying live_sessions for courseIds:`, courseIds);
                const { data: liveSessions, error: sessionsError } = await supabaseService
                    .from("live_sessions")
                    .select(`
                        *,
                        course:course!inner(id, slug, name, image)
                    `)
                    .eq("status", "live")
                    .in("course_id", courseIds)
                    .is("ended_at", null);
                
                if (sessionsError) {
                    console.error(`[live-class-api] Error querying live_sessions:`, sessionsError);
                } else {
                    console.log(`[live-class-api] Found ${liveSessions?.length || 0} live sessions from database`);
                }

                const liveClasses: any[] = [];
                
                if (!sessionsError && liveSessions && liveSessions.length > 0) {
                    console.log(`[live-class-api] Processing ${liveSessions.length} live sessions from database`);
                    
                    // Get all active rooms to match with sessions
                    const roomsResult = await listRooms();
                    const activeRooms = (roomsResult.data || []).filter((r: any) => r.enabled === true);
                    console.log(`[live-class-api] Found ${activeRooms.length} active rooms from 100ms`);
                    const roomMap = new Map(activeRooms.map((r: any) => [r.id, r]));
                    
                    for (const session of liveSessions) {
                        const roomId = session.meeting_token; // room ID stored here
                        console.log(`[live-class-api] Checking session ${session.id}, roomId: ${roomId}`);
                        const room = roomMap.get(roomId);
                        
                        if (room) {
                            console.log(`[live-class-api] Room ${roomId} found and active`);
                            // Get room codes
                            let codes: Record<string, string> = {};
                            try {
                                const codesRes = await getRoomCodes(room.id);
                                const codesData = codesRes.data || [];
                                codesData.forEach((c: any) => { codes[c.role] = c.code; });
                            } catch (err) {
                                console.error(`Failed to get codes for room ${room.id}:`, err);
                            }

                            const studentCode = codes.student || codes.guest || codes.viewer;
                            const domainConfig = Deno.env.get("HMS_SYSTEM_SUBDOMAIN") || "gradus.app.100ms.live";
                            const fullDomain = domainConfig.includes(".") ? domainConfig : `${domainConfig}.app.100ms.live`;
                            const joinUrl = studentCode ? `https://${fullDomain}/meeting/${studentCode}` : null;

                            liveClasses.push({
                                roomId: room.id,
                                roomName: room.name,
                                courseId: session.course?.id || session.course_id,
                                courseSlug: session.course_slug || session.course?.slug,
                                courseName: session.course_name || session.course?.name,
                                courseImage: session.course?.image?.url || null,
                                joinUrl: joinUrl,
                                startedAt: session.started_at || room.created_at,
                            });
                            console.log(`[live-class-api] Added live class: ${session.course_name || session.course_slug}`);
                        } else {
                            console.log(`[live-class-api] Room ${roomId} not found in active rooms`);
                        }
                    }
                } else {
                    console.log(`[live-class-api] No live sessions found in database, trying fallback method`);
                }
                
                // Method 2: Fallback - match by room name/description if no database entries
                if (liveClasses.length === 0) {
                    console.log(`[live-class-api] No database sessions found, trying room matching fallback`);
                    const roomsResult = await listRooms();
                    const activeRooms = (roomsResult.data || []).filter((r: any) => r.enabled === true);
                    console.log(`[live-class-api] Checking ${activeRooms.length} active rooms against ${enrollments.length} enrollments`);
                    
                    for (const room of activeRooms) {
                        const roomName = (room.name || "").toLowerCase();
                        const roomDesc = (room.description || "").toLowerCase();
                        console.log(`[live-class-api] Checking room: ${room.name}, desc: ${room.description}`);
                        
                        for (const enrollment of enrollments) {
                            const course = enrollment.course;
                            if (!course) continue;
                            
                            const courseSlug = (course.slug || "").toLowerCase();
                            const courseName = (course.name || "").toLowerCase();
                            
                            console.log(`[live-class-api] Comparing with course: ${course.name} (${course.slug})`);
                            
                            const roomCreatedAt = new Date(room.created_at || 0);
                            const hoursSinceCreation = (Date.now() - roomCreatedAt.getTime()) / (1000 * 60 * 60);
                            const isRecent = hoursSinceCreation < 24;
                            
                            // More flexible matching - check if description contains course identifier
                            const descHasCourse = roomDesc.includes("course:") || roomDesc.includes("| course:");
                            const descMatchesSlug = courseSlug && roomDesc.includes(courseSlug);
                            const descMatchesName = courseName && roomDesc.includes(courseName);
                            const nameMatchesSlug = courseSlug && roomName.includes(courseSlug.replace(/[^a-z0-9]/g, ''));
                            const nameMatchesName = courseName && roomName.includes(courseName.toLowerCase().replace(/[^a-z0-9]/g, ''));
                            
                            const matchesDescription = roomDesc.includes("live class") && 
                                (descHasCourse || descMatchesSlug || descMatchesName);
                            const matchesName = nameMatchesSlug || nameMatchesName;
                            
                            console.log(`[live-class-api] Match check - isRecent: ${isRecent}, matchesDesc: ${matchesDescription}, matchesName: ${matchesName}`);
                            
                            if (isRecent && (matchesDescription || matchesName)) {
                                console.log(`[live-class-api] ✅ MATCH FOUND! Room ${room.id} matches course ${course.slug}`);
                                let codes: Record<string, string> = {};
                                try {
                                    const codesRes = await getRoomCodes(room.id);
                                    const codesData = codesRes.data || [];
                                    codesData.forEach((c: any) => { codes[c.role] = c.code; });
                                } catch (err) {
                                    console.error(`Failed to get codes for room ${room.id}:`, err);
                                }

                                const studentCode = codes.student || codes.guest || codes.viewer;
                                const domainConfig = Deno.env.get("HMS_SYSTEM_SUBDOMAIN") || "gradus.app.100ms.live";
                                const fullDomain = domainConfig.includes(".") ? domainConfig : `${domainConfig}.app.100ms.live`;
                                const joinUrl = studentCode ? `https://${fullDomain}/meeting/${studentCode}` : null;

                                liveClasses.push({
                                    roomId: room.id,
                                    roomName: room.name,
                                    courseId: course.id,
                                    courseSlug: course.slug,
                                    courseName: course.name,
                                    courseImage: course.image?.url || null,
                                    joinUrl: joinUrl,
                                    startedAt: room.created_at,
                                });
                                break;
                            }
                        }
                    }
                }
                
                console.log(`[live-class-api] Returning ${liveClasses.length} live classes for user ${userId}`);

                return jsonResponse({ success: true, classes: liveClasses }, 200, cors);
            } catch (error) {
                console.error("[live-class-api] Error fetching active classes:", error);
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Internal server error", 
                    success: false 
                }, 500, cors);
            }
        }

        // 7. POST /start-recording/:roomId - Start recording (Teacher only)
        if (apiPath.startsWith("/start-recording/") && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const { admin, error: authError } = await verifyAdminToken(req);
            if (!admin) {
                return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
            }
            
            if (!isTeacherRole(admin.role)) {
                return jsonResponse({ 
                    error: "Access denied. Only teachers can start recordings.", 
                    success: false 
                }, 403, cors);
            }
            
            const roomId = apiPath.split("/").pop();
            if (!roomId) return jsonResponse({ error: "roomId is required", success: false }, 400, cors);

            try {
                const body = await req.json().catch(() => ({}));
                const resolution = body.resolution || { width: 1280, height: 720 };
                
                const recording = await startRecording(roomId, resolution);
                
                // Store recording info in database
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (supabaseUrl && supabaseServiceKey) {
                    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                    const supabase = createClient(supabaseUrl, supabaseServiceKey);
                    
                    // Find live session by room ID
                    const { data: session } = await supabase
                        .from("live_sessions")
                        .select("id, course_id, course_slug")
                        .eq("meeting_token", roomId)
                        .eq("status", "live")
                        .single();
                    
                    if (session) {
                        await supabase.from("live_recordings").insert({
                            session_id: session.id,
                            admin_id: admin.id,
                            recording_id: recording.id || recording.recording_id,
                            room_id: roomId,
                            status: "recording",
                            started_at: new Date().toISOString(),
                        });
                    }
                }
                
                return jsonResponse({ success: true, recording }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to start recording", 
                    success: false 
                }, 500, cors);
            }
        }

        // 8. POST /stop-recording/:roomId - Stop recording (Teacher only)
        if (apiPath.startsWith("/stop-recording/") && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const { admin, error: authError } = await verifyAdminToken(req);
            if (!admin) {
                return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
            }
            
            if (!isTeacherRole(admin.role)) {
                return jsonResponse({ 
                    error: "Access denied. Only teachers can stop recordings.", 
                    success: false 
                }, 403, cors);
            }
            
            const roomId = apiPath.split("/").pop();
            if (!roomId) return jsonResponse({ error: "roomId is required", success: false }, 400, cors);

            try {
                const body = await req.json().catch(() => ({}));
                const recordingId = body.recordingId;
                
                const result = await stopRecording(roomId, recordingId);
                
                // Update recording status in database
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (supabaseUrl && supabaseServiceKey) {
                    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                    const supabase = createClient(supabaseUrl, supabaseServiceKey);
                    
                    const { data: recording } = await getRecording(result.id || result.recording_id);
                    
                    await supabase
                        .from("live_recordings")
                        .update({
                            status: "completed",
                            url: recording.url || recording.recording_url,
                            duration_ms: recording.duration || 0,
                            completed_at: new Date().toISOString(),
                        })
                        .eq("room_id", roomId)
                        .eq("status", "recording");
                }
                
                return jsonResponse({ success: true, recording: result }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to stop recording", 
                    success: false 
                }, 500, cors);
            }
        }

        // 9. GET /recording-status/:roomId - Get recording status
        if (apiPath.startsWith("/recording-status/") && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const { admin, error: authError } = await verifyAdminToken(req);
            if (!admin) {
                return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
            }
            
            if (!isTeacherRole(admin.role)) {
                return jsonResponse({ 
                    error: "Access denied. Only teachers can view recording status.", 
                    success: false 
                }, 403, cors);
            }
            
            const roomId = apiPath.split("/").pop();
            if (!roomId) return jsonResponse({ error: "roomId is required", success: false }, 400, cors);

            try {
                const status = await getRecordingStatus(roomId);
                // If no recordings exist, return empty array instead of error
                if (!status || !status.data || status.data.length === 0) {
                    return jsonResponse({ success: true, status: { data: [] } }, 200, cors);
                }
                return jsonResponse({ success: true, status }, 200, cors);
            } catch (error) {
                // If 404 from 100ms API, return empty status instead of error
                if (error instanceof Error && error.message.includes('404')) {
                    return jsonResponse({ success: true, status: { data: [] } }, 200, cors);
                }
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to get recording status", 
                    success: false 
                }, 500, cors);
            }
        }

        // 10. GET /recordings/:courseSlug - Get recordings for a course
        if (apiPath.startsWith("/recordings/") && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const courseSlug = apiPath.split("/").pop();
            if (!courseSlug) return jsonResponse({ error: "courseSlug is required", success: false }, 400, cors);

            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                // Find course
                const { data: course } = await supabase
                    .from("course")
                    .select("id")
                    .eq("slug", courseSlug)
                    .single();
                
                if (!course) {
                    return jsonResponse({ success: true, recordings: [] }, 200, cors);
                }
                
                // Get recordings for this course
                const { data: recordings } = await supabase
                    .from("live_recordings")
                    .select(`
                        *,
                        live_sessions!inner(
                            course_id,
                            course_slug,
                            course_name,
                            title
                        )
                    `)
                    .eq("live_sessions.course_id", course.id)
                    .eq("status", "completed")
                    .order("created_at", { ascending: false });
                
                return jsonResponse({ success: true, recordings: recordings || [] }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to get recordings", 
                    success: false 
                }, 500, cors);
            }
        }

        // 11. POST /chat/:sessionId - Send chat message
        if (apiPath.startsWith("/chat/") && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const sessionId = apiPath.split("/")[2];
            if (!sessionId) return jsonResponse({ error: "sessionId is required", success: false }, 400, cors);
            
            try {
                const body = await req.json().catch(() => ({}));
                const { message, participantId, isTeacher } = body;
                
                if (!message || !message.trim()) {
                    return jsonResponse({ error: "Message is required", success: false }, 400, cors);
                }
                
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                // Get user ID from token
                let userId: string | null = null;
                let adminId: string | null = null;
                
                const token = authHeader.replace("Bearer ", "");
                const { data: { user: sbUser } } = await supabase.auth.getUser(token);
                
                if (sbUser) {
                    const { data: adminData } = await supabase
                        .from("admin_users")
                        .select("id")
                        .eq("supabase_id", sbUser.id)
                        .single();
                    
                    if (adminData) {
                        adminId = adminData.id;
                    } else {
                        const { data: userData } = await supabase
                            .from("users")
                            .select("id")
                            .eq("supabase_id", sbUser.id)
                            .single();
                        if (userData) userId = userData.id;
                    }
                }
                
                const { data: chatMessage, error: chatError } = await supabase
                    .from("live_chat_messages")
                    .insert({
                        session_id: sessionId,
                        user_id: userId,
                        admin_id: adminId,
                        participant_id: participantId,
                        message: message.trim(),
                        is_teacher: isTeacher || !!adminId,
                    })
                    .select()
                    .single();
                
                if (chatError) {
                    return jsonResponse({ error: chatError.message, success: false }, 500, cors);
                }
                
                return jsonResponse({ success: true, message: chatMessage }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to send message", 
                    success: false 
                }, 500, cors);
            }
        }

        // 12. GET /chat/:sessionId - Get chat messages
        if (apiPath.startsWith("/chat/") && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const sessionId = apiPath.split("/")[2];
            if (!sessionId) return jsonResponse({ error: "sessionId is required", success: false }, 400, cors);
            
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                const { data: messages, error: messagesError } = await supabase
                    .from("live_chat_messages")
                    .select("*")
                    .eq("session_id", sessionId)
                    .order("created_at", { ascending: true });
                
                if (messagesError) {
                    return jsonResponse({ error: messagesError.message, success: false }, 500, cors);
                }
                
                return jsonResponse({ success: true, messages: messages || [] }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to get messages", 
                    success: false 
                }, 500, cors);
            }
        }

        // 13. POST /hand-raise/:sessionId - Raise hand
        if (apiPath.startsWith("/hand-raise/") && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const sessionId = apiPath.split("/")[2];
            if (!sessionId) return jsonResponse({ error: "sessionId is required", success: false }, 400, cors);
            
            try {
                const body = await req.json().catch(() => ({}));
                const { participantId } = body;
                
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                // Get user ID from token
                let userId: string | null = null;
                const token = authHeader.replace("Bearer ", "");
                const { data: { user: sbUser } } = await supabase.auth.getUser(token);
                
                if (sbUser) {
                    const { data: userData } = await supabase
                        .from("users")
                        .select("id")
                        .eq("supabase_id", sbUser.id)
                        .single();
                    if (userData) userId = userData.id;
                }
                
                if (!userId) {
                    return jsonResponse({ error: "User not found", success: false }, 401, cors);
                }
                
                // Check if hand is already raised
                const { data: existing } = await supabase
                    .from("live_hand_raises")
                    .select("id")
                    .eq("session_id", sessionId)
                    .eq("user_id", userId)
                    .eq("is_acknowledged", false)
                    .single();
                
                if (existing) {
                    return jsonResponse({ success: true, message: "Hand already raised", handRaise: existing }, 200, cors);
                }
                
                const { data: handRaise, error: handRaiseError } = await supabase
                    .from("live_hand_raises")
                    .insert({
                        session_id: sessionId,
                        user_id: userId,
                        participant_id: participantId,
                    })
                    .select()
                    .single();
                
                if (handRaiseError) {
                    return jsonResponse({ error: handRaiseError.message, success: false }, 500, cors);
                }
                
                return jsonResponse({ success: true, handRaise }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to raise hand", 
                    success: false 
                }, 500, cors);
            }
        }

        // 14. POST /hand-raise/:sessionId/acknowledge - Acknowledge hand raise (Teacher only)
        if (apiPath.includes("/hand-raise/") && apiPath.includes("/acknowledge") && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const { admin, error: authError } = await verifyAdminToken(req);
            if (!admin) {
                return jsonResponse({ error: authError || "Unauthorized", success: false }, 401, cors);
            }
            
            if (!isTeacherRole(admin.role)) {
                return jsonResponse({ 
                    error: "Access denied. Only teachers can acknowledge hand raises.", 
                    success: false 
                }, 403, cors);
            }
            
            const parts = apiPath.split("/");
            const sessionId = parts[2];
            const handRaiseId = parts[parts.length - 1] === "acknowledge" ? null : parts[parts.length - 1];
            
            if (!sessionId) return jsonResponse({ error: "sessionId is required", success: false }, 400, cors);
            
            try {
                const body = await req.json().catch(() => ({}));
                const targetHandRaiseId = handRaiseId || body.handRaiseId;
                
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                const updateData: any = {
                    is_acknowledged: true,
                    acknowledged_at: new Date().toISOString(),
                };
                
                const query = supabase
                    .from("live_hand_raises")
                    .update(updateData)
                    .eq("session_id", sessionId)
                    .eq("is_acknowledged", false);
                
                if (targetHandRaiseId) {
                    query.eq("id", targetHandRaiseId);
                }
                
                const { data, error } = await query.select();
                
                if (error) {
                    return jsonResponse({ error: error.message, success: false }, 500, cors);
                }
                
                return jsonResponse({ success: true, handRaises: data }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to acknowledge hand raise", 
                    success: false 
                }, 500, cors);
            }
        }

        // 15. GET /hand-raises/:sessionId - Get hand raises for session
        if (apiPath.startsWith("/hand-raises/") && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const sessionId = apiPath.split("/")[2];
            if (!sessionId) return jsonResponse({ error: "sessionId is required", success: false }, 400, cors);
            
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                const { data: handRaises, error: handRaisesError } = await supabase
                    .from("live_hand_raises")
                    .select(`
                        *,
                        users!inner(id, first_name, last_name, email)
                    `)
                    .eq("session_id", sessionId)
                    .eq("is_acknowledged", false)
                    .order("raised_at", { ascending: true });
                
                if (handRaisesError) {
                    return jsonResponse({ error: handRaisesError.message, success: false }, 500, cors);
                }
                
                return jsonResponse({ success: true, handRaises: handRaises || [] }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to get hand raises", 
                    success: false 
                }, 500, cors);
            }
        }

        // 16. POST /attendance/:sessionId - Mark attendance
        if (apiPath.startsWith("/attendance/") && req.method === "POST") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const sessionId = apiPath.split("/")[2];
            if (!sessionId) return jsonResponse({ error: "sessionId is required", success: false }, 400, cors);
            
            try {
                const body = await req.json().catch(() => ({}));
                const { participantId, action } = body; // action: 'join' or 'leave'
                
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                // Get user ID from token
                let userId: string | null = null;
                const token = authHeader.replace("Bearer ", "");
                const { data: { user: sbUser } } = await supabase.auth.getUser(token);
                
                if (sbUser) {
                    const { data: userData } = await supabase
                        .from("users")
                        .select("id")
                        .eq("supabase_id", sbUser.id)
                        .single();
                    if (userData) userId = userData.id;
                }
                
                if (!userId) {
                    return jsonResponse({ error: "User not found", success: false }, 401, cors);
                }
                
                if (action === "join") {
                    const { data: attendance, error: attendanceError } = await supabase
                        .from("live_attendance")
                        .upsert({
                            session_id: sessionId,
                            user_id: userId,
                            participant_id: participantId,
                            joined_at: new Date().toISOString(),
                            is_present: true,
                        }, {
                            onConflict: "session_id,user_id",
                        })
                        .select()
                        .single();
                    
                    if (attendanceError) {
                        return jsonResponse({ error: attendanceError.message, success: false }, 500, cors);
                    }
                    
                    return jsonResponse({ success: true, attendance }, 200, cors);
                } else if (action === "leave") {
                    const { data: attendance } = await supabase
                        .from("live_attendance")
                        .select("joined_at")
                        .eq("session_id", sessionId)
                        .eq("user_id", userId)
                        .single();
                    
                    const leftAt = new Date().toISOString();
                    const durationSeconds = attendance?.joined_at 
                        ? Math.floor((new Date(leftAt).getTime() - new Date(attendance.joined_at).getTime()) / 1000)
                        : 0;
                    
                    const { data: updatedAttendance, error: updateError } = await supabase
                        .from("live_attendance")
                        .update({
                            left_at: leftAt,
                            duration_seconds: durationSeconds,
                            is_present: false,
                        })
                        .eq("session_id", sessionId)
                        .eq("user_id", userId)
                        .select()
                        .single();
                    
                    if (updateError) {
                        return jsonResponse({ error: updateError.message, success: false }, 500, cors);
                    }
                    
                    return jsonResponse({ success: true, attendance: updatedAttendance }, 200, cors);
                }
                
                return jsonResponse({ error: "Invalid action. Use 'join' or 'leave'", success: false }, 400, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to update attendance", 
                    success: false 
                }, 500, cors);
            }
        }

        // 17. GET /attendance/:sessionId - Get attendance for session
        if (apiPath.startsWith("/attendance/") && req.method === "GET") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);
            
            const sessionId = apiPath.split("/")[2];
            if (!sessionId) return jsonResponse({ error: "sessionId is required", success: false }, 400, cors);
            
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                
                if (!supabaseUrl || !supabaseServiceKey) {
                    return jsonResponse({ error: "Database not configured", success: false }, 500, cors);
                }

                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                const { data: attendance, error: attendanceError } = await supabase
                    .from("live_attendance")
                    .select(`
                        *,
                        users!inner(id, first_name, last_name, email)
                    `)
                    .eq("session_id", sessionId)
                    .order("joined_at", { ascending: true });
                
                if (attendanceError) {
                    return jsonResponse({ error: attendanceError.message, success: false }, 500, cors);
                }
                
                return jsonResponse({ success: true, attendance: attendance || [] }, 200, cors);
            } catch (error) {
                return jsonResponse({ 
                    error: error instanceof Error ? error.message : "Failed to get attendance", 
                    success: false 
                }, 500, cors);
            }
        }

        return jsonResponse({ error: "Not found", success: false }, 404, cors);

    } catch (error) {
        console.error("[live-class-api] Error:", error);
        return jsonResponse({
            error: error instanceof Error ? error.message : "Internal server error",
            success: false,
        }, 500, cors);
    }
});
