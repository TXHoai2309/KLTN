import type { QaSettings } from "../runtime-config/runtime-config-contract";

export type QaRuntimeGateEnvironment = {
  nodeEnv?: string;
  vercelEnv?: string;
  qaRuntimeEnabled?: string;
  qaPreviewRuntimeEnabled?: string;
  qaProductionRuntimeEnabled?: string;
  qaAbuseProtectionAccepted?: string;
  databaseUrl?: string;
  allowedDatabaseHost?: string;
  allowedDatabaseName?: string;
};

function matchesAllowedDatabase(env: QaRuntimeGateEnvironment): boolean {
  if (!env.databaseUrl || !env.allowedDatabaseHost || !env.allowedDatabaseName) return false;
  try {
    const target = new URL(env.databaseUrl);
    if(target.protocol!=="postgres:"&&target.protocol!=="postgresql:")return false;
    const databaseName = decodeURIComponent(target.pathname.replace(/^\//u, ""));
    return target.hostname.toLowerCase() === env.allowedDatabaseHost.trim().toLowerCase()
      && databaseName === env.allowedDatabaseName.trim();
  } catch {
    return false;
  }
}

/** Public QA stays closed unless an owner explicitly accepts abuse controls,
 * opts in the target environment, and pins its exact database target. */
export function isQaRuntimeEnabled(env: QaRuntimeGateEnvironment): boolean {
  if (env.qaAbuseProtectionAccepted !== "true" || !matchesAllowedDatabase(env)) return false;
  if (env.nodeEnv === "development" && (!env.vercelEnv || env.vercelEnv === "development")) {
    return env.qaRuntimeEnabled === "true";
  }
  if (env.nodeEnv === "production" && env.vercelEnv === "preview") {
    return env.qaPreviewRuntimeEnabled === "true";
  }
  if (env.nodeEnv === "production" && env.vercelEnv === "production") {
    return env.qaProductionRuntimeEnabled === "true";
  }
  return false;
}

export function isConfiguredQaRuntimeEnabled(settings: QaSettings): boolean {
  return isQaRuntimeEnabled({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    qaRuntimeEnabled: String(settings.enabled),
    qaPreviewRuntimeEnabled: String(settings.enabled),
    qaProductionRuntimeEnabled: String(settings.enabled),
    qaAbuseProtectionAccepted: String(settings.abuseProtectionAccepted),
    databaseUrl: process.env.DATABASE_URL,
    allowedDatabaseHost: settings.databaseHost,
    allowedDatabaseName: settings.databaseName,
  });
}
