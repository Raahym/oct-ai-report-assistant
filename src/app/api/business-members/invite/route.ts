import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const permissionKeys = ["manage_members", "add_hospitals", "edit_hospitals", "suspend_hospitals", "manage_modules", "delete_hospitals"] as const;
type BusinessPermissionKey = typeof permissionKeys[number];
type BusinessPermissions = Partial<Record<BusinessPermissionKey, boolean>>;

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function requiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function cleanPermissions(value: unknown): BusinessPermissions {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(permissionKeys.map((key) => [key, source[key] === true])) as BusinessPermissions;
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
  if (error || requester?.role !== "afio_admin") return { error: jsonError("Only Business Admin can invite members.", 403) };
  const isOwner = String(requester.email ?? "").toLowerCase() === "raahymm@gmail.com";
  if (!isOwner && requester.business_permissions?.manage_members !== true) {
    return { error: jsonError("Your Business Admin account cannot invite members.", 403) };
  }
  return { userId: authData.user.id };
}

async function sendInviteEmail(input: { to: string; fullName: string; password: string; permissions: BusinessPermissions }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "AFIO Platform <reports@cvclinics.online>";
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY is not configured." };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cvclinics.online";
  const allowed = permissionKeys.filter((key) => input.permissions[key]).map((key) => key.replace(/_/g, " ")).join(", ") || "No actions enabled yet";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2>You have been added to AFIO Business Admin</h2>
      <p>Hello <strong>${input.fullName}</strong>, you can now sign in as an AFIO business member.</p>
      <p>Sign in: <a href="${appUrl}/login">${appUrl}/login</a></p>
      <p><strong>Email:</strong> ${input.to}<br/><strong>Temporary password:</strong> ${input.password}</p>
      <p>Enabled access: <strong>${allowed}</strong></p>
      <p>Please change this password after your first login.</p>
    </div>
  `;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: input.to, subject: "AFIO Business Admin access", html })
  });
  if (!response.ok) return { sent: false, reason: await response.text() };
  return { sent: true };
}

export async function POST(request: NextRequest) {
  const env = requiredEnv();
  if (!env) return jsonError("Business member invites are not configured.", 500);
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const requester = await assertMemberManager(request, admin);
  if (requester.error) return requester.error;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim() || email.split("@")[0];
  const permissions = cleanPermissions(body.permissions);
  const temporaryPassword = randomPassword();
  if (!isEmail(email)) return jsonError("Enter a valid member email.");

  const { data: existingProfile, error: existingProfileError } = await admin
    .from("profiles")
    .select("id,email,role")
    .ilike("email", email)
    .maybeSingle();
  if (existingProfileError) return jsonError("Could not verify existing member.", 500);
  if (existingProfile && existingProfile.role !== "afio_admin") return jsonError("That email already belongs to a clinical user.");

  try {
    let authUser = await findAuthUserByEmail(admin, email);
    if (authUser) {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { ...(authUser.user_metadata ?? {}), full_name: fullName, role: "afio_admin", clinic_name: "AFIO Platform" }
      });
      if (error || !data.user) throw error ?? new Error("Could not update member login.");
      authUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "afio_admin", clinic_name: "AFIO Platform" }
      });
      if (error || !data.user) throw error ?? new Error("Could not create member login.");
      authUser = data.user;
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: authUser.id,
        full_name: fullName,
        email,
        role: "afio_admin",
        clinic_name: "AFIO Platform",
        clinic_id: null,
        business_permissions: permissions,
        is_active: true
      }, { onConflict: "id" })
      .select("*")
      .single();
    if (profileError) throw profileError;

    const emailResult = await sendInviteEmail({ to: email, fullName, password: temporaryPassword, permissions });
    await admin.from("audit_logs").insert({
      user_id: requester.userId,
      action: "Business member invited",
      record_type: "profile",
      record_id: profile.id,
      details: { message: `${email} invited to AFIO Business Admin` }
    });

    return NextResponse.json({
      profile,
      temporaryPassword,
      emailSent: emailResult.sent,
      emailMessage: emailResult.sent ? "Invite email sent." : emailResult.reason
    });
  } catch (error) {
    console.error("Business member invite failed.", error);
    return jsonError("Could not invite business member.", 500);
  }
}
