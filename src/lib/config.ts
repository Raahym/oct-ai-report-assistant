/**
 * Centralized configuration helpers for the application.
 */

/**
 * Determines whether the application is running in offline mode.
 * 
 * Controlled by the `OFFLINE_MODE` or `NEXT_PUBLIC_OFFLINE_MODE` environment variable.
 * Returns `true` when set to "true" or "1" (case-insensitive), otherwise `false`.
 */
export function isOfflineMode(): boolean {
  const envVal = (
    process.env.OFFLINE_MODE ??
    process.env.NEXT_PUBLIC_OFFLINE_MODE ??
    ""
  )
    .trim()
    .toLowerCase();

  return envVal === "true" || envVal === "1";
}
