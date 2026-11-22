import { describe, expect, it, vi } from "vitest";
import { candidate } from "../trip-planner/__fixtures__/planner-fixtures";
import { createPlannerService } from "../trip-planner/planner-service";
import type { RouteProvider } from "../trip-planner/planner-routes";
import type { JourneyRoute } from "./journey-route-contract";
import { planJourney } from "./journey-planner";
import { selectPlannerDays } from "../trip-planner/planner-engine";
import { isFeaturedDestination } from "../trip-planner/planner-candidates";
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
  it("reuses evidence: re-planning after a drop only requests legs it has not seen", async () => {
    const routes = providers();
    await propose(pool, 3, 420, routes);
    const pairs = routes.route.mock.calls.map(([pair]) => `${pair.from.id}>${pair.to.id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(routes.coordinateRoute.mock.calls.length).toBeLessThanOrEqual(6);
  });
  it("recognises well-known names that start a word with Đ", () => {
    expect(isFeaturedDestination({ name: "Phố cổ Đồng Văn" })).toBe(true);
    expect(isFeaturedDestination({ name: "Đèo Mã Pì Lèng" })).toBe(true);
    expect(isFeaturedDestination({ name: "Di tích Căng Bắc Mê" })).toBe(false);
  });
  it("orders a round trip as a loop instead of doubling back", async () => {
    const stops = [["a", 23.2, 105.0], ["b", 23.2, 105.4], ["c", 22.8, 105.0], ["d", 22.8, 105.4]].map(([id, latitude, longitude]) => candidate(id as string, { latitude: latitude as number, longitude: longitude as number, suggestedDurationMinutes: 30 }));
    const requirement = tripRequirementInputSchema.parse({ ...input(2, 420), journey: { ...input(2, 420).journey, origin: { label: "Hà Nội", latitude: 21, longitude: 105.2, source: "MANUAL", confirmed: true } } });
    const order = selectPlannerDays(requirement, stops).flat().map(stop => stop.id);
    // c and d are the southern pair nearest Hà Nội: they must open and close the loop.
    expect(new Set([order[0], order[3]])).toEqual(new Set(["c", "d"]));
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
  it("keeps well-known stops when trimming and when there are more places than slots", async () => {
    const featured = candidate("lc", { name: "Cột cờ Lũng Cú", latitude: 22.8, longitude: 105 });
    const others = pool.slice(0, 14);
    const result = await propose([...others, featured], 3, 420);
    expect(result.days.flatMap(day => day.stops.map(stop => stop.destination.id))).toContain("lc");
    expect(result.warnings.map(w => w.code)).toContain("JOURNEY_STOPS_REDUCED");
  });
  it("leaves 60 minutes for lunch only between visits", async () => {
    const result = await propose(pool.slice(0, 6), 2, 420, providers(verified(1800)));
    const gaps = result.days.flatMap(day => day.stops.slice(0, -1).map((stop, index) => ({ from: stop.departureMinute!, gap: day.stops[index + 1]!.arrivalMinute! - stop.departureMinute! })));
    expect(gaps.filter(item => item.from >= 690 && item.from <= 840).map(item => item.gap)).toContain(90);
    expect(gaps.filter(item => item.from < 690).every(item => item.gap === 30)).toBe(true);
  });
  it("warns about a long driving day without blocking the plan", async () => {
    const result = await propose(pool.slice(0, 6), 2, 300, providers(verified(30_000)));
    expect(result.warnings.find(w => w.code === "LONG_DRIVING_DAY")?.day).toBe(1);
    expect(result.status).not.toBe("NO_FEASIBLE_ITINERARY");
  });
  it("planJourney alone never removes a stop (Assistant must-visits stay)", async () => {
    const requirement = tripRequirementInputSchema.parse(input(3, 420));
    const selected = [pool.slice(0, 3), pool.slice(3, 6), pool.slice(6, 9)];
    const result = await planJourney(requirement, selected, providers(), undefined, true);
    expect(result.days.flatMap(day => day.stops.map(stop => stop.destination.id))).toEqual(selected.flat().map(stop => stop.id));
  });
});
