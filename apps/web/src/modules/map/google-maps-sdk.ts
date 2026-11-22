/** The small browser SDK surface used by our renderers; no server credentials here. */
export type GooglePoint = { lat: number; lng: number };
export type GoogleLatLng = { lat(): number; lng(): number };
export type GoogleListener = { remove(): void };
export type GoogleMap = {
  addListener(name: string, callback: (event: { latLng?: GoogleLatLng | null }) => void): GoogleListener;
  fitBounds(bounds: GoogleBounds, padding?: number | { top: number; right: number; bottom: number; left: number }): void;
  setCenter(point: GooglePoint): void; getCenter(): GoogleLatLng | undefined;
  setZoom(zoom: number): void; getZoom(): number | undefined;
  panTo(point: GooglePoint): void; unbindAll(): void;
  getMapCapabilities?(): { isAdvancedMarkersAvailable?: boolean };
};
type GoogleBounds = { extend(point: GooglePoint): GoogleBounds };
export type GoogleMarker = HTMLElement & { map: GoogleMap | null; position: GooglePoint | GoogleLatLng | null; addListener(name: string, callback: () => void): GoogleListener };
export type GoogleMapsSdk = {
  Map: new (host: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  LatLngBounds: new () => GoogleBounds;
  InfoWindow: new (options: { content: HTMLElement }) => { open(options: { map: GoogleMap; anchor: GoogleMarker; shouldFocus: boolean }): void; close(): void };
  Polyline: new (options: Record<string, unknown>) => { setMap(map: GoogleMap | null): void };
  marker: { AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarker };
  event: { clearInstanceListeners(instance: object): void; trigger(instance: object, event: string): void };
};
type GoogleWindow = Window & { google?: { maps: GoogleMapsSdk }; gm_authFailure?: () => void };
let loading: Promise<GoogleMapsSdk> | undefined;
let loadAttempt = 0;
let authorizationFailed = false;
const failures = new Set<() => void>();
export function onGoogleAuthorizationFailure(callback: () => void) { failures.add(callback); return () => { failures.delete(callback); }; }

/** Shared script promise. Retry resets a failed load, never selects another provider. */
export function loadGoogleMaps(mapId: string): Promise<GoogleMapsSdk> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key || !mapId || typeof window === "undefined") return Promise.reject(new Error("Google Maps is not configured"));
  if (authorizationFailed) return Promise.reject(new Error("Google Maps authorization failed"));
  const browser = window as GoogleWindow;
  if (browser.google?.maps?.marker?.AdvancedMarkerElement) return Promise.resolve(browser.google.maps);
  if (loading) return loading;
  loading = new Promise<GoogleMapsSdk>((resolve, reject) => {
    const script = document.createElement("script");
    const callback = `__kltnGoogleReady${++loadAttempt}`;
    const callbacks = browser as unknown as Record<string, unknown>;
    const cleanup = () => { clearTimeout(timer); delete callbacks[callback]; script.onerror = null; };
    const fail = () => { cleanup(); script.remove(); reject(new Error("Google Maps unavailable")); };
    const timer = setTimeout(fail, 14000);
    callbacks[callback] = () => {
      cleanup();
      if (!authorizationFailed && browser.google?.maps?.marker?.AdvancedMarkerElement) resolve(browser.google.maps);
      else fail();
    };
    const previousAuthFailure = browser.gm_authFailure;
    browser.gm_authFailure = () => { authorizationFailed = true; failures.forEach(callback => callback()); fail(); previousAuthFailure?.(); };
    const url = new URL("https://maps.googleapis.com/maps/api/js");
    url.search = new URLSearchParams({ key, v: "weekly", libraries: "marker", language: "vi", region: "VN", loading: "async", callback, auth_referrer_policy: "origin" }).toString();
    script.src = url.toString(); script.async = true; script.onerror = fail;
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) script.nonce = nonce;
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
