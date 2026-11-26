// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DaySun, StopWeather, TripWeatherFootnote } from "./trip-weather-inline";
import { TripWeatherContext, type TripWeatherState } from "./trip-weather-state";
import type { TripWeather, WindowSummary } from "./trip-weather-service";

const summary = (over: Partial<WindowSummary> = {}): WindowSummary => ({
  fromTime: "2026-11-27T08:00", toTime: "2026-11-27T09:00",
  minTemperatureC: 15, maxTemperatureC: 17.6, maxPrecipitationProbability: 18, maxPrecipitationMm: 0,
  minVisibilityM: 12000, maxWindGustKmh: 48, ...over,
});

function weather(over: Partial<TripWeather> = {}): TripWeather {
  return {
    days: [{
      day: 2, date: "2026-11-27",
      sunTimes: { date: "2026-11-27", sunriseMinute: 6 * 60 + 22, sunsetMinute: 17 * 60 + 14, morningGoldenEndMinute: null, eveningGoldenStartMinute: null },
      visits: [
        { destinationId: "a", isOutdoor: true, weather: { status: "AVAILABLE", summary: summary() } },
        { destinationId: "b", isOutdoor: false, weather: { status: "AVAILABLE", summary: summary({ minVisibilityM: 500 }) } },
        { destinationId: "c", isOutdoor: false, weather: { status: "NOT_YET_AVAILABLE", availableFrom: "2026-12-05" } },
        { destinationId: "d", isOutdoor: false, weather: { status: "UNAVAILABLE", reason: "TIMEOUT" } },
      ],
    }],
    legs: [],
    advisories: [
      { kind: "FOG", day: 2, location: { type: "VISIT", destinationId: "b" }, fromTime: "2026-11-27T08:00", toTime: "2026-11-27T09:00", observed: 500, threshold: 1000 },
      { kind: "WIND", day: 2, location: { type: "VISIT", destinationId: "a" }, fromTime: "2026-11-27T08:00", toTime: "2026-11-27T09:00", observed: 52, threshold: 40 },
      { kind: "RAIN", day: 2, location: { type: "LEG", legIndex: 0, label: "A → B" }, fromTime: "2026-11-27T08:00", toTime: "2026-11-27T09:00", observed: 90, threshold: 70 },
    ],
    source: { provider: "OPEN_METEO", fetchedAt: "2026-11-22T06:47:45Z" },
    ...over,
  };
}

const render = (state: TripWeatherState | null, node: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(TripWeatherContext.Provider, { value: state }, node));
const ready = (w = weather()): TripWeatherState => ({ status: "ready", weather: w });

describe("inline trip weather", () => {
  it("shows temperature and rain chance on the stop and never a wind speed", () => {
    const html = render(ready(), createElement(StopWeather, { day: 2, destinationId: "a" }));
    expect(html).toContain("15–18°C");
    expect(html).toContain("mưa 18%");
    expect(html).toContain("Gió giật mạnh");
    expect(html).not.toMatch(/\d+ km\/h/);
  });

  it("shows low visibility once, as the fog warning, and ignores warnings on legs", () => {
    const html = render(ready(), createElement(StopWeather, { day: 2, destinationId: "b" }));
    expect(html.match(/0\.5 km/g)).toHaveLength(1);
    expect(html).toContain("Sương mù 0.5 km");
    expect(html).not.toContain("Mưa 90%");
  });

  it("explains a forecast that is not available yet or could not be fetched", () => {
    const pendingHtml = render(ready(), createElement(StopWeather, { day: 2, destinationId: "c" }));
    expect(pendingHtml).toContain("Dự báo có từ ngày 05/12");
    expect(pendingHtml).not.toContain("2026-12-05");
    expect(render(ready(), createElement(StopWeather, { day: 2, destinationId: "d" }))).toContain("Chưa có dự báo thời tiết");
  });

  it("renders nothing while loading, on error, outside a provider or for an unknown stop", () => {
    const stop = createElement(StopWeather, { day: 2, destinationId: "a" });
    expect(render({ status: "loading" }, stop)).toBe("");
    expect(render({ status: "error" }, stop)).toBe("");
    expect(render(null, stop)).toBe("");
    expect(render(ready(), createElement(StopWeather, { day: 2, destinationId: "zzz" }))).toBe("");
    expect(render(ready(), createElement(StopWeather, { day: 9, destinationId: "a" }))).toBe("");
  });

  it("shows sunrise and sunset in the day header only when the day has them", () => {
    const html = render(ready(), createElement(DaySun, { day: 2 }));
    expect(html).toContain("Bình minh 06:22");
    expect(html).toContain("Hoàng hôn 17:14");
    expect(render(ready(), createElement(DaySun, { day: 5 }))).toBe("");
    expect(render({ status: "loading" }, createElement(DaySun, { day: 2 }))).toBe("");
  });

  it("states the source once, and says plainly when the forecast could not be loaded", () => {
    const ok = render(ready(), createElement(TripWeatherFootnote));
    expect(ok).toContain("Open-Meteo");
    expect(ok).toContain("không ảnh hưởng kết quả kiểm tra");
    const failed = render({ status: "error" }, createElement(TripWeatherFootnote));
    expect(failed).toContain("Không lấy được thời tiết lúc này");
    expect(failed).toContain("Đây không phải là trời đẹp");
    expect(render({ status: "loading" }, createElement(TripWeatherFootnote))).toBe("");
  });
});
