"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

type Destination = {
  id: string;
  name: string;
  area: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
};
type Position = { lat: number; lng: number };
type Listener = { remove(): void };
type GoogleMap = { addListener(event: string, handler: () => void): Listener };
type GoogleMarker = HTMLElement & { map: GoogleMap | null };
type GoogleInfoWindow = { open(options: { map: GoogleMap; anchor: GoogleMarker }): void; close(): void };
type GoogleMapsLibrary = {
  Map: new (host: HTMLElement, options: { center: Position; zoom: number; maxZoom: number; mapId: string; colorScheme: "LIGHT" | "DARK"; gestureHandling: "cooperative"; mapTypeControl: boolean; streetViewControl: boolean; fullscreenControl: boolean }) => GoogleMap;
  InfoWindow: new (options: { content: HTMLElement }) => GoogleInfoWindow;
  AdvancedMarkerElement: new (options: { map: GoogleMap; position: Position; title: string; gmpClickable: boolean }) => GoogleMarker;
};
type GoogleWindow = Window & {
  google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
  __kltnGoogleMapsReady?: () => void;
};

let mapsPromise: Promise<GoogleMapsLibrary> | null = null;

export function googleDetailPosition(destination: Pick<Destination, "latitude" | "longitude">): Position | null {
  const { latitude, longitude } = destination;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { lat: latitude, lng: longitude };
}

function loadGoogleMaps(key: string): Promise<GoogleMapsLibrary> {
  if (mapsPromise) return mapsPromise;
  const browser = window as GoogleWindow;
  mapsPromise = (async () => {
    if (!browser.google?.maps?.importLibrary) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          delete browser.__kltnGoogleMapsReady;
          if (error) { script.remove(); reject(error); }
          else resolve();
        };
        const timeout = setTimeout(() => finish(new Error("Google Maps load timed out")), 15000);
        browser.__kltnGoogleMapsReady = () => finish();
        script.async = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=maps,marker&callback=__kltnGoogleMapsReady`;
        script.onerror = () => finish(new Error("Google Maps load failed"));
        document.head.append(script);
      });
    }
    const importLibrary = browser.google?.maps?.importLibrary;
    if (!importLibrary) throw new Error("Google Maps library unavailable");
    const [maps, marker] = await Promise.all([importLibrary("maps"), importLibrary("marker")]);
    const mapsLibrary = maps as Pick<GoogleMapsLibrary, "Map" | "InfoWindow">;
    const markerLibrary = marker as Pick<GoogleMapsLibrary, "AdvancedMarkerElement">;
    if (!mapsLibrary.Map || !mapsLibrary.InfoWindow || !markerLibrary.AdvancedMarkerElement) throw new Error("Google Maps library incomplete");
    return { Map: mapsLibrary.Map, InfoWindow: mapsLibrary.InfoWindow, AdvancedMarkerElement: markerLibrary.AdvancedMarkerElement };
  })().catch(error => { mapsPromise = null; throw error; });
  return mapsPromise;
}

export function mountGoogleDetailMap(host: HTMLElement, library: GoogleMapsLibrary, destination: Destination, position: Position, mapId: string, theme: "LIGHT" | "DARK", onReady: () => void) {
  const map = new library.Map(host, {
    center: position, zoom: 12, maxZoom: 15, mapId, colorScheme: theme,
    gestureHandling: "cooperative", mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
  });
  let tilesListener: Listener | null = null;
  let marker: GoogleMarker | null = null;
  let infoWindow: GoogleInfoWindow | null = null;
  let onMarkerClick: EventListener | null = null;
  const dispose = () => {
    tilesListener?.remove();
    if (marker && onMarkerClick) marker.removeEventListener("gmp-click", onMarkerClick);
    infoWindow?.close();
    if (marker) marker.map = null;
    host.replaceChildren();
  };
  try {
    tilesListener = map.addListener("tilesloaded", onReady);
    marker = new library.AdvancedMarkerElement({ map, position, title: `Xem ${destination.name}`, gmpClickable: true });
    const card = document.createElement("div");
    card.className = "destination-map-popup";
    const heading = document.createElement("strong");
    heading.textContent = destination.name;
    const context = document.createElement("p");
    context.textContent = [destination.area, destination.category].filter(Boolean).join(" · ");
    card.append(heading, context);
    infoWindow = new library.InfoWindow({ content: card });
    onMarkerClick = () => infoWindow?.open({ map, anchor: marker! });
    marker.addEventListener("gmp-click", onMarkerClick);
    return dispose;
  } catch (error) { dispose(); throw error; }
}

export default function GoogleDestinationDetailMap({ destination, label }: { destination: Destination; label?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const { resolvedTheme } = useTheme();
  const position = googleDetailPosition(destination);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim();

  useEffect(() => {
    if (!position || !key || !mapId || !host.current) return;
    const container = host.current;
    let disposed = false;
    let failed = false;
    let disposeMap: (() => void) | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    setState("loading");
    const fail = () => { if (!disposed) { failed = true; setState("error"); } };
    void loadGoogleMaps(key).then(library => {
      if (disposed) return;
      try {
        timeout = setTimeout(fail, 15000);
        disposeMap = mountGoogleDetailMap(container, library, destination, position, mapId, resolvedTheme === "dark" ? "DARK" : "LIGHT", () => {
          if (!disposed && !failed) { if (timeout) clearTimeout(timeout); setState("ready"); }
        });
      } catch { fail(); }
    }).catch(fail);
    return () => {
      disposed = true;
      if (timeout) clearTimeout(timeout);
      disposeMap?.();
      if (!disposeMap) container.replaceChildren();
    };
  }, [position?.lat, position?.lng, destination.name, destination.area, destination.category, key, mapId, resolvedTheme, attempt]);

  const mapLabel = label ?? `Bản đồ vị trí ${destination.name}`;
  if (!position) return <section className="destination-map" aria-label={mapLabel}><div className="destination-map-state" role="status">Điểm đến chưa có tọa độ hợp lệ để hiển thị trên bản đồ.</div></section>;
  const unavailable = !key || !mapId || state === "error";
  return <section className="destination-map destination-google-map" aria-label={mapLabel}>
    <div ref={host} className="destination-map-canvas" aria-label={mapLabel} />
    {state !== "ready" || unavailable ? <div className="destination-map-state destination-map-overlay" role={unavailable ? "alert" : "status"} aria-busy={!unavailable}>
      <strong>{unavailable ? "Bản đồ hiện không khả dụng" : "Đang tải bản đồ…"}</strong>
      {unavailable && <><p>Không thể tải bản đồ. Thông tin điểm đến vẫn khả dụng.</p><button type="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>Thử lại bản đồ</button></>}
    </div> : null}
  </section>;
}
