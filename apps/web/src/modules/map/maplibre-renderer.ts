import type * as MapLibre from "maplibre-gl";
import type { ExploreReturnHref } from "../destination/destination-detail-navigation";
import { destinationDetailHref, haGiangViewport, toMapCoordinate, type MapDestination } from "./map-model";

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
