import type * as MapLibre from "maplibre-gl";
import { haGiangViewport, toMapCoordinate } from "./map-model";
import type { PlannerStop } from "../trip-planner/planner-contract";

/** Marker coordinates come from Destination records. Never draws a guessed route. */
export function mountItineraryMap(host: HTMLDivElement, library: typeof MapLibre, stops: readonly PlannerStop[], style: string, onSelect: (id: string) => void, onReady: () => void, onFailure: () => void) {
  const map = new library.Map({ container: host, style, center: toMapCoordinate(haGiangViewport.center), zoom: haGiangViewport.zoom, maxZoom: 16,
    cooperativeGestures: true, attributionControl: { compact: true } });
  const markers: { marker: MapLibre.Marker; button: HTMLButtonElement; click: () => void; stop: PlannerStop }[] = [];
  let disposed = false;
  let currentStyle = style;
  const dispose = () => {
    if (disposed) return; disposed = true;
    for (const item of markers) { item.button.removeEventListener("click", item.click); item.marker.remove(); }
    map.off("load", onReady); map.off("error", onFailure); map.remove();
  };
  try {
    map.on("load", onReady); map.on("error", onFailure);
    map.addControl(new library.NavigationControl({ showCompass: true }), "top-right");
    for (const stop of stops) {
      const button = document.createElement("button"); button.type = "button"; button.className = "planner-map-marker";
      button.textContent = String(stop.order); button.setAttribute("aria-label", `Điểm ${stop.order}: ${stop.destination.name}`); button.setAttribute("aria-pressed", "false");
      button.title = stop.destination.name;
      const click = () => onSelect(stop.destination.id); button.addEventListener("click", click);
      const marker = new library.Marker({ element: button, anchor: "bottom" }).setLngLat(toMapCoordinate(stop.destination)).addTo(map);
      markers.push({ marker, button, click, stop });
    }
    if (stops.length === 1) map.jumpTo({ center: toMapCoordinate(stops[0]!.destination), zoom: 11 });
    else if (stops.length > 1) { const bounds = new library.LngLatBounds(); stops.forEach(stop => bounds.extend(toMapCoordinate(stop.destination))); map.fitBounds(bounds, { padding: 70, maxZoom: 11, duration: 0 }); }
    return { dispose, setStyle(next: string) {
      if (disposed || currentStyle === next) return;
      map.setStyle(next); currentStyle = next;
    }, select(id: string | null, focus = true) {
      if (disposed) return;
      for (const item of markers) { const selected = item.stop.destination.id === id; item.button.classList.toggle("is-selected", selected); item.button.setAttribute("aria-pressed", String(selected)); }
      const selected = markers.find(item => item.stop.destination.id === id);
      if (selected && focus) map.easeTo({ center: toMapCoordinate(selected.stop.destination), zoom: Math.max(map.getZoom(), 11), duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350 });
    } };
  } catch (error) { dispose(); throw error; }
}
