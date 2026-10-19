import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { routingRegistry } from "../destination/destination-routing-registry";
import { retrievePlannerCandidates, retrievePlannerCandidateInventory } from "./planner-candidates";
import { registeredPlannerPropose } from "./planner-registry";
import { createPlannerService } from "./planner-service";
import { candidate, fakeRoutes, referenceTime, requirement } from "./__fixtures__/planner-fixtures";
import { requestTripProposal } from "@/lib/trip-planner-client";
import { plannerResponse } from "./planner-http";
import type { AuthorizationDependencies } from "@/server/authorization/guard";

const production = "postgresql://test:test@ep-blue-art-b3v3vr4h-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
function setup(rows: ReturnType<typeof candidate>[], url = production) {
  const registry = routingRegistry(url);
  const findMany = vi.fn(async () => rows.map(row => ({ ...row, shortDescription: null, media: [], contentRevision: 1, updatedAt: referenceTime })));
  const db = { destination: { findMany } } as unknown as Database;
  const route = vi.fn(fakeRoutes.route);
  const service = createPlannerService({ repository: { candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds), inventory: () => retrievePlannerCandidateInventory(db, undefined, registry.excludedIds), recheck: async () => true }, routes: { route }, now: () => referenceTime });
  return { findMany, route, propose: registeredPlannerPropose(registry, service.propose) };
}
describe("Production registry is a configuration boundary, not business approval", () => {
  it("Production reads eligible mock records, excluding hidden/invalid coordinates without bypassing validation", async () => {
    const s = setup([candidate("a"), candidate("bb"), candidate("hidden", { visibility: "HIDDEN" }), candidate("bad", { latitude: 91 })]);
    const result = await s.propose("traveler", "production-valid", { ...requirement, durationDays: 1 });
    expect(s.findMany).toHaveBeenCalledOnce();
    expect(result.status).toBe("PROPOSAL_READY");
    expect(result.days.flatMap(d => d.stops.map(stop => stop.destination.id))).toEqual(["a", "bb"]);
    expect(result.checks.every(c => c.status === "PASS")).toBe(true);
  });
  it.each(["unknown", production.replace("ep-blue-art-b3v3vr4h", "ep-not-reviewed")])("rejects unsupported configuration before database/provider work", async url => {
    const s = setup([candidate("a")], url);
    await expect(s.propose("traveler", "unknown-registry", requirement)).rejects.toMatchObject({ code: "PLANNER_NOT_CONFIGURED", status: 503 });
    expect(s.findMany).not.toHaveBeenCalled(); expect(s.route).not.toHaveBeenCalled();
  });
  it("existing public destinations with missing duration are distinct from an empty database", async () => {
    const missing = await setup([candidate("a", { minimumDurationMinutes: null, suggestedDurationMinutes: null })]).propose("u", "missing-duration", requirement);
    const empty = await setup([]).propose("u", "empty-database", requirement);
    expect(missing.status).toBe("INSUFFICIENT_DATA");
    expect(missing.reasonCodes).toContain("NO_SCHEDULABLE_CANDIDATES");
    expect(missing.reasonCodes).not.toContain("NO_PUBLIC_DESTINATIONS");
    expect(missing.days.flatMap(d => d.stops)).toHaveLength(0);
    expect(missing.warnings.map(w => w.code)).toContain("MISSING_VISIT_DURATION");
    expect(empty.reasonCodes).toContain("NO_PUBLIC_DESTINATIONS");
  });
  it("invalid coordinates and registry exclusions are not misreported as an empty database", async () => {
    const invalid = await setup([candidate("invalid", { longitude: 181 })]).propose("u", "invalid-coordinates", requirement);
    expect(invalid.reasonCodes).toContain("INVALID_DESTINATION_COORDINATES");
    expect(invalid.reasonCodes).not.toContain("NO_PUBLIC_DESTINATIONS");
    const dev = production.replace("ep-blue-art-b3v3vr4h", "ep-purple-pond-b3xujb8o");
    const excluded = await setup([candidate("cmv7kc5eu0003209w9ggzpolq")], dev).propose("u", "registry-excluded", requirement);
    expect(excluded.reasonCodes).toContain("REGISTRY_EXCLUDES_CANDIDATES");
    expect(excluded.days.flatMap(d => d.stops)).toHaveLength(0);
  });
  it("missing opening hours never become OPEN or final-confirmable", async () => {
    const s = setup([candidate("a", { openingDays: [] })]);
    const result = await s.propose("u", "unknown-hours", requirement);
    expect(result.days.flatMap(d => d.stops)).toHaveLength(1);
    expect(result.status).toBe("INSUFFICIENT_DATA"); expect(result.eligibleForFinalConfirmation).toBe(false);
    expect(result.checks.find(c => c.key === "OPENING_HOURS")?.status).toBe("INSUFFICIENT_DATA");
    expect(s.route).not.toHaveBeenCalled();
  });
  it("client distinguishes safe configuration feedback without exposing server details", async () => {
    const result = await requestTripProposal(requirement, "config-error", new AbortController().signal,
      async () => Response.json({ success: false, error: { code: "PLANNER_NOT_CONFIGURED", message: "secret URL must not be reflected" } }, { status: 503 }));
    expect(result).toMatchObject({ ok: false, code: "PLANNER_NOT_CONFIGURED", ambiguous: false });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("HTTP returns a safe configuration error to an authorized principal, and checks persisted auth first", async () => {
    for (const role of [null, "TRAVELER", "ADMIN"] as const) {
      const s = setup([candidate("a")], "unknown");
      const authorization = { resolveSession: async () => role ? { user: { id: "user", role } } : null,
        database: { user: { findUnique: async () => role ? { id: "user", role, status: "ACTIVE" } : null } } } as unknown as AuthorizationDependencies;
      const request = new Request("https://app.example/api/trip-proposals", { method: "POST", headers: { origin: "https://app.example", "content-type": "application/json", "Idempotency-Key": "unknown-registry" }, body: JSON.stringify({ requirement }) });
      const response = await plannerResponse(request, { authorization, propose: s.propose });
      expect(response.status).toBe(role ? 503 : 401);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      if (role) expect((await response.json()).error.code).toBe("PLANNER_NOT_CONFIGURED");
      expect(s.findMany).not.toHaveBeenCalled(); expect(s.route).not.toHaveBeenCalled();
    }
  });
});
