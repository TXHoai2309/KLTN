export type QaCleanupGateEnvironment = {
  enabled?: string;
  databaseUrl?: string;
  allowedDatabaseHost?: string;
  allowedDatabaseName?: string;
};

/** Cleanup runs only after an explicit opt-in and an exact database pin. */
export function isQaCleanupEnabled(env: QaCleanupGateEnvironment): boolean {
  if (env.enabled !== "true" || !env.databaseUrl || !env.allowedDatabaseHost || !env.allowedDatabaseName) return false;
  try {
    const target = new URL(env.databaseUrl);
    if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") return false;
    const databaseName = decodeURIComponent(target.pathname.replace(/^\//u, ""));
    if (!databaseName || databaseName.includes("/") || target.hostname.includes("%")) return false;
    return target.hostname.toLowerCase() === env.allowedDatabaseHost.trim().toLowerCase()
      && databaseName === env.allowedDatabaseName.trim();
  } catch {
    return false;
  }
}
