import type { DiseaseClass } from "./types";

export const safetyDisclaimer =
  "AI-assisted preliminary result. Requires doctor review.";

export const finalReportDisclaimer =
  "This report was generated with AI assistance and reviewed by a qualified clinician. The AI output is not a standalone diagnosis.";

export type ReportTemplate = {
  findings: string;
  impression: string;
  recommendation: string;
};

export const reportTemplates: Record<
  DiseaseClass,
  ReportTemplate
> = {
  NORMAL: {
    findings:
      "The OCT image does not show obvious abnormal features based on AI-assisted analysis.",
    impression: "AI-assisted classification suggests a normal OCT pattern.",
    recommendation:
      "Routine clinical review is advised if symptoms persist or if clinical suspicion remains."
  },
  CNV: {
    findings:
      "The OCT image shows features suggestive of choroidal neovascularization.",
    impression:
      "AI-assisted classification suggests CNV. This may require retinal specialist review.",
    recommendation:
      "Ophthalmologist confirmation and further retinal evaluation are advised."
  },
  DME: {
    findings:
      "The OCT image shows features suggestive of diabetic macular edema.",
    impression:
      "AI-assisted classification suggests DME. Clinical correlation with diabetic history is recommended.",
    recommendation:
      "Ophthalmologist review and correlation with patient history, visual acuity, and fundus examination are advised."
  },
  DRUSEN: {
    findings:
      "The OCT image shows features suggestive of drusen-related retinal changes.",
    impression:
      "AI-assisted classification suggests DRUSEN. This may be associated with age-related macular changes.",
    recommendation:
      "Further ophthalmic evaluation and monitoring may be considered."
  }
};

const TEMPLATE_STORAGE_KEY = "oct-ai-report-assistant-report-templates-v1";

export function getReportTemplates() {
  if (typeof window === "undefined") return reportTemplates;
  const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!raw) return reportTemplates;
  try {
    return { ...reportTemplates, ...(JSON.parse(raw) as Partial<Record<DiseaseClass, ReportTemplate>>) };
  } catch {
    return reportTemplates;
  }
}

export function saveReportTemplates(templates: Record<DiseaseClass, ReportTemplate>) {
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}
