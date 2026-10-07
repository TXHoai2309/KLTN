"use client";
import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { PublicLocation } from "@/modules/destination/public-destination-list";
import type { ExploreReturnHref } from "@/modules/destination/destination-detail-navigation";
import { projectMarkers } from "@/modules/map/map-model";
import { loadMapLibre, mapStyle } from "@/modules/map/map-config";
import { startMapSession } from "@/modules/map/map-session";
import { mountMapLibre } from "@/modules/map/maplibre-renderer";

export default function DestinationMap({ destinations, label = "Bản đồ điểm đến Hà Giang", detail = false, returnTo }: {
  destinations: readonly PublicLocation[]; label?: string; detail?: boolean; returnTo?: ExploreReturnHref;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const points = projectMarkers(destinations);
  const { resolvedTheme } = useTheme();
  const style = mapStyle(resolvedTheme);
  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    return startMapSession({ load: loadMapLibre, onState: setState,
      mount: (library, ready, fail) => mountMapLibre(host, library, points, style, detail, returnTo, ready, fail),
    });
    // points derive only from the same immutable result set used by List View.
  }, [destinations, attempt, detail, returnTo, style]);
  return <section className="destination-map" aria-label={label}>
    <div ref={container} className="destination-map-canvas" aria-label={label} style={{ visibility: state === "ready" ? "visible" : "hidden" }} />
    {state !== "ready" && <div className="destination-map-state destination-map-overlay" role={state === "error" ? "alert" : "status"} aria-busy={state === "loading"}>
      <strong>{state === "loading" ? "Đang tải bản đồ…" : "Bản đồ hiện không khả dụng"}</strong>
      {state === "error" && <><p>Không thể tải bản đồ. Thông tin điểm đến và Danh sách vẫn khả dụng.</p><button type="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>Thử lại bản đồ</button></>}
    </div>}
    {points.length === 0 && <p role="status" className="destination-map-note">{destinations.length ? "Các điểm đến này chưa có tọa độ hợp lệ để hiển thị trên bản đồ. Bạn vẫn có thể dùng Danh sách." : "Không tìm thấy điểm đến phù hợp."}</p>}
    {points.length > 0 && points.length < destinations.length && <p className="destination-map-note">{destinations.length - points.length} điểm đến chưa có tọa độ hợp lệ; xem trong Danh sách.</p>}
  </section>;
}
