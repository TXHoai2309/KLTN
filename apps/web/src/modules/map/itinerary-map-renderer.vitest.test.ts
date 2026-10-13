import { afterEach, describe, expect, it, vi } from "vitest";
import type * as MapLibre from "maplibre-gl";
import { mountItineraryMap } from "./itinerary-map-renderer";
import { schedulePlannerDays } from "../trip-planner/planner-engine";
import { candidate, requirement } from "../trip-planner/__fixtures__/planner-fixtures";
afterEach(() => vi.unstubAllGlobals());
function harness() {
  const buttons: { attrs: Record<string, string>; click?: () => void; removeEventListener: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal("document", { createElement: () => { const button = { attrs: {} as Record<string, string>, classList: { toggle: vi.fn() }, setAttribute(key: string, value: string) { this.attrs[key] = value; }, addEventListener(_type: string, callback: () => void) { this.click = callback; }, click: undefined as (() => void) | undefined, removeEventListener: vi.fn() }; buttons.push(button); return button; } });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const map = { on: vi.fn(), off: vi.fn(), remove: vi.fn(), addControl: vi.fn(), jumpTo: vi.fn(), fitBounds: vi.fn(), easeTo: vi.fn(), getZoom: () => 10 };
  const markerRemoval = vi.fn(), positions: number[][] = [];
  const library = { Map: class { constructor() { return map; } }, NavigationControl: class {}, LngLatBounds: class { extend = vi.fn(); }, Marker: class { setLngLat(coords: number[]) { positions.push(coords); return this; } addTo() { return this; } remove = markerRemoval; } } as unknown as typeof MapLibre;
  const stops = schedulePlannerDays({ ...requirement, durationDays: 1 }, [[candidate("a"), candidate("bb")]], new Map())[0]!.stops;
  const onSelect = vi.fn(), ready = vi.fn(), failure = vi.fn();
  const renderer = mountItineraryMap({} as HTMLDivElement, library, stops, "style", onSelect, ready, failure);
  return { renderer, map, buttons, positions, stops, onSelect, markerRemoval };
}
describe("itinerary MapLibre selection and lifecycle", () => {
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
