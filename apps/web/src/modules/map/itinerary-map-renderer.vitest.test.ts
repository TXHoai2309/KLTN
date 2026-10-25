import { afterEach, describe, expect, it, vi } from "vitest";
import type * as MapLibre from "maplibre-gl";
import { mountItineraryMap } from "./itinerary-map-renderer";
import { schedulePlannerDays } from "../trip-planner/planner-engine";
import { candidate, requirement } from "../trip-planner/__fixtures__/planner-fixtures";
afterEach(() => vi.unstubAllGlobals());
function harness(options: Parameters<typeof mountItineraryMap>[7] = {}) {
  const buttons: { attrs: Record<string, string>; click?: () => void; removeEventListener: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal("document", { createElement: () => { const button = { attrs: {} as Record<string, string>, style: { setProperty: vi.fn() }, classList: { toggle: vi.fn() }, setAttribute(key: string, value: string) { this.attrs[key] = value; }, addEventListener(_type: string, callback: () => void) { this.click = callback; }, click: undefined as (() => void) | undefined, removeEventListener: vi.fn() }; buttons.push(button); return button; } });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (name: string) => name === "--planner-route-2" ? "#286ba5" : name === "--planner-route-casing" ? "#fff" : "#28734f" }));
  const sources = new globalThis.Map();
  const map = { on: vi.fn(), off: vi.fn(), remove: vi.fn(), setStyle: vi.fn(() => sources.clear()), addControl: vi.fn(), jumpTo: vi.fn(), fitBounds: vi.fn(), easeTo: vi.fn(), getZoom: () => 10,
    getSource: vi.fn((id: string) => sources.get(id)), addSource: vi.fn((id: string, value: unknown) => sources.set(id, { value, setData: vi.fn() })), addLayer: vi.fn(), isStyleLoaded: () => true };
  const markerRemoval = vi.fn(), positions: number[][] = [];
  const library = { Map: class { constructor() { return map; } }, NavigationControl: class {}, LngLatBounds: class { extend = vi.fn(); }, Marker: class { setLngLat(coords: number[]) { positions.push(coords); return this; } addTo() { return this; } remove = markerRemoval; } } as unknown as typeof MapLibre;
  const stops = schedulePlannerDays({ ...requirement, durationDays: 1 }, [[candidate("a"), candidate("bb")]], new Map())[0]!.stops;
  const onSelect = vi.fn(), ready = vi.fn(), failure = vi.fn();
  const renderer = mountItineraryMap({} as HTMLDivElement, library, stops, "style", onSelect, ready, failure, options);
  return { renderer, map, buttons, positions, stops, onSelect, markerRemoval };
}
describe("itinerary MapLibre selection and lifecycle", () => {
  it("draws separate provider shapes, restores them after theme changes and can refit", () => {
    const geometry = { type: "LineString" as const, coordinates: [[105, 23], [105.1, 23.2], [105.2, 23.3]] as [number, number][] };
    const h = harness({ overview: true, markerDays: new globalThis.Map([["a", 1], ["bb", 2]]), routes: [{ day: 2, geometry, fromDestinationId: "a", toDestinationId: "bb" }] });
    const styleLoaded = h.map.on.mock.calls.find(call => call[0] === "style.load")![1] as () => void;
    styleLoaded();
    expect(h.map.addSource.mock.calls[0]?.[1]).toMatchObject({ data: { features: [{ geometry, properties: { day: 2, color: "#286ba5" } }] } });
    expect(h.map.addLayer).toHaveBeenCalledTimes(2);
    h.renderer.setStyle("dark-style"); styleLoaded();
    expect(h.map.addSource).toHaveBeenCalledTimes(2); expect(h.map.remove).not.toHaveBeenCalled();
    expect(h.buttons[1]!.attrs["aria-label"]).toContain("Ngày 2");
    h.renderer.fit(); expect(h.map.fitBounds).toHaveBeenCalledTimes(2);
    h.renderer.dispose(); styleLoaded(); expect(h.map.addSource).toHaveBeenCalledTimes(2);
  });
  it("switches style on the same map without touching markers, selection or camera", () => {
    const h = harness();
    h.renderer.select("bb", false);
    h.renderer.setStyle("dark-style"); h.renderer.setStyle("dark-style");
    expect(h.map.setStyle).toHaveBeenCalledExactlyOnceWith("dark-style");
    expect(h.map.remove).not.toHaveBeenCalled(); expect(h.markerRemoval).not.toHaveBeenCalled();
    expect(h.buttons[1]!.attrs["aria-pressed"]).toBe("true"); expect(h.map.easeTo).not.toHaveBeenCalled();
    h.renderer.dispose(); h.renderer.setStyle("light-style"); expect(h.map.setStyle).toHaveBeenCalledTimes(1);
  });
  it("uses only DB coordinates, fits actual stops and binds accessible marker clicks", () => {
    const h = harness(); expect(h.positions).toEqual(h.stops.map(stop => [stop.destination.longitude, stop.destination.latitude])); expect(h.map.fitBounds).toHaveBeenCalledOnce();
    expect(h.buttons[1]!.attrs["aria-label"]).toBe("Điểm 2: TEST Điểm đến bb"); h.buttons[1]!.click!(); expect(h.onSelect).toHaveBeenCalledWith("bb");
  });
  it("selects and pans without remounting or drawing unverified routes, respecting reduced motion", () => {
    const h = harness(); h.renderer.select("bb"); expect(h.buttons[0]!.attrs["aria-pressed"]).toBe("false"); expect(h.buttons[1]!.attrs["aria-pressed"]).toBe("true");
    expect(h.map.easeTo).toHaveBeenCalledWith({ center: h.positions[1], zoom: 11, duration: 0 }); expect(h.map.remove).not.toHaveBeenCalled();
    // The supplied map has no addSource/addLayer: mounting and selection cannot draw a fake route.
  });
  it("cleanup removes listeners and all markers once; disposed selection has no effect", () => {
    const h = harness(); h.renderer.dispose(); h.renderer.dispose(); h.renderer.select("a");
    expect(h.markerRemoval).toHaveBeenCalledTimes(2); expect(h.map.remove).toHaveBeenCalledOnce(); expect(h.map.off).toHaveBeenCalledTimes(2); expect(h.buttons.every(button => button.removeEventListener.mock.calls.length === 1)).toBe(true); expect(h.map.easeTo).not.toHaveBeenCalled();
  });
});
