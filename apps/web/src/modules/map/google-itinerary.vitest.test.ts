import { afterEach, expect, it, vi } from "vitest";
import { mountItineraryMap } from "./map-renderer";
import type { GoogleMapsSdk } from "./google-maps-sdk";
import { schedulePlannerDays } from "../trip-planner/planner-engine";
import { candidate, requirement } from "../trip-planner/__fixtures__/planner-fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("renders actual route points, keeps selection and camera across theme changes and disposes overlays", () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "fixture-map-id");
  const buttons: { attributes: Record<string, string>; click?: () => void }[] = [];
  vi.stubGlobal("document", { createElement: () => {
    const button = { attributes: {} as Record<string, string>, style: { setProperty() {} }, classList: { toggle() {} }, setAttribute(name: string, value: string) { this.attributes[name] = value; }, addEventListener(name: string, callback: () => void) { if (name === "click") this.click = callback; }, removeEventListener() { this.click = undefined; }, click: undefined as (() => void) | undefined };
    buttons.push(button); return button;
  } });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#327252" }));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const maps: FakeMap[] = [], lines: { path: unknown; detached: boolean }[] = [];
  let width = 0, visibleFits = 0, resize = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  class FakeMap {
    center = { lat: 23, lng: 105 }; zoom = 12;
    addListener() { return { remove() {} }; }
    constructor() { maps.push(this); }
    fitBounds() { if (width > 0) visibleFits++; } setCenter(p: typeof this.center) { this.center = p; } getCenter() { return { lat: () => this.center.lat, lng: () => this.center.lng }; }
    setZoom(n: number) { this.zoom = n; } getZoom() { return this.zoom; } panTo(p: typeof this.center) { this.center = p; } unbindAll() {}
  }
  const sdk = {
    Map: FakeMap, LatLngBounds: class { extend() { return this; } },
    marker: { AdvancedMarkerElement: class { map: unknown; append() {} remove() {} } },
    Polyline: class { line: (typeof lines)[number]; constructor(options: { path: unknown }) { this.line = { path: options.path, detached: false }; lines.push(this.line); } setMap(value: unknown) { this.line.detached = value === null; } },
    event: { clearInstanceListeners() {}, trigger() {} },
  } as unknown as GoogleMapsSdk;
  const stops = schedulePlannerDays({ ...requirement, durationDays: 1 }, [[candidate("a"), candidate("b")]], new Map())[0]!.stops;
  const selected = vi.fn();
  const renderer = mountItineraryMap({ get clientWidth() { return width; }, replaceChildren() {} } as unknown as HTMLDivElement, { provider: "GOOGLE", sdk, mapId: "fixture-map-id" }, stops, "light", selected, vi.fn(), vi.fn(), {
    routes: [{ day: 1, fromDestinationId: "a", toDestinationId: "b", provider: "GOOGLE_MAPS", geometry: { type: "LineString", coordinates: [[105, 23], [105.1, 23.05], [105.2, 23.1]] } }],
  });
  expect(lines[0]!.path).toEqual([{ lng: 105, lat: 23 }, { lng: 105.1, lat: 23.05 }, { lng: 105.2, lat: 23.1 }]);
  width = 600; resize();
  expect(visibleFits).toBe(1);
  buttons[1]!.click!(); expect(selected).toHaveBeenCalledWith("b");
  renderer.select("b", false);
  maps[0]!.setCenter({ lat: 22, lng: 104 }); maps[0]!.setZoom(16);
  renderer.setStyle("dark");
  expect(buttons[3]!.attributes["aria-pressed"]).toBe("true");
  expect(maps[1]!.center).toEqual({ lat: 22, lng: 104 }); expect(maps[1]!.zoom).toBe(16);
  expect(lines).toHaveLength(2); expect(lines[0]!.detached).toBe(true);
  renderer.dispose(); renderer.dispose();
  expect(lines[1]!.detached).toBe(true);
  expect(buttons.every(button => !button.click)).toBe(true);
});
