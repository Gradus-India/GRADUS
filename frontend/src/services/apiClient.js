/*
  Lightweight fetch wrapper for REST calls
  - Picks API base URL from Vite env, with sensible localhost defaults
  - Parses JSON/text automatically and throws enriched errors
*/
const DEFAULT_LOCAL_API_BASE_URL = "http://localhost:5000/api";
const DEFAULT_REMOTE_API_BASE_URL = "https://api.gradusindia.in/api";

const isLocalhost = (hostname) => {
  if (!hostname) {
    return false;
  }

  const normalizedHost = hostname.toLowerCase();
  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "[::1]" ||
    normalizedHost.endsWith(".local")
  );
};

const resolveApiBaseUrl = () => {
  // In development, dynamic hostname to support network access (e.g., 192.168.x.x)
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return `http://${window.location.hostname}:5000/api`;
  }

  const envValue = import.meta.env.VITE_API_BASE_URL;
  const forceRemoteOnLocal =
    String(import.meta.env.VITE_API_FORCE_REMOTE || "").toLowerCase() ===
    "true";

  if (typeof window !== "undefined") {
    const { hostname } = window.location;

    // When running on localhost, prefer a localhost API base unless explicitly forced remote.
    if (isLocalhost(hostname)) {
      if (forceRemoteOnLocal && envValue) {
        return envValue;
      }
      // If hardcoded localhost env var exists, use it, otherwise default
      if (envValue && /^https?:\/\/localhost(?::\d+)?\/.*/i.test(envValue)) {
        return envValue;
      }
      return DEFAULT_LOCAL_API_BASE_URL;
    }

    // When NOT on localhost (production/staging), never use a localhost API base
    // even if it was accidentally bundled at build time.
    if (envValue && !/https?:\/\/localhost(?::\d+)?\/.*/i.test(envValue)) {
      return envValue;
    }
  }

  // Fallback to the remote API base when no safe env override is present.
  return DEFAULT_REMOTE_API_BASE_URL;
};

export const API_BASE_URL = resolveApiBaseUrl();

const parseResponse = async (response, responseType) => {
  if (responseType === "blob") {
    if (!response.ok) {
      // If error, try to read text to throw useful error
      const text = await response.text().catch(() => "Download failed");
      const error = new Error(text);
      error.status = response.status;
      throw error;
    }
    return response.blob();
  }

  const contentType = response.headers.get("content-type");
  let data = null;

  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let message = "Request failed";
    if (typeof data === "string") {
      message = data;
    } else if (data?.message || data?.error) {
      message = data.message || data.error;
    }

    const error = new Error(message);
    error.status = response.status;
    if (typeof data === "object" && data?.details) {
      error.details = data.details;
    }
    throw error;
  }

  return data;
};

