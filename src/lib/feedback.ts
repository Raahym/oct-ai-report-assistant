"use client";

import type { FeedbackEntry, FeedbackResponse } from "./types";
import { supabase } from "./supabase";

const FEEDBACK_KEY = "oct-ai-report-assistant-feedback-v1";
let cachedFeedbackEntries: FeedbackEntry[] | null = null;

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return body.detail || body.message || fallback;
  } catch {
    return fallback;
  }
}

function readEntries(): FeedbackEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(FEEDBACK_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as FeedbackEntry[];
  } catch {
    return [];
  }
}

type DbFeedbackMessage = {
  id: string;
  responder_name: string;
  message: string;
  created_at: string;
};

type DbFeedbackEntry = {
  id: string;
  type: "feedback" | "complaint";
  status: FeedbackEntry["status"];
  clinic_id: string | null;
  hospital_name: string | null;
  module_id: FeedbackEntry["moduleId"] | null;
  name: string;
  email: string | null;
  phone: string | null;
  patient_code: string | null;
  report_id: string | null;
  message: string;
  created_at: string;
  feedback_messages?: DbFeedbackMessage[];
};

function mapFeedbackEntry(row: DbFeedbackEntry): FeedbackEntry {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    clinicId: row.clinic_id ?? undefined,
    hospitalName: row.hospital_name ?? undefined,
    moduleId: row.module_id ?? undefined,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    patientCode: row.patient_code ?? undefined,
    reportId: row.report_id ?? undefined,
    message: row.message,
    createdAt: row.created_at,
    responses: (row.feedback_messages ?? []).map((message) => ({
      id: message.id,
      responderName: message.responder_name,
      message: message.message,
      createdAt: message.created_at
    }))
  };
}

export async function getFeedbackEntries() {
  if (supabase) {
    const { data, error } = await supabase
      .from("feedback_entries")
      .select("*, feedback_messages(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    cachedFeedbackEntries = ((data ?? []) as DbFeedbackEntry[]).map(mapFeedbackEntry);
    return cachedFeedbackEntries;
  }

  cachedFeedbackEntries = cachedFeedbackEntries ?? readEntries();
  return cachedFeedbackEntries;
}

export function getCachedFeedbackEntries() {
  cachedFeedbackEntries = cachedFeedbackEntries ?? readEntries();
  return cachedFeedbackEntries;
}

export async function submitFeedback(input: Omit<FeedbackEntry, "id" | "status" | "createdAt">) {
  try {
    const response = await fetch("/api/public/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: input.type,
        clinic_id: input.clinicId || null,
        hospital_name: input.hospitalName || null,
        module_id: input.moduleId || null,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        patient_code: input.patientCode || null,
        report_id: input.reportId || null,
        message: input.message
      })
    });
    if (!response.ok) throw new Error(await readError(response, "Could not submit feedback."));
    const body = await response.json();
    cachedFeedbackEntries = null;
    return body.entry as FeedbackEntry;
  } catch (error) {
    throw error;
  }
}

export async function updateFeedbackStatus(id: string, status: FeedbackEntry["status"]) {
  if (supabase) {
    const { error } = await supabase
      .from("feedback_entries")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return getFeedbackEntries();
  }

  throw new Error("Feedback admin updates require Supabase configuration.");
}

export async function addFeedbackResponse(id: string, input: Omit<FeedbackResponse, "id" | "createdAt">) {
  if (supabase) {
    const { error } = await supabase.from("feedback_messages").insert({
      feedback_id: id,
      responder_name: input.responderName,
      message: input.message
    });
    if (error) throw new Error(error.message);
    return getFeedbackEntries();
  }

  throw new Error("Feedback responses require Supabase configuration.");
}
