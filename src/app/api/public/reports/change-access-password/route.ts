import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findPatientByAccessId, setPatientPassword, verifyPatientPassword } from "@/lib/server-report-access";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_WINDOW_ATTEMPTS = 10;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function requiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function rateLimitKey(request: NextRequest, accessId: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${accessId.toLowerCase()}`;
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_WINDOW_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const env = requiredEnv();
  if (!env) return jsonError("Report access is not configured.", 500);

  const body = await request.json().catch(() => ({}));
  const accessId = String(body.access_id ?? "").trim().slice(0, 80);
  const oldPassword = String(body.old_password ?? "").slice(0, 120);
  const newPassword = String(body.new_password ?? "").slice(0, 120);
  if (!accessId || !oldPassword || !newPassword) return jsonError("Access ID, old password, and new password are required.");
  if (newPassword.length < 8) return jsonError("New password must be at least 8 characters.");
  if (isRateLimited(rateLimitKey(request, accessId))) return jsonError("Too many attempts. Please wait before trying again.", 429);

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const patient = await findPatientByAccessId(admin, accessId);
  if (!patient) return jsonError("Access ID or old password is incorrect.", 401);

  const verified = await verifyPatientPassword(admin, patient, oldPassword);
  if (!verified.ok) {
    return jsonError(verified.locked ? "Too many failed attempts. Please wait before trying again." : "Access ID or old password is incorrect.", verified.locked ? 429 : 401);
  }

  await setPatientPassword(admin, patient.id, newPassword);
  return NextResponse.json({ changed: true, message: "Patient password updated." });
}
