import type { OriginSelection } from "../trip-origin/trip-origin-contract";

/**
 * Fixed trip hubs (ADR-42 §4): where a traveler arriving from far away starts the drive, usually by renting a vehicle.
 * Client-safe public places. The model only ever sees `id` and `name`.
 */
export const TRIP_HUBS = [
  { id: "HA_NOI", name: "Hà Nội (bến xe Mỹ Đình)", latitude: 21.0287, longitude: 105.7782 },
  { id: "HA_GIANG_CITY", name: "TP Hà Giang (bến xe phía Nam)", latitude: 22.8036, longitude: 104.9783 },
] as const;
export type TripHubId = (typeof TRIP_HUBS)[number]["id"];

/** The fixed hub at these coordinates, if any: a public meeting point that may be shown to companions. */
export const hubAt = (point: { latitude: number; longitude: number }) =>
  TRIP_HUBS.find(hub => Math.abs(hub.latitude - point.latitude) < 1e-4 && Math.abs(hub.longitude - point.longitude) < 1e-4) ?? null;

/** A hub chosen by the traveler's own click is a confirmed origin; nothing here is picked by the model. */
export function hubOrigin(id: TripHubId): OriginSelection {
  const hub = TRIP_HUBS.find(item => item.id === id)!;
  return { label: hub.name, latitude: hub.latitude, longitude: hub.longitude, source: "MANUAL", confirmed: true };
}
