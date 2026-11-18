import type * as MapLibre from "maplibre-gl";
import { mapsProviderFromEnv } from "./maps-provider";
import { loadMapLibre } from "./map-config";
import { loadGoogleMaps, type GoogleMapsSdk } from "./google-maps-sdk";
import { mountGoogleDestinations, mountGooglePin, mountGoogleItinerary } from "./google-map-renderer";
import { mountMapLibre, mountDestinationPinPicker as mountStadiaPin } from "./maplibre-renderer";
import { mountItineraryMap as mountStadiaItinerary } from "./itinerary-map-renderer";

export type MapLibrary = { provider: "GOOGLE"; sdk: GoogleMapsSdk } | { provider: "STADIA"; sdk: typeof MapLibre };
export async function loadMapLibrary(): Promise<MapLibrary> {
  return mapsProviderFromEnv() === "GOOGLE" ? { provider: "GOOGLE", sdk: await loadGoogleMaps() } : { provider: "STADIA", sdk: await loadMapLibre() };
}
export type MapStyleController = { setStyle(style: string): void };
type DestinationArgs = Parameters<typeof mountMapLibre>;
type DestinationExtras = Omit<NonNullable<DestinationArgs[7]>, "onMap"> & { onMap?: (map: MapStyleController | null) => void };
export function mountDestinationMap(host: DestinationArgs[0], library: MapLibrary, points: DestinationArgs[2], style: string, returnTo: DestinationArgs[4], ready: () => void, fail: (error?: unknown) => void, extras: DestinationExtras = {}) {
  if (library.provider === "STADIA") return mountMapLibre(host, library.sdk, points, style, returnTo, ready, fail, extras);
  const scene = mountGoogleDestinations(host, library.sdk, points, style, returnTo, ready, fail, extras);
  extras.onMap?.(scene);
  return () => { extras.onMap?.(null); scene.dispose(); };
}
export function mountDestinationPinPicker(host: Parameters<typeof mountStadiaPin>[0], library: MapLibrary, ...args: Parameters<typeof mountStadiaPin> extends [unknown, unknown, ...infer R] ? R : never) {
  return library.provider === "GOOGLE" ? mountGooglePin(host, library.sdk, ...args) : mountStadiaPin(host, library.sdk, ...args);
}
export function mountItineraryMap(host: Parameters<typeof mountStadiaItinerary>[0], library: MapLibrary, ...args: Parameters<typeof mountStadiaItinerary> extends [unknown, unknown, ...infer R] ? R : never) {
  return library.provider === "GOOGLE" ? mountGoogleItinerary(host, library.sdk, ...args) : mountStadiaItinerary(host, library.sdk, ...args);
}
