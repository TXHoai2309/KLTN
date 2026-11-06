import { describe, expect, it, vi } from "vitest";
import { candidate } from "../trip-planner/__fixtures__/planner-fixtures";
import { createPlannerService } from "../trip-planner/planner-service";
import type { RouteProvider } from "../trip-planner/planner-routes";
import type { JourneyRoute } from "./journey-route-contract";
import { planJourney } from "./journey-planner";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";

const verified = (durationSeconds: number): JourneyRoute => ({ status: "VERIFIED", reason: null, durationSeconds, distanceMeters: 1000, provider: "STADIA_MAPS" });
const providers = (coordinate: JourneyRoute = verified(23_400)) => ({
  route: vi.fn(async (pair: Parameters<RouteProvider["route"]>[0]) => ({ ...verified(1800), fromDestinationId: pair.from.id, toDestinationId: pair.to.id })),
  coordinateRoute: vi.fn(async () => coordinate),
});
const pool = Array.from({ length: 15 }, (_, i) => candidate(`p${i}`, { latitude: 22.8 + i * 0.01, longitude: 105, suggestedDurationMinutes: 90 }));
const input = (durationDays: number, departureMinute: number) => ({ startDate: "2027-01-04", durationDays, transport: "CAR", pace: "MODERATE", journey: { ...COMPLETE_JOURNEY_FIXTURE, departureMinute, returnDeadlineMinute: 1320 } });
const propose = (candidates: typeof pool, durationDays: number, departure: number, routes: RouteProvider = providers()) =>
  createPlannerService({ repository: { candidates: async () => candidates, recheck: async () => true }, routes, now: () => new Date("2026-11-06T00:00:00Z") }).propose("user", "key-12345678", input(durationDays, departure));
const layout = (result: { days: { stops: unknown[] }[] }) => result.days.map(day => day.stops.length);

describe("origin journeys fit the day boundaries and auto-selected stops", () => {
  it("moves day boundaries along the whole chain before dropping anything", async () => {
    const result = await propose(pool.slice(0, 12), 5, 420);
    expect(result.status).toBe("PROPOSAL_READY");
    expect(layout(result).reduce((a, b) => a + b)).toBe(12);
    expect(layout(result)[0]).toBeLessThan(3);
    expect(result.warnings.map(w => w.code)).not.toContain("JOURNEY_STOPS_REDUCED");
  });
  it("drops only as many auto-selected stops as needed and discloses it", async () => {
    const result = await propose(pool, 3, 420);
    expect(result.status).toBe("PROPOSAL_READY");
    expect(layout(result)).toEqual([2, 3, 3]);
    expect(result.warnings.map(w => w.code)).toContain("JOURNEY_STOPS_REDUCED");
    expect(result.eligibleForFinalConfirmation).toBe(true);
  });
  it("uses a travel-only first day for an afternoon departure", async () => {
    const result = await propose(pool, 3, 780);
    expect(result.status).toBe("PROPOSAL_READY");
    expect(result.days[0]?.journeyDayKind).toBe("OUTBOUND_ONLY");
    expect(layout(result)).toEqual([0, 3, 3]);
  });
  it("reuses evidence: trimming only requests the legs that changed", async () => {
    const routes = providers();
    await propose(pool, 3, 420, routes);
    expect(routes.route.mock.calls.length).toBe(8);
    expect(routes.coordinateRoute.mock.calls.length).toBe(3);
  });
  it("does not trim when route evidence is missing", async () => {
    const result = await propose(pool, 3, 420, providers({ status: "INSUFFICIENT_DATA", reason: "UNAVAILABLE", durationSeconds: null, distanceMeters: null, provider: null }));
    expect(layout(result).reduce((a, b) => a + b)).toBe(9);
    expect(result.warnings.map(w => w.code)).not.toContain("JOURNEY_STOPS_REDUCED");
  });
  it("reports a truthful failure when even one stop cannot fit", async () => {
    const result = await propose(pool, 1, 420, providers(verified(50_000)));
    expect(result.status).toBe("NO_FEASIBLE_ITINERARY");
    expect(layout(result)).toEqual([3]);
  });
  it("planJourney alone never removes a stop (Assistant must-visits stay)", async () => {
    const requirement = tripRequirementInputSchema.parse(input(3, 420));
    const selected = [pool.slice(0, 3), pool.slice(3, 6), pool.slice(6, 9)];
    const result = await planJourney(requirement, selected, providers(), undefined, true);
    expect(result.days.flatMap(day => day.stops.map(stop => stop.destination.id))).toEqual(selected.flat().map(stop => stop.id));
  });
});