const request = async (path, options = {}) => {
  const {
    method = "GET",
    body,
    data, // Support 'data' as alias for 'body'
    token,
    headers: customHeaders,
    signal,
  } = options;
  const headers = new Headers(customHeaders || {});

  // Determine the effective body
  const effectiveBody = body !== undefined ? body : data;

  if (!(effectiveBody instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    // If no user token, send Supabase Anon Key for Edge Function access
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (anonKey) {
      headers.set("Authorization", `Bearer ${anonKey}`);
    }
  }

  const fetchOptions = {
    method,
    headers,
    credentials: options.credentials || "include",
  };

  if (signal) {
    fetchOptions.signal = signal;
  }

  if (effectiveBody !== undefined) {
    fetchOptions.body =
      effectiveBody instanceof FormData
        ? effectiveBody
        : JSON.stringify(effectiveBody);
  }

  let finalUrl = `${API_BASE_URL}${path}`;

  // EDGE FUNCTION INTERCEPTION
  // Map specific paths to Supabase Edge Functions
  const edgeBaseUrl = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
    : "https://utxxhgoxsywhrdblwhbx.supabase.co/functions/v1"; // Hardcoded fallback

  console.log("[ApiClient] Path:", path, "EdgeBase:", edgeBaseUrl);

  if (edgeBaseUrl) {
    // Helper to normalize path
    const p = path.startsWith("/") ? path : `/${path}`;

    if (p.startsWith("/courses") || p.startsWith("/courses/")) {
      // /courses -> /courses-api
      // /courses/foo -> /courses-api/foo
      const subPath = p.replace(/^\/courses/, "");

      // Handle enroll
      if (p.match(/\/enroll$/)) {
        const parts = subPath.split("/").filter(Boolean);
        const slug = parts[0];
        finalUrl = `${edgeBaseUrl}/courses-api/enroll/${slug}`;
      }
      // Handle progress
      else if (p.match(/\/progress$/)) {
        // /courses/:slug/progress -> /courses-api/progress/:slug
        // subPath is /:slug/progress
        const slug = subPath.replace(/\/progress$/, ""); // /gradus-x/foo/progress -> /gradus-x/foo
        finalUrl = `${edgeBaseUrl}/courses-api/progress${slug}`;
      }
      // Handle modules detail
      else if (p.match(/\/modules\/detail$/)) {
        // /courses/:slug/modules/detail -> /courses-api/modules/:slug
        const slug = subPath.replace(/\/modules\/detail$/, "");
        finalUrl = `${edgeBaseUrl}/courses-api/modules${slug}`;
      } else {
        finalUrl = `${edgeBaseUrl}/courses-api${subPath}`;
      }
    } else if (p.startsWith("/events")) {
      const subPath = p.replace(/^\/events/, "");
      finalUrl = `${edgeBaseUrl}/events-api${subPath}`;
    } else if (p.startsWith("/landing-page-registrations")) {
      // Explicitly route to new dedicated function
      finalUrl = `${edgeBaseUrl}/landing-page-registration`;
    } else if (p.startsWith("/event-registrations")) {
      const subPath = p.replace(/^\/event-registrations/, "");
      finalUrl = `${edgeBaseUrl}/event-registrations-api${subPath}`;
    } else if (
      p.startsWith("/banners") ||
      p.startsWith("/why-gradus-video") ||
      p.startsWith("/partners") ||
      p.startsWith("/testimonials") ||
      p.startsWith("/expert-videos") ||
      p.startsWith("/inquiries") ||
      p.startsWith("/gallery") ||
      p.startsWith("/landing-pages")
    ) {
      finalUrl = `${edgeBaseUrl}/content-api${p}`;
    } else if (p.startsWith("/cloudinary") || p.startsWith("/admin/uploads")) {
      // /cloudinary/upload -> /cloudinary-api/upload
      // /admin/uploads/image -> /cloudinary-api/upload
      const subPath = p.startsWith("/admin/uploads")
        ? "/upload"
        : p.replace(/^\/cloudinary/, "");
      finalUrl = `${edgeBaseUrl}/cloudinary-api${subPath}`;
    } else if (p.startsWith("/blogs")) {
      // /blogs -> /blogs-api
      const subPath = p.replace(/^\/blogs/, "");
      finalUrl = `${edgeBaseUrl}/blogs-api${subPath}`;
    } else if (p.startsWith("/live")) {
      // /live -> /courses-api/live
      const subPath = p.replace(/^\/live/, "/live");
      finalUrl = `${edgeBaseUrl}/courses-api${subPath}`;
    } else if (p.startsWith("/auth")) {
      // /auth/... -> /auth-api/...
      // Frontend calls /auth/login -> /auth-api/login
      const subPath = p.replace(/^\/auth/, "");
      finalUrl = `${edgeBaseUrl}/auth-api${subPath}`;
    } else if (
      p.startsWith("/analytics") ||
      p.startsWith("/page-meta") ||
      p.startsWith("/jobs") ||
      p.startsWith("/tickets")
    ) {
      finalUrl = `${edgeBaseUrl}/site-services-api${p}`;
    } else if (
      p.startsWith("/payment-processing") ||
      p.startsWith("/payments") ||
      p.startsWith("/create-order")
    ) {
      finalUrl = `${edgeBaseUrl}/payment-processing${p}`;
    } else if (p.startsWith("/users/me")) {
      const subPath = p.replace(/^\/users\/me/, "/me");
      finalUrl = `${edgeBaseUrl}/users-api${subPath}`;
    } else if (
      p.startsWith("/users/email-change") ||
      p.startsWith("/users/password") ||
      p.startsWith("/users/account-delete")
    ) {
      // /users/email-change/start, /users/password/change, /users/account-delete/start -> /users-api/...
      const subPath = p.replace(/^\/users/, "");
      finalUrl = `${edgeBaseUrl}/users-api${subPath}`;
    }
  }

  const response = await fetch(finalUrl, fetchOptions);
  return parseResponse(
    response,
    options.responseType ||
      (headers.get("Content-Type") === "application/pdf" ? "blob" : null)
  );
};

// Multi-style API client (supports apiClient(path, opts) and apiClient.get(path))
const apiClient = (path, options) => request(path, options);

apiClient.get = (path, options = {}) =>
  request(path, { ...options, method: "GET" });
apiClient.post = (path, body, options = {}) =>
  request(path, { ...options, method: "POST", body });
apiClient.put = (path, body, options = {}) =>
  request(path, { ...options, method: "PUT", body });
apiClient.delete = (path, options = {}) =>
  request(path, { ...options, method: "DELETE" });

export default apiClient;
