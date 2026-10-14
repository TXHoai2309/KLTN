import type * as MapLibre from "maplibre-gl";
import type { ExploreReturnHref } from "../destination/destination-detail-navigation";
import { destinationDetailHref, haGiangViewport, normalizeMapCoordinate, toMapCoordinate, type MapCoordinate, type MapDestination } from "./map-model";

export function mountMapLibre(host: HTMLDivElement, library: typeof MapLibre, points: readonly MapDestination[], style: string, detail: boolean, returnTo: ExploreReturnHref | undefined, onReady: () => void, onFailure: () => void) {
  const map = new library.Map({ container: host, style, center: toMapCoordinate(haGiangViewport.center), zoom: haGiangViewport.zoom, maxZoom: 15, cooperativeGestures: true, attributionControl: { compact: true } });
  const markers: MapLibre.Marker[] = []; const popups: MapLibre.Popup[] = [];
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; markers.forEach(item => item.remove()); popups.forEach(item => item.remove()); map.off("load", onReady); map.off("error", onFailure); map.remove(); };
  try {
    map.on("load", onReady); map.on("error", onFailure);
    map.addControl(new library.NavigationControl({ showCompass: false }), "top-right");
    points.forEach(point => {
      const card = document.createElement("div"); card.className = "destination-map-popup";
      const heading = document.createElement("strong"); heading.textContent = point.name;
      const context = document.createElement("p"); context.textContent = [point.area, point.category].filter(Boolean).join(" · "); card.append(heading, context);
      if (!detail) { const link = document.createElement("a"); link.textContent = "Xem chi tiết"; link.href = destinationDetailHref(point.id, returnTo); card.append(link); }
      const element = document.createElement("button"); element.type = "button"; element.className = "destination-map-marker"; element.setAttribute("aria-label", `Xem ${point.name}`); element.textContent = "●";
      const popup = new library.Popup({ offset: 24, focusAfterOpen: true }).setDOMContent(card); popups.push(popup);
      const marker = new library.Marker({ element }).setLngLat(toMapCoordinate(point)).setPopup(popup).addTo(map); markers.push(marker);
      // MapLibre's setPopup supplies click/Space/Enter handling for this native button.
    });
    if (points.length === 1) map.jumpTo({ center: toMapCoordinate(points[0]!), zoom: 12 });
    else if (points.length > 1) { const bounds = new library.LngLatBounds(); points.forEach(point => bounds.extend(toMapCoordinate(point))); map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 }); }
    return dispose;
  } catch (error) { dispose(); throw error; }
}

/** Admin-only editable pin. Public Explore markers continue to use mountMapLibre above. */
export function mountDestinationPinPicker(host: HTMLDivElement, library: typeof MapLibre, initial: MapCoordinate | null, style: string, onCoordinateChange: (coordinate: MapCoordinate) => void, onReady: () => void, onFailure: () => void) {
  const start = initial ?? haGiangViewport.center;
  const map = new library.Map({ container: host, style, center: toMapCoordinate(start), zoom: initial ? 12 : haGiangViewport.zoom, maxZoom: 18, cooperativeGestures: true, attributionControl: { compact: true } });
  let marker: MapLibre.Marker | null = null;
  let disposed = false;
  let markerKeydown: ((event: KeyboardEvent) => void) | null = null;

  const removeMarker = () => {
    if (!marker) return;
    const element = marker.getElement();
    if (markerKeydown) element.removeEventListener("keydown", markerKeydown);
    marker.remove();
    marker = null;
    markerKeydown = null;
  };

  const setCoordinates = (coordinate: MapCoordinate | null, recenter = true) => {
    const next = coordinate ? normalizeMapCoordinate(coordinate) : null;
    if (!next) {
      removeMarker();
      return;
    }
    if (!marker) {
      marker = new library.Marker({ draggable: true, color: "#35765c" }).setLngLat(toMapCoordinate(next)).addTo(map);
      const element = marker.getElement();
      element.tabIndex = 0;
      element.setAttribute("role", "group");
      element.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight");
      element.setAttribute("title", "Kéo hoặc dùng phím mũi tên để điều chỉnh pin");
      markerKeydown = event => {
        const steps: Record<string, [number, number]> = {
          ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1],
        };
        const direction = steps[event.key];
        if (!direction || !marker || disposed) return;
        const position = marker.getLngLat();
        const step = event.shiftKey ? 0.001 : 0.0001;
        const moved = normalizeMapCoordinate({ latitude: position.lat + direction[0] * step, longitude: position.lng + direction[1] * step });
        if (moved.latitude === position.lat && moved.longitude === position.lng) return;
        event.preventDefault();
        setCoordinates(moved);
        onCoordinateChange(moved);
      };
      element.addEventListener("keydown", markerKeydown);
      marker.on("dragend", () => {
        if (!marker || disposed) return;
        const position = marker.getLngLat();
        const moved = normalizeMapCoordinate({ latitude: position.lat, longitude: position.lng });
        setCoordinates(moved, false);
        onCoordinateChange(moved);
      });
    } else marker.setLngLat(toMapCoordinate(next));
    marker.getElement().setAttribute("aria-label", `Pin điểm đến. Vĩ độ ${next.latitude.toFixed(6)}, kinh độ ${next.longitude.toFixed(6)}. Dùng phím mũi tên để điều chỉnh.`);
    if (recenter) map.jumpTo({ center: toMapCoordinate(next), zoom: Math.max(map.getZoom(), 12) });
  };
  const handleMapClick = (event: MapLibre.MapMouseEvent) => {
    if (disposed) return;
    const next = normalizeMapCoordinate({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    setCoordinates(next, false);
    onCoordinateChange(next);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    removeMarker();
    map.off("load", onReady);
    map.off("error", onFailure);
    map.off("click", handleMapClick);
    map.remove();
  };

  try {
    map.on("load", onReady);
    map.on("error", onFailure);
    map.on("click", handleMapClick);
    if (initial) setCoordinates(initial, false);
    return { setCoordinates, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
