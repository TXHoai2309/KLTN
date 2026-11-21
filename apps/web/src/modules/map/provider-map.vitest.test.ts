import { afterEach, expect, it, vi } from "vitest";
import { loadMapLibrary, mountDestinationPinPicker } from "./map-renderer";
import type { GoogleMap, GoogleMapsSdk } from "./google-maps-sdk";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("fails the selected Google map without loading Stadia when the browser key is missing", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
  vi.stubGlobal("window", {});
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(loadMapLibrary()).rejects.toThrow("Google Maps is not configured");
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not request a Google SDK when its required map ID is missing", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "fixture-browser-key");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
  vi.stubGlobal("window", {});
  await expect(loadMapLibrary()).rejects.toThrow("Google Maps is not configured");
});

it("keeps a confirmed pin's coordinates across theme changes and stops accepting updates after disposal", () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "fixture-map-id");
  const elements = () => ({ append: vi.fn(), remove: vi.fn(), setAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { createElement: elements });
  const markerPositions: unknown[] = [];
  const markerUpdates: unknown[] = [];
  const options: Record<string, unknown>[] = [];
  const sdk = {
    Map: class { constructor(_host: unknown, config: Record<string, unknown>) { options.push(config); } addListener() { return { remove() {} }; } setCenter() {} setZoom() {} getZoom() { return 12; } getCenter() { return { lat: () => 21, lng: () => 105.8 }; } unbindAll() {} },
    marker: { AdvancedMarkerElement: class { map: GoogleMap | null = null; set position(value: unknown) { markerUpdates.push(value); } constructor(config: { position: unknown }) { markerPositions.push(config.position); } append() {} remove() {} addListener() { return { remove() {} }; } } },
    event: { clearInstanceListeners() {} },
  } as unknown as GoogleMapsSdk;
  const host = { replaceChildren: vi.fn() } as unknown as HTMLDivElement;
  const changed = vi.fn();
  const pin = mountDestinationPinPicker(host, { provider: "GOOGLE", sdk }, { latitude: 21, longitude: 105.8 }, "light", changed, vi.fn(), vi.fn());
  pin.setStyle("dark");
  expect(options.map(option => option.colorScheme)).toEqual(["LIGHT", "DARK"]);
  expect(markerPositions).toEqual([{ lat: 21, lng: 105.8 }, { lat: 21, lng: 105.8 }]);
  pin.dispose();
  const updatesBefore = markerUpdates.length;
  pin.setCoordinates({ latitude: 22, longitude: 105 });
  // A disposed picker must not mutate the detached Google marker or recreate content.
  expect(changed).not.toHaveBeenCalled();
  expect(markerUpdates).toHaveLength(updatesBefore);
});
