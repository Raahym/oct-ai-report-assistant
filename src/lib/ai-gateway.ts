import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { buildSignedRequestHeaders } from "@/lib/request-signing";

export type GatewayEnv = {
  backendUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  sharedSecret: string;
};

export type GatewayBaseEnv = {
  supabaseUrl: string;
  serviceRoleKey: string;
  sharedSecret: string;
};

export type GatewayAuthResult =
  | {
      userId: string;
      clinicId: string | null;
      role: string | null;
    }
  | NextResponse;

export const MAX_GATEWAY_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const GATEWAY_ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_SAFE_RESPONSE_HEADERS = new Set(["content-type"]);

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function requiredGatewayEnv(backendUrlEnvNames: string[]) {
  const backendUrl = backendUrlEnvNames.map((name) => process.env[name]?.replace(/\/$/, "")).find(Boolean);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sharedSecret = process.env.AI_GATEWAY_SHARED_SECRET;
  if (!backendUrl || !supabaseUrl || !serviceRoleKey || !sharedSecret) return null;
  return { backendUrl, supabaseUrl, serviceRoleKey, sharedSecret } satisfies GatewayEnv;
}

export function requiredGatewayBaseEnv(): GatewayBaseEnv | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sharedSecret = process.env.AI_GATEWAY_SHARED_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !sharedSecret) return null;
  return { supabaseUrl, serviceRoleKey, sharedSecret };
}

export function configuredGatewayUrls(backendUrlEnvNames: string[]) {
  return Array.from(
    new Set(
      backendUrlEnvNames
        .map((name) => process.env[name]?.replace(/\/$/, ""))
        .filter((value): value is string => Boolean(value))
    )
  );
}

export async function requireGatewayModuleAccess(
  request: NextRequest,
  env: Pick<GatewayEnv, "supabaseUrl" | "serviceRoleKey">,
  moduleId: string
): Promise<GatewayAuthResult> {
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  if (authResult.profile.role === "afio_admin") {
    return {
      userId: authResult.user.id,
      clinicId: typeof authResult.profile.clinic_id === "string" ? authResult.profile.clinic_id : null,
      role: typeof authResult.profile.role === "string" ? authResult.profile.role : null
    };
  }

  const clinicId = String(authResult.profile.clinic_id ?? "");
  if (!clinicId) {
    return jsonError("You are not authorized to use this module.", 403);
  }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const entitlementResult = await verifyCommercialEntitlement(admin, clinicId, moduleId);
  if (entitlementResult !== undefined) {
    if (entitlementResult) return entitlementResult;
    return {
      userId: authResult.user.id,
      clinicId,
      role: typeof authResult.profile.role === "string" ? authResult.profile.role : null
    };
  }

  const { data, error } = await admin
    .from("clinic_modules")
    .select("module_id,is_enabled")
    .eq("clinic_id", clinicId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (error) return jsonError(`Could not verify ${moduleId} module access.`, 500);
  if (!data || data.is_enabled === false) return jsonError("You are not authorized to use this module.", 403);

  return {
    userId: authResult.user.id,
    clinicId,
    role: typeof authResult.profile.role === "string" ? authResult.profile.role : null
  };
}

async function verifyCommercialEntitlement(
  admin: ReturnType<typeof createClient<any>>,
  clinicId: string,
  moduleId: string
): Promise<NextResponse | null | undefined> {
  const { data, error } = (await admin
    .from("clinic_module_entitlements")
    .select("status,expires_at,monthly_scan_quota,monthly_scan_count")
    .eq("clinic_id", clinicId)
    .eq("module_id", moduleId)
    .maybeSingle()) as {
    data: {
      status?: string | null;
      expires_at?: string | null;
      monthly_scan_quota?: number | null;
      monthly_scan_count?: number | null;
    } | null;
    error: { message?: string } | null;
  };

  if (error) {
    const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
    if (message.includes("does not exist") || message.includes("schema cache")) return undefined;
    return jsonError(`Could not verify ${moduleId} commercial entitlement.`, 500);
  }
  if (!data) return undefined;

  if (!["active", "trial"].includes(String(data.status))) {
    return jsonError("This module is not active for your hospital.", 403);
  }

  if (data.expires_at && new Date(String(data.expires_at)).getTime() < Date.now()) {
    return jsonError("This module subscription has expired.", 403);
  }

  const quota = data.monthly_scan_quota == null ? null : Number(data.monthly_scan_quota);
  const used = Number(data.monthly_scan_count ?? 0);
  if (quota !== null && Number.isFinite(quota) && quota >= 0 && used >= quota) {
    return jsonError("This module monthly scan quota has been reached.", 429);
  }

  return null;
}

function hasAllowedImageSignature(bytes: Uint8Array, contentType: string) {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (contentType === "image/png" && isPng) || (contentType === "image/jpeg" && isJpeg);
}

export async function validateGatewayUpload(file: File) {
  if (!GATEWAY_ALLOWED_CONTENT_TYPES.has(file.type)) {
    return jsonError("Only JPG, JPEG, and PNG images are supported.", 400);
  }
  if (file.size <= 0 || file.size > MAX_GATEWAY_UPLOAD_SIZE_BYTES) {
    return jsonError("Uploaded image is too large.", 413);
  }
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasAllowedImageSignature(signature, file.type)) {
    return jsonError("Uploaded file content does not match a supported image type.", 400);
  }
  return null;
}

