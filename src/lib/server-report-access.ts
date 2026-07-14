import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Patient, Report } from "./types";

const ACCESS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export type DbPatientAccess = {
  id: string;
  patient_code: string;
  cnic: string | null;
  access_password_hash: string | null;
  access_password_salt: string | null;
  access_password_set_at: string | null;
  access_failed_attempts: number | null;
  access_locked_until: string | null;
  full_name: string;
  age: number;
  gender: string;
  clinic_id: string | null;
  module_id: string | null;
  created_at: string;
};

export type DbReportAccess = {
  id: string;
  patient_id: string;
  ai_result_id: string | null;
  findings: string;
  impression: string;
  recommendation: string;
  doctor_notes: string | null;
  final_diagnosis: string | null;
  status: Report["status"];
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  clinic_id: string | null;
  module_id: string | null;
};

export type DbAiResultAccess = {
  id: string;
  predicted_class: string;
};

export type DbProfileAccess = {
  id: string;
  full_name: string;
};

function fnv1a(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getLegacyPatientAccessPassword(patient: Pick<DbPatientAccess, "id" | "created_at">) {
  let value = fnv1a(`${patient.id}:${patient.created_at}`);
  let password = "";
  for (let index = 0; index < 7; index += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    password += ACCESS_ALPHABET[value % ACCESS_ALPHABET.length];
  }
  return password;
}

export function cleanAccessId(value: string) {
  return value.trim();
}

export function formatCnic(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : value;
}

export function getPatientAccessId(patient: Pick<DbPatientAccess, "cnic" | "patient_code">) {
  return patient.cnic ? patient.cnic.replace(/\D/g, "") : patient.patient_code;
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return { salt, hash };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function findPatientByAccessId(admin: SupabaseClient, rawAccessId: string) {
  const accessId = cleanAccessId(rawAccessId);
  const cnic = formatCnic(accessId);
  const candidates = await Promise.all([
    admin.from("patients").select("*").eq("patient_code", accessId).limit(1),
    admin.from("patients").select("*").eq("global_patient_key", accessId).limit(1),
    admin.from("patients").select("*").eq("cnic", cnic).limit(1)
  ]);

  const firstError = candidates.find((candidate) => candidate.error)?.error;
  if (firstError) throw firstError;

  const rows = candidates.flatMap((candidate) => candidate.data ?? []) as DbPatientAccess[];
  return rows[0] ?? null;
}

export async function verifyPatientPassword(admin: SupabaseClient, patient: DbPatientAccess, password: string) {
  const lockedUntil = patient.access_locked_until ? new Date(patient.access_locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    return { ok: false, locked: true };
  }

  let ok = false;
  if (patient.access_password_hash && patient.access_password_salt) {
    ok = safeEqual(hashPassword(password, patient.access_password_salt).hash, patient.access_password_hash);
  } else {
    ok = password === getLegacyPatientAccessPassword(patient);
    if (ok) {
      const next = hashPassword(password);
      await admin
        .from("patients")
        .update({
          access_password_hash: next.hash,
          access_password_salt: next.salt,
          access_password_set_at: new Date().toISOString(),
          access_failed_attempts: 0,
          access_locked_until: null
        })
        .eq("id", patient.id);
    }
  }

  if (ok) {
    await admin.from("patients").update({ access_failed_attempts: 0, access_locked_until: null }).eq("id", patient.id);
    return { ok: true, locked: false };
  }

  const attempts = (patient.access_failed_attempts ?? 0) + 1;
  await admin
    .from("patients")
    .update({
      access_failed_attempts: attempts,
      access_locked_until: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null
    })
    .eq("id", patient.id);

  return { ok: false, locked: attempts >= MAX_ATTEMPTS };
}

export function patientSafeReportText(value: string) {
  return value
    .replace(/AI model output/gi, "Clinical result")
    .replace(/AI model/gi, "screening system")
    .replace(/AI-screening features/gi, "screening features")
    .replace(/AI classification/gi, "screening result")
    .replace(/AI-assisted classification suggests/gi, "Doctor-reviewed results show")
    .replace(/based on AI-assisted analysis/gi, "after doctor review")
    .replace(/AI-assisted fundus screening suggests/gi, "Doctor-reviewed fundus screening shows")
    .replace(/AI-assisted VKG screening suggests/gi, "Doctor-reviewed VKG screening shows")
    .replace(/AI-assisted/g, "Doctor-reviewed")
    .replace(/\bAI\b/g, "clinical")
    .replace(/\bConfidence:\s*\d+%/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function patientResult(result?: string | null, fallback?: string | null) {
  return result && result !== "Needs clinical correlation" ? result : fallback && fallback !== "Needs clinical correlation" ? fallback : "-";
}

export async function setPatientPassword(admin: SupabaseClient, patientId: string, password: string) {
  const next = hashPassword(password);
  const { error } = await admin
    .from("patients")
    .update({
      access_password_hash: next.hash,
      access_password_salt: next.salt,
      access_password_set_at: new Date().toISOString(),
      access_failed_attempts: 0,
      access_locked_until: null
    })
    .eq("id", patientId);
  if (error) throw error;
}
