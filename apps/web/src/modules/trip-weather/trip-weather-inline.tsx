"use client";

import { CalendarClock, CloudOff, Droplets, EyeOff, Sunrise, Sunset } from "lucide-react";
import { FOG_VISIBILITY_THRESHOLD_M, type WeatherAdvisory } from "./trip-weather-service";
import { advisoryChipIcon, conditionMeta, formatRainSummary, formatTempSummary, KIND_TEXT } from "./trip-weather-panel";
import { formatMinute } from "./sun-times";
import { useTripWeatherContext } from "./trip-weather-state";
import "./trip-weather.css";

/** Short chip text. Wind is named but its speed is not shown. */
function chipText(a: WeatherAdvisory): string {
  if (a.kind === "RAIN") return a.threshold < 10 ? `Mưa ${a.observed} mm/h` : `Mưa ${a.observed}%`;
  if (a.kind === "FOG") return `Sương mù ${(a.observed / 1000).toFixed(1)} km`;
  if (a.kind === "WIND") return "Gió giật mạnh";
  return `Sau hoàng hôn ${formatMinute(a.threshold)}`;
}

/**
 * Compact weather line for one stop, meant to sit inside the stop card. Renders nothing until the forecast is ready,
 * and nothing outside a `TripWeatherProvider`, so a missing forecast never leaves a hole in the card.
 */
export function StopWeather({ day, destinationId }: { day: number; destinationId: string }) {
  const state = useTripWeatherContext();
  if (!state || state.status !== "ready") return null;
  const visit = state.weather.days.find(d => d.day === day)?.visits.find(v => v.destinationId === destinationId);
  if (!visit) return null;
  const advisories = state.weather.advisories.filter(a => a.location.type === "VISIT" && a.day === day && a.location.destinationId === destinationId);
  const w = visit.weather;

  if (w.status === "NOT_YET_AVAILABLE") {
    return (
      <p className="trip-weather-stop trip-weather-stop--muted">
        <CalendarClock size={14} aria-hidden="true" />
        <span>Dự báo có từ ngày {w.availableFrom}</span>
      </p>
    );
  }
  if (w.status === "UNAVAILABLE") {
    if (w.reason === "DESTINATION_UNAVAILABLE") return null;
    return (
      <p className="trip-weather-stop trip-weather-stop--muted">
        <CloudOff size={14} aria-hidden="true" />
        <span>Chưa có dự báo thời tiết</span>
      </p>
    );
  }

  const s = w.summary;
  const { Icon, label, tone } = conditionMeta(s);
  if (tone === "muted") return null;
  const temp = formatTempSummary(s);
  const rain = formatRainSummary(s);
  const hasFogChip = advisories.some(a => a.kind === "FOG");
  const lowVisibility = !hasFogChip && s.minVisibilityM !== null && s.minVisibilityM < FOG_VISIBILITY_THRESHOLD_M;

  return (
    <div className="trip-weather-stop" aria-label={`Thời tiết tại điểm dừng: ${label}`}>
      <span className={`trip-weather-stop-cond trip-weather-stop-cond--${tone}`}>
        <Icon size={15} aria-hidden="true" />
        {temp && <strong>{temp}</strong>}
      </span>
      {rain && (
        <span className="trip-weather-stop-metric">
          <Droplets size={13} aria-hidden="true" />
          {rain}
        </span>
      )}
      {lowVisibility && (
        <span className="trip-weather-stop-metric trip-weather-stop-metric--warn">
          <EyeOff size={13} aria-hidden="true" />
          tầm nhìn {(s.minVisibilityM! / 1000).toFixed(1)} km
        </span>
      )}
      {advisories.map((a, i) => {
        const ChipIcon = advisoryChipIcon(a.kind);
        return (
          <span key={`${a.kind}-${i}`} className={`trip-weather-stop-chip trip-weather-stop-chip--${a.kind.toLowerCase()}`} title={`${KIND_TEXT[a.kind]} · ${a.fromTime.slice(11, 16)}–${a.toTime.slice(11, 16)}`}>
            <ChipIcon size={13} aria-hidden="true" />
            {chipText(a)}
          </span>
        );
      })}
    </div>
  );
}

/** Sunrise and sunset of one day, small enough for the day header. */
export function DaySun({ day }: { day: number }) {
  const state = useTripWeatherContext();
  if (!state || state.status !== "ready") return null;
  const sun = state.weather.days.find(d => d.day === day)?.sunTimes;
  if (!sun || (sun.sunriseMinute === null && sun.sunsetMinute === null)) return null;
  return (
    <span className="trip-weather-daysun">
      {sun.sunriseMinute !== null && (
        <span><Sunrise size={15} aria-hidden="true" />Bình minh {formatMinute(sun.sunriseMinute)}</span>
      )}
      {sun.sunsetMinute !== null && (
        <span><Sunset size={15} aria-hidden="true" />Hoàng hôn {formatMinute(sun.sunsetMinute)}</span>
      )}
    </span>
  );
}

/** One quiet line under the itinerary: forecast source, or the reason there is none. */
export function TripWeatherFootnote() {
  const state = useTripWeatherContext();
  if (!state || state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <p className="trip-weather-foot trip-weather-foot--error" role="status">
        <CloudOff size={14} aria-hidden="true" />
        <span>Không lấy được thời tiết lúc này. Đây không phải là trời đẹp; lịch trình vẫn dùng được bình thường.</span>
      </p>
    );
  }
  const { source } = state.weather;
  return (
    <p className="trip-weather-foot">
      <span>
        Thời tiết chỉ để tham khảo, không ảnh hưởng kết quả kiểm tra lịch trình.
        {source && <> Nguồn: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>, cập nhật {new Date(source.fetchedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.</>}
      </span>
    </p>
  );
}
