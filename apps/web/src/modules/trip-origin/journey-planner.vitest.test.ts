import { describe, expect, it, vi, afterEach } from "vitest";
import { createPlannerService } from "../trip-planner/planner-service";
import { candidate } from "../trip-planner/__fixtures__/planner-fixtures";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { planJourney, validateJourneyTiming } from "./journey-planner";
import { driveWithRest } from "./rest-policy";
import type { JourneyRoute } from "./journey-route-contract";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { plannerResponse } from "../trip-planner/planner-http";
import type { Database } from "@KLTN/db";
import { syntheticJourneyProposal, syntheticMissingJourneyProposal } from "./journey-planning-fixtures";

const now = new Date("2027-01-01T00:00:00Z");
const base = tripRequirementInputSchema.parse({ startDate: "2027-01-02", durationDays: 1, transport: "CAR", journey: COMPLETE_JOURNEY_FIXTURE });
const verified = (seconds: number): JourneyRoute => ({ status: "VERIFIED", durationSeconds: seconds, distanceMeters: 1000, provider: "STADIA_MAPS", reason: null });
function provider(outbound: number, returning = outbound, transfer = 0): RouteProvider {
  let boundary = 0;
  return { route: async pair => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified(transfer) }), coordinateRoute: async () => verified(boundary++ === 0 ? outbound : returning) };
}
function service(routes: RouteProvider, minutes = 60) {
  return createPlannerService({ repository: { candidates: async () => [candidate("a", { suggestedDurationMinutes: minutes, minimumDurationMinutes: minutes })], recheck: async () => true }, routes, now: () => now });
}
afterEach(() => vi.useRealTimers());

