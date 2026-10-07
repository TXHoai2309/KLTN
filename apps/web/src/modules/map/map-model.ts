import type { PublicLocation } from "../destination/public-destination-list";
import type { ExploreReturnHref } from "../destination/destination-detail-navigation";

export type MapDestination = PublicLocation & { latitude: number; longitude: number };
export const haGiangViewport = { center: { lat: 22.8233, lng: 104.9836 }, zoom: 9 };
export function toMapCoordinate(point: { latitude: number; longitude: number } | { lat: number; lng: number }): [number, number] {
  return "longitude" in point ? [point.longitude, point.latitude] : [point.lng, point.lat];
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
