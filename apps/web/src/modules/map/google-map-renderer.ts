import type { ExploreReturnHref } from "../destination/destination-detail-navigation";
import type { PlannerStop } from "../trip-planner/planner-contract";
import { EXTERNAL_PLACE_LABEL } from "../trip-planner/planner-contract";
import { destinationDetailHref, haGiangViewport, normalizeMapCoordinate, type MapCoordinate, type MapDestination, type RouteGeometry } from "./map-model";
import { itineraryDayColorToken, type ItineraryMapRoute } from "./itinerary-map-model";
import { cleanCategoryDisplayLabel } from "../../lib/traveler-display-clean";
import { onGoogleAuthorizationFailure, type GoogleMap, type GoogleMarker, type GoogleMapsSdk, type GooglePoint } from "./google-maps-sdk";

const point = (p: MapCoordinate): GooglePoint => ({ lat: p.latitude, lng: p.longitude });
const dark = (style: string) => style.includes("dark");
type Scene = { map: GoogleMap; restoring: boolean; cleanup: (() => void)[]; marker(position: MapCoordinate, content: HTMLElement, title: string, draggable?: boolean): GoogleMarker; line(geometry: RouteGeometry, color: string): void };

/** colorScheme is immutable in Google Maps: rebuild while preserving camera and caller selection. */
function mountScene(host: HTMLDivElement, sdk: GoogleMapsSdk, mapId: string, initialStyle: string, ready: () => void, fail: () => void, content: (scene: Scene) => void) {
  if (!mapId) throw new Error("Google Maps map ID is not configured");
  let currentStyle = initialStyle, disposed = false, destroy = () => {}, map: GoogleMap;
  const removeAuthListener = onGoogleAuthorizationFailure(fail);
  const render = (camera?: { center: GooglePoint; zoom: number }) => {
    const cleanup: (() => void)[] = [];
    map = new sdk.Map(host, { center: haGiangViewport.center, zoom: haGiangViewport.zoom, maxZoom: 18, mapId, colorScheme: dark(currentStyle) ? "DARK" : "LIGHT", gestureHandling: "cooperative", streetViewControl: false, mapTypeControl: false, fullscreenControl: false });
    const instance = map;
    destroy = () => { cleanup.splice(0).reverse().forEach(dispose => dispose()); sdk.event.clearInstanceListeners(instance); instance.unbindAll(); host.replaceChildren(); };
    try {
      let markedReady = false;
      const markReady = () => {
        if (disposed || markedReady) return;
        if (instance.getMapCapabilities?.().isAdvancedMarkersAvailable === false) {
          fail();
          return;
        }
        markedReady = true;
        ready();
      };
      const checkCapabilities = () => { if (!disposed && instance.getMapCapabilities?.().isAdvancedMarkersAvailable === false) fail(); };
      const capability = instance.addListener("mapcapabilities_changed", checkCapabilities);
      // Listen to BOTH `tilesloaded` and `idle`: on SPA remounts (tab switch / after save), Google Maps
      // often reuses cached tiles and fires `idle` without firing `tilesloaded`, which previously triggered the 15s timeout.
      const loaded = instance.addListener("tilesloaded", markReady);
      const idle = instance.addListener("idle", markReady);
      cleanup.push(() => loaded.remove(), () => idle.remove(), () => capability.remove());
      content({ map: instance, restoring: Boolean(camera), cleanup,
        marker(position, element, title, draggable = false) {
          const marker = new sdk.marker.AdvancedMarkerElement({ map: instance, position: point(position), title, gmpDraggable: draggable, gmpClickable: true });
          marker.append(element);
          cleanup.push(() => { sdk.event.clearInstanceListeners(marker); marker.map = null; marker.remove(); });
          return marker;
        },
        line(geometry, color) {
          const line = new sdk.Polyline({ map: instance, path: geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), strokeColor: color, strokeOpacity: 0.9, strokeWeight: 5, clickable: false });
          cleanup.push(() => line.setMap(null));
        },
      });
      if (camera) { instance.setCenter(camera.center); instance.setZoom(camera.zoom); }
    } catch (error) { destroy(); throw error; }
  };
  try { render(); } catch (error) { removeAuthListener(); throw error; }
  return {
    get map() { return map; },
    setStyle(next: string) {
      if (disposed || dark(next) === dark(currentStyle)) return;
      const center = map.getCenter(), zoom = map.getZoom();
      const camera = center && zoom !== undefined ? { center: { lat: center.lat(), lng: center.lng() }, zoom } : undefined;
      currentStyle = next; destroy();
      try { render(camera); } catch { fail(); }
    },
    dispose() { if (disposed) return; disposed = true; removeAuthListener(); destroy(); },
  };
}

