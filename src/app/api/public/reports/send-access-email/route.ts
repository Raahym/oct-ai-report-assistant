import { NextRequest, NextResponse } from "next/server";
import { createInMemoryRateLimiter, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createInMemoryRateLimiter(10 * 60 * 1000, 10);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function backendUrl() {
  return (process.env.OCT_AI_BACKEND_URL || process.env.AI_BACKEND_URL || "").replace(/\/$/, "");
}

function cleanString(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const backend = backendUrl();
  if (!backend) return jsonError("Report email service is not configured.", 500);

  const body = await request.json().catch(() => ({}));
  const toEmail = cleanString(body.to_email, 254).toLowerCase();
  const patientName = cleanString(body.patient_name, 160);
  const accessId = cleanString(body.access_id, 80);
  const password = cleanString(body.password, 120);
  const mode = ["patient-created", "report-registered", "report-ready"].includes(body.mode) ? body.mode : "report-ready";

  if (!isEmail(toEmail)) return jsonError("A valid recipient email is required.");
  if (!patientName || !accessId || !password) return jsonError("Patient name, access ID, and password are required.");
  if (limiter.isRateLimited(rateLimitKey(request, toEmail))) {
    return jsonError("Too many email attempts. Please wait before trying again.", 429);
  }

  let response: Response;
  try {
    response = await fetch(`${backend}/reports/send-access-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_email: toEmail,
        patient_name: patientName,
        access_id: accessId,
        password,
        mode
      })
    });
  } catch {
    return jsonError("Could not reach report email service.", 502);
  }

  const payload = await response.json().catch(() => ({ message: "Report email service returned an invalid response." }));
  return NextResponse.json(payload, { status: response.status });
}
