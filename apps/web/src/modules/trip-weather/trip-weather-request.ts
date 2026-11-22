import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import type { JourneyPlan } from "@/modules/trip-origin/journey-route-contract";
import type { TripWeatherRequest } from "./trip-weather-service";

const MAX_SENT_POINTS = 64;

function coarse(geometry: { type: "LineString"; coordinates: Array<[number, number]> } | undefined) {
  if (!geometry) return undefined;
  const n = geometry.coordinates.length;
  const count = Math.min(MAX_SENT_POINTS, n);
  return {
    type: "LineString" as const,
    coordinates: Array.from({ length: count }, (_, i) => geometry.coordinates[Math.round((i * (n - 1)) / (count - 1))]!),
  };
}

/** Builds the read-only weather request from an itinerary's days and optional journey plan. */
export function toTripWeatherRequest(days: PlannerDay[], journeyPlan?: JourneyPlan | null): TripWeatherRequest {
  const names = new Map(days.flatMap(d => d.stops.map(s => [s.destination.id, s.destination.name] as const)));
  const endpoint = (e: JourneyPlan["legs"][number]["from"]) =>
    e.kind === "ORIGIN" ? "Nơi xuất phát" : names.get(e.destinationId) ?? "Điểm đến";
  const legs: TripWeatherRequest["legs"] = journeyPlan?.legs.length
    ? journeyPlan.legs.map(l => ({
        day: l.day,
        label: `${endpoint(l.from)} → ${endpoint(l.to)}`,
        verified: l.route.status === "VERIFIED",
        startMinute: l.startMinute === null ? null : Math.round(l.startMinute),
        endMinute: l.endMinute === null ? null : Math.round(l.endMinute),
        geometry: coarse(l.route.geometry),
      }))
    : days.flatMap(d =>
        d.stops.slice(1).map((s, i) => ({
          day: d.day,
          label: `${d.stops[i]!.destination.name} → ${s.destination.name}`,
          verified: s.inbound?.status === "VERIFIED",
          startMinute: d.stops[i]!.departureMinute,
          endMinute: s.arrivalMinute,
          geometry: coarse(s.inbound?.geometry),
        })),
      );
  return {
    days: days.map(d => ({
      day: d.day,
      date: d.date,
      stops: d.stops.map(s => ({
        destinationId: s.destination.id,
        arrivalMinute: s.arrivalMinute,
        departureMinute: s.departureMinute,
      })),
    })),
    legs: legs
      .filter(l => l.startMinute === null || l.startMinute <= 10080)
      .map(l => ({ ...l, endMinute: l.endMinute !== null && l.endMinute > 10080 ? null : l.endMinute })),
  };
}
