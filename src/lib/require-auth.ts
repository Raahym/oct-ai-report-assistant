import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { isOfflineMode } from "@/lib/config";

type AuthEnv = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export type AuthenticatedProfile = Record<string, unknown> & { id: string; is_active?: boolean | null };

export type RequireAuthResult =
  | {
      user: User;
      profile: AuthenticatedProfile;
    }
  | NextResponse;

const OFFLINE_OPERATOR_USER: User = {
  id: "offline_operator",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
  email: "operator@offline.local",
  phone: "",
  role: "authenticated",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const OFFLINE_OPERATOR_PROFILE: AuthenticatedProfile = {
  id: "offline_operator",
  email: "operator@offline.local",
  full_name: "Local Offline Operator",
  role: "afio_admin",
  clinic_id: "hospital_afio_demo",
  is_active: true,
};

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function requiredEnv(): AuthEnv | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function createAdminClient(env: AuthEnv) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function requireAuth(request: NextRequest): Promise<RequireAuthResult> {
  if (isOfflineMode()) {
    return {
      user: OFFLINE_OPERATOR_USER,
      profile: OFFLINE_OPERATOR_PROFILE,
    };
  }

  const env = requiredEnv();
  if (!env) return jsonError("Authentication is not configured.", 500);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonError("Missing authenticated session.", 401);

  const admin = createAdminClient(env);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return jsonError("Invalid authenticated session.", 401);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) return jsonError("Could not verify account access.", 500);
  if (!profile) return jsonError("Profile not found.", 404);
  if (profile.is_active === false) return jsonError("This account is inactive.", 403);

  return {
    user: authData.user,
    profile: profile as AuthenticatedProfile
  };
}