export async function forwardSignedUpload(input: {
  backendUrl: string;
  backendPath: string;
  file: File;
  fieldName?: string;
  sharedSecret: string;
  extraHeaders?: Record<string, string>;
  audit?: {
    supabaseUrl: string;
    serviceRoleKey: string;
    moduleId: string;
    userId: string;
    clinicId: string | null;
    route: string;
  };
}) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const payload = Buffer.from(await input.file.arrayBuffer()).toString("base64");
  const signedHeaders = buildSignedRequestHeaders(payload, input.sharedSecret, {
    signatureHeader: "X-AFIO-Signature",
    timestampHeader: "X-AFIO-Timestamp",
    requestId
  });

  const forward = new FormData();
  forward.append(input.fieldName ?? "file", input.file, input.file.name || "image.jpg");

  const response = await fetch(`${input.backendUrl}${input.backendPath}`, {
    method: "POST",
    headers: {
      ...signedHeaders,
      ...(input.extraHeaders ?? {})
    },
    body: forward
  });
  await recordGatewayRequest(input.audit, {
    requestId,
    backendPath: input.backendPath,
    statusCode: response.status,
    durationMs: Date.now() - startedAt,
    fileSizeBytes: input.file.size,
    contentType: input.file.type
  });
  if (response.ok) {
    await incrementEntitlementUsage(input.audit);
  }

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (MAX_SAFE_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });
  responseHeaders.set("Cache-Control", "no-store, max-age=0");
  responseHeaders.set("X-AFIO-Request-Id", requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

async function incrementEntitlementUsage(
  audit:
    | {
        supabaseUrl: string;
        serviceRoleKey: string;
        moduleId: string;
        userId: string;
        clinicId: string | null;
        route: string;
      }
    | undefined
) {
  if (!audit?.clinicId) return;

  try {
    const admin = createClient(audit.supabaseUrl, audit.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error } = await admin.rpc("increment_clinic_module_scan_usage", {
      target_clinic_id: audit.clinicId,
      target_module_id: audit.moduleId
    });
    if (!error) return;

    const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
    if (!message.includes("could not find the function") && !message.includes("schema cache")) return;

    const { data } = await admin
      .from("clinic_module_entitlements")
      .select("monthly_scan_count")
      .eq("clinic_id", audit.clinicId)
      .eq("module_id", audit.moduleId)
      .maybeSingle();
    if (!data) return;

    const currentCount = Number(data.monthly_scan_count ?? 0);
    await admin
      .from("clinic_module_entitlements")
      .update({ monthly_scan_count: currentCount + 1 })
      .eq("clinic_id", audit.clinicId)
      .eq("module_id", audit.moduleId);
  } catch {
    // Quota accounting should be monitored, but it must not turn a successful model response into a failed clinical request.
  }
}

async function recordGatewayRequest(
  audit:
    | {
        supabaseUrl: string;
        serviceRoleKey: string;
        moduleId: string;
        userId: string;
        clinicId: string | null;
        route: string;
      }
    | undefined,
  event: {
    requestId: string;
    backendPath: string;
    statusCode: number;
    durationMs: number;
    fileSizeBytes: number;
    contentType: string;
  }
) {
  if (!audit) return;

  try {
    const admin = createClient(audit.supabaseUrl, audit.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    await admin.from("ai_gateway_requests").insert({
      request_id: event.requestId,
      clinic_id: audit.clinicId,
      user_id: audit.userId,
      module_id: audit.moduleId,
      route: audit.route,
      backend_path: event.backendPath,
      status_code: event.statusCode,
      duration_ms: event.durationMs,
      file_size_bytes: event.fileSizeBytes,
      content_type: event.contentType
    });
  } catch {
    // Gateway audit must never break clinical inference. Missing migrations are caught during deployment checks.
  }
}
