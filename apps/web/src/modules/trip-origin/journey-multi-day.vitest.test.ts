import { afterEach, describe, expect, it, vi } from "vitest";
import { candidate } from "../trip-planner/__fixtures__/planner-fixtures";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { planJourney } from "./journey-planner";
import { createPlannerService } from "../trip-planner/planner-service";
import { createStadiaRoutesProvider, resolveBoundedRoutes, type RouteProvider } from "../trip-planner/planner-routes";
import type { JourneyRoute } from "./journey-route-contract";

const route: JourneyRoute = { status: "VERIFIED", reason: null, durationSeconds: 7200, distanceMeters: 120_000, provider: "STADIA_MAPS" };
const base = tripRequirementInputSchema.parse({ startDate: "2027-01-02", durationDays: 2, transport: "CAR", journey: COMPLETE_JOURNEY_FIXTURE });
const routes: RouteProvider = { route: async pair => ({ ...route, fromDestinationId: pair.from.id, toDestinationId: pair.to.id }), coordinateRoute: async () => route };
afterEach(() => vi.useRealTimers());

describe("multi-day journey route budget and rest", () => {
  it("counts boundaries once and starts interday transfers at the existing 08:00 anchor", async () => {
    const selected = [[candidate("a")], [candidate("b")]];
    const result = await planJourney(base, selected, routes);
    expect(result.journeyPlan.legs.map(leg => [leg.kind, leg.day])).toEqual([["OUTBOUND", 1], ["TRANSFER", 2], ["RETURN", 2]]);
    expect(result.days.map(day => day.stops[0]?.arrivalMinute)).toEqual([480, 600]);
    expect(result.days.map(day => day.travelSeconds)).toEqual([7200, 14_400]);
    expect(result.journeyPlan.totals).toEqual({ drivingSeconds: 21_600, restMinutes: 0, distanceMeters: 360_000 });
    expect(result.check.status).toBe("PASS");
  });
  it("resets driving at the Vietnam day boundary even after a short visit", async () => {
    const selected = [[candidate("a", { suggestedDurationMinutes: 14, minimumDurationMinutes: 14 })], [candidate("b")]];
    const result = await planJourney(base, selected, routes);
    expect(result.journeyPlan.legs[1]?.restMinutes).toBe(0);
    expect(result.days[1]?.stops[0]?.arrivalMinute).toBe(600);
  });
  it("resolves 28 stops plus two origin legs in one 29-pair budget, at most three in flight", async () => {
    let active = 0, maxActive = 0, calls = 0;
    const pending = async () => { calls++; active++; maxActive = Math.max(active, maxActive); await new Promise(done => setTimeout(done, 1)); active--; return { ...route, durationSeconds: 60 }; };
    const provider: RouteProvider = { coordinateRoute: pending, route: async pair => ({ ...await pending(), fromDestinationId: pair.from.id, toDestinationId: pair.to.id }) };
    const selected = Array.from({ length: 14 }, (_, day) => [candidate(`day${day}-a`), candidate(`day${day}-b`)]);
    const result = await planJourney({ ...base, durationDays: 14 }, selected, provider);
    expect(result.journeyPlan.legs).toHaveLength(29); expect(calls).toBe(29); expect(maxActive).toBe(3);
    expect(result.days).toHaveLength(14); expect(selected.flat().map(c => c.id)).toEqual(result.days.flatMap(day => day.stops.map(stop => stop.destination.id)));
    await expect(resolveBoundedRoutes(Array.from({ length: 30 }, (_, i) => i), async n => n, n => n)).rejects.toThrow(/budget/);
  });
  it("fails every unresolved leg under the same deadline and preserves stop/day/mode constraints", async () => {
    vi.useFakeTimers();
    const provider: RouteProvider = { route: () => new Promise(() => undefined), coordinateRoute: () => new Promise(() => undefined) };
    const pending = planJourney(base, [[candidate("a")], [candidate("b")]], provider, 20);
    await vi.advanceTimersByTimeAsync(21); const result = await pending;
    expect(result.journeyPlan.legs.every(leg => leg.route.reason === "TIMEOUT")).toBe(true);
    expect(result.journeyPlan.totals).toEqual({ drivingSeconds: null, restMinutes: null, distanceMeters: null });
    expect(result.check.status).toBe("INSUFFICIENT_DATA");
    expect(result.days.map(day => day.stops.length)).toEqual([1, 1]);
  });
  it.each(["CAR", "MOTORCYCLE"] as const)("uses the actual Stadia server adapter for origin endpoints in %s mode", async transport => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ trip: { summary: { time: 60, length: 1 } } }));
    const provider = createStadiaRoutesProvider({ apiKey: () => "synthetic-secret", fetcher });
    const result = await planJourney({ ...base, transport }, [[candidate("a")], [candidate("b")]], provider);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) expect(JSON.parse(String(init?.body)).costing).toBe(transport === "CAR" ? "auto" : "motorcycle");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).locations[0].lat).toBe(COMPLETE_JOURNEY_FIXTURE.origin!.latitude);
    expect(result.journeyPlan.legs.every(leg => leg.route.status === "VERIFIED")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
  it("returns a complete multi-day proposal through the existing form planner, still not official Save", async () => {
    const planner = createPlannerService({ repository: { candidates: async () => [candidate("a"), candidate("b")], recheck: async () => true }, routes, now: () => new Date("2027-01-01T00:00:00Z") });
    const proposal = await planner.propose("owner", "multi-day-http-contract", base);
    expect(proposal.journeyPlan?.legs).toHaveLength(3);
    expect(proposal.days).toHaveLength(2);
    expect(proposal.eligibleForFinalConfirmation).toBe(true);
    expect(proposal.warnings.some(w => w.code === "LODGING_LEGS_NOT_INCLUDED")).toBe(true);
  });
});
