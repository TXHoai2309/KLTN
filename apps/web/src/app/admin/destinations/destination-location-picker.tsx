"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type * as MapLibre from "maplibre-gl";
import { loadMapLibre, mapStyle } from "@/modules/map/map-config";
import { mountDestinationPinPicker } from "@/modules/map/maplibre-renderer";
import { startMapSession } from "@/modules/map/map-session";
import type { MapCoordinate } from "@/modules/map/map-model";

type PinSession = ReturnType<typeof mountDestinationPinPicker>;

export default function DestinationLocationPicker({ coordinates, locationVerified, onChange }: {
  coordinates: MapCoordinate | null;
  locationVerified: boolean;
  onChange: (coordinates: MapCoordinate) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const session = useRef<PinSession | null>(null);
  const coordinatesRef = useRef(coordinates);
  const onChangeRef = useRef(onChange);
  coordinatesRef.current = coordinates;
  onChangeRef.current = onChange;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const { resolvedTheme } = useTheme();
  const style = mapStyle(resolvedTheme);

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    return startMapSession({
      load: loadMapLibre,
      onState: setState,
      mount: (library, ready, fail) => {
        const mounted = mountDestinationPinPicker(host, library as typeof MapLibre, coordinatesRef.current, style, value => onChangeRef.current(value), ready, fail);
        session.current = mounted;
        return () => {
          mounted.dispose();
          if (session.current === mounted) session.current = null;
        };
      },
    });
  }, [attempt, style]);

  useEffect(() => {
    session.current?.setCoordinates(coordinates);
  }, [coordinates?.latitude, coordinates?.longitude]);

  const pinStatus = coordinates
    ? locationVerified ? "Vị trí hiện được đánh dấu đã xác nhận." : "Pin đang chờ xác nhận. Tọa độ chỉ được lưu khi bạn bấm Lưu thay đổi."
    : "Chưa có pin. Nhấp bản đồ hoặc nhập đủ tọa độ để chọn vị trí.";

  return <section className="destination-location-picker" aria-label="Chọn pin điểm đến">
    <p className="destination-helper">Nhấp bản đồ để đặt pin. Kéo marker hoặc focus marker rồi dùng phím mũi tên để điều chỉnh.</p>
    <div className="destination-map destination-location-map">
      <div ref={container} className="destination-map-canvas" aria-label="Bản đồ chọn vị trí điểm đến" style={{ visibility: state === "ready" ? "visible" : "hidden" }} />
      {state !== "ready" && <div className="destination-map-state destination-map-overlay" role={state === "error" ? "alert" : "status"} aria-busy={state === "loading"}>
        <strong>{state === "loading" ? "Đang tải bản đồ…" : "Bản đồ hiện không khả dụng"}</strong>
        {state === "error" && <><p>Tọa độ vẫn có thể nhập thủ công. Thử tải lại bản đồ khi kết nối ổn định.</p><button type="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>Thử lại bản đồ</button></>}
      </div>}
    </div>
    <p className="destination-location-status" role="status" aria-live="polite">{pinStatus}</p>
  </section>;
}
