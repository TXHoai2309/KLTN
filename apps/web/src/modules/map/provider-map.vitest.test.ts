import { afterEach, expect, it, vi } from "vitest";
import { loadMapLibrary, mountDestinationPinPicker, resetMapSettingsCacheForTests } from "./map-renderer";
import type { GoogleMap, GoogleMapsSdk } from "./google-maps-sdk";

afterEach(() => {
  resetMapSettingsCacheForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("fails the selected Google map without loading Stadia when the browser key is missing", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
  vi.stubGlobal("window", {});
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValue(new Response(JSON.stringify({ data: { provider: "GOOGLE", googleMapId: "fixture-map-id" } })));
  await expect(loadMapLibrary()).rejects.toThrow("Google Maps is not configured");
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/maps/config", { cache: "no-store" });
});

it("does not request a Google SDK when its required map ID is missing", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "fixture-browser-key");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
  vi.stubGlobal("window", {});
  await expect(loadMapLibrary({ provider: "GOOGLE", googleMapId: "" })).rejects.toThrow("Google Maps is not configured");
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
  const pin = mountDestinationPinPicker(host, { provider: "GOOGLE", sdk, mapId: "fixture-map-id" }, { latitude: 21, longitude: 105.8 }, "light", changed, vi.fn(), vi.fn());
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

it("Point 5: shares one /api/maps/config request across remounts, clears cache on failure for retry, and throttles rapid forceRefresh", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "fixture-browser-key");
  const fakeMaps = { marker: { AdvancedMarkerElement: class {} } } as unknown as GoogleMapsSdk;
  vi.stubGlobal("window", { google: { maps: fakeMaps } });

  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);

  // 1st attempt fails (503) -> clears cache so clicking "Thử lại bản đồ" immediately succeeds
  fetcher.mockResolvedValueOnce(new Response("{}", { status: 503 }));
  await expect(loadMapLibrary()).rejects.toThrow("Map configuration is unavailable");
  expect(fetcher).toHaveBeenCalledTimes(1);

  // 2nd attempt (retry) succeeds -> cached for 5 minutes across multiple tab switches / remounts
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ data: { provider: "GOOGLE", googleMapId: "map-123" } })));
  const [a, b, c] = await Promise.all([loadMapLibrary(), loadMapLibrary(), loadMapLibrary()]);
  expect(a.provider).toBe("GOOGLE");
  expect(b.provider).toBe("GOOGLE");
  expect(c.provider).toBe("GOOGLE");
  expect(fetcher).toHaveBeenCalledTimes(2);

  // Remounting after 2 minutes (switching tabs / saving trip) still uses cache -> 0 new requests
  vi.advanceTimersByTime(120_000);
  await loadMapLibrary();
  expect(fetcher).toHaveBeenCalledTimes(2);

  // Rapid forceRefresh within 5s of a refresh is throttled; after >= 5s it refreshes once cleanly
  await loadMapLibrary(undefined, { forceRefresh: true });
  expect(fetcher).toHaveBeenCalledTimes(3);
  await loadMapLibrary(undefined, { forceRefresh: true });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
