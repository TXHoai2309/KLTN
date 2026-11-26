"use client";

import { useEffect, useState } from "react";
import { Sunrise } from "lucide-react";
import { formatMinute, formatShortViDate, todayInVietnam, type SunTimes } from "./sun-times";
import type { DestinationForecast, DestinationWeather } from "./destination-weather-service";

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; weather: DestinationWeather };

export function SunTimesView({ sunTimes }: { sunTimes: SunTimes }) {
  const rows: Array<[string, string]> = [
    ["Bình minh", formatMinute(sunTimes.sunriseMinute)],
    ["Giờ vàng sáng", `${formatMinute(sunTimes.sunriseMinute)}–${formatMinute(sunTimes.morningGoldenEndMinute)}`],
    ["Giờ vàng chiều", `${formatMinute(sunTimes.eveningGoldenStartMinute)}–${formatMinute(sunTimes.sunsetMinute)}`],
    ["Hoàng hôn", formatMinute(sunTimes.sunsetMinute)],
  ];
  return (
    <dl className="public-detail-coordinates">
      {rows.map(([label, value]) => <div className="public-detail-coord-box" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

const num = (value: number | null, unit: string, digits = 0) => value === null ? "—" : `${value.toFixed(digits)}${unit}`;
const km = (meters: number | null) => meters === null ? "—" : meters >= 10_000 ? "≥10 km" : `${(meters / 1000).toFixed(1)} km`;

export function ForecastView({ forecast, today }: { forecast: DestinationForecast; today: string }) {
  if (forecast.status === "UNAVAILABLE") return <p role="alert">Không lấy được dự báo thời tiết lúc này. Đây không phải là trời đẹp; vui lòng thử lại sau.</p>;
  return (
    <>
      {forecast.status === "NOT_YET_AVAILABLE"
        ? <p>{forecast.availableFrom > today ? `Chưa có dự báo cho ngày này, sẽ có từ ngày ${formatShortViDate(forecast.availableFrom)}.` : "Không có dự báo cho ngày này."}</p>
        : (
          <div className="public-detail-table-scroll" tabIndex={0} role="region" aria-label="Bảng dự báo theo giờ">
            <table className="weather-hourly">
              <caption>Dự báo theo giờ</caption>
              <thead><tr>{["Giờ", "Nhiệt độ", "Khả năng mưa", "Lượng mưa", "Tầm nhìn", "Gió giật"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead>
              <tbody>{forecast.hours.map(h => <tr key={h.time}><th scope="row">{h.time.slice(11, 16)}</th><td>{num(h.temperatureC, "°C")}</td><td>{num(h.precipitationProbability, "%")}</td><td>{num(h.precipitationMm, " mm", 1)}</td><td>{km(h.visibilityM)}</td><td>{num(h.windGustKmh, " km/h")}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      {forecast.days.length > 0 && (
        <details>
          <summary>Các ngày tới</summary>
          <ul>{forecast.days.map(d => <li key={d.date}>{d.date}: {num(d.minTemperatureC, "°")}–{num(d.maxTemperatureC, "°C")}, mưa tối đa {num(d.maxPrecipitationProbability, "%")} ({num(d.totalPrecipitationMm, " mm", 1)}), tầm nhìn thấp nhất {km(d.minVisibilityM)}, gió giật {num(d.maxWindGustKmh, " km/h")}</li>)}</ul>
        </details>
      )}
      {forecast.status === "AVAILABLE" && <p className="public-detail-location-sub">Nguồn: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · cập nhật {new Date(forecast.fetchedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>}
    </>
  );
}

export function DestinationWeatherCard({ destinationId }: { destinationId: string }) {
  const [date, setDate] = useState(() => todayInVietnam());
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/destinations/${encodeURIComponent(destinationId)}/weather?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json() as { success?: boolean; data?: DestinationWeather };
        if (!response.ok || !body.success || !body.data) throw new Error("weather");
        setState({ status: "ready", weather: body.data });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [destinationId, date]);

  return (
    <section className="public-detail-card" aria-labelledby="sun-times-title">
      <div className="public-detail-card-header">
        <h2 id="sun-times-title"><Sunrise size={21} aria-hidden="true" />Giờ mặt trời và thời tiết</h2>
        <label className="public-detail-location-sub">
          Ngày{" "}
          <input type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} />
        </label>
      </div>
      {state.status === "loading" && <p aria-live="polite">Đang tải…</p>}
      {state.status === "error" && <p role="alert">Không lấy được giờ mặt trời và dự báo. Vui lòng thử lại.</p>}
      {state.status === "ready" && <><SunTimesView sunTimes={state.weather.sunTimes} /><ForecastView forecast={state.weather.forecast} today={todayInVietnam()} /></>}
      <p className="public-detail-location-sub">Giờ Việt Nam (UTC+7).</p>
    </section>
  );
}
