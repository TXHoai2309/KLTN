import type { PlannerDay, PlannerStop } from "../trip-planner/planner-contract";
import type { RouteGeometry } from "./map-model";
import type { JourneyPlan } from "../trip-origin/journey-route-contract";

export type ItineraryMapRoute = { day: number; geometry: RouteGeometry; fromDestinationId: string; toDestinationId: string; boundary?: boolean };
export type ItineraryMapView = {
  stops: PlannerStop[]; markerDays: Map<string, number>; routes: ItineraryMapRoute[];
  missingGeometryCount: number; hasPreviousDayTransfer: boolean; showsOrigin: boolean;
};
export const itineraryDayColorToken = (day: number) => `--planner-route-${(day - 1) % 3 + 1}`;

/** Null day means the whole trip. Cross-day transfers belong to the receiving day; origin legs to their own day. */
export function buildItineraryMapView(days: readonly PlannerDay[], selectedDay: number | null, journeyPlan?: JourneyPlan | null): ItineraryMapView {
  const all = days.flatMap(day => day.stops.map(stop => ({ day: day.day, stop })));
  const included = all.filter(item => selectedDay === null || item.day === selectedDay);
  const firstIndex = all.findIndex(item => item.stop.destination.id === included[0]?.stop.destination.id);
  const previous = selectedDay !== null && firstIndex > 0 ? all[firstIndex - 1] : undefined;
  const markers = previous ? [previous, ...included] : included;
  const routes: ItineraryMapRoute[] = [];
  let missingGeometryCount = 0;
  for (const item of included) {
    const index = all.indexOf(item);
    if (index === 0) continue;
    const from = all[index - 1]!.stop.destination.id, leg = item.stop.inbound;
    if (leg?.status === "VERIFIED" && leg.fromDestinationId === from && leg.toDestinationId === item.stop.destination.id && leg.geometry) {
      routes.push({ day: item.day, geometry: leg.geometry, fromDestinationId: from, toDestinationId: item.stop.destination.id });
    } else missingGeometryCount++;
  }
  let showsOrigin = false;
  for (const leg of journeyPlan?.legs ?? []) {
    if (leg.kind === "TRANSFER" || (selectedDay !== null && leg.day !== selectedDay)) continue;
    showsOrigin = true;
    const anchor = leg.from.kind === "ATTRACTION" ? leg.from.destinationId : leg.to.kind === "ATTRACTION" ? leg.to.destinationId : "";
    // A travel-only day has no visits of its own: mark the attraction the leg is routed to.
    const anchorItem = all.find(item => item.stop.destination.id === anchor);
    if (anchorItem && !markers.includes(anchorItem)) markers.push(anchorItem);
    if (leg.route.status === "VERIFIED" && leg.route.geometry) {
      routes.push({ day: leg.day, geometry: leg.route.geometry, fromDestinationId: leg.from.kind === "ATTRACTION" ? anchor : "origin", toDestinationId: leg.to.kind === "ATTRACTION" ? anchor : "origin", boundary: true });
    } else missingGeometryCount++;
  }
  return {
    stops: markers.map((item, index) => ({ ...item.stop, order: selectedDay === null ? index + 1 : previous && index === 0 ? 0 : item.stop.order })),
    markerDays: new Map(markers.map(item => [item.stop.destination.id, item.day])), routes, missingGeometryCount,
    hasPreviousDayTransfer: Boolean(previous), showsOrigin,
  };
}
