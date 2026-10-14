"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { MapPinned, RotateCcw } from "lucide-react";
import { loadMapLibre, mapStyle } from "@/modules/map/map-config";
import { startMapSession } from "@/modules/map/map-session";
import { mountItineraryMap } from "@/modules/map/itinerary-map-renderer";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";

export function ItineraryMap({ day, selectedDestinationId, focusSelection, onSelect }: { day: PlannerDay; selectedDestinationId: string | null; focusSelection: boolean; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof mountItineraryMap> | null>(null);
  const currentSelection = useRef(selectedDestinationId); currentSelection.current = selectedDestinationId;
  const callback = useRef(onSelect); callback.current = onSelect;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const { resolvedTheme } = useTheme(); const style = mapStyle(resolvedTheme);
  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    const dispose = startMapSession({ load: loadMapLibre, onState: setState, mount: (library, ready, fail) => {
      const map = mountItineraryMap(host, library, day.stops, style, id => callback.current(id), ready, fail);
      renderer.current = map; map.select(currentSelection.current, false);
      return () => { map.dispose(); if (renderer.current === map) renderer.current = null; };
    } });
    return dispose;
  }, [day, style, attempt]);
  useEffect(() => { renderer.current?.select(selectedDestinationId, focusSelection); }, [selectedDestinationId, focusSelection]);
  return <section className="planner-map" aria-label={`Bản đồ điểm dừng ngày ${day.day}`}>
    <div ref={container} className="planner-map-canvas" style={{ visibility: state === "ready" ? "visible" : "hidden" }} />
    {state !== "ready" && <div className="planner-map-state" role={state === "error" ? "alert" : "status"} aria-busy={state === "loading"}>
      <MapPinned size={34} aria-hidden="true" /><strong>{state === "loading" ? "Đang tải bản đồ hành trình…" : "Bản đồ chưa khả dụng"}</strong>
      <p>{state === "error" ? "Bạn vẫn có thể chọn điểm dừng trong lịch trình và xem thông tin bên dưới." : "Các điểm dừng lấy từ dữ liệu điểm đến hiện hành."}</p>
      {state === "error" && <button type="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}><RotateCcw size={16} /> Thử lại bản đồ</button>}
    </div>}
    <div className="planner-map-caption"><span><MapPinned size={16} aria-hidden="true" /> {day.stops.length} điểm dừng · Ngày {day.day}</span><span>Xem số liệu di chuyển ở phần tổng quan</span></div>
  </section>;
}
