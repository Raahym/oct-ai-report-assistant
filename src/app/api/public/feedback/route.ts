import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInMemoryRateLimiter, rateLimitKey } from "@/lib/rate-limit";

type ModuleId = "oct" | "vkg" | "corneal" | "corneal_ulcer" | "retina";
type FeedbackType = "feedback" | "complaint";
const limiter = createInMemoryRateLimiter(10 * 60 * 1000, 12);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function requiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

function cleanString(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  const env = requiredEnv();
  if (!env) return jsonError("Feedback is not configured.", 500);

  const body = await request.json().catch(() => ({}));
  const type = (body.type === "complaint" ? "complaint" : "feedback") as FeedbackType;
  const moduleId = ["oct", "vkg", "corneal", "corneal_ulcer", "retina"].includes(body.module_id) ? body.module_id as ModuleId : null;
  const clinicId = cleanString(body.clinic_id, 80) || null;
  const hospitalName = cleanString(body.hospital_name, 160) || null;
  const name = cleanString(body.name, 120);
  const email = cleanString(body.email, 254).toLowerCase() || null;
  const phone = cleanString(body.phone, 40) || null;
  const patientCode = cleanString(body.patient_code, 80) || null;
  const reportId = cleanString(body.report_id, 80) || null;
  const message = cleanString(body.message, 4000);

  if (!name || !message) return jsonError("Name and message are required.");
  if (email && !isEmail(email)) return jsonError("Enter a valid email address.");
  if (limiter.isRateLimited(rateLimitKey(request, email || phone || name))) {
    return jsonError("Too many feedback attempts. Please wait before trying again.", 429);
  }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await admin
    .from("feedback_entries")
    .insert({
      type,
      clinic_id: clinicId,
      hospital_name: hospitalName,
      module_id: moduleId,
      name,
      email,
      phone,
      patient_code: patientCode,
      report_id: reportId,
      message
    })
    .select("*")
    .single();

  if (error) {
    console.error("Public feedback insert failed.", error);
    return jsonError("Could not register this request.", 500);
  }

  return NextResponse.json({
    entry: {
      id: data.id,
      type: data.type,
      status: data.status,
      clinicId: data.clinic_id ?? undefined,
      hospitalName: data.hospital_name ?? undefined,
      moduleId: data.module_id ?? undefined,
      name: data.name,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      patientCode: data.patient_code ?? undefined,
      reportId: data.report_id ?? undefined,
      message: data.message,
      createdAt: data.created_at,
      responses: []
    }
  });
}
