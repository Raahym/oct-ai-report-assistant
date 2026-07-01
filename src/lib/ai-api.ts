import type { BackendPrediction } from "./types";

export async function predictOCT(file: File): Promise<BackendPrediction> {
  const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL;

  if (!backendUrl) {
    throw new Error("NEXT_PUBLIC_AI_BACKEND_URL is missing. Add it to .env.local.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${backendUrl}/predict`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    let detail = "AI prediction failed.";
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // Keep the generic message if the backend did not return JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}
