import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const permissionKeys = ["manage_members", "add_hospitals", "edit_hospitals", "suspend_hospitals", "manage_modules", "delete_hospitals"] as const;

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function requiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function cleanPermissions(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(permissionKeys.map((key) => [key, source[key] === true]));
}

async function assertMemberManager(request: NextRequest, admin: any) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: jsonError("Missing Business Admin session.", 401) };
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return { error: jsonError("Invalid Business Admin session.", 401) };
  const { data: requester, error } = await admin
    .from("profiles")
    .select("id,email,role,business_permissions")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error || requester?.role !== "afio_admin") return { error: jsonError("Only Business Admin can manage members.", 403) };
  const isOwner = String(requester.email ?? "").toLowerCase() === "raahymm@gmail.com";
  if (!isOwner && requester.business_permissions?.manage_members !== true) {
    return { error: jsonError("Your Business Admin account cannot manage members.", 403) };
  }
  return { userId: authData.user.id };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ profileId: string }> }
) {
  const env = requiredEnv();
  if (!env) return jsonError("Business member management is not configured.", 500);
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const requester = await assertMemberManager(request, admin);
  if (requester.error) return requester.error;

  const { profileId } = await context.params;
  if (!profileId) return jsonError("Profile ID is required.");
  const body = await request.json().catch(() => ({}));
  const permissions = cleanPermissions(body.permissions);

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id,email,role")
    .eq("id", profileId)
    .maybeSingle();
  if (targetError || !target) return jsonError("Business member not found.", 404);
  if (target.role !== "afio_admin") return jsonError("Only AFIO business members can receive business permissions.");
  if (String(target.email ?? "").toLowerCase() === "raahymm@gmail.com") return jsonError("Owner permissions cannot be changed.", 403);

  const { data: profile, error } = await admin
    .from("profiles")
    .update({ business_permissions: permissions })
    .eq("id", profileId)
    .select("*")
    .single();
  if (error) {
    console.error("Business member permission update failed.", error);
    return jsonError("Could not update business member permissions.", 500);
  }

  await admin.from("audit_logs").insert({
    user_id: requester.userId,
    action: "Business member permissions updated",
    record_type: "profile",
    record_id: profileId,
    details: { message: `${target.email} permissions updated` }
  });

  return NextResponse.json({ profile });
}
