import { describe, expect, it } from "vitest";
import { candidate } from "../trip-planner/__fixtures__/planner-fixtures";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { planJourney } from "./journey-planner";
import { validatePlannerDays } from "../trip-planner/planner-validator";
import type { RouteProvider } from "../trip-planner/planner-routes";
import type { JourneyRoute } from "./journey-route-contract";

const base = tripRequirementInputSchema.parse({ startDate: "2027-01-02", durationDays: 3, transport: "CAR", journey: { ...COMPLETE_JOURNEY_FIXTURE, returnDepartureMinute: 540 } });
const metric = (minutes: number): JourneyRoute => ({ status: "VERIFIED", reason: null, durationSeconds: minutes * 60, distanceMeters: 1000, provider: "STADIA_MAPS" });
function routes(outbound = 300, returning = 300): RouteProvider {
  let index = 0;
  return { coordinateRoute: async () => metric(index++ === 0 ? outbound : returning), route: async pair => ({ ...metric(30), fromDestinationId: pair.from.id, toDestinationId: pair.to.id }) };
}
describe("travel-only boundary days and anchors", () => {
  it("uses next-day first attraction and prior-day final attraction without fictitious visits or duplicate legs", async () => {
    const selected = [[], [candidate("a"), candidate("b")], []];
    const result = await planJourney(base, selected, routes());
    expect(result.days.map(day => day.journeyDayKind)).toEqual(["OUTBOUND_ONLY", "VISITS", "RETURN_ONLY"]);
    expect(result.days.map(day => day.stops.length)).toEqual([0, 2, 0]);
    expect(result.days[1]?.stops[0]).toMatchObject({ arrivalMinute: 480, inbound: null });
    expect(result.journeyPlan.legs.map(leg => [leg.kind, leg.day])).toEqual([["OUTBOUND", 1], ["TRANSFER", 2], ["RETURN", 3]]);
    expect(result.journeyPlan.legs[0]).toMatchObject({ to: { kind: "ATTRACTION", destinationId: "a" }, startMinute: 360, endMinute: 690, restMinutes: 30 });
    expect(result.journeyPlan.legs.at(-1)).toMatchObject({ from: { kind: "ATTRACTION", destinationId: "b" }, startMinute: 540, endMinute: 870, restMinutes: 30 });
    expect(result.journeyPlan.totals.drivingSeconds).toBe(630 * 60);
    expect(result.journeyPlan.totals.restMinutes).toBe(60);
    expect(result.check.status).toBe("PASS");
    expect(validatePlannerDays(base, result.days, selected.flat(), result.travelOnlyDays).checks.every(check => check.status === "PASS")).toBe(true);
  });
  it("does not invent 08:00 on a return-only day and differentiates missing clock from infeasibility", async () => {
    const requirement = { ...base, journey: { ...base.journey!, returnDepartureMinute: null } };
    const result = await planJourney(requirement, [[], [candidate("a")], []], routes());
    expect(result.journeyPlan.legs.at(-1)).toMatchObject({ day: 3, startMinute: null, endMinute: null });
    expect(result.check.status).toBe("INSUFFICIENT_DATA");
    expect(result.check.issues.map(issue => issue.code)).toContain("JOURNEY_INPUT_MISSING");
  });
  it("ignores a return-only clock on a final day WITH visits and departs after the last visit", async () => {
    const result = await planJourney({ ...base, durationDays: 2, journey: { ...base.journey!, returnDepartureMinute: 1 } }, [[candidate("a")], [candidate("b")]], routes(60, 60));
    const last = result.days[1]!.stops.at(-1)!;
    expect(result.journeyPlan.legs.at(-1)?.startMinute).toBe(last.departureMinute);
    expect(result.journeyPlan.legs.filter(leg => leg.kind === "RETURN")).toHaveLength(1);
  });
  it("resets short-visit driving before a return-only day and retains overnight violations", async () => {
    const requirement = { ...base, durationDays: 2 };
    const result = await planJourney(requirement, [[candidate("a", { suggestedDurationMinutes: 14, minimumDurationMinutes: 14 })], []], routes(120, 120));
    expect(result.journeyPlan.legs.at(-1)?.restMinutes).toBe(0);
    const overnight = await planJourney({ ...requirement, journey: { ...base.journey!, returnDepartureMinute: 1380 } }, [[candidate("a")], []], routes(0, 120));
    expect(overnight.check.status).toBe("VIOLATION");
    expect(overnight.check.issues.map(issue => issue.code)).toContain("OVERNIGHT_DRIVING_UNSUPPORTED");
  });
  it("does not call arbitrary interior empty days travel-only and rejects an all-travel/no-visit proposal", async () => {
    const selected = [[candidate("a")], [], [candidate("b")]];
    const result = await planJourney(base, selected, routes(0, 0));
    expect(result.days[1]?.journeyDayKind).toBe("EMPTY");
    expect(validatePlannerDays(base, result.days, selected.flat(), result.travelOnlyDays).checks.flatMap(check => check.issues).map(issue => issue.code)).toContain("EMPTY_DAY");
    expect((await planJourney(base, [[], [], []], routes())).check).toMatchObject({ status: "VIOLATION", issues: expect.arrayContaining([expect.objectContaining({ code: "NO_SIGHTSEEING_TIME" })]) });
  });
  it("repartitions bounded boundary alternatives only when they improve verified constraints, preserving chain/days/mode", async () => {
    const selected = [[candidate("a")], [candidate("b")], []];
    const result = await planJourney(base, selected, routes(660, 60), undefined, true);
    expect(result.days[0]?.journeyDayKind).toBe("OUTBOUND_ONLY");
    expect(result.days.flatMap(day => day.stops.map(stop => stop.destination.id))).toEqual(["a", "b"]);
    expect(result.days).toHaveLength(3);
    expect(result.journeyPlan.legs).toHaveLength(3);
    expect(result.check.status).toBe("PASS");
  });
});
