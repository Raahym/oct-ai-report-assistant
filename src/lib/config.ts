/**
 * Centralized configuration helpers for the application.
 */

let hasWarnedOffline = false;

/**
 * Determines whether the application is running in offline mode.
 * 
 * Controlled exclusively by the `NEXT_PUBLIC_OFFLINE_MODE` environment variable.
 * Returns `true` when set to "true" or "1" (case-insensitive), otherwise `false`.
 */
export function isOfflineMode(): boolean {
  const envVal = (process.env.NEXT_PUBLIC_OFFLINE_MODE ?? "").trim().toLowerCase();
  const isOffline = envVal === "true" || envVal === "1";

  if (isOffline) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const trimmed = supabaseUrl.trim().toLowerCase();
      if (
        trimmed !== "" &&
        trimmed !== "offline.local" &&
        trimmed !== "http://offline.local" &&
        trimmed !== "https://offline.local"
      ) {
        throw new Error(
          "[SECURITY ERROR] Cannot enable offline mode (NEXT_PUBLIC_OFFLINE_MODE=true) while NEXT_PUBLIC_SUPABASE_URL points to a real Supabase project."
        );
      }
    }

    if (!hasWarnedOffline) {
      hasWarnedOffline = true;
      console.warn("[SECURITY WARNING] Offline mode is ACTIVE. Authentication checks are bypassed.");
    }
  }

  return isOffline;
}
