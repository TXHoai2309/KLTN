import { describe, expect, it, vi } from "vitest";
import { haversine, plannerRoutePairs, selectPlannerDays } from "./planner-engine";
import { balancePlannerDays } from "./planner-day-balance";
import { missingLeg, resolvePlannerRoutes } from "./planner-routes";
import { createPlannerService } from "./planner-service";
import { candidate, fakeRoutes, referenceTime, requirement } from "./__fixtures__/planner-fixtures";

// Offline regression coordinates mirror the owner's seven-stop screenshot.
// Opening hours and provider metrics below are synthetic, not tourism evidence.
const screenshotCandidates = [
  candidate("cmv9fcwo1000be89w3yxz3mqu", { name: "Bac Me", latitude: 22.7308573, longitude: 105.3745508 }),
  candidate("test_planner_quan_ba", { name: "Quan Ba", latitude: 23.0645, longitude: 104.9928 }),
  candidate("test_planner_nha_vuong", { name: "Nha Vuong", latitude: 23.2483, longitude: 105.2447 }),
  candidate("test_planner_lung_cu", { name: "Lung Cu", latitude: 23.3619, longitude: 105.3186 }),
  candidate("test_planner_dong_van", { name: "Dong Van", latitude: 23.2785, longitude: 105.3614 }),
  candidate("test_planner_ma_pi_leng", { name: "Ma Pi Leng", latitude: 23.2415, longitude: 105.4168 }),
  candidate("test_planner_nho_que", { name: "Nho Que", latitude: 23.2201, longitude: 105.4332 }),
];
const screenshotRequirement = { ...requirement, durationDays: 3, startDate: null, interests: [] };
const names = (rows: typeof screenshotCandidates) => selectPlannerDays(screenshotRequirement, rows).flat().map(row => row.name);

describe("planner route coherence", () => {
  it("visits Lung Cu before leaving Dong Van for Ma Pi Leng and Nho Que", () => {
    expect(names(screenshotCandidates)).toEqual(["Bac Me", "Quan Ba", "Nha Vuong", "Lung Cu", "Dong Van", "Ma Pi Leng", "Nho Que"]);
  });

  it("keeps the geographic route when IDs and repository order change", () => {
    const renamed = [...screenshotCandidates].reverse().map((row, index) => ({ ...row, id: `renamed-${index}` }));
    expect(names(renamed)).toEqual(names(screenshotCandidates));
  });

  it("is stable across every rotated repository order", () => {
    for (let offset = 0; offset < screenshotCandidates.length; offset++) {
      expect(names([...screenshotCandidates.slice(offset), ...screenshotCandidates.slice(0, offset)])).toEqual(names(screenshotCandidates));
    }
  });

  it("selects a compact subset rather than starting at an ID-first outlier", () => {
    const rows = [
      candidate("a-outlier", { latitude: 22, longitude: 104 }),
      ...[0, 1, 2].map(index => candidate(`z-${index}`, { latitude: 23 + index / 100, longitude: 105 })),
    ];
    const selected = selectPlannerDays({ ...requirement, durationDays: 1, interests: [] }, rows).flat();
    expect(selected).toHaveLength(3);
    expect(selected.some(row => row.id === "a-outlier")).toBe(false);
    expect(haversine(selected[0]!, selected[2]!)).toBeLessThan(3);
  });

  it("repartitions days using verified road time without requesting extra pairs", async () => {
    const rows = ["a", "b", "c", "d"].map((id, index) => candidate(id, {
      latitude: 23 + index / 100, longitude: 105,
      suggestedDurationMinutes: id === "d" ? 240 : 120,
    }));
    const route = vi.fn(async (pair: Parameters<typeof fakeRoutes.route>[0], signal: AbortSignal) => ({
      ...await fakeRoutes.route(pair, signal),
      durationSeconds: (pair.to.id === "d" ? 300 : 10) * 60,
    }));
    const service = createPlannerService({ repository: { candidates: async () => rows, recheck: async () => true }, routes: { route }, now: () => referenceTime });
    const result = await service.propose("owner", "road-time-rebalance", { ...requirement, interests: [] });
    expect(result.days.map(day => day.stops.length)).toEqual([3, 1]);
    expect(result.checks.every(check => check.status === "PASS")).toBe(true);
    expect(route).toHaveBeenCalledTimes(3);
    expect(result.days[1]!.stops[0]!.inbound?.fromDestinationId).toBe("c");
    expect(result.days[1]!.stops[0]!.arrivalMinute).toBe(780);
  });

  it("does not jump over a long visit just to fill a day's stop count", () => {
    const rows = ["a", "b", "c", "d"].map((id, index) => candidate(id, {
      latitude: 23 + index / 100, longitude: 105, suggestedDurationMinutes: index < 2 ? 360 : 60,
    }));
    const selected = selectPlannerDays({ ...requirement, interests: [] }, rows);
    expect(selected.flat().map(row => row.id)).toEqual(["a", "b", "c", "d"]);
    expect(selected.map(day => day.length)).toEqual([1, 3]);
  });

  it("respects actual opening dates when moving day boundaries", async () => {
    const rows = ["a", "b", "c", "d"].map((id, index) => candidate(id, {
      latitude: 23 + index / 100, longitude: 105,
      openingDays: candidate(id).openingDays.map(day => day.dayOfWeek === "SATURDAY" && id === "c" ? { ...day, status: "CLOSED", intervals: [] } : day),
    }));
    const selected = [[rows[0]!, rows[1]!, rows[2]!], [rows[3]!]];
    const routes = await resolvePlannerRoutes(plannerRoutePairs(selected, "CAR"), fakeRoutes);
    const balanced = balancePlannerDays({ ...requirement, interests: [] }, selected, routes);
    expect(balanced[0]!.map(row => row.id)).toContain("c");
    expect(balanced.flat()).toEqual(selected.flat());
  });

  it("keeps missing routes insufficient instead of balancing with guessed travel time", async () => {
    const service = createPlannerService({ repository: { candidates: async () => screenshotCandidates, recheck: async () => true }, routes: { route: async pair => missingLeg(pair, "NO_ROUTE") }, now: () => referenceTime });
    const result = await service.propose("owner", "missing-coherent-routes", screenshotRequirement);
    expect(result.checks.find(check => check.key === "TRAVEL_TIME")?.status).toBe("INSUFFICIENT_DATA");
    expect(result.eligibleForFinalConfirmation).toBe(false);
    expect(result.days.flatMap(day => day.stops).slice(1).every(stop => stop.arrivalMinute === null)).toBe(true);
  });

  it("keeps impossible transfers as violations rather than dropping their stops", async () => {
    const rows = [candidate("a", { latitude: 23 }), candidate("b", { latitude: 24 })];
    const service = createPlannerService({ repository: { candidates: async () => rows, recheck: async () => true }, routes: { route: async (pair, signal) => ({ ...await fakeRoutes.route(pair, signal), durationSeconds: 40_000 }) }, now: () => referenceTime });
    const result = await service.propose("owner", "impossible-coherent-route", { ...requirement, interests: [] });
    expect(result.days.flatMap(day => day.stops)).toHaveLength(2);
    expect(result.status).toBe("NO_FEASIBLE_ITINERARY");
    expect(result.eligibleForFinalConfirmation).toBe(false);
  });
});
