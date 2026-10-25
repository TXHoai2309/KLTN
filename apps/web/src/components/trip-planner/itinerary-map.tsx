"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { MapPinned, RotateCcw } from "lucide-react";
import { loadMapLibre, mapStyle } from "@/modules/map/map-config";
import { startMapSession } from "@/modules/map/map-session";
import { mountItineraryMap } from "@/modules/map/itinerary-map-renderer";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import { DestinationPreviewCard } from "./planner-presentation";

export function ItineraryMap({
  day,
  selectedDestinationId,
  focusSelection,
  onSelect,
}: {
  day: PlannerDay;
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
          day.stops,
          styleRef.current,
          (id) => callback.current(id),
          ready,
          fail,
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
  }, [day, attempt]);

  useEffect(() => {
    renderer.current?.setStyle(style);
  }, [style]);

  useEffect(() => {
    renderer.current?.select(selectedDestinationId, focusSelection);
  }, [selectedDestinationId, focusSelection]);

  const selectedStop = day.stops.find((stop) => stop.destination.id === selectedDestinationId);

  return (
    <section className="planner-map" aria-label={`Bản đồ điểm dừng ngày ${day.day}`}>
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
      {selectedStop && (
        <DestinationPreviewCard
          stop={selectedStop}
          onClose={() => onSelect("")}
        />
      )}

      <div className="planner-map-caption">
        <span>
          <MapPinned size={14} aria-hidden="true" /> {day.stops.length} điểm dừng · Ngày {day.day}
        </span>
        <span className="sr-only">Bản đồ sử dụng dữ liệu nền từ Stadia Maps</span>
      </div>
    </section>
  );
}
