import type * as MapLibre from "maplibre-gl";
import type { MapSettings } from "../runtime-config/runtime-config-contract";
import { loadMapLibre } from "./map-config";
import { loadGoogleMaps, type GoogleMapsSdk } from "./google-maps-sdk";
import { mountGoogleDestinations, mountGooglePin, mountGoogleItinerary } from "./google-map-renderer";
import { mountMapLibre, mountDestinationPinPicker as mountStadiaPin } from "./maplibre-renderer";
import { mountItineraryMap as mountStadiaItinerary } from "./itinerary-map-renderer";

export type MapLibrary = { provider: "GOOGLE"; sdk: GoogleMapsSdk; mapId: string } | { provider: "STADIA"; sdk: typeof MapLibre };
export const MAP_SETTINGS_CACHE_TTL_MS = 300_000;
const FORCE_REFRESH_MIN_GAP_MS = 5_000;
// One lookup is shared by every map on the page and reused for 5 minutes, so remounting maps on tab switches or saves never hammer /api/maps/config.
let cachedSettings: { at: number; promise: Promise<MapSettings> } | null = null;
/** Test seam to reset cached map settings between isolated unit tests. */
export function resetMapSettingsCacheForTests() {
  cachedSettings = null;
}
function fetchMapSettings(forceRefresh = false): Promise<MapSettings> {
  const now = Date.now();
  if (cachedSettings) {
    const age = now - cachedSettings.at;
    if (!forceRefresh && age < MAP_SETTINGS_CACHE_TTL_MS) return cachedSettings.promise;
    // Even explicit retries cannot hammer /api/maps/config within 5 seconds of the previous lookup.
    if (forceRefresh && age < FORCE_REFRESH_MIN_GAP_MS) return cachedSettings.promise;
  }
  const promise = requestMapSettings();
  const entry = { at: now, promise };
  cachedSettings = entry;
  promise.catch(() => { if (cachedSettings === entry) cachedSettings = null; });
  return promise;
}
async function requestMapSettings(): Promise<MapSettings> {
  const response = await fetch("/api/maps/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Map configuration is unavailable");
  const { data } = await response.json() as { data?: Partial<MapSettings> };
  if ((data?.provider !== "GOOGLE" && data?.provider !== "STADIA") || typeof data.googleMapId !== "string") {
    throw new Error("Map configuration is unavailable");
  }
  return { provider: data.provider, googleMapId: data.googleMapId };
}
export async function loadMapLibrary(
  settings?: MapSettings,
  options?: { forceRefresh?: boolean },
): Promise<MapLibrary> {
  const { provider, googleMapId } = settings ?? await fetchMapSettings(options?.forceRefresh === true);
  return provider === "GOOGLE"
    ? { provider, sdk: await loadGoogleMaps(googleMapId), mapId: googleMapId }
    : { provider, sdk: await loadMapLibre() };
}
export type MapStyleController = { setStyle(style: string): void };
type DestinationArgs = Parameters<typeof mountMapLibre>;
type DestinationExtras = Omit<NonNullable<DestinationArgs[7]>, "onMap"> & { onMap?: (map: MapStyleController | null) => void };
export function mountDestinationMap(host: DestinationArgs[0], library: MapLibrary, points: DestinationArgs[2], style: string, returnTo: DestinationArgs[4], ready: () => void, fail: (error?: unknown) => void, extras: DestinationExtras = {}) {
  if (library.provider === "STADIA") return mountMapLibre(host, library.sdk, points, style, returnTo, ready, fail, extras);
  const scene = mountGoogleDestinations(host, library.sdk, library.mapId, points, style, returnTo, ready, fail, extras);
  extras.onMap?.(scene);
  return () => { extras.onMap?.(null); scene.dispose(); };
}
export function mountDestinationPinPicker(host: Parameters<typeof mountStadiaPin>[0], library: MapLibrary, ...args: Parameters<typeof mountStadiaPin> extends [unknown, unknown, ...infer R] ? R : never) {
  return library.provider === "GOOGLE" ? mountGooglePin(host, library.sdk, library.mapId, ...args) : mountStadiaPin(host, library.sdk, ...args);
}
export function mountItineraryMap(host: Parameters<typeof mountStadiaItinerary>[0], library: MapLibrary, ...args: Parameters<typeof mountStadiaItinerary> extends [unknown, unknown, ...infer R] ? R : never) {
  return library.provider === "GOOGLE" ? mountGoogleItinerary(host, library.sdk, library.mapId, ...args) : mountStadiaItinerary(host, library.sdk, ...args);
}
