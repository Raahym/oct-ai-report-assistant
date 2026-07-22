import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_HEALTH_ENDPOINTS = [
  "https://oct-ai-backend.onrender.com/health",
  "https://afio-oct-gradcam-backend.onrender.com/health",
  "https://afio-corneal-ai-backend.onrender.com/health",
  "https://afio-corneal-resnet-backend.onrender.com/health",
  "https://afio-corneal-densenet-backend.onrender.com/health",
  "https://afio-corneal-efficientnet-backend.onrender.com/health",
  "https://afio-corneal-ulcer-backend.onrender.com/health",
  "https://afio-retina-dr-backend.onrender.com/health",
  "https://afio-retina-hr-backend.onrender.com/health",
  "https://13.48.31.108.sslip.io/health",
  "https://16.16.104.107.sslip.io/health",
  "https://16.16.233.198.sslip.io/health"
];

function configuredHealthEndpoints() {
  const envUrls = [
    process.env.OCT_AI_BACKEND_URL,
    process.env.OCT_GRADCAM_BACKEND_URL,
    process.env.CORNEAL_AI_BACKEND_URL,
    process.env.CORNEAL_ULCER_BACKEND_URL,
    process.env.RETINA_DR_BACKEND_URL,
    process.env.RETINA_HR_BACKEND_URL,
    process.env.RETINA_GLAUCOMA_BACKEND_URL,
    process.env.RETINA_DR_GRADCAM_BACKEND_URL
  ];

  return Array.from(
    new Set(
      [...envUrls, ...FALLBACK_HEALTH_ENDPOINTS]
        .filter((url): url is string => Boolean(url))
        .map((url) => {
          const cleanUrl = url.replace(/\/$/, "");
          return cleanUrl.endsWith("/health") ? cleanUrl : `${cleanUrl}/health`;
        })
    )
  );
}

async function pingHealth(url: string) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });
    return { url, ok: response.ok, status: response.status, durationMs: Date.now() - startedAt };
  } catch {
    return { url, ok: false, status: 0, durationMs: Date.now() - startedAt };
  }
}

export async function GET() {
  const results = await Promise.all(configuredHealthEndpoints().map(pingHealth));
  return NextResponse.json(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      ready: results.filter((result) => result.ok).length,
      total: results.length,
      results
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
