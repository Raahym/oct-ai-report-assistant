export const BOOTSTRAP_OWNER_EMAIL = "raahymm@gmail.com";

export type PlatformRole = "owner" | "business_admin" | "support" | "security_auditor";

export async function getPlatformMember(
  admin: any,
  userId: string
): Promise<{ role: PlatformRole | null; isActive: boolean; permissions: Record<string, unknown> }> {
  const { data, error } = await admin
    .from("platform_members")
    .select("role,is_active,permissions")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return { role: null, isActive: false, permissions: {} };
    }
    throw error;
  }

  return {
    role: (data?.role as PlatformRole | undefined) ?? null,
    isActive: data?.is_active === true,
    permissions: data?.permissions && typeof data.permissions === "object" ? data.permissions : {}
  };
}

export async function isPlatformOwner(admin: any, user: { id: string; email?: string | null }) {
  const member = await getPlatformMember(admin, user.id);
  if (member.isActive && member.role === "owner") return true;

  return String(user.email ?? "").toLowerCase() === BOOTSTRAP_OWNER_EMAIL;
}

export async function canManagePlatformMembers(
  admin: any,
  user: { id: string; email?: string | null },
  profilePermissions: Record<string, unknown> | null | undefined
) {
  const member = await getPlatformMember(admin, user.id);
  if (member.isActive && member.role === "owner") return true;
  if (member.isActive && member.permissions.manage_members === true) return true;
  if (String(user.email ?? "").toLowerCase() === BOOTSTRAP_OWNER_EMAIL) return true;
  return profilePermissions?.manage_members === true;
}
