import { describe, expect, it } from "vitest";
import { buildItineraryMapView } from "./itinerary-map-model";
import { plannerRoutePairs, schedulePlannerDays } from "../trip-planner/planner-engine";
import { resolvePlannerRoutes, missingLeg } from "../trip-planner/planner-routes";
import { candidate, fakeRoutes, requirement } from "../trip-planner/__fixtures__/planner-fixtures";

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

  it("accepts older metric-only proposals and keeps empty days explicit", async () => {
    const days = await fixture();
    delete days[0]!.stops[1]!.inbound!.geometry;
    expect(buildItineraryMapView(days, 1).missingGeometryCount).toBe(1);
    days[1]!.stops = [];
    const empty = buildItineraryMapView(days, 2);
    expect(empty.stops).toEqual([]); expect(empty.routes).toEqual([]);
  });
});
