"use client";

import { useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CloudDrizzle,
  CloudFog,
  CloudOff,
  CloudRain,
  CloudSun,
  Droplets,
  EyeOff,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import type { JourneyPlan } from "@/modules/trip-origin/journey-route-contract";
import { formatMinute, formatShortViDate } from "./sun-times";
import { toTripWeatherRequest } from "./trip-weather-request";
import { useTripWeatherState } from "./trip-weather-state";
import {
  FOG_VISIBILITY_THRESHOLD_M,
  RAIN_INTENSITY_THRESHOLD_MM,
  RAIN_PROBABILITY_THRESHOLD,
  WIND_GUST_THRESHOLD_KMH,
  type TripWeather,
  type WeatherAdvisory,
  type WindowSummary,
  type WindowWeather,
} from "./trip-weather-service";
import "./trip-weather.css";

export { toTripWeatherRequest };

export const KIND_TEXT: Record<WeatherAdvisory["kind"], string> = {
  RAIN: "Mưa",
  FOG: "Sương mù",
  WIND: "Gió giật",
  AFTER_SUNSET: "Sau hoàng hôn",
};

export function advisoryChipIcon(kind: WeatherAdvisory["kind"]) {
  if (kind === "RAIN") return CloudRain;
  if (kind === "FOG") return CloudFog;
  if (kind === "WIND") return Wind;
  return Sunset;
}

export function advisoryValueShort(a: WeatherAdvisory) {
  if (a.kind === "RAIN") return a.threshold < 10 ? `${a.observed} mm/h` : `${a.observed}%`;
  if (a.kind === "FOG") return `${(a.observed / 1000).toFixed(1)} km`;
  if (a.kind === "WIND") return `${Math.round(a.observed)} km/h`;
  return `(>${formatMinute(a.threshold)})`;
}

function advisoryText(a: WeatherAdvisory, names: Map<string, string>) {
  const where = a.location.type === "VISIT" ? names.get(a.location.destinationId) ?? "Điểm đến" : `chặng ${a.location.label}`;
  const when = `${a.fromTime.slice(11, 16)}–${a.toTime.slice(11, 16)}`;
  const detail = a.kind === "RAIN" ? (a.threshold < 10 ? `lượng mưa ${a.observed} mm/h (ngưỡng ${a.threshold})` : `khả năng mưa ${a.observed}% (ngưỡng ${a.threshold}%)`)
    : a.kind === "FOG" ? `tầm nhìn ${(a.observed / 1000).toFixed(1)} km (ngưỡng dưới ${a.threshold / 1000} km)`
    : a.kind === "WIND" ? `gió giật ${Math.round(a.observed)} km/h (ngưỡng ${a.threshold} km/h)`
    : `kết thúc lúc ${formatMinute(a.observed % 1440)}, hoàng hôn ${formatMinute(a.threshold)}`;
  return `Ngày ${a.day} · ${where} · ${when}: ${KIND_TEXT[a.kind]} — ${detail}`;
}

export function unavailableReasonText(reason: Extract<WindowWeather, { status: "UNAVAILABLE" }>["reason"]) {
  if (reason === "NO_DATE") return "Chưa có ngày đi nên chưa có dự báo";
  if (reason === "NO_TIME") return "Chưa có giờ đến nên chưa có dự báo";
  if (reason === "DESTINATION_UNAVAILABLE") return "Điểm đến không còn công khai";
  return "Không lấy được dự báo";
}

export function formatTempSummary(s: WindowSummary): string | null {
  if (s.minTemperatureC === null || s.maxTemperatureC === null) return null;
  const lo = Math.round(s.minTemperatureC);
  const hi = Math.round(s.maxTemperatureC);
  return lo === hi ? `${hi}°C` : `${lo}–${hi}°C`;
}

export function formatRainSummary(s: WindowSummary): string | null {
  if (s.maxPrecipitationProbability !== null) {
    if (s.maxPrecipitationMm !== null && s.maxPrecipitationMm >= RAIN_INTENSITY_THRESHOLD_MM) {
      return `mưa ${s.maxPrecipitationProbability}% (${s.maxPrecipitationMm.toFixed(1)} mm/h)`;
    }
    return `mưa ${s.maxPrecipitationProbability}%`;
  }
  if (s.maxPrecipitationMm !== null) return `mưa ${s.maxPrecipitationMm.toFixed(1)} mm/h`;
  return null;
}

export function conditionMeta(s: WindowSummary) {
  const hasAny =
    s.minTemperatureC !== null ||
    s.maxPrecipitationProbability !== null ||
    s.maxPrecipitationMm !== null ||
    s.minVisibilityM !== null ||
    s.maxWindGustKmh !== null;
  if (!hasAny) return { Icon: CloudOff, label: "Chưa có số liệu", tone: "muted" as const };
  if (
    (s.maxPrecipitationProbability !== null && s.maxPrecipitationProbability >= RAIN_PROBABILITY_THRESHOLD) ||
    (s.maxPrecipitationMm !== null && s.maxPrecipitationMm >= RAIN_INTENSITY_THRESHOLD_MM)
  ) {
    return { Icon: CloudRain, label: "Khả năng mưa cao", tone: "caution" as const };
  }
  if (s.minVisibilityM !== null && s.minVisibilityM < FOG_VISIBILITY_THRESHOLD_M) {
    return { Icon: CloudFog, label: "Sương mù / tầm nhìn thấp", tone: "caution" as const };
  }
  if (s.maxWindGustKmh !== null && s.maxWindGustKmh >= WIND_GUST_THRESHOLD_KMH) {
    return { Icon: Wind, label: "Gió giật mạnh", tone: "caution" as const };
  }
  if ((s.maxPrecipitationProbability !== null && s.maxPrecipitationProbability >= 35) || (s.maxPrecipitationMm !== null && s.maxPrecipitationMm > 0)) {
    return { Icon: CloudDrizzle, label: "Có thể có mưa", tone: "neutral" as const };
  }
  return { Icon: CloudSun, label: "Ít mưa", tone: "neutral" as const };
}

function VisitWeatherMetrics({ weather }: { weather: WindowWeather }) {
  if (weather.status === "NOT_YET_AVAILABLE") {
    return (
      <span className="trip-weather-state trip-weather-state--pending">
        <CalendarClock size={14} aria-hidden="true" />
        <span>Chưa có dự báo, sẽ có từ ngày {formatShortViDate(weather.availableFrom)}</span>
      </span>
    );
  }
  if (weather.status === "UNAVAILABLE") {
    return (
      <span className="trip-weather-state trip-weather-state--unavailable">
        <CloudOff size={14} aria-hidden="true" />
        <span>{unavailableReasonText(weather.reason)}</span>
      </span>
    );
  }

  const s = weather.summary;
  const { Icon, label, tone } = conditionMeta(s);
  if (tone === "muted") {
    return (
      <span className="trip-weather-state trip-weather-state--unavailable">
        <CloudOff size={14} aria-hidden="true" />
        <span>Nhà cung cấp không có số liệu</span>
      </span>
    );
  }

  const temp = formatTempSummary(s);
  const rain = formatRainSummary(s);
  const lowVisibility = s.minVisibilityM !== null && s.minVisibilityM < FOG_VISIBILITY_THRESHOLD_M;

  return (
    <div className="trip-weather-metrics">
      <span className={`trip-weather-cond trip-weather-cond--${tone}`} title={label}>
        <Icon size={15} aria-hidden="true" />
        <span className="sr-only">{label}</span>
        {temp && <strong className="trip-weather-temp">{temp}</strong>}
      </span>
      {rain && (
        <span className="trip-weather-metric">
          <Droplets size={13} aria-hidden="true" />
          <span>{rain}</span>
        </span>
      )}
      {lowVisibility && (
        <span className="trip-weather-metric trip-weather-metric--warn">
          <EyeOff size={13} aria-hidden="true" />
          <span>tầm nhìn {(s.minVisibilityM! / 1000).toFixed(1)} km</span>
        </span>
      )}
    </div>
  );
}

type VisitAdvisory = Omit<WeatherAdvisory, "location"> & { location: Extract<WeatherAdvisory["location"], { type: "VISIT" }> };

export function resolveAdvisoryJump(targetId: string) {
  return { highlightedTarget: targetId };
}

export function TripWeatherView({
  weather,
  days,
  initialHighlightedTarget = null,
}: {
  weather: TripWeather;
  days: PlannerDay[];
  initialHighlightedTarget?: string | null;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = rawId ? `tw-${rawId}` : "tw";
  const [highlightedTarget, setHighlightedTarget] = useState<string | null>(initialHighlightedTarget);
  // Per-leg weather is not shown, so only warnings tied to a visit are listed.
  const advisories = useMemo(
    () => weather.advisories.filter((a): a is VisitAdvisory => a.location.type === "VISIT"),
    [weather.advisories],
  );

  const names = useMemo(
    () => new Map(days.flatMap(d => d.stops.map(s => [s.destination.id, s.destination.name] as const))),
    [days],
  );
  const stopsByDay = useMemo(
    () => new Map(days.map(d => [d.day, d.stops] as const)),
    [days],
  );

  const allVisits = weather.days.flatMap(d => d.visits);
  const hasAvailable = allVisits.some(v => v.weather.status === "AVAILABLE");
  const allNotYetAvailable = !hasAvailable && allVisits.length > 0 && allVisits.every(v => v.weather.status === "NOT_YET_AVAILABLE");
  const allUnavailable = !hasAvailable && !allNotYetAvailable && allVisits.length > 0;

  const targetIdForAdvisory = (a: (typeof advisories)[number]) => `${prefix}-visit-${a.day}-${a.location.destinationId}`;

  const jumpToTarget = (targetId: string) => {
    setHighlightedTarget(resolveAdvisoryJump(targetId).highlightedTarget);
    const focusTarget = () => {
      const el = typeof document !== "undefined" ? document.getElementById(targetId) : null;
      if (!el) return;
      const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
      el.focus?.({ preventScroll: true });
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focusTarget);
    else focusTarget();
  };

  return (
    <div className="trip-weather-body">
      <div
        className={`trip-weather-summary${advisories.length > 0 ? " trip-weather-summary--caution" : allUnavailable ? " trip-weather-summary--unavailable" : ""}`}
        role="status"
      >
        <span className="trip-weather-summary-badge">
          {advisories.length > 0 ? (
            <>
              <AlertTriangle size={15} aria-hidden="true" />
              <strong>{advisories.length} cảnh báo</strong>
            </>
          ) : allNotYetAvailable ? (
            <>
              <CalendarClock size={15} aria-hidden="true" />
              <strong>Chưa có dự báo · Không có cảnh báo</strong>
            </>
          ) : allUnavailable ? (
            <>
              <CloudOff size={15} aria-hidden="true" />
              <strong>Không lấy được dự báo · Không có cảnh báo</strong>
            </>
          ) : (
            <>
              <CloudSun size={15} aria-hidden="true" />
              <strong>Không có cảnh báo</strong>
            </>
          )}
        </span>
        <span className="trip-weather-disclaimer">
          Chỉ để tham khảo, không ảnh hưởng kết quả kiểm tra lịch trình. Ngưỡng do nhóm tự đặt, chưa hiệu chuẩn.
        </span>
      </div>

      {advisories.length > 0 && (
        <div className="trip-weather-chips" role="list" aria-label="Cảnh báo thời tiết">
          {advisories.map((a, i) => {
            const ChipIcon = advisoryChipIcon(a.kind);
            const targetId = targetIdForAdvisory(a);
            const where = names.get(a.location.destinationId) ?? "Điểm đến";
            const fullText = advisoryText(a, names);
            const isHighlighted = highlightedTarget === targetId;
            return (
              <div key={i} role="listitem" className="trip-weather-chip-item">
                <a
                  href={`#${targetId}`}
                  title={fullText}
                  aria-label={`${fullText}. Bấm để xem chi tiết tại mục tương ứng.`}
                  className={`trip-weather-chip trip-weather-chip--${a.kind.toLowerCase()}${isHighlighted ? " is-active" : ""}`}
                  onClick={event => {
                    event.preventDefault();
                    jumpToTarget(targetId);
                  }}
                >
                  <ChipIcon size={14} aria-hidden="true" />
                  <span className="trip-weather-chip-kind">{KIND_TEXT[a.kind]} {advisoryValueShort(a)}</span>
                  <span className="trip-weather-chip-sep" aria-hidden="true">·</span>
                  <span className="trip-weather-chip-where">Ngày {a.day} · {where}</span>
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div className="trip-weather-days">
        {weather.days.map(d => {
          const dayStops = stopsByDay.get(d.day) ?? [];
          const seenDestinationIds = new Set<string>();
          return (
            <article key={d.day} className="trip-weather-day-card" aria-label={`Thời tiết ngày ${d.day}`}>
              <header className="trip-weather-day-header">
                <div className="trip-weather-day-heading">
                  <h4>Ngày {d.day}{d.date ? ` · ${d.date}` : ""}</h4>
                </div>
                {d.sunTimes && (
                  <div className="trip-weather-sun" aria-label={`Giờ mặt trời ngày ${d.day}`}>
                    <span className="trip-weather-sun-item">
                      <Sunrise size={14} aria-hidden="true" />
                      <span>Bình minh {formatMinute(d.sunTimes.sunriseMinute)}</span>
                    </span>
                    <span className="trip-weather-sun-item">
                      <Sunset size={14} aria-hidden="true" />
                      <span>Hoàng hôn {formatMinute(d.sunTimes.sunsetMinute)}</span>
                    </span>
                  </div>
                )}
              </header>

              {d.visits.length === 0 ? (
                <p className="trip-weather-empty-visits">Ngày di chuyển — không có điểm dừng tham quan.</p>
              ) : (
                <ul className="trip-weather-visits">
                  {d.visits.map((v, visitIndex) => {
                    const baseTargetId = `${prefix}-visit-${d.day}-${v.destinationId}`;
                    const rowId = seenDestinationIds.has(v.destinationId) ? `${baseTargetId}-${visitIndex}` : baseTargetId;
                    seenDestinationIds.add(v.destinationId);
                    const stop = dayStops[visitIndex]?.destination.id === v.destinationId
                      ? dayStops[visitIndex]
                      : dayStops.find(s => s.destination.id === v.destinationId);
                    const isHighlighted = highlightedTarget === rowId;
                    return (
                      <li
                        id={rowId}
                        key={`${v.destinationId}-${visitIndex}`}
                        tabIndex={-1}
                        data-highlighted={isHighlighted ? "true" : undefined}
                        className={`trip-weather-visit-row${isHighlighted ? " is-highlighted" : ""}`}
                      >
                        <div className="trip-weather-visit-place">
                          {stop?.arrivalMinute != null && (
                            <span className="trip-weather-visit-time">{formatMinute(stop.arrivalMinute)}</span>
                          )}
                          <span className="trip-weather-visit-name">{names.get(v.destinationId) ?? "Điểm đến"}</span>
                          {v.isOutdoor && <span className="trip-weather-outdoor-tag">Ngoài trời</span>}
                        </div>
                        <VisitWeatherMetrics weather={v.weather} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>

      {weather.source && (
        <p className="trip-weather-source">
          Nguồn dự báo:{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
            Open-Meteo
          </a>{" "}
          · cập nhật {new Date(weather.source.fetchedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
        </p>
      )}
    </div>
  );
}

export function TripWeatherPanel({ days, journeyPlan }: { days: PlannerDay[]; journeyPlan?: JourneyPlan | null }) {
  const titleId = useId();
  const state = useTripWeatherState(days, journeyPlan);
  return (
    <section className="trip-weather-panel" aria-labelledby={titleId}>
      <h3 id={titleId} className="trip-weather-panel-title">
        <CloudSun size={18} aria-hidden="true" />
        <span>Thời tiết và giờ mặt trời</span>
      </h3>
      {state.status === "loading" && <p className="trip-weather-loading" aria-live="polite">Đang tải thời tiết…</p>}
      {state.status === "error" && (
        <p className="trip-weather-error" role="alert">
          <CloudOff size={15} aria-hidden="true" />
          <span>Không lấy được thời tiết lúc này. Đây không phải là trời đẹp; lịch trình vẫn dùng được bình thường.</span>
        </p>
      )}
      {state.status === "ready" && <TripWeatherView weather={state.weather} days={days} />}
    </section>
  );
}
