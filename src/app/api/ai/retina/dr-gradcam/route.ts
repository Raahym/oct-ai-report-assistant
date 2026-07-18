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
const BACKEND_URL_ENV_NAMES = ["RETINA_DR_GRADCAM_BACKEND_URL", "RETINA_GRADCAM_BACKEND_URL"];

export async function POST(request: NextRequest) {
  const baseEnv = requiredGatewayBaseEnv();
  if (!baseEnv) return jsonError("Retina DR Grad-CAM gateway is not configured.", 500);

  const accessResult = await requireGatewayModuleAccess(request, baseEnv, "retina");
  if (accessResult instanceof Response) return accessResult;

  const [backendUrl] = configuredGatewayUrls(BACKEND_URL_ENV_NAMES);
  if (!backendUrl) return jsonError("Retina DR Grad-CAM gateway is not configured.", 500);

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

  try {
    return await forwardSignedUpload({
      backendUrl,
      backendPath: "/gradcam",
      file: uploaded,
      fieldName: "image",
      sharedSecret: baseEnv.sharedSecret
    });
  } catch {
    return jsonError("Could not reach Retina DR Grad-CAM backend.", 502);
  }
}
