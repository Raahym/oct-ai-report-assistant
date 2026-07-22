export const AFIO_SESSION_COOKIE = "afio_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64UrlEncode(input: string | ArrayBuffer) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export function sessionCookieSecret() {
  return process.env.AFIO_SESSION_COOKIE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.AI_GATEWAY_SHARED_SECRET ?? "";
}

export async function createSessionCookieValue(userId: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiresAt = nowSeconds + SESSION_TTL_SECONDS;
  const payload = `${base64UrlEncode(userId)}.${expiresAt}`;
  const signature = await hmacSha256(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySessionCookieValue(value: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!value || !secret) return false;
  const [encodedUserId, expiresAtText, signature] = value.split(".");
  if (!encodedUserId || !expiresAtText || !signature) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) return false;

  const expected = await hmacSha256(`${encodedUserId}.${expiresAtText}`, secret);
  return signature === expected;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS
};
