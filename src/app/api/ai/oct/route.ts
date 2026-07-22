import { NextRequest, NextResponse } from "next/server";
import { createInMemoryRateLimiter, rateLimitKey } from "@/lib/rate-limit";
import { buildSignedRequestHeaders } from "@/lib/request-signing";
import { forwardSignedUpload, jsonError, requiredGatewayBaseEnv, requireGatewayModuleAccess, validateGatewayUpload } from "@/lib/ai-gateway";

export const runtime = "nodejs";

const limiter = createInMemoryRateLimiter(10 * 60 * 1000, 20);
const OCT_PREDICT_TIMEOUT_MS = 120_000;
const GRADCAM_TIMEOUT_MS = 90_000;
const OCT_GRADCAM_FALLBACK_URLS = [
  "https://afio-oct-gradcam-backend.onrender.com",
  "https://16.16.104.107.sslip.io"
];

function envUrl(name: string) {
  return process.env[name]?.replace(/\/$/, "");
}

function uniqueUrls(urls: Array<string | undefined>) {
  return Array.from(new Set(urls.filter(Boolean) as string[]));
}

function requestIsGradcam(request: NextRequest, incoming: FormData) {
  const headerMode = request.headers.get("x-afio-mode")?.trim().toLowerCase();
  const headerGradcam = request.headers.get("x-afio-gradcam")?.trim().toLowerCase();
  const formMode = incoming.get("mode");
  const formGradcam = incoming.get("gradcam");

  return (
    headerMode === "gradcam" ||
    headerGradcam === "1" ||
    headerGradcam === "true" ||
    formMode === "gradcam" ||
    formMode === "grad-cam" ||
    formMode === "grad_cam" ||
    formGradcam === "1" ||
    formGradcam === "true"
  );
}

async function fetchOptionalGradcam(input: {
  backendUrls: string[];
  file: File;
  sharedSecret: string;
}) {
  const payload = Buffer.from(await input.file.arrayBuffer()).toString("base64");

  for (const backendUrl of input.backendUrls) {
    const headers = buildSignedRequestHeaders(payload, input.sharedSecret, {
      signatureHeader: "X-AFIO-Signature",
      timestampHeader: "X-AFIO-Timestamp",
      requestId: crypto.randomUUID()
    });

    const formData = new FormData();
    formData.append("file", input.file, input.file.name || "image.jpg");

    const response = await fetch(`${backendUrl}/gradcam`, {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(GRADCAM_TIMEOUT_MS)
    }).catch(() => null);
    if (!response?.ok) continue;

    const gradcam = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (
      gradcam?.gradcam_overlay_base64 ||
      gradcam?.heatmap ||
      gradcam?.heatmap_base64 ||
      gradcam?.overlay
    ) {
      return gradcam;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const env = requiredGatewayBaseEnv();
  const predictBackendUrl = envUrl("OCT_AI_BACKEND_URL");
  if (!env || !predictBackendUrl) return jsonError("OCT gateway is not configured.", 500);

  const accessResult = await requireGatewayModuleAccess(request, env, "oct");
  if (accessResult instanceof Response) return accessResult;

  if (limiter.isRateLimited(rateLimitKey(request, accessResult.userId))) {
    return jsonError("Too many attempts. Please wait before trying again.", 429);
  }

  const incoming = await request.formData().catch(() => null);
  if (!incoming) return jsonError("No image file uploaded.", 400);

  const uploaded = incoming.get("image") ?? incoming.get("file");
  if (!(uploaded instanceof File)) {
    return jsonError("No image file uploaded.", 400);
  }
  const validationError = await validateGatewayUpload(uploaded);
  if (validationError) return validationError;

  const isGradcam = requestIsGradcam(request, incoming);

  try {
    const predictionResponse = await forwardSignedUpload({
      backendUrl: predictBackendUrl,
      backendPath: "/predict",
      file: uploaded,
      fieldName: "file",
      sharedSecret: env.sharedSecret,
      timeoutMs: OCT_PREDICT_TIMEOUT_MS,
      retries: 2,
      retryDelayMs: 2_500,
      audit: {
        supabaseUrl: env.supabaseUrl,
        serviceRoleKey: env.serviceRoleKey,
        moduleId: "oct",
        userId: accessResult.userId,
        clinicId: accessResult.clinicId,
        route: "/api/ai/oct"
      }
    });
    if (!isGradcam || !predictionResponse.ok) return predictionResponse;

    const prediction = await predictionResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!prediction) return predictionResponse;

    const gradcamBackendUrls = uniqueUrls([
      envUrl("OCT_GRADCAM_BACKEND_URL"),
      ...OCT_GRADCAM_FALLBACK_URLS,
      predictBackendUrl
    ]);
    const gradcam = await fetchOptionalGradcam({
      backendUrls: gradcamBackendUrls,
      file: uploaded,
      sharedSecret: env.sharedSecret
    }).catch(() => null);

    const heatmap =
      gradcam?.gradcam_overlay_base64 ??
      gradcam?.heatmap ??
      gradcam?.heatmap_base64 ??
      gradcam?.overlay ??
      null;

    const warnings = Array.isArray(prediction.validation_warnings)
      ? prediction.validation_warnings
      : [];

    return NextResponse.json({
      ...prediction,
      ...(heatmap ? { gradcam_overlay_base64: heatmap, heatmap } : {}),
      validation_warnings: heatmap
        ? warnings
        : [...warnings, "OCT Grad-CAM is currently unavailable; prediction completed without heatmap."]
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-AFIO-Request-Id": predictionResponse.headers.get("X-AFIO-Request-Id") ?? ""
      }
    });
  } catch {
    return jsonError("OCT screening service is warming up or temporarily busy. Please retry this scan in a few seconds.", 502);
  }
}
