/** Reviewed on 2026-10-14 by a read-only query against this exact Development endpoint.
 * IDs must never be reused for another database/environment. No names/categories are heuristics.
 */
const registries: Record<string, readonly string[]> = {
  "ep-purple-pond-b3xujb8o/neondb": ["cmv7kc5eu0003209w9ggzpolq"],
};
export function routingRegistry(databaseUrl: string): {
  verified: boolean;
  excludedIds: readonly string[];
} {
  try {
    const url = new URL(databaseUrl);
    const endpoint = url.hostname.split(".")[0]?.replace(/-pooler$/u, "");
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
