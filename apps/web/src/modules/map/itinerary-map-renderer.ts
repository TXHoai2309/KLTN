import type * as MapLibre from "maplibre-gl";
import { haGiangViewport, toMapCoordinate } from "./map-model";
import type { PlannerStop } from "../trip-planner/planner-contract";
import { itineraryDayColorToken, type ItineraryMapRoute } from "./itinerary-map-model";

/** Marker coordinates come from Destination records. Never draws a guessed route. */
export function mountItineraryMap(host: HTMLDivElement, library: typeof MapLibre, stops: readonly PlannerStop[], style: string, onSelect: (id: string) => void, onReady: () => void, onFailure: () => void, options: { routes?: readonly ItineraryMapRoute[]; overview?: boolean; markerDays?: ReadonlyMap<string, number> } = {}) {
  const map = new library.Map({ container: host, style, center: toMapCoordinate(haGiangViewport.center), zoom: haGiangViewport.zoom, maxZoom: 16,
    cooperativeGestures: true, attributionControl: { compact: true } });
  const markers: { marker: MapLibre.Marker; button: HTMLButtonElement; click: () => void; stop: PlannerStop }[] = [];
  let disposed = false;
  let fittedVisible = false;
  let currentStyle = style;
  const addRoutes = () => {
    if (disposed || !options.routes?.length) return;
    const css = getComputedStyle(host);
    const data = {
      type: "FeatureCollection" as const,
      features: options.routes.map(route => ({ type: "Feature" as const, geometry: route.geometry,
        properties: { day: route.day, color: css.getPropertyValue(itineraryDayColorToken(options.overview ? route.day : 1)).trim() } })),
    };
    const source = map.getSource("itinerary-routes");
    if (source) { (source as MapLibre.GeoJSONSource).setData(data); return; }
    map.addSource("itinerary-routes", { type: "geojson", data });
    map.addLayer({ id: "itinerary-route-casing", type: "line", source: "itinerary-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": css.getPropertyValue("--planner-route-casing").trim(), "line-width": 8, "line-opacity": 0.9 } });
    map.addLayer({ id: "itinerary-route-line", type: "line", source: "itinerary-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4.5, "line-opacity": 0.95 } });
  };
  const fit = () => {
    if (disposed) return;
    if (host.clientWidth > 0) fittedVisible = true;
    if (stops.length === 1 && !options.routes?.length) map.jumpTo({ center: toMapCoordinate(stops[0]!.destination), zoom: 11 });
    else if (stops.length) {
      const bounds = new library.LngLatBounds();
      stops.forEach(stop => bounds.extend(toMapCoordinate(stop.destination)));
      options.routes?.forEach(route => route.geometry.coordinates.forEach(point => bounds.extend(point)));
      map.fitBounds(bounds, { padding: { top: 70, right: 60, bottom: 80, left: 60 }, maxZoom: 11, duration: 0 });
    }
  };
  // A mobile tab can mount the map while its panel is hidden.
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
    if (disposed || host.clientWidth === 0) return;
    map.resize();
    if (!fittedVisible) fit();
  });
  const dispose = () => {
    if (disposed) return; disposed = true;
    resizeObserver?.disconnect();
    for (const item of markers) { item.button.removeEventListener("click", item.click); item.marker.remove(); }
    map.off("load", onReady); map.off("error", onFailure);
    if (options.routes?.length) map.off("style.load", addRoutes);
    map.remove();
  };
  try {
    map.on("load", onReady); map.on("error", onFailure);
    resizeObserver?.observe(host);
    if (options.routes?.length) map.on("style.load", addRoutes);
    map.addControl(new library.NavigationControl({ showCompass: true }), "top-right");
    for (const stop of stops) {
      const button = document.createElement("button"); button.type = "button"; button.className = "planner-map-marker";
      button.textContent = String(stop.order); button.setAttribute("aria-label", `Điểm ${stop.order}: ${stop.destination.name}`); button.setAttribute("aria-pressed", "false");
      const day = options.markerDays?.get(stop.destination.id);
      if (day !== undefined) {
        button.setAttribute("data-trip-day", String(day));
        button.setAttribute("data-destination-id", stop.destination.id);
        button.style.setProperty("--planner-marker-color", `var(${itineraryDayColorToken(options.overview ? day : 1)})`);
        button.setAttribute("aria-label", stop.order === 0 ? `Điểm cuối ngày ${day}: ${stop.destination.name}` : `Ngày ${day} · Điểm ${stop.order}: ${stop.destination.name}`);
      }
      button.title = stop.destination.name;
      const click = () => onSelect(stop.destination.id); button.addEventListener("click", click);
      const marker = new library.Marker({ element: button, anchor: "bottom", offset: [0, -6] }).setLngLat(toMapCoordinate(stop.destination)).addTo(map);
      markers.push({ marker, button, click, stop });
    }
    fit();
    return { dispose, fit, setStyle(next: string) {
      if (disposed) return;
      if (currentStyle === next) { if (options.routes?.length && map.isStyleLoaded()) addRoutes(); return; }
      map.setStyle(next); currentStyle = next;
    }, select(id: string | null, focus = true) {
      if (disposed) return;
      for (const item of markers) { const selected = item.stop.destination.id === id; item.button.classList.toggle("is-selected", selected); item.button.setAttribute("aria-pressed", String(selected)); }
      const selected = markers.find(item => item.stop.destination.id === id);
      if (selected && focus) map.easeTo({ center: toMapCoordinate(selected.stop.destination), zoom: Math.max(map.getZoom(), 11), duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350 });
    } };
  } catch (error) { dispose(); throw error; }
}
