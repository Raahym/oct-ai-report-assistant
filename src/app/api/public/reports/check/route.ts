import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  findPatientByAccessId,
  getPatientAccessId,
  patientResult,
  patientSafeReportText,
  verifyPatientPassword,
  type DbAiResultAccess,
  type DbProfileAccess,
  type DbReportAccess
} from "@/lib/server-report-access";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_WINDOW_ATTEMPTS = 20;

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

function doctorName(name?: string | null) {
  if (!name) return undefined;
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

export async function POST(request: NextRequest) {
  const env = requiredEnv();
  if (!env) return jsonError("Report access is not configured.", 500);

  const body = await request.json().catch(() => ({}));
  const accessId = String(body.access_id ?? "").trim().slice(0, 80);
  const password = String(body.password ?? "").slice(0, 120);
  if (!accessId || !password) return jsonError("Access ID and password are required.");

  if (isRateLimited(rateLimitKey(request, accessId))) {
    return jsonError("Too many attempts. Please wait before trying again.", 429);
  }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const patient = await findPatientByAccessId(admin, accessId);
  if (!patient) {
    return NextResponse.json({ found: false, approved: false, message: "No matching approved report was found." });
  }

  const verified = await verifyPatientPassword(admin, patient, password);
  if (!verified.ok) {
    return NextResponse.json({
      found: false,
      approved: false,
      message: verified.locked ? "Too many failed attempts. Please wait before trying again." : "No matching approved report was found."
    });
  }

  const { data: reportRows, error: reportsError } = await admin
    .from("reports")
    .select("*")
    .eq("patient_id", patient.id)
    .eq("status", "approved")
    .order("approved_at", { ascending: false });
  if (reportsError) throw reportsError;

  const reports = (reportRows ?? []) as DbReportAccess[];
  if (!reports.length) {
    return NextResponse.json({
      found: true,
      approved: false,
      status: "pending_review",
      message: "Report is registered, but no approved report is available yet."
    });
  }

  const aiIds = reports.map((report) => report.ai_result_id).filter(Boolean) as string[];
  const approverIds = reports.map((report) => report.approved_by).filter(Boolean) as string[];
  const [aiResult, approverResult] = await Promise.all([
    aiIds.length ? admin.from("ai_results").select("id,predicted_class").in("id", aiIds) : Promise.resolve({ data: [], error: null }),
    approverIds.length ? admin.from("profiles").select("id,full_name").in("id", approverIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (aiResult.error) throw aiResult.error;
  if (approverResult.error) throw approverResult.error;

  const aiById = new Map(((aiResult.data ?? []) as DbAiResultAccess[]).map((row) => [row.id, row]));
  const approverById = new Map(((approverResult.data ?? []) as DbProfileAccess[]).map((row) => [row.id, row]));
  const publicReports = reports.map((report) => {
    const ai = report.ai_result_id ? aiById.get(report.ai_result_id) : undefined;
    const approver = report.approved_by ? approverById.get(report.approved_by) : undefined;
    const result = patientResult(report.final_diagnosis, ai?.predicted_class);
    return {
      id: report.id,
      patientCode: getPatientAccessId(patient),
      patientName: patient.full_name,
      age: patient.age,
      gender: patient.gender,
      result,
      findings: patientSafeReportText(report.findings),
      impression: patientSafeReportText(report.impression),
      recommendation: patientSafeReportText(report.recommendation),
      doctorNotes: patientSafeReportText(report.doctor_notes || "No additional notes."),
      finalDiagnosis: result,
      approvedByName: doctorName(approver?.full_name),
      approvedAt: report.approved_at ?? undefined,
      createdAt: report.created_at,
      status: report.status
    };
  });

  return NextResponse.json({
    configured: true,
    found: true,
    approved: true,
    status: publicReports[0].status,
    report: publicReports[0],
    reports: publicReports
  });
}
