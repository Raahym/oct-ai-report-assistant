import type { BackendPrediction } from "./types";

async function postImagePrediction(file: File, backendUrl: string | undefined, missingMessage: string, fieldName = "file"): Promise<BackendPrediction> {
  if (!backendUrl) {
    throw new Error(missingMessage);
  }

  const formData = new FormData();
  formData.append(fieldName, file);
  const startedAt = performance.now();

  let response: Response;
  try {
    response = await fetch(`${backendUrl}/predict`, {
      method: "POST",
      body: formData
    });
  } catch (error) {
    throw new Error(
      "Could not reach the AI backend. Check your internet connection, Render backend status, or CORS settings."
    );
  }

  if (!response.ok) {
    let detail = "AI prediction failed.";
    try {
      const body = await response.json();
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // Keep the generic message if the backend did not return JSON.
    }
    throw new Error(detail);
  }

  const prediction = (await response.json()) as BackendPrediction;
  return {
    ...prediction,
    request_time_ms: Math.round(performance.now() - startedAt),
  };
}

async function postImageEndpoint(file: File, endpointUrl: string | undefined, missingMessage: string, fieldName = "file"): Promise<BackendPrediction> {
  if (!endpointUrl) {
    throw new Error(missingMessage);
  }

  const formData = new FormData();
  formData.append(fieldName, file);
  const startedAt = performance.now();

  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      body: formData
    });
  } catch {
    throw new Error("Could not reach the AI backend. Check your internet connection, Render backend status, or CORS settings.");
  }

  if (!response.ok) {
    let detail = "AI prediction failed.";
    try {
      const body = await response.json();
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // Keep the generic message if the backend did not return JSON.
    }
    throw new Error(detail);
  }

  const prediction = (await response.json()) as BackendPrediction;
  return {
    ...prediction,
    request_time_ms: Math.round(performance.now() - startedAt),
  };
}

export async function predictOCT(file: File): Promise<BackendPrediction> {
  return postImagePrediction(
    file,
    process.env.NEXT_PUBLIC_AI_BACKEND_URL,
    "NEXT_PUBLIC_AI_BACKEND_URL is missing. Add it to .env.local."
  );
}

export async function predictOCTWithGradcam(file: File): Promise<BackendPrediction> {
  try {
    return await postImageEndpoint(
      file,
      process.env.NEXT_PUBLIC_AI_BACKEND_URL ? `${process.env.NEXT_PUBLIC_AI_BACKEND_URL.replace(/\/$/, "")}/gradcam` : undefined,
      "NEXT_PUBLIC_AI_BACKEND_URL is missing. Add it to .env.local."
    );
  } catch {
    return predictOCT(file);
  }
}

export async function predictCorneal(file: File): Promise<BackendPrediction> {
  return postImagePrediction(
    file,
    process.env.NEXT_PUBLIC_CORNEAL_BACKEND_URL,
    "NEXT_PUBLIC_CORNEAL_BACKEND_URL is missing. Add the Corneal Render service URL."
  );
}

export async function predictVKG(file: File): Promise<BackendPrediction> {
  const vkgBackendUrl = process.env.NEXT_PUBLIC_VKG_BACKEND_URL ?? process.env.NEXT_PUBLIC_CORNEAL_BACKEND_URL;
  if (vkgBackendUrl) {
    return normalizeVkgPrediction(await postImagePrediction(file, vkgBackendUrl, "NEXT_PUBLIC_VKG_BACKEND_URL is missing."));
  }

  throw new Error("VKG trained model backend is not connected. Add NEXT_PUBLIC_VKG_BACKEND_URL or NEXT_PUBLIC_CORNEAL_BACKEND_URL in Vercel before running VKG analysis.");
}

export async function predictRetina(file: File): Promise<BackendPrediction> {
  const retinaBackendUrl = process.env.NEXT_PUBLIC_RETINA_BACKEND_URL?.replace(/\/$/, "");
  if (!retinaBackendUrl) {
    throw new Error("NEXT_PUBLIC_RETINA_BACKEND_URL is missing. Add the Retina Render service URL.");
  }

  const [dr, glaucoma, hypertensiveRetinopathy] = await Promise.all([
    postImageEndpoint(file, `${retinaBackendUrl}/predict`, "Retina diabetic-retinopathy endpoint is missing.", "image"),
    postImageEndpoint(file, `${retinaBackendUrl}/predict-glaucoma`, "Retina glaucoma endpoint is missing.", "image"),
    postImageEndpoint(file, `${retinaBackendUrl}/predict-hr`, "Retina hypertensive-retinopathy endpoint is missing.", "image"),
  ]);

  return normalizeRetinaPrediction(dr, glaucoma as RetinaGlaucomaPrediction, hypertensiveRetinopathy as RetinaHrPrediction);
}

type RetinaGlaucomaPrediction = {
  cdr?: number;
  risk_level?: string;
  risk_detail?: string;
  disc_pixels?: number;
  cup_pixels?: number;
};

type RetinaHrPrediction = {
  hr_detected?: boolean;
  probability?: number;
  risk_level?: string;
  recommendation?: string;
  note?: string;
};