describe("one-day authoritative origin routing/scheduling", () => {
  it("publishes schema-valid synthetic complete/missing fixtures for FE", () => {
    expect(plannerResultSchema.safeParse(syntheticJourneyProposal()).success).toBe(true);
    expect(plannerResultSchema.safeParse(syntheticMissingJourneyProposal()).success).toBe(true);
  });
  it.each([
    ["CAR", 119, 0], ["CAR", 120, 0], ["CAR", 121, 15], ["CAR", 240, 15], ["CAR", 300, 30],
    ["MOTORCYCLE", 89, 0], ["MOTORCYCLE", 90, 0], ["MOTORCYCLE", 91, 15],
  ] as const)("%s %i driving minutes includes %i rest minutes before endpoint", async (transport, driving, rest) => {
    const result = await service(provider(driving * 60, 0)).propose("owner", `rest-${transport}-${driving}`, { ...base, transport });
    expect(result.journeyPlan?.legs[0]).toMatchObject({ kind: "OUTBOUND", from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: "a" }, restMinutes: rest, endMinute: 360 + driving + rest });
    expect(result.days[0]?.stops[0]?.arrivalMinute).toBe(Math.max(480, 360 + driving + rest));
    expect(result.eligibleForFinalConfirmation).toBe(true);
    expect(plannerResultSchema.safeParse(result).success).toBe(true);
  });
  it("accumulates short visits, resets at 15 minutes, and carries an exact threshold into subsequent driving", async () => {
    for (const duration of [14, 15]) {
      const selected = [[candidate("a", { suggestedDurationMinutes: duration, minimumDurationMinutes: duration }), candidate("b")]];
      const planned = await planJourney(base, selected, provider(120 * 60, 0, 60));
      expect(planned.journeyPlan.legs[1]?.restMinutes).toBe(duration === 14 ? 15 : 0);
      expect(planned.check.status).toBe("PASS");
    }
    expect(driveWithRest(1, 7200, "CAR").restMinutes).toBe(15);
    expect(driveWithRest(0, 7200, "CAR").restMinutes).toBe(0);
  });
  it("separates return deadline violation from missing route and counts each leg once", async () => {
    const journey = { ...COMPLETE_JOURNEY_FIXTURE, departureMinute: 480, returnDeadlineMinute: 660 };
    const onTime = await service(provider(60 * 60)).propose("owner", "deadline-equal", { ...base, journey });
    expect(onTime.journeyPlan?.legs.at(-1)?.endMinute).toBe(660);
    expect(onTime.checks.find(check => check.key === "TRAVEL_TIME")?.status).toBe("PASS");
    expect(onTime.journeyPlan?.totals).toEqual({ drivingSeconds: 7200, restMinutes: 0, distanceMeters: 2000 });
    expect(onTime.days[0]?.travelSeconds).toBe(7200);
    const late = await service(provider(60 * 60, 61 * 60)).propose("owner", "deadline-missed", { ...base, journey });
    expect(late.checks.find(check => check.key === "TRAVEL_TIME")).toMatchObject({ status: "VIOLATION", issues: expect.arrayContaining([expect.objectContaining({ code: "RETURN_DEADLINE_MISSED" })]) });
    const missing: RouteProvider = { route: provider(0).route, coordinateRoute: async () => ({ status: "INSUFFICIENT_DATA", reason: "NO_ROUTE", durationSeconds: null, distanceMeters: null, provider: null }) };
    const unknown = await service(missing).propose("owner", "deadline-unknown", { ...base, journey });
    expect(unknown.journeyPlan?.totals.drivingSeconds).toBeNull();
    expect(unknown.status).toBe("INSUFFICIENT_DATA");
    expect(unknown.reasonCodes).not.toContain("RETURN_DEADLINE_MISSED");
  });
  it("adds rest before deadline/overnight checks and never truncates route or visit evidence", async () => {
    const journey = { ...COMPLETE_JOURNEY_FIXTURE, departureMinute: 480, returnDeadlineMinute: 850 };
    const result = await service(provider(0, 300 * 60)).propose("owner", "return-with-rest", { ...base, journey });
    expect(result.journeyPlan?.legs.at(-1)).toMatchObject({ restMinutes: 30, startMinute: 540, endMinute: 870 });
    expect(result.reasonCodes).toContain("RETURN_DEADLINE_MISSED");
    const overnight = await service(provider(0, 900 * 60)).propose("owner", "return-overnight", base);
    expect(overnight.reasonCodes).toContain("OVERNIGHT_DRIVING_UNSUPPORTED");
    expect(overnight.days[0]?.stops).toHaveLength(1);
  });
  it("retains preliminary needs when incomplete, rejects out-of-country, and changes arrival from actual origin route", async () => {
    const routes = provider(0);
    routes.coordinateRoute = async pair => verified(pair.from.latitude < 22 ? 180 * 60 : 60 * 60);
    const planner = service(routes);
    const near = await planner.propose("owner", "origin-near", { ...base, journey: { ...base.journey, origin: { ...base.journey!.origin, label: "Hà Giang", latitude: 22.8233, longitude: 104.9836 } } });
    const far = await planner.propose("owner", "origin-far", base);
    expect(far.days[0]!.stops[0]!.arrivalMinute).toBeGreaterThan(near.days[0]!.stops[0]!.arrivalMinute!);
    const incomplete = await service(provider(0)).propose("owner", "origin-incomplete", { ...base, journey: { origin: null } });
    expect(incomplete.status).toBe("INSUFFICIENT_DATA"); expect(incomplete.reasonCodes).toContain("JOURNEY_INPUT_MISSING");
    await expect(service(provider(0)).propose("owner", "origin-outside", { ...base, journey: { ...base.journey, origin: { ...base.journey!.origin, latitude: 20, longitude: 102 } } })).rejects.toMatchObject({ code: "ORIGIN_OUTSIDE_VIETNAM" });
  });
  it("rejects forged rest/arrival evidence through deterministic validation", async () => {
    const plan = await planJourney(base, [[candidate("a")]], provider(121 * 60, 0));
    plan.journeyPlan.legs[0]!.restMinutes = 0;
    plan.days[0]!.stops[0]!.arrivalMinute = 480;
    const checked = validateJourneyTiming(base, plan.days, plan.journeyPlan);
    expect(checked.status).toBe("VIOLATION"); expect(checked.issues.map(issue => issue.code)).toContain("JOURNEY_REST_MISMATCH");
  });
  it("uses a single route deadline including both boundary legs, even for a noncooperative provider", async () => {
    vi.useFakeTimers();
    const routes = provider(0); routes.coordinateRoute = vi.fn<NonNullable<RouteProvider["coordinateRoute"]>>(() => new Promise(() => undefined));
    const pending = planJourney(base, [[candidate("a")]], routes, 20);
    await vi.advanceTimersByTimeAsync(21);
    const result = await pending;
    expect(result.journeyPlan.legs.map(leg => leg.route.reason)).toEqual(["TIMEOUT", "TIMEOUT"]);
    expect(result.check.status).toBe("INSUFFICIENT_DATA");
    expect(vi.mocked(routes.coordinateRoute).mock.calls[0]?.[1]?.aborted).toBe(true);
  });
  it("serves the real shared planner HTTP boundary without enabling Save", async () => {
    const planner = service(provider(0));
    const response = await plannerResponse(new Request("https://example.test/api/trip-proposals", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", "Idempotency-Key": "one-day-http" }, body: JSON.stringify({ requirement: base }) }), {
      authorization: { resolveSession: async () => ({ user: { id: "owner" } }), database: { user: { findUnique: async () => ({ id: "owner", role: "TRAVELER" }) } } as unknown as Database },
      propose: planner.propose,
    });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ data: { journeyPlan: { policy: "roadside-rest-v1", legs: [{ kind: "OUTBOUND" }, { kind: "RETURN" }] }, eligibleForFinalConfirmation: true } });
  });
});
