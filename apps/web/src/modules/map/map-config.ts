export const stadiaStyles = {
  light: "https://tiles.stadiamaps.com/styles/alidade_smooth.json",
  dark: "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json",
  terrain: "https://tiles.stadiamaps.com/styles/outdoors.json",
} as const;
export type MapBackground = "default" | "terrain";
export function mapStyle(theme: string | undefined, background: MapBackground = "default") {
  if (background === "terrain") return stadiaStyles.terrain;
  return theme === "dark" ? stadiaStyles.dark : stadiaStyles.light;
}
const BACKGROUND_KEY = "kltn-map-background";
/** Per-device preference; storage can be blocked, so every access falls back to the default. */
export function readMapBackground(): MapBackground {
  try { return globalThis.localStorage?.getItem(BACKGROUND_KEY) === "terrain" ? "terrain" : "default"; } catch { return "default"; }
}
export function saveMapBackground(background: MapBackground) {
  try { globalThis.localStorage?.setItem(BACKGROUND_KEY, background); } catch { /* preference is optional */ }
}
/** Cached npm module, not remote script. Only called inside client effect. */
export async function verifyMapWorkerAssets() {
  // v6 caches its global worker initialization, including a rejected promise.
  // Check packaged assets first so a missing asset can recover via normal retry.
  for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    const response = await fetch(`/maplibre/${file}`, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Map worker asset unavailable");
  }
}
export async function loadMapLibre() {
  await verifyMapWorkerAssets();
  const library = await import("maplibre-gl");
  library.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  return library;
}
