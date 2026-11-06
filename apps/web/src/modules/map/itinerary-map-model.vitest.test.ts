import { describe, expect, it } from "vitest";
import { buildItineraryMapView } from "./itinerary-map-model";
import { plannerRoutePairs, schedulePlannerDays } from "../trip-planner/planner-engine";
import { resolvePlannerRoutes, missingLeg } from "../trip-planner/planner-routes";
import { candidate, fakeRoutes, requirement } from "../trip-planner/__fixtures__/planner-fixtures";
import type { JourneyPlan } from "../trip-origin/journey-route-contract";

async function fixture() {
  const selected = [[candidate("a"), candidate("bb")], [candidate("ccc")], [candidate("dddd")]];
  const routes = await resolvePlannerRoutes(plannerRoutePairs(selected, "CAR"), { route: async (pair, signal) => ({ ...await fakeRoutes.route(pair, signal), geometry: { type: "LineString", coordinates: [[pair.from.longitude, pair.from.latitude], [105.07, 23.08], [pair.to.longitude, pair.to.latitude]] } }) });
  return schedulePlannerDays({ ...requirement, durationDays: 3 }, selected, routes);
}

describe("daily and whole-trip map projection", () => {
  it("shows each provider leg once across the entire trip and numbers markers globally", async () => {
    const days = await fixture(), view = buildItineraryMapView(days, null);
    expect(view.stops.map(stop => stop.order)).toEqual([1, 2, 3, 4]);
    expect(view.routes.map(route => route.day)).toEqual([1, 2, 3]);
    expect(view.missingGeometryCount).toBe(0);
    expect(view.routes[1]!.fromDestinationId).toBe("bb");
  });

  it("includes the previous day's actual endpoint and receiving-day transfer", async () => {
    const view = buildItineraryMapView(await fixture(), 2);
    expect(view.stops.map(stop => [stop.destination.id, stop.order])).toEqual([["bb", 0], ["ccc", 1]]);
    expect(view.routes).toHaveLength(1); expect(view.routes[0]!.day).toBe(2);
    expect(view.hasPreviousDayTransfer).toBe(true);
  });

  it("leaves missing and mismatched legs disconnected instead of inventing lines", async () => {
    const days = await fixture(), stop = days[1]!.stops[0]!;
    stop.inbound = missingLeg({ from: candidate("bb"), to: candidate("ccc"), transport: "CAR" }, "NO_ROUTE");
    days[2]!.stops[0]!.inbound!.fromDestinationId = "a";
    const view = buildItineraryMapView(days, null);
    expect(view.routes).toHaveLength(1); expect(view.missingGeometryCount).toBe(2);
    expect(view.stops).toHaveLength(4);
  });

  describe("origin legs", () => {
    const line = { type: "LineString" as const, coordinates: [[105.8, 21], [105, 23]] as [number, number][] };
    const route = (geometry = true) => ({ status: "VERIFIED" as const, reason: null, durationSeconds: 60, distanceMeters: 1000, provider: "STADIA_MAPS" as const, ...(geometry ? { geometry: line } : {}) });
    const plan = (outboundGeometry = true): JourneyPlan => ({ policy: "roadside-rest-v1", totals: { drivingSeconds: 120, restMinutes: 0, distanceMeters: 2000 }, legs: [
      { kind: "OUTBOUND", day: 1, from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: "a" }, route: route(outboundGeometry), startMinute: 300, endMinute: 480, restMinutes: 0 },
      { kind: "RETURN", day: 3, from: { kind: "ATTRACTION", destinationId: "dddd" }, to: { kind: "ORIGIN" }, route: route(), startMinute: 900, endMinute: 1100, restMinutes: 0 },
    ] });
    it("belong to their own day and to the whole trip", async () => {
      const days = await fixture();
      expect(buildItineraryMapView(days, 1, plan()).routes.filter(item => item.boundary).map(item => item.toDestinationId)).toEqual(["a"]);
      expect(buildItineraryMapView(days, 2, plan()).showsOrigin).toBe(false);
      expect(buildItineraryMapView(days, 3, plan()).routes.filter(item => item.boundary).map(item => item.toDestinationId)).toEqual(["origin"]);
      expect(buildItineraryMapView(days, null, plan()).routes.filter(item => item.boundary)).toHaveLength(2);
    });
    it("counts a leg without a shape as missing, and draws nothing without a plan", async () => {
      const days = await fixture();
      const view = buildItineraryMapView(days, 1, plan(false));
      expect(view.routes.some(item => item.boundary)).toBe(false); expect(view.missingGeometryCount).toBe(1); expect(view.showsOrigin).toBe(true);
      expect(buildItineraryMapView(days, 1).showsOrigin).toBe(false);
    });
    it("marks the anchor attraction on a travel-only day", async () => {
      const days = await fixture(), moved = days[0]!.stops;
      days[1]!.stops = [...moved, ...days[1]!.stops]; days[0]!.stops = [];
      expect(buildItineraryMapView(days, 1, plan()).stops.map(stop => stop.destination.id)).toEqual(["a"]);
    });
  });

  it("accepts older metric-only proposals and keeps empty days explicit", async () => {
    const days = await fixture();
    delete days[0]!.stops[1]!.inbound!.geometry;
    expect(buildItineraryMapView(days, 1).missingGeometryCount).toBe(1);
    days[1]!.stops = [];
    const empty = buildItineraryMapView(days, 2);
    expect(empty.stops).toEqual([]); expect(empty.routes).toEqual([]);
  });
});
