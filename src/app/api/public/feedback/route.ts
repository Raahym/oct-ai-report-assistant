import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ModuleId = "oct" | "vkg" | "corneal" | "corneal_ulcer" | "retina";
type FeedbackType = "feedback" | "complaint";

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

export async function POST(request: NextRequest) {
  const env = requiredEnv();
  if (!env) return jsonError("Feedback is not configured.", 500);

  const body = await request.json().catch(() => ({}));
  const type = (body.type === "complaint" ? "complaint" : "feedback") as FeedbackType;
  const moduleId = ["oct", "vkg", "corneal", "retina"].includes(body.module_id) ? body.module_id as ModuleId : null;
  const clinicId = String(body.clinic_id ?? "").trim() || null;
  const hospitalName = String(body.hospital_name ?? "").trim() || null;
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase() || null;
  const phone = String(body.phone ?? "").trim() || null;
  const patientCode = String(body.patient_code ?? "").trim() || null;
  const reportId = String(body.report_id ?? "").trim() || null;
  const message = String(body.message ?? "").trim();

  if (!name || !message) return jsonError("Name and message are required.");
  if (email && !isEmail(email)) return jsonError("Enter a valid email address.");
  if (message.length > 4000) return jsonError("Message is too long.");

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
