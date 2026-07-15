import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function requiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

export async function GET(request: NextRequest) {
  const env = requiredEnv();
  if (!env) return jsonError("Profile loading is not configured.", 500);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonError("Missing admin session.", 401);

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return jsonError("Invalid admin session.", 401);

  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("id,role,clinic_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (requesterError) return jsonError("Could not verify profile access.", 500);
  if (!requester) return jsonError("Profile not found.", 404);

  let query = admin.from("profiles").select("*").order("created_at", { ascending: false });
  if (requester.role !== "afio_admin") {
    if (!["hospital_admin", "admin", "doctor", "assistant"].includes(requester.role)) {
      return jsonError("Profile access is not allowed.", 403);
    }
    query = query.eq("clinic_id", requester.clinic_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Profile list failed.", error);
    return jsonError("Could not load profiles.", 500);
  }

  return NextResponse.json({ profiles: data ?? [] });
}
