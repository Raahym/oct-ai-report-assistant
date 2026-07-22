import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AFIO_SESSION_COOKIE, createSessionCookieValue, sessionCookieOptions, sessionCookieSecret } from "@/lib/session-cookie";

export const runtime = "nodejs";

function env() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cookieSecret = sessionCookieSecret();
  if (!supabaseUrl || !serviceRoleKey || !cookieSecret) return null;
  return { supabaseUrl, serviceRoleKey, cookieSecret };
}

export async function POST(request: NextRequest) {
  const config = env();
  if (!config) return NextResponse.json({ error: "Auth session is not configured." }, { status: 500 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing authenticated session." }, { status: 401 });

  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid authenticated session." }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AFIO_SESSION_COOKIE, await createSessionCookieValue(data.user.id, config.cookieSecret), sessionCookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AFIO_SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
