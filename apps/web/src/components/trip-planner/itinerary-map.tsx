"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Expand, MapPinned, RotateCcw } from "lucide-react";
import { loadMapLibre, mapStyle } from "@/modules/map/map-config";
import { startMapSession } from "@/modules/map/map-session";
import { mountItineraryMap } from "@/modules/map/itinerary-map-renderer";
import { buildItineraryMapView, itineraryDayColorToken } from "@/modules/map/itinerary-map-model";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import { DestinationPreviewCard } from "./planner-presentation";

export function ItineraryMap({
  day,
  days,
  selectedDestinationId,
  focusSelection,
  onSelect,
}: {
  day: PlannerDay;
  days: PlannerDay[];
  selectedDestinationId: string | null;
  focusSelection: boolean;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof mountItineraryMap> | null>(null);
  const currentSelection = useRef(selectedDestinationId);
  currentSelection.current = selectedDestinationId;
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [overview, setOverview] = useState(false);
  const activeDay = overview ? null : day.day;
  const view = useMemo(() => buildItineraryMapView(days, activeDay), [days, activeDay]);
  const { resolvedTheme } = useTheme();
  const style = mapStyle(resolvedTheme);
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    const dispose = startMapSession({
      load: loadMapLibre,
      onState: setState,
      mount: (library, ready, fail) => {
        const map = mountItineraryMap(
          host,
          library,
          view.stops,
          styleRef.current,
          (id) => callback.current(id),
          ready,
          fail,
          { routes: view.routes, markerDays: view.markerDays, overview },
        );
        renderer.current = map;
        map.select(currentSelection.current, false);
        return () => {
          map.dispose();
          if (renderer.current === map) renderer.current = null;
        };
      },
    });
    return dispose;
  }, [view, overview, attempt]);

  useEffect(() => {
    renderer.current?.setStyle(style);
  }, [style]);

  useEffect(() => {
    renderer.current?.select(selectedDestinationId, focusSelection);
  }, [selectedDestinationId, focusSelection]);

  const selectedStop = view.stops.find((stop) => stop.destination.id === selectedDestinationId);

  return (
    <section className="planner-map-workspace" aria-label="Bản đồ hành trình">
      <div className="planner-map-toolbar">
        <div className="planner-map-scope" role="group" aria-label="Phạm vi bản đồ">
          <button type="button" aria-pressed={!overview} onClick={() => setOverview(false)}>Ngày {day.day}</button>
          <button type="button" aria-pressed={overview} onClick={() => setOverview(true)}>Toàn hành trình</button>
        </div>
        <button className="planner-map-fit" type="button" disabled={state !== "ready"} onClick={() => renderer.current?.fit()}>
          <Expand size={15} aria-hidden="true" /><span>Vừa bản đồ</span>
        </button>
      </div>
      {overview && (
        <ul className="planner-map-legend" aria-label="Màu tuyến theo ngày">
          {days.map(item => (
            <li key={item.day} style={{ "--planner-marker-color": `var(${itineraryDayColorToken(item.day)})` } as CSSProperties}>
              <span aria-hidden="true" />Ngày {item.day}<small>{item.stops.length} điểm</small>
            </li>
          ))}
        </ul>
      )}
      <div className="planner-map" aria-label={overview ? `Bản đồ toàn hành trình ${days.length} ngày` : `Bản đồ điểm dừng ngày ${day.day}`}>
      <div
        ref={container}
        className="planner-map-canvas"
        style={{ visibility: state === "ready" ? "visible" : "hidden" }}
      />
      {state !== "ready" && (
        <div
          className="planner-map-state"
          role={state === "error" ? "alert" : "status"}
          aria-busy={state === "loading"}
        >
          <MapPinned size={32} aria-hidden="true" />
          <strong>
            {state === "loading" ? "Đang tải bản đồ hành trình…" : "Bản đồ chưa khả dụng"}
          </strong>
          <p>
            {state === "error"
              ? "Bạn vẫn có thể xem danh sách điểm dừng trong lịch trình bên cạnh."
              : "Các điểm dừng lấy từ dữ liệu điểm đến hiện hành."}
          </p>
          {state === "error" && (
            <button
              type="button"
              onClick={() => {
                setState("loading");
                setAttempt((v) => v + 1);
              }}
            >
              <RotateCcw size={15} /> Thử lại bản đồ
            </button>
          )}
        </div>
      )}

      {/* Floating Destination Detail Card */}
      {state !== "error" && selectedStop && (
        <DestinationPreviewCard
          stop={selectedStop}
          onClose={() => onSelect("")}
        />
      )}

      <div className="planner-map-caption">
        <span>
          <MapPinned size={14} aria-hidden="true" /> {overview ? `${view.stops.length} điểm dừng · ${days.length} ngày` : `${day.stops.length} điểm dừng · Ngày ${day.day}`}
        </span>
        <span className="sr-only">Bản đồ sử dụng dữ liệu nền từ Stadia Maps</span>
      </div>
      </div>
      {state === "ready" && <div className="planner-map-route-status" role="status" aria-live="polite">
        <p>{view.routes.length ? `${view.routes.length} chặng đường bộ dự kiến được hiển thị.` : view.stops.length < 2 ? "Chưa có chặng di chuyển trong phạm vi này." : "Chưa có hình tuyến đường để hiển thị."}</p>
        {view.missingGeometryCount > 0 && <p>Chưa có hình tuyến cho {view.missingGeometryCount} chặng; các điểm dừng vẫn hiển thị.</p>}
        {!overview && view.hasPreviousDayTransfer && <p>Điểm 0 là điểm cuối ngày trước, nơi bắt đầu chặng chuyển ngày.</p>}
      </div>}
    </section>
  );
}