function fit(sdk: GoogleMapsSdk, map: GoogleMap, points: readonly MapCoordinate[], extra: readonly RouteGeometry[] = []) {
  if (!points.length && !extra.length) return;
  if (points.length === 1 && !extra.length) { map.setCenter(point(points[0]!)); map.setZoom(12); return; }
  const bounds = new sdk.LatLngBounds(); points.forEach(p => bounds.extend(point(p)));
  extra.forEach(geometry => geometry.coordinates.forEach(([lng, lat]) => bounds.extend({ lng, lat })));
  map.fitBounds(bounds, { top: 70, right: 60, bottom: 140, left: 60 });
  const clamp = map.addListener("idle", () => { clamp.remove(); if ((map.getZoom() ?? 0) > 12) map.setZoom(12); });
  return () => clamp.remove();
}

export function mountGoogleDestinations(host: HTMLDivElement, sdk: GoogleMapsSdk, mapId: string, points: readonly MapDestination[], style: string, returnTo: ExploreReturnHref | undefined, ready: () => void, fail: () => void, extras: { routeGeometry?: RouteGeometry; disablePopup?: boolean } = {}) {
  return mountScene(host, sdk, mapId, style, ready, fail, scene => {
    points.forEach(p => {
      const button = document.createElement("button"); button.type = "button"; button.className = "destination-map-marker"; button.textContent = "●";
      button.setAttribute("aria-label", `Xem ${p.name}`); button.setAttribute("data-destination-id", p.id);
      if (extras.disablePopup) { const name = document.createElement("span"); name.className = "destination-map-marker-label"; name.textContent = p.name; button.append(name); }
      const marker = scene.marker(p, button, p.name);
      if (!extras.disablePopup) {
        const card = document.createElement("div"); card.className = "destination-map-popup";
        if (p.image?.url) { const image = document.createElement("img"); image.className = "destination-map-popup-thumb"; image.src = p.image.url; image.alt = p.image.alt || p.name; card.append(image); }
        const title = document.createElement("strong"); title.textContent = p.name;
        const context = document.createElement("p"); context.textContent = [p.area, cleanCategoryDisplayLabel(p.category) || p.category].filter(Boolean).join(" · ");
        const link = document.createElement("a"); link.textContent = "Xem chi tiết"; link.href = destinationDetailHref(p.id, returnTo); card.append(title, context, link);
        const popup = new sdk.InfoWindow({ content: card });
        const click = () => popup.open({ map: scene.map, anchor: marker, shouldFocus: true }); button.addEventListener("click", click);
        scene.cleanup.push(() => { button.removeEventListener("click", click); popup.close(); });
      }
    });
    if (extras.routeGeometry) scene.line(extras.routeGeometry, "#327252");
    if (!scene.restoring) { const stopFit = fit(sdk, scene.map, points, extras.routeGeometry ? [extras.routeGeometry] : []); if (stopFit) scene.cleanup.push(stopFit); }
  });
}

export function mountGooglePin(host: HTMLDivElement, sdk: GoogleMapsSdk, mapId: string, initial: MapCoordinate | null, style: string, changed: (coordinate: MapCoordinate) => void, ready: () => void, fail: () => void) {
  let disposed = false;
  let current = initial, update = (_coordinate: MapCoordinate | null, _recenter = true) => {};
  const scene = mountScene(host, sdk, mapId, style, ready, fail, ({ map, cleanup, marker: addMarker }) => {
    let marker: GoogleMarker | undefined;
    const button = document.createElement("button"); button.type = "button"; button.className = "destination-map-marker"; button.textContent = "●";
    button.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight");
    update = (coordinate, recenter = true) => {
      current = coordinate ? normalizeMapCoordinate(coordinate) : null;
      if (!current) { if (marker) marker.map = null; return; }
      if (!marker) {
        marker = addMarker(current, button, "Vị trí đã chọn", true);
        const drag = marker.addListener("dragend", () => {
          const p = marker?.position; if (!p) return;
          const moved = normalizeMapCoordinate({ latitude: typeof p.lat === "function" ? p.lat() : p.lat, longitude: typeof p.lng === "function" ? p.lng() : p.lng });
          update(moved, false); changed(moved);
        }); cleanup.push(() => drag.remove());
      }
      marker.map = map; marker.position = point(current);
      button.setAttribute("aria-label", `Pin vị trí. Vĩ độ ${current.latitude.toFixed(6)}, kinh độ ${current.longitude.toFixed(6)}. Dùng phím mũi tên để điều chỉnh.`);
      if (recenter) { map.setCenter(point(current)); map.setZoom(Math.max(map.getZoom() ?? 12, 12)); }
    };
    const keydown = (event: KeyboardEvent) => {
      const direction: Record<string, [number, number]> = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
      const step = direction[event.key]; if (!step || !current) return; event.preventDefault();
      const size = event.shiftKey ? 0.001 : 0.0001;
      const next = normalizeMapCoordinate({ latitude: current.latitude + step[0] * size, longitude: current.longitude + step[1] * size }); update(next); changed(next);
    };
    button.addEventListener("keydown", keydown); cleanup.push(() => button.removeEventListener("keydown", keydown));
    const click = map.addListener("click", event => {
      if (!event.latLng) return; const next = normalizeMapCoordinate({ latitude: event.latLng.lat(), longitude: event.latLng.lng() }); update(next, false); changed(next);
    }); cleanup.push(() => click.remove());
    update(current);
  });
  return { dispose() { disposed = true; scene.dispose(); }, setStyle: scene.setStyle, setCoordinates(coordinate: MapCoordinate | null, recenter = true) { if (!disposed) update(coordinate, recenter); } };
}

