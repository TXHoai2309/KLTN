"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  Route,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import type { JourneyPlan } from "@/modules/trip-origin/journey-route-contract";
import { formatMinute } from "./sun-times";
import { toTripWeatherRequest } from "./trip-weather-request";
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

const KIND_TEXT: Record<WeatherAdvisory["kind"], string> = {
  RAIN: "Mưa",
  FOG: "Sương mù",
  WIND: "Gió giật",
  AFTER_SUNSET: "Sau hoàng hôn",
};

function advisoryChipIcon(kind: WeatherAdvisory["kind"]) {
  if (kind === "RAIN") return CloudRain;
  if (kind === "FOG") return CloudFog;
  if (kind === "WIND") return Wind;
  return Sunset;
}

function advisoryValueShort(a: WeatherAdvisory) {
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

function unavailableReasonText(reason: Extract<WindowWeather, { status: "UNAVAILABLE" }>["reason"]) {
  if (reason === "NO_DATE") return "Chưa có ngày đi nên chưa có dự báo";
  if (reason === "NO_TIME") return "Chưa có giờ đến nên chưa có dự báo";
  if (reason === "DESTINATION_UNAVAILABLE") return "Điểm đến không còn công khai";
  return "Không lấy được dự báo";
}

function formatTempSummary(s: WindowSummary): string | null {
  if (s.minTemperatureC === null || s.maxTemperatureC === null) return null;
  const lo = Math.round(s.minTemperatureC);
  const hi = Math.round(s.maxTemperatureC);
  return lo === hi ? `${hi}°C` : `${lo}–${hi}°C`;
}

function formatRainSummary(s: WindowSummary): string | null {
  if (s.maxPrecipitationProbability !== null) {
    if (s.maxPrecipitationMm !== null && s.maxPrecipitationMm >= RAIN_INTENSITY_THRESHOLD_MM) {
      return `mưa ${s.maxPrecipitationProbability}% (${s.maxPrecipitationMm.toFixed(1)} mm/h)`;
    }
    return `mưa ${s.maxPrecipitationProbability}%`;
  }
  if (s.maxPrecipitationMm !== null) return `mưa ${s.maxPrecipitationMm.toFixed(1)} mm/h`;
  return null;
}

function conditionMeta(s: WindowSummary) {
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

export function weatherText(w: WindowWeather): string {
  if (w.status === "NOT_YET_AVAILABLE") return `Chưa có dự báo, sẽ có từ ngày ${w.availableFrom}`;
  if (w.status === "UNAVAILABLE") return unavailableReasonText(w.reason);
  const s = w.summary, parts: string[] = [];
  const temp = formatTempSummary(s);
  const rain = formatRainSummary(s);
  if (temp) parts.push(temp);
  if (rain) parts.push(rain);
  if (s.maxWindGustKmh !== null) parts.push(`gió ${Math.round(s.maxWindGustKmh)} km/h`);
  if (s.minVisibilityM !== null && s.minVisibilityM < FOG_VISIBILITY_THRESHOLD_M) {
    parts.push(`tầm nhìn ${(s.minVisibilityM / 1000).toFixed(1)} km`);
  }
  return parts.join(" · ") || "Nhà cung cấp không có số liệu";
}

function VisitWeatherMetrics({ weather }: { weather: WindowWeather }) {
  if (weather.status === "NOT_YET_AVAILABLE") {
    return (
      <span className="trip-weather-state trip-weather-state--pending">
        <CalendarClock size={14} aria-hidden="true" />
        <span>Chưa có dự báo, sẽ có từ ngày {weather.availableFrom}</span>
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
      {s.maxWindGustKmh !== null && (
        <span className="trip-weather-metric">
          <Wind size={13} aria-hidden="true" />
          <span>gió {Math.round(s.maxWindGustKmh)} km/h</span>
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

export function resolveAdvisoryJump(advisory: WeatherAdvisory, targetId: string) {
  return {
    highlightedTarget: targetId,
    openLegs: advisory.location.type === "LEG",
  };
}

export function TripWeatherView({
  weather,
  days,
  legLabels,
  initialLegsOpen = false,
  initialHighlightedTarget = null,
}: {
  weather: TripWeather;
  days: PlannerDay[];
  legLabels: string[];
  initialLegsOpen?: boolean;
  initialHighlightedTarget?: string | null;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = rawId ? `tw-${rawId}` : "tw";
  const [legsOpen, setLegsOpen] = useState(initialLegsOpen);
  const [highlightedTarget, setHighlightedTarget] = useState<string | null>(initialHighlightedTarget);
  const legsDetailsRef = useRef<HTMLDetailsElement>(null);

  const names = useMemo(
    () => new Map(days.flatMap(d => d.stops.map(s => [s.destination.id, s.destination.name] as const))),
    [days],
  );
  const stopsByDay = useMemo(
    () => new Map(days.map(d => [d.day, d.stops] as const)),
    [days],
  );

  const allVisits = weather.days.flatMap(d => d.visits);
  const hasAvailable =
    allVisits.some(v => v.weather.status === "AVAILABLE") ||
    weather.legs.some(l => l.status === "AVAILABLE" && l.samples.some(s => s.weather.status === "AVAILABLE"));
  const allNotYetAvailable = !hasAvailable && allVisits.length > 0 && allVisits.every(v => v.weather.status === "NOT_YET_AVAILABLE");
  const allUnavailable = !hasAvailable && !allNotYetAvailable && allVisits.length > 0;

  const targetIdForAdvisory = (a: WeatherAdvisory) =>
    a.location.type === "VISIT"
      ? `${prefix}-visit-${a.day}-${a.location.destinationId}`
      : `${prefix}-leg-${a.location.legIndex}`;

  const jumpToTarget = (a: WeatherAdvisory, targetId: string) => {
    const next = resolveAdvisoryJump(a, targetId);
    if (next.openLegs) {
      setLegsOpen(true);
      if (legsDetailsRef.current) legsDetailsRef.current.open = true;
    }
    setHighlightedTarget(next.highlightedTarget);
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
        className={`trip-weather-summary${weather.advisories.length > 0 ? " trip-weather-summary--caution" : allUnavailable ? " trip-weather-summary--unavailable" : ""}`}
        role="status"
      >
        <span className="trip-weather-summary-badge">
          {weather.advisories.length > 0 ? (
            <>
              <AlertTriangle size={15} aria-hidden="true" />
              <strong>{weather.advisories.length} cảnh báo</strong>
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

      {weather.advisories.length > 0 && (
        <div className="trip-weather-chips" role="list" aria-label="Cảnh báo thời tiết">
          {weather.advisories.map((a, i) => {
            const ChipIcon = advisoryChipIcon(a.kind);
            const targetId = targetIdForAdvisory(a);
            const where = a.location.type === "VISIT"
              ? names.get(a.location.destinationId) ?? "Điểm đến"
              : `Chặng ${a.location.label}`;
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
                    jumpToTarget(a, targetId);
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

      {weather.legs.length > 0 && (
        <details
          ref={legsDetailsRef}
          className="trip-weather-legs"
          open={legsOpen}
          onToggle={event => setLegsOpen(event.currentTarget.open)}
        >
          <summary className="trip-weather-legs-summary">
            <span className="trip-weather-legs-title">
              <Route size={15} aria-hidden="true" />
              <span>Thời tiết dọc chặng</span>
            </span>
            <span className="trip-weather-legs-note">Ước lượng theo tốc độ đều</span>
          </summary>
          <ul className="trip-weather-legs-list">
            {weather.legs.map((l, i) => {
              const legId = `${prefix}-leg-${i}`;
              const isHighlighted = highlightedTarget === legId;
              return (
                <li
                  id={legId}
                  key={i}
                  tabIndex={-1}
                  data-highlighted={isHighlighted ? "true" : undefined}
                  className={`trip-weather-leg-item${isHighlighted ? " is-highlighted" : ""}`}
                >
                  <div className="trip-weather-leg-label">{legLabels[i] ?? `Chặng ${i + 1}`}</div>
                  {l.status === "INSUFFICIENT_DATA" ? (
                    <span className="trip-weather-state trip-weather-state--unavailable">
                      <CloudOff size={13} aria-hidden="true" />
                      <span>Không đủ dữ liệu lộ trình hoặc thời gian</span>
                    </span>
                  ) : (
                    <ul className="trip-weather-leg-samples">
                      {l.samples.map((s, k) => (
                        <li key={k} className="trip-weather-leg-sample">
                          <span className="trip-weather-sample-time">{s.time.slice(11, 16)}</span>
                          <span className="trip-weather-sample-text">{weatherText(s.weather)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

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

type State = { status: "loading" } | { status: "error" } | { status: "ready"; weather: TripWeather };
export function TripWeatherPanel({ days, journeyPlan }: { days: PlannerDay[]; journeyPlan?: JourneyPlan | null }) {
  const titleId = useId();
  const request = useMemo(() => toTripWeatherRequest(days, journeyPlan), [days, journeyPlan]);
  const body = useMemo(() => JSON.stringify(request), [request]);
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch("/api/trip-weather", { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal })
      .then(async r => { const b = await r.json() as { success?: boolean; data?: TripWeather }; if (!r.ok || !b.success || !b.data) throw new Error("weather"); setState({ status: "ready", weather: b.data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [body]);
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
      {state.status === "ready" && <TripWeatherView weather={state.weather} days={days} legLabels={request.legs.map(l => l.label)} />}
    </section>
  );
}
