import { NextRequest } from "next/server";
import { createInMemoryRateLimiter, rateLimitKey } from "@/lib/rate-limit";
import { forwardSignedUpload, jsonError, requiredGatewayEnv, requireGatewayModuleAccess, validateGatewayUpload } from "@/lib/ai-gateway";

export const runtime = "nodejs";

const limiter = createInMemoryRateLimiter(10 * 60 * 1000, 20);

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

export async function POST(request: NextRequest) {
  const env = requiredGatewayEnv(["OCT_AI_BACKEND_URL", "OCT_GRADCAM_BACKEND_URL"]);
  if (!env) return jsonError("OCT gateway is not configured.", 500);

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
    return await forwardSignedUpload({
      backendUrl: env.backendUrl,
      backendPath: `/${isGradcam ? "gradcam" : "predict"}`,
      file: uploaded,
      fieldName: "file",
      sharedSecret: env.sharedSecret,
      audit: {
        supabaseUrl: env.supabaseUrl,
        serviceRoleKey: env.serviceRoleKey,
        moduleId: "oct",
        userId: accessResult.userId,
        clinicId: accessResult.clinicId,
        route: "/api/ai/oct"
      }
    });
  } catch {
    return jsonError("Could not reach OCT backend.", 502);
  }
}