export type GoogleItineraryOptions = { routes?: readonly ItineraryMapRoute[]; overview?: boolean; markerDays?: ReadonlyMap<string, number>; origin?: { label: string; latitude: number; longitude: number } };
export function mountGoogleItinerary(host: HTMLDivElement, sdk: GoogleMapsSdk, mapId: string, stops: readonly PlannerStop[], style: string, onSelect: (id: string) => void, ready: () => void, fail: () => void, options: GoogleItineraryOptions = {}) {
  let selection: string | null = null, select = (_id: string | null, _focus = true) => {}, refit = () => {};
  const scene = mountScene(host, sdk, mapId, style, ready, fail, content => {
    const buttons: { stop: PlannerStop; button: HTMLButtonElement }[] = [];
    let fittedVisible = content.restoring && host.clientWidth > 0;
    const css = getComputedStyle(host);
    stops.forEach(stop => {
      const button = document.createElement("button"); button.type = "button"; button.className = "planner-map-marker"; button.textContent = String(stop.order);
      const day = options.markerDays?.get(stop.destination.id);
      button.setAttribute("aria-label", `${day ? `Ngày ${day} · ` : ""}Điểm ${stop.order}: ${stop.destination.name}${stop.destination.external ? ` (${EXTERNAL_PLACE_LABEL})` : ""}`);
      button.setAttribute("data-destination-id", stop.destination.id);
      if (day !== undefined) { button.setAttribute("data-trip-day", String(day)); button.style.setProperty("--planner-marker-color", `var(${itineraryDayColorToken(options.overview ? day : 1)})`); }
      const click = () => onSelect(stop.destination.id); button.addEventListener("click", click); content.cleanup.push(() => button.removeEventListener("click", click));
      content.marker(stop.destination, button, stop.destination.name); buttons.push({ stop, button });
    });
    if (options.origin) { const pin = document.createElement("div"); pin.className = "planner-map-origin-marker"; pin.textContent = "⌂"; pin.setAttribute("role", "img"); pin.setAttribute("aria-label", `Nơi xuất phát: ${options.origin.label}`); content.marker(options.origin, pin, options.origin.label); }
    options.routes?.forEach(route => content.line(route.geometry, css.getPropertyValue(route.boundary ? "--planner-route-origin" : itineraryDayColorToken(options.overview ? route.day : 1)).trim() || "#327252"));
    const positions = [...stops.map(stop => stop.destination), ...(options.origin ? [options.origin] : [])];
    refit = () => { if (host.clientWidth > 0) fittedVisible = true; const cleanup = fit(sdk, content.map, positions, options.routes?.map(route => route.geometry)); if (cleanup) content.cleanup.push(cleanup); };
    select = (id, focus = true) => {
      selection = id;
      buttons.forEach(({ button, stop }) => { const selected = stop.destination.id === id; button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected)); });
      const chosen = stops.find(stop => stop.destination.id === id);
      if (chosen && focus) { if (matchMedia("(prefers-reduced-motion: reduce)").matches) content.map.setCenter(point(chosen.destination)); else content.map.panTo(point(chosen.destination)); content.map.setZoom(Math.max(content.map.getZoom() ?? 11, 11)); }
    };
    if (!content.restoring) refit(); select(selection, false);
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => { if (host.clientWidth > 0) { sdk.event.trigger(content.map, "resize"); if (!fittedVisible) refit(); } });
    resize?.observe(host); content.cleanup.push(() => resize?.disconnect());
  });
  let disposed = false;
  return { dispose() { disposed = true; scene.dispose(); }, setStyle: scene.setStyle, fit() { if (!disposed) refit(); }, select(id: string | null, focus = true) { if (!disposed) select(id, focus); } };
}