function normalizeRetinaPrediction(prediction: BackendPrediction & {
  predicted_class?: number;
  severity_label?: string;
  scores?: Record<string, number> | number[];
  referral?: string;
  heatmap?: string | null;
  low_confidence?: boolean;
  confidence_warning?: string;
}, glaucoma?: RetinaGlaucomaPrediction, hypertensiveRetinopathy?: RetinaHrPrediction): BackendPrediction {
  const labels = ["NO_DR", "MILD_DR", "MODERATE_DR", "SEVERE_DR", "PROLIFERATIVE_DR"] as const;
  const scoreValues = Array.isArray(prediction.scores)
    ? prediction.scores
    : labels.map((_, index) => Number((prediction.scores as Record<string, number> | undefined)?.[String(index)] ?? 0));
  const predictedClass = labels[prediction.predicted_class ?? 0] ?? "NO_DR";
  const glaucomaSummary = glaucoma
    ? `Glaucoma: ${glaucoma.risk_level ?? "Unknown"}${typeof glaucoma.cdr === "number" ? `, CDR ${glaucoma.cdr}` : ""}`
    : "Glaucoma: not run";
  const hrSummary = hypertensiveRetinopathy
    ? `Hypertensive retinopathy: ${hypertensiveRetinopathy.risk_level ?? (hypertensiveRetinopathy.hr_detected ? "Detected" : "Not detected")}${typeof hypertensiveRetinopathy.probability === "number" ? `, probability ${Math.round(hypertensiveRetinopathy.probability * 100)}%` : ""}`
    : "Hypertensive retinopathy: not run";
  const drSummary = `Diabetic retinopathy: ${prediction.severity_label ?? predictedClass}`;

  return {
    ...prediction,
    prediction: predictedClass,
    confidence: Number(prediction.confidence ?? scoreValues[prediction.predicted_class ?? 0] ?? 0),
    probabilities: {
      NO_DR: scoreValues[0] ?? 0,
      MILD_DR: scoreValues[1] ?? 0,
      MODERATE_DR: scoreValues[2] ?? 0,
      SEVERE_DR: scoreValues[3] ?? 0,
      PROLIFERATIVE_DR: scoreValues[4] ?? 0,
    },
    is_valid_oct: true,
    quality_metrics: {
      ...(prediction.quality_metrics ?? {}),
      glaucoma_cdr: glaucoma?.cdr ?? "",
      glaucoma_risk: glaucoma?.risk_level ?? "",
      glaucoma_detail: glaucoma?.risk_detail ?? "",
      hypertensive_retinopathy_detected: hypertensiveRetinopathy?.hr_detected ?? "",
      hypertensive_retinopathy_probability: hypertensiveRetinopathy?.probability ?? "",
      hypertensive_retinopathy_recommendation: hypertensiveRetinopathy?.recommendation ?? "",
    },
    model_name: "Retina Combined Screening Model",
    model_version: [drSummary, glaucomaSummary, hrSummary].join(" | "),
    gradcam_overlay_base64: prediction.heatmap ?? prediction.gradcam_overlay_base64,
    disclaimer:
      prediction.disclaimer ||
      [drSummary, prediction.referral, glaucomaSummary, glaucoma?.risk_detail, hrSummary, hypertensiveRetinopathy?.recommendation, prediction.confidence_warning]
        .filter(Boolean)
        .join(" | ") ||
      "Fundus AI screening output. Requires clinician review.",
  };
}

function normalizeVkgPrediction(prediction: BackendPrediction): BackendPrediction {
  const rawProbabilities = prediction.probabilities as Record<string, number>;
  const keratoconus = rawProbabilities.keratoconus ?? rawProbabilities.KCN ?? rawProbabilities.KERATOCONUS_RISK ?? 0;
  const normal = rawProbabilities.non_keratoconus ?? rawProbabilities.NORMAL ?? rawProbabilities.NO_KERATOCONUS_RISK ?? 0;
  const suspect = rawProbabilities.SUSPECT ?? Math.max(0, 1 - Math.max(keratoconus, normal));
  const rawPrediction = prediction.prediction as string;
  const isValidVkg = prediction.is_valid_corneal ?? prediction.is_valid_oct ?? true;
  const mappedPrediction = rawPrediction === "KERATOCONUS_RISK"
    ? "KCN"
    : rawPrediction === "NO_KERATOCONUS_RISK"
      ? "NORMAL"
      : prediction.prediction;

  if (mappedPrediction === "NORMAL" || mappedPrediction === "KCN" || mappedPrediction === "SUSPECT") {
    return {
      ...prediction,
      prediction: mappedPrediction,
      probabilities: {
        NORMAL: normal,
        KCN: keratoconus,
        SUSPECT: suspect,
      },
      is_valid_oct: isValidVkg,
      model_name: prediction.model_name || "VKG Keratoconus Screening Model",
      disclaimer: prediction.disclaimer || "VKG/topography AI screening output. Requires clinician review.",
    };
  }

  return {
    ...prediction,
    is_valid_oct: isValidVkg,
  };
}
