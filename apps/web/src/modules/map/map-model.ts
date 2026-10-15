import type { PublicLocation } from "../destination/public-destination-list";
import type { ExploreReturnHref } from "../destination/destination-detail-navigation";

export type MapDestination = PublicLocation & { latitude: number; longitude: number };
export type MapCoordinate = { latitude: number; longitude: number };
export type RouteGeometry = { type: "LineString"; coordinates: [number, number][] };
export const haGiangViewport = { center: { lat: 22.8233, lng: 104.9836 }, zoom: 9 };
export function toMapCoordinate(point: { latitude: number; longitude: number } | { lat: number; lng: number }): [number, number] {
  return "longitude" in point ? [point.longitude, point.latitude] : [point.lng, point.lat];
}
export function isValidMapCoordinate(point: MapCoordinate | null | undefined): point is MapCoordinate {
  return Boolean(point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
}
export function parseCoordinateInputs(latitude: string, longitude: string): MapCoordinate | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  return isValidMapCoordinate(point) ? point : null;
}
export function normalizeMapCoordinate(point: MapCoordinate): MapCoordinate {
  const longitude = point.longitude >= -180 && point.longitude <= 180 ? point.longitude : ((point.longitude + 540) % 360) - 180;
  return { latitude: Math.max(-90, Math.min(90, point.latitude)), longitude };
}
export function projectMarkers(items: readonly PublicLocation[]): MapDestination[] {
  return items.filter((item): item is MapDestination => typeof item.latitude === "number" && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90
    && typeof item.longitude === "number" && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180);
}
export function destinationDetailHref(id: string, returnTo?: ExploreReturnHref): `/destinations/${string}` {
  const path = `/destinations/${encodeURIComponent(id)}` as `/destinations/${string}`;
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` as `/destinations/${string}` : path;
}
export function exploreView(params: URLSearchParams): "list" | "map" { return params.get("view") === "map" ? "map" : "list"; }
/** Preserve current query state; only view changes. No dataset fetch is triggered. */
export function exploreViewHref(params: URLSearchParams, view: "list" | "map") {
  const next = new URLSearchParams(params); next.set("view", view); return `/explore?${next}`;
}

/** Commit Explore URL changes as normal App Router history entries. */
export function commitExploreNavigation(href: string, currentHref: string, push: () => void, retry: () => void) {
  if (currentHref === href) retry();
  else push();
}
