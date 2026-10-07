import { NextRequest, NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "saksuuu_admin_token";

// Convert string to Uint8Array for Web Crypto
function getSecretBytes(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.ADMIN_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured for admin sessions");
  return new TextEncoder().encode(secret);
}

// Base64URL encode/decode
function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.byteLength; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface AdminSession {
  username: string;
  role: string;
  name: string;
  exp: number;
  iat: number;
}

/**
 * Sign an admin session payload using Web Crypto HMAC-SHA256
 * Works in both Edge Runtime (middleware) and Node.js
 */
export async function signAdminToken(
  payload: Omit<AdminSession, "exp" | "iat">,
  expiresInSeconds: number = 7 * 24 * 60 * 60 // 7 days
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const fullPayload: AdminSession = { ...payload, iat, exp };

  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };

  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const message = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    getSecretBytes() as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${message}.${signatureB64}`;
}

/**
 * Verify and decode an admin token
 */
export async function verifyAdminToken(token: string): Promise<AdminSession | null> {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
    if (header?.alg !== "HS256" || header?.typ !== "JWT") return null;
    const message = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      "raw",
      getSecretBytes() as unknown as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const encoder = new TextEncoder();
    const signatureBytes = base64UrlDecode(signatureB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as BufferSource,
      encoder.encode(message)
    );

    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as AdminSession;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (
      !payload ||
      !Number.isFinite(payload.exp) || payload.exp <= now ||
      !Number.isFinite(payload.iat) || payload.iat > now ||
      typeof payload.username !== "string" || !payload.username.trim() ||
      typeof payload.name !== "string" ||
      !["Admin", "Super Admin"].includes(payload.role)
    ) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}

/**
 * Validates admin credentials against explicitly configured accounts
 */
export function validateAdminCredentials(username?: string, password?: string): boolean {
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) return false;

  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;

  if (!validUsername || !validPassword) return false;

  const trimmedUser = username.trim().toLowerCase();
  return trimmedUser === validUsername.trim().toLowerCase() && password === validPassword;
}

/**
 * Check if the current incoming request has a valid admin session
 */
export async function getAdminSessionFromRequest(
  req: NextRequest | Request
): Promise<AdminSession | null> {
  let token: string | undefined;

  // Check cookie first
  if ("cookies" in req && typeof req.cookies.get === "function") {
    token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  } else {
    // Parse cookie header manually
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`));
      if (match) token = match[1];
    }
  }

  // Check Authorization Bearer header as fallback
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) return null;

  return await verifyAdminToken(token);
}

/**
 * Helper to enforce admin authorization in API routes
 */
export async function requireAdminAuth(
  req: NextRequest | Request
): Promise<{ authorized: true; session: AdminSession } | { authorized: false; response: NextResponse }> {
  const session = await getAdminSessionFromRequest(req);
  if (!session) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Admin session required.",
        },
        { status: 401 }
      ),
    };
  }
  return { authorized: true, session };
}
