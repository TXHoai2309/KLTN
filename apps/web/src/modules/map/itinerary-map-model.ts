import type { PlannerDay, PlannerStop } from "../trip-planner/planner-contract";
import type { RouteGeometry } from "./map-model";

export type ItineraryMapRoute = { day: number; geometry: RouteGeometry; fromDestinationId: string; toDestinationId: string };
export type ItineraryMapView = {
  stops: PlannerStop[]; markerDays: Map<string, number>; routes: ItineraryMapRoute[];
  missingGeometryCount: number; hasPreviousDayTransfer: boolean;
};
export const itineraryDayColorToken = (day: number) => `--planner-route-${(day - 1) % 3 + 1}`;

/** Null day means the whole trip. Cross-day transfers belong to the receiving day. */
export function buildItineraryMapView(days: readonly PlannerDay[], selectedDay: number | null): ItineraryMapView {
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
  return {
    stops: markers.map((item, index) => ({ ...item.stop, order: selectedDay === null ? index + 1 : previous && index === 0 ? 0 : item.stop.order })),
    markerDays: new Map(markers.map(item => [item.stop.destination.id, item.day])), routes, missingGeometryCount,
    hasPreviousDayTransfer: Boolean(previous),
  };
}
