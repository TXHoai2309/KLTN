"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Expand, MapPinned, RotateCcw } from "lucide-react";
import { mapStyle } from "@/modules/map/map-config";
import { loadMapLibrary, mountItineraryMap } from "@/modules/map/map-renderer";
import type { MapsProvider } from "@/modules/map/maps-provider";
import { startMapSession } from "@/modules/map/map-session";
import { buildItineraryMapView, itineraryDayColorToken } from "@/modules/map/itinerary-map-model";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import type { JourneyPlan } from "@/modules/trip-origin/journey-route-contract";
import { DestinationPreviewCard } from "./planner-presentation";

export function ItineraryMap({
  day,
  days,
  selectedDestinationId,
  focusSelection,
  onSelect,
  overviewOnly = false,
  journeyPlan,
  origin,
}: {
  day: PlannerDay;
  days: PlannerDay[];
  selectedDestinationId: string | null;
  focusSelection: boolean;
  onSelect: (id: string) => void;
  overviewOnly?: boolean;
  /** Owner-only origin data; shared-trip views never pass it. */
  journeyPlan?: JourneyPlan | null;
  origin?: { label: string; latitude: number; longitude: number; source?: string } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof mountItineraryMap> | null>(null);
  const currentSelection = useRef(selectedDestinationId);
  currentSelection.current = selectedDestinationId;
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [provider, setProvider] = useState<MapsProvider | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showOverview, setOverview] = useState(false);
  const overview = overviewOnly || showOverview;
  const canShowOrigin = !(provider === "STADIA" && origin?.source === "GOOGLE_PLACES");
  const activeDay = overview ? null : day.day;
  const originLabel = origin?.label;
  const originLat = origin?.latitude;
  const originLng = origin?.longitude;
  const originSource = origin?.source;
  const stableOrigin = useMemo(
    () =>
      originLabel !== undefined && originLat !== undefined && originLng !== undefined
        ? { label: originLabel, latitude: originLat, longitude: originLng, ...(originSource !== undefined ? { source: originSource } : {}) }
        : null,
    [originLabel, originLat, originLng, originSource],
  );
  const view = useMemo(() => buildItineraryMapView(days, activeDay, stableOrigin ? journeyPlan : null, provider ?? "STADIA"), [days, activeDay, journeyPlan, stableOrigin, provider]);
  const { resolvedTheme } = useTheme();
  const style = mapStyle(resolvedTheme);
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    let cancelled = false;
    let disposeSession: (() => void) | null = null;
    let waitObserver: ResizeObserver | null = null;

    const begin = () => {
      if (cancelled || disposeSession) return;
      disposeSession = startMapSession({
        load: () => loadMapLibrary(undefined, attempt > 0 ? { forceRefresh: true } : undefined),
        onState: setState,
        mount: (library, ready, fail) => {
          setProvider(library.provider);
          const visible = buildItineraryMapView(days, activeDay, stableOrigin ? journeyPlan : null, library.provider);
          const map = mountItineraryMap(
            host,
            library,
            visible.stops,
            styleRef.current,
            (id) => callback.current(id),
            ready,
            fail,
            { routes: visible.routes, markerDays: visible.markerDays, overview, ...(visible.showsOrigin && stableOrigin && !(library.provider === "STADIA" && stableOrigin.source === "GOOGLE_PLACES") ? { origin: stableOrigin } : {}) },
          );
          renderer.current = map;
          map.select(currentSelection.current, false);
          return () => {
            map.dispose();
            if (renderer.current === map) renderer.current = null;
          };
        },
      });
    };

    // Never start the 15s load timeout while the map host is hidden (display: none -> 0x0),
    // because Google Maps / WebGL will not emit tilesloaded/idle until the container has non-zero layout.
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      begin();
    } else if (typeof ResizeObserver !== "undefined") {
      setState("loading");
      waitObserver = new ResizeObserver(() => {
        if (!cancelled && host.clientWidth > 0 && host.clientHeight > 0) {
          waitObserver?.disconnect();
          waitObserver = null;
          begin();
        }
      });
      waitObserver.observe(host);
    } else {
      begin();
    }

    return () => {
      cancelled = true;
      waitObserver?.disconnect();
      disposeSession?.();
    };
  }, [days, activeDay, journeyPlan, overview, attempt, stableOrigin]);

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
        {!overviewOnly && <div className="planner-map-scope" role="group" aria-label="Phạm vi bản đồ">
          <button type="button" aria-pressed={!overview} onClick={() => setOverview(false)}>Ngày {day.day}</button>
          <button type="button" aria-pressed={overview} onClick={() => setOverview(true)}>Toàn hành trình</button>
        </div>}
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
              ? "Bạn vẫn có thể xem danh sách điểm dừng trong lịch trình."
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
        {provider && <span className="sr-only">Bản đồ sử dụng {provider === "GOOGLE" ? "Google Maps" : "Stadia Maps"}</span>}
      </div>
      </div>
      {state === "ready" && <div className="planner-map-route-status" role="status" aria-live="polite">
        {provider === "STADIA" && days.some(item => item.stops.some(stop => stop.destination.external)) && <p>Điểm ngoài danh mục từ Google vẫn có trong lịch trình, nhưng không hiển thị trên bản đồ Stadia.</p>}
        {provider === "GOOGLE" && <p>Tuyến xe máy của Google đang thử nghiệm và có thể chưa phù hợp với mọi đường đi. Hãy kiểm tra biển báo và điều kiện thực tế.</p>}
        <p>{view.routes.length ? `${view.routes.length} chặng đường bộ dự kiến được hiển thị.` : view.stops.length < 2 ? "Chưa có chặng di chuyển trong phạm vi này." : "Chưa có hình tuyến đường để hiển thị."}</p>
        {view.missingGeometryCount > 0 && <p>Chưa có hình tuyến cho {view.missingGeometryCount} chặng; các điểm dừng vẫn hiển thị.</p>}
        {!canShowOrigin && <p>Ghim nơi xuất phát từ Google không hiển thị trên bản đồ Stadia. Lịch trình đã lưu vẫn được giữ nguyên.</p>}
        {view.showsOrigin && <p className="planner-map-origin-note"><span aria-hidden="true" />Đường màu đỏ gạch là chặng đi hoặc về nơi xuất phát.</p>}
        {!overview && view.hasPreviousDayTransfer && <p>Điểm 0 là điểm cuối ngày trước, nơi bắt đầu chặng chuyển ngày.</p>}
      </div>}
    </section>
  );
}
