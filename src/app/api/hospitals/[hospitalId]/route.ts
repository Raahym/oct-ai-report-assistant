import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ModuleId = "oct" | "vkg" | "corneal" | "retina";

const moduleNames: Record<ModuleId, string> = {
  oct: "OCT",
  vkg: "VKG",
  corneal: "Corneal",
  retina: "Retinal Fundus"
};

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function requiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function cleanHospitalCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function sendWelcomeEmail(input: {
  to: string;
  hospitalName: string;
  password: string;
  enabledModules: ModuleId[];
  mode: "created" | "updated";
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "AFIO Platform <reports@cvclinics.online>";
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY is not configured." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cvclinics.online";
  const modules = input.enabledModules.map((moduleId) => moduleNames[moduleId]).join(", ") || "No modules enabled yet";
  const signInUrl = `${appUrl}/login`;
  const subject = input.mode === "created" ? `Welcome to AFIO - ${input.hospitalName}` : `AFIO admin login updated - ${input.hospitalName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2>${input.mode === "created" ? "Welcome to" : "Your login was updated for"} AFIO Clinical Report Platform</h2>
      <p>Your hospital workspace for <strong>${input.hospitalName}</strong> is ready.</p>
      <p>Enabled services: <strong>${modules}</strong></p>
      <p>Sign in here: <a href="${signInUrl}">${signInUrl}</a></p>
      <p><strong>Email:</strong> ${input.to}<br/><strong>Temporary password:</strong> ${input.password}</p>
      <p>Please change this password after your first login.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: input.to, subject, html })
  });

  if (!response.ok) return { sent: false, reason: await response.text() };
  return { sent: true };
}

async function assertBusinessAdmin(request: NextRequest, admin: any) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: jsonError("Missing Business Admin session.", 401) };

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return { error: jsonError("Invalid Business Admin session.", 401) };

  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (requesterError || requester?.role !== "afio_admin") {
    return { error: jsonError("Only AFIO Business Admin can manage hospitals.", 403) };
  }

  return { userId: authData.user.id };
}

async function findAuthUserByEmail(admin: any, email: string) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user: { email?: string | null }) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ hospitalId: string }> }
) {
  const env = requiredEnv();
  if (!env) {
    console.error("Hospital update is missing server environment variables.");
    return jsonError("Server provisioning is not configured. Ask AFIO admin to check deployment settings.", 500);
  }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const requester = await assertBusinessAdmin(request, admin);
  if (requester.error) return requester.error;

  const params = await context.params;
  const hospitalId = params.hospitalId;
  if (!hospitalId) return jsonError("Hospital ID is required.");

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const code = cleanHospitalCode(String(body.code ?? ""));
  const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
  const requestedPassword = String(body.adminPassword ?? "").trim();
  if (!name || !code) return jsonError("Hospital name and code are required.");
  if (adminEmail && !isEmail(adminEmail)) return jsonError("Hospital admin email is invalid.");
  if (requestedPassword && requestedPassword.length < 8) return jsonError("Temporary password must be at least 8 characters.");

  const { data: currentClinic, error: currentClinicError } = await admin
    .from("clinics")
    .select("id, name, admin_email, clinic_modules(module_id,is_enabled)")
    .eq("id", hospitalId)
    .maybeSingle();
  if (currentClinicError) {
    console.error("Could not load hospital before update.", currentClinicError);
    return jsonError("Could not load hospital before update.", 500);
  }
  if (!currentClinic) return jsonError("Hospital not found.", 404);

  const { data: codeOwner, error: codeOwnerError } = await admin
    .from("clinics")
    .select("id")
    .eq("code", code)
    .neq("id", hospitalId)
    .maybeSingle();
  if (codeOwnerError) return jsonError("Could not verify hospital code.", 500);
  if (codeOwner) return jsonError(`Hospital code ${code} is already used.`);

  if (adminEmail) {
    const { data: emailOwner, error: emailOwnerError } = await admin
      .from("clinics")
      .select("id")
      .ilike("admin_email", adminEmail)
      .neq("id", hospitalId)
      .maybeSingle();
    if (emailOwnerError) return jsonError("Could not verify hospital admin email.", 500);
    if (emailOwner) return jsonError("That email is already assigned to another hospital.");
  }

  const { data: hospital, error: hospitalError } = await admin
    .from("clinics")
    .update({ name, code, admin_email: adminEmail || null })
    .eq("id", hospitalId)
    .select("*, clinic_modules(module_id,is_enabled)")
    .single();
  if (hospitalError) {
    console.error("Hospital update failed.", hospitalError);
    return jsonError("Could not update hospital details.", 500);
  }

  const { error: profileClinicNameError } = await admin
    .from("profiles")
    .update({ clinic_name: name })
    .eq("clinic_id", hospitalId);
  if (profileClinicNameError) {
    console.error("Could not update hospital profile names.", profileClinicNameError);
    return jsonError("Hospital saved, but profile names could not be updated.", 500);
  }

  let profile = null;
  let temporaryPassword = "";
  let emailSent = false;
  let emailMessage: string | undefined;
  const previousAdminEmail = String(currentClinic.admin_email ?? "").toLowerCase();
  const { data: existingProfile, error: existingProfileError } = adminEmail
    ? await admin
        .from("profiles")
        .select("*")
        .ilike("email", adminEmail)
        .maybeSingle()
    : { data: null, error: null };
  if (existingProfileError) return jsonError("Could not verify existing admin profile.", 500);
  if (existingProfile && existingProfile.clinic_id && existingProfile.clinic_id !== hospitalId) {
    return jsonError("That email already belongs to another hospital profile.");
  }
  if (existingProfile && existingProfile.role === "afio_admin") {
    return jsonError("Business Admin email cannot be assigned as a hospital admin.");
  }

  const shouldPrepareAdminLogin = Boolean(adminEmail && (adminEmail !== previousAdminEmail || requestedPassword || !existingProfile));

  if (shouldPrepareAdminLogin && adminEmail) {
    try {
      temporaryPassword = requestedPassword || randomPassword();
      const { data: departmentRows, error: departmentsError } = await admin
        .from("departments")
        .select("id,module_id")
        .eq("clinic_id", hospitalId);
      if (departmentsError) {
        console.error("Could not load departments for admin assignment.", departmentsError);
        return jsonError("Could not prepare hospital admin departments.", 500);
      }
      const enabledModules = ((hospital.clinic_modules ?? []) as Array<{ module_id: ModuleId; is_enabled: boolean | null }>)
        .filter((module) => module.is_enabled ?? true)
        .map((module) => module.module_id);
      const defaultDepartment = (departmentRows ?? []).find((department) => department.module_id === (enabledModules[0] ?? "oct")) ?? (departmentRows ?? [])[0];

      let authUser = await findAuthUserByEmail(admin, adminEmail);
      if (authUser) {
        const { data: updatedUser, error: updateUserError } = await admin.auth.admin.updateUserById(authUser.id, {
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            ...(authUser.user_metadata ?? {}),
            full_name: existingProfile?.full_name ?? `${name} Admin`,
            role: "hospital_admin",
            clinic_id: hospitalId,
            clinic_name: name
          }
        });
        if (updateUserError || !updatedUser.user) throw updateUserError ?? new Error("Could not update hospital admin login.");
        authUser = updatedUser.user;
      } else {
        const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
          email: adminEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            full_name: `${name} Admin`,
            role: "hospital_admin",
            clinic_id: hospitalId,
            clinic_name: name
          }
        });
        if (createUserError || !createdUser.user) throw createUserError ?? new Error("Could not create hospital admin login.");
        authUser = createdUser.user;
      }

      const profilePayload = {
        id: authUser.id,
        full_name: existingProfile?.full_name ?? `${name} Admin`,
        email: adminEmail,
        role: "hospital_admin",
        clinic_name: name,
        clinic_id: hospitalId,
        default_department_id: defaultDepartment?.id ?? null,
        is_active: true
      };
      const { data: savedProfile, error: profileError } = await admin
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" })
        .select("*")
        .single();
      if (profileError) throw profileError;
      profile = savedProfile;

      if (previousAdminEmail && previousAdminEmail !== adminEmail) {
        const { data: oldProfiles } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", previousAdminEmail)
          .eq("clinic_id", hospitalId)
          .eq("role", "hospital_admin");
        const oldProfileIds = (oldProfiles ?? []).map((oldProfile: { id: string }) => oldProfile.id).filter((id: string) => id !== authUser.id);
        if (oldProfileIds.length) {
          await admin.from("department_users").delete().in("user_id", oldProfileIds);
          await admin.from("profiles").update({ is_active: false }).in("id", oldProfileIds);
        }
      }

      if (departmentRows?.length) {
        await admin.from("department_users").delete().eq("user_id", authUser.id);
        const enabledDepartments = departmentRows.filter((department) => enabledModules.includes(department.module_id));
        if (enabledDepartments.length) {
          const { error: departmentUsersError } = await admin.from("department_users").insert(
            enabledDepartments.map((department) => ({
              department_id: department.id,
              user_id: authUser.id,
              role: "hospital_admin",
              can_view_all: true
            }))
          );
          if (departmentUsersError) throw departmentUsersError;
        }
      }

      const email = await sendWelcomeEmail({ to: adminEmail, hospitalName: name, password: temporaryPassword, enabledModules, mode: existingProfile ? "updated" : "created" });
      emailSent = email.sent;
      emailMessage = email.sent ? "Welcome email sent." : email.reason;
    } catch (error) {
      console.error("Hospital admin login update failed.", error);
      return jsonError("Hospital details saved, but the admin login could not be prepared.", 500);
    }
  }

  await admin.from("audit_logs").insert({
    user_id: requester.userId,
    action: shouldPrepareAdminLogin ? "Hospital admin login updated" : "Hospital details updated",
    record_type: "hospital",
    record_id: hospitalId,
    details: { message: shouldPrepareAdminLogin ? `${name} admin login prepared for ${adminEmail}` : `${name} details updated` }
  });

  return NextResponse.json({
    hospital,
    profile,
    temporaryPassword,
    emailSent,
    emailMessage
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ hospitalId: string }> }
) {
  const env = requiredEnv();
  if (!env) {
    console.error("Hospital removal is missing server environment variables.");
    return jsonError("Server provisioning is not configured. Ask AFIO admin to check deployment settings.", 500);
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonError("Missing Business Admin session.", 401);

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return jsonError("Invalid Business Admin session.", 401);

  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (requesterError || requester?.role !== "afio_admin") {
    return jsonError("Only AFIO Business Admin can remove hospitals.", 403);
  }

  const params = await context.params;
  const hospitalId = params.hospitalId;
  if (!hospitalId) return jsonError("Hospital ID is required.");

  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .select("id, name")
    .eq("id", hospitalId)
    .maybeSingle();
  if (clinicError) {
    console.error("Could not load hospital before removal.", clinicError);
    return jsonError("Could not load hospital before removal.", 500);
  }
  if (!clinic) return jsonError("Hospital not found.", 404);

  const { data: departmentRows, error: departmentsError } = await admin
    .from("departments")
    .select("id")
    .eq("clinic_id", hospitalId);
  if (departmentsError) {
    console.error("Could not load hospital departments before removal.", departmentsError);
    return jsonError("Could not load hospital departments before removal.", 500);
  }

  const { data: profileRows, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("clinic_id", hospitalId);
  if (profilesError) {
    console.error("Could not load hospital users before removal.", profilesError);
    return jsonError("Could not load hospital users before removal.", 500);
  }

  const departmentIds = (departmentRows ?? []).map((department) => department.id);
  const profileIds = (profileRows ?? []).map((profile) => profile.id);

  try {
    const { data: scanRows, error: scansLoadError } = await admin
      .from("scans")
      .select("id")
      .eq("clinic_id", hospitalId);
    if (scansLoadError) throw scansLoadError;
    const scanIds = (scanRows ?? []).map((scan) => scan.id);

    const { data: reportRows, error: reportsLoadError } = await admin
      .from("reports")
      .select("id")
      .eq("clinic_id", hospitalId);
    if (reportsLoadError) throw reportsLoadError;
    const reportIds = (reportRows ?? []).map((report) => report.id);

    if (scanIds.length > 0) {
      const { error } = await admin.from("ai_results").delete().in("scan_id", scanIds);
      if (error) throw error;
    }
    if (reportIds.length > 0) {
      const { error } = await admin.from("report_versions").delete().in("report_id", reportIds);
      if (error) throw error;
    }
    if (departmentIds.length > 0) {
      const { error } = await admin.from("department_users").delete().in("department_id", departmentIds);
      if (error) throw error;
    }

    const deleteByClinic = async (table: string) => {
      const { error } = await admin.from(table).delete().eq("clinic_id", hospitalId);
      if (error) throw error;
    };

    await deleteByClinic("reports");
    await deleteByClinic("scans");
    await deleteByClinic("patients");
    await deleteByClinic("feedback_entries");
    await deleteByClinic("profiles");
    await deleteByClinic("clinic_modules");
    await deleteByClinic("module_api_keys");
    await deleteByClinic("departments");

    const { error: clinicDeleteError } = await admin.from("clinics").delete().eq("id", hospitalId);
    if (clinicDeleteError) throw clinicDeleteError;

    await Promise.all(profileIds.map((profileId) => admin.auth.admin.deleteUser(profileId).catch(() => undefined)));

    await admin.from("audit_logs").insert({
      user_id: authData.user.id,
      action: "Hospital removed",
      record_type: "hospital",
      record_id: hospitalId,
      details: { message: `${clinic.name} removed with related access records` }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Hospital removal failed.", error);
    return jsonError("Could not fully remove hospital.", 500);
  }
}
