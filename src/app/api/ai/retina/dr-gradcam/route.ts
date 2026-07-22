import { NextRequest } from "next/server";
import {
  configuredGatewayUrls,
  forwardSignedUpload,
  jsonError,
  requiredGatewayBaseEnv,
  requireGatewayModuleAccess,
  validateGatewayUpload
} from "@/lib/ai-gateway";
import { createInMemoryRateLimiter, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createInMemoryRateLimiter(10 * 60 * 1000, 20);
const BACKEND_URL_ENV_NAMES = ["RETINA_DR_GRADCAM_BACKEND_URL"];
const DR_GRADCAM_TIMEOUT_MS = 90_000;
const DR_GRADCAM_FALLBACK_URLS = ["https://13.48.31.108.sslip.io"];

function gradcamBackendUrls() {
  return Array.from(new Set([
    ...configuredGatewayUrls(BACKEND_URL_ENV_NAMES),
    ...DR_GRADCAM_FALLBACK_URLS
  ]));
}

export async function POST(request: NextRequest) {
  const baseEnv = requiredGatewayBaseEnv();
  if (!baseEnv) return jsonError("Retina DR Grad-CAM gateway is not configured.", 500);

  const accessResult = await requireGatewayModuleAccess(request, baseEnv, "retina");
  if (accessResult instanceof Response) return accessResult;

  const backendUrls = gradcamBackendUrls();
  if (backendUrls.length === 0) return jsonError("Retina DR Grad-CAM gateway is not configured.", 500);

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

  let lastStatus = 502;
  let lastMessage = "Could not reach Retina DR Grad-CAM backend.";

  for (const backendUrl of backendUrls) {
    try {
      const response = await forwardSignedUpload({
        backendUrl,
        backendPath: "/gradcam",
        file: uploaded,
        fieldName: "image",
        sharedSecret: baseEnv.sharedSecret,
        timeoutMs: DR_GRADCAM_TIMEOUT_MS,
        audit: {
          supabaseUrl: baseEnv.supabaseUrl,
          serviceRoleKey: baseEnv.serviceRoleKey,
          moduleId: "retina",
          userId: accessResult.userId,
          clinicId: accessResult.clinicId,
          route: "/api/ai/retina/dr-gradcam"
        }
      });

      if (response.ok) return response;

      lastStatus = response.status;
      const detail = await response.json().catch(() => null) as { error?: string; detail?: string } | null;
      lastMessage = detail?.error ?? detail?.detail ?? lastMessage;
    } catch {
      lastStatus = 502;
      lastMessage = "Could not reach Retina DR Grad-CAM backend.";
    }
  }

  return jsonError(lastMessage, lastStatus);
}
