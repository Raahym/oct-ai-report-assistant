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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ profileId: string }> }
) {
  const env = requiredEnv();
  if (!env) {
    console.error("Profile removal is missing server environment variables.");
    return jsonError("Server provisioning is not configured. Ask AFIO admin to check deployment settings.", 500);
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonError("Missing admin session.", 401);

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return jsonError("Invalid admin session.", 401);

  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("id, role, clinic_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (requesterError || !requester) return jsonError("Could not verify admin access.", 403);
  if (!["afio_admin", "hospital_admin", "admin"].includes(requester.role)) {
    return jsonError("Only admins can remove users.", 403);
  }

  const params = await context.params;
  const profileId = params.profileId;
  if (!profileId) return jsonError("Profile ID is required.");
  if (profileId === authData.user.id) return jsonError("You cannot remove your own account while signed in.");

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, role, clinic_id, full_name, email")
    .eq("id", profileId)
    .maybeSingle();
  if (targetError) return jsonError("Could not load the user before removal.", 500);
  if (!target) return jsonError("User not found.", 404);
  if (target.role === "afio_admin") return jsonError("Business Admin owner cannot be removed from this screen.", 403);
  if (requester.role !== "afio_admin" && target.clinic_id !== requester.clinic_id) {
    return jsonError("Hospital admins can only remove users from their own hospital.", 403);
  }

  try {
    const nullByProfile = async (table: string, column: string) => {
      const { error } = await admin.from(table).update({ [column]: null }).eq(column, profileId);
      if (error) throw error;
    };

    const deleteByProfile = async (table: string, column: string) => {
      const { error } = await admin.from(table).delete().eq(column, profileId);
      if (error) throw error;
    };

    await deleteByProfile("department_users", "user_id");
    await nullByProfile("patients", "created_by");
    await nullByProfile("scans", "uploaded_by");
    await nullByProfile("reports", "approved_by");
    await nullByProfile("reports", "created_by");
    await nullByProfile("report_versions", "edited_by");
    await nullByProfile("report_templates", "updated_by");
    await nullByProfile("audit_logs", "user_id");

    const { data: clinics } = await admin.from("clinics").select("id, admin_email").ilike("admin_email", target.email);
    if (clinics?.length) {
      const { error } = await admin.from("clinics").update({ admin_email: null }).in("id", clinics.map((clinic: { id: string }) => clinic.id));
      if (error) throw error;
    }

    await admin.from("audit_logs").insert({
      user_id: authData.user.id,
      action: "User removed",
      record_type: "profile",
      record_id: profileId,
      details: { message: `${target.full_name || target.email} removed from user access` }
    });

    const { error: profileError } = await admin.from("profiles").delete().eq("id", profileId);
    if (profileError) throw profileError;

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(profileId);
    if (authDeleteError && !/not found|does not exist|user.*not/i.test(authDeleteError.message)) throw authDeleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Profile removal failed.", error);
    return jsonError("Could not remove user.", 500);
  }
}
