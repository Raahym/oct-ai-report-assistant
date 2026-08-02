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
const BACKEND_URL_ENV_NAMES = ["RETINA_GLAUCOMA_BACKEND_URL"];
const AWS_GLAUCOMA_FALLBACK_URL = "https://16.16.233.198.sslip.io";

function glaucomaBackendUrls() {
  return Array.from(new Set([...configuredGatewayUrls(BACKEND_URL_ENV_NAMES), AWS_GLAUCOMA_FALLBACK_URL]));
}

export async function POST(request: NextRequest) {
  const baseEnv = requiredGatewayBaseEnv();
  if (!baseEnv) return jsonError("Retina glaucoma gateway is not configured.", 500);

  const accessResult = await requireGatewayModuleAccess(request, baseEnv, "retina");
  if (accessResult instanceof Response) return accessResult;

  const backendUrls = glaucomaBackendUrls();
  if (backendUrls.length === 0) return jsonError("Retina glaucoma gateway is not configured.", 500);

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

  for (const backendUrl of backendUrls) {
    try {
      const response = await forwardSignedUpload({
        backendUrl,
        backendPath: "/predict-glaucoma",
        file: uploaded,
        fieldName: "image",
        sharedSecret: baseEnv.sharedSecret,
        audit: {
          supabaseUrl: baseEnv.supabaseUrl,
          serviceRoleKey: baseEnv.serviceRoleKey,
          moduleId: "retina",
          userId: accessResult.userId,
          clinicId: accessResult.clinicId,
          route: "/api/ai/retina/glaucoma"
        }
      });

      if (response.ok) return response;
    } catch {
      // Try the next backend so a suspended Render service does not block AWS.
    }
  }

  return jsonError("Could not reach Retina glaucoma backend.", 502);
}
