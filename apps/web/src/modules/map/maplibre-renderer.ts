import type * as MapLibre from "maplibre-gl";
import type { ExploreReturnHref } from "../destination/destination-detail-navigation";
import { destinationDetailHref, haGiangViewport, normalizeMapCoordinate, toMapCoordinate, type MapCoordinate, type MapDestination, type RouteGeometry } from "./map-model";

export function mountMapLibre(host: HTMLDivElement, library: typeof MapLibre, points: readonly MapDestination[], style: string, returnTo: ExploreReturnHref | undefined, onReady: () => void, onFailure: (error?: unknown) => void, extras: { routeGeometry?: RouteGeometry; onMap?: (map: MapLibre.Map | null) => void; disablePopup?: boolean } = {}) {
  const map = new library.Map({ container: host, style, center: toMapCoordinate(haGiangViewport.center), zoom: haGiangViewport.zoom, maxZoom: 15, cooperativeGestures: true, attributionControl: { compact: true } });
  const markers: MapLibre.Marker[] = []; const popups: MapLibre.Popup[] = [];
  let disposed = false;
  const addRoute = () => {
    if (disposed || !extras.routeGeometry || map.getSource("destination-route")) return;
    map.addSource("destination-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: extras.routeGeometry } });
    map.addLayer({ id: "destination-route-line", type: "line", source: "destination-route", paint: { "line-color": "#327252", "line-width": 4, "line-opacity": 0.85 } });
  };
  // Hiển thị tên địa danh bằng tiếng Việt (name:vi) khi dữ liệu bản đồ có; nếu không thì giữ tên gốc.
  const localizeLabels = () => {
    if (disposed) return;
    try {
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type !== "symbol" || !layer.layout || !("text-field" in layer.layout) || !JSON.stringify(layer.layout["text-field"]).includes("name")) continue;
        map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:vi"], ["get", "name:latin"], ["get", "name"]]);
      }
    } catch { /* Kiểu bản đồ chưa sẵn sàng hoặc không có lớp chữ: bỏ qua, bản đồ vẫn dùng bình thường. */ }
  };
  const dispose = () => { if (disposed) return; disposed = true; extras.onMap?.(null); markers.forEach(item => item.remove()); popups.forEach(item => item.remove()); map.off("load", onReady); map.off("error", onFailure); map.off("style.load", addRoute); map.off("style.load", localizeLabels); map.remove(); };
  try {
    map.on("load", onReady); map.on("error", onFailure); map.on("style.load", localizeLabels);
    if (extras.routeGeometry) map.on("style.load", addRoute);
    extras.onMap?.(map);
    map.addControl(new library.NavigationControl({ showCompass: false }), "top-right");
    points.forEach(point => {
      const element = document.createElement("button"); element.type = "button"; element.className = "destination-map-marker"; element.setAttribute("aria-label", `Xem ${point.name}`); element.setAttribute("data-destination-id", point.id); element.textContent = "●";
      if (extras.disablePopup) { const nameLabel = document.createElement("span"); nameLabel.className = "destination-map-marker-label"; nameLabel.textContent = point.name; nameLabel.setAttribute("aria-hidden", "true"); element.append(nameLabel); } // chỉ bản đồ trang chủ hiện tên cạnh điểm
      const markerInstance = new library.Marker({ element }).setLngLat(toMapCoordinate(point));
      if (!extras.disablePopup) {
        const card = document.createElement("div"); card.className = "destination-map-popup";
        if (point.image?.url) {
          const thumb = document.createElement("img");
          thumb.className = "destination-map-popup-thumb";
          thumb.src = point.image.url;
          thumb.alt = point.image.alt || point.name;
          card.append(thumb);
        }
        const heading = document.createElement("strong"); heading.textContent = point.name;
        const context = document.createElement("p"); context.textContent = [point.area, point.category].filter(Boolean).join(" · "); card.append(heading, context);
        const link = document.createElement("a"); link.textContent = "Xem chi tiết"; link.href = destinationDetailHref(point.id, returnTo); card.append(link);
        const popup = new library.Popup({ offset: 24, focusAfterOpen: true }).setDOMContent(card);
        popups.push(popup);
        markerInstance.setPopup(popup);
      }
      const marker = markerInstance.addTo(map);
      markers.push(marker);
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
  let currentStyle = style;
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
    return {
      setCoordinates,
      dispose,
      setStyle(next: string) {
        if (disposed || currentStyle === next) return;
        map.setStyle(next);
        currentStyle = next;
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
