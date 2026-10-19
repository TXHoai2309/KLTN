/** Development reviewed 2026-10-14; Production identity and complete Destination inventory
 * independently verified read-only on 2026-10-18 (us28-production-registry-evidence).
 * This registry admits a database, not its business data: normal eligibility still applies.
 * IDs must never be reused for another database/environment.
 */
const registries: Record<string, readonly string[]> = {
  "ep-purple-pond-b3xujb8o/neondb": ["cmv7kc5eu0003209w9ggzpolq"],
  "ep-blue-art-b3v3vr4h/neondb": [],
};
export function routingRegistry(databaseUrl: string): {
  verified: boolean;
  excludedIds: readonly string[];
} {
  try {
    const url = new URL(databaseUrl);
    const endpoint = url.hostname.split(".")[0]?.replace(/-pooler$/u, "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash ||
        (url.port && url.port !== "5432") ||
        !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "") ||
        ![`${endpoint}.c-4.ap-southeast-1.aws.neon.tech`, `${endpoint}-pooler.c-4.ap-southeast-1.aws.neon.tech`].includes(url.hostname)) {
      return { verified: false, excludedIds: [] };
    }
    const ids = registries[`${endpoint}${url.pathname}`];
    return { verified: Boolean(ids), excludedIds: ids ?? [] };
  } catch {
    return { verified: false, excludedIds: [] };
  }
}
export function routingCandidateAllowed(
  id: string,
  registry: { verified: boolean; excludedIds: readonly string[] },
) {
  return registry.verified && !registry.excludedIds.includes(id);
}
