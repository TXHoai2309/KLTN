import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { clearForecastCache, forecastStartDateFor, getForecasts, summarizeDays } from "./forecast";
import { ForecastView } from "./destination-weather-card";
import { getDestinationWeather } from "./destination-weather-service";

export function openMeteoLocation(times: string[], overrides: Partial<Record<string, Array<number | null>>> = {}) {
  const fill = (v: number) => times.map(() => v);
  return { hourly: { time: times, temperature_2m: fill(18), precipitation_probability: fill(10), precipitation: fill(0), visibility: fill(20000), wind_gusts_10m: fill(12), weather_code: fill(1), ...overrides } };
}
const hoursOf = (date: string) => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, "0")}:00`);
const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
const POINT = { latitude: 23.2667, longitude: 105.3667 };
const now = () => new Date("2026-11-18T00:00:00Z");

beforeEach(() => clearForecastCache());

describe("Open-Meteo forecast adapter", () => {
  it("normalizes a single-location response and keeps provider nulls as null", async () => {
    const [result] = await getForecasts([POINT], { now, fetcher: json(openMeteoLocation(hoursOf("2026-11-18"), { visibility: [null, ...Array(23).fill(9000)] })) });
    expect(result!.status).toBe("AVAILABLE");
    if (result!.status !== "AVAILABLE") return;
    expect(result.hours).toHaveLength(24);
    expect(result.hours[0]).toMatchObject({ time: "2026-11-18T00:00", visibilityM: null, temperatureC: 18 });
    expect(result.hours[1]!.visibilityM).toBe(9000);
  });

  it("returns one result per point for multi-location responses, in order", async () => {
    const other = { latitude: 22.8, longitude: 104.98 };
    const results = await getForecasts([POINT, other], { now, fetcher: json([openMeteoLocation(hoursOf("2026-11-18")), openMeteoLocation(hoursOf("2026-11-18"), { temperature_2m: Array(24).fill(25) })]) });
    expect(results.map(r => r.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
    expect(results[1]!.status === "AVAILABLE" && results[1]!.hours[0]!.temperatureC).toBe(25);
  });

  it("maps HTTP errors, malformed JSON and network failures to UNAVAILABLE without values", async () => {
    expect((await getForecasts([POINT], { now, fetcher: json({}, 503) }))[0]).toEqual({ status: "UNAVAILABLE", reason: "UNAVAILABLE" });
    expect((await getForecasts([POINT], { now, fetcher: json({ hourly: { time: ["bad"] } }) }))[0]).toEqual({ status: "UNAVAILABLE", reason: "INVALID_RESPONSE" });
    expect((await getForecasts([POINT], { now, fetcher: async () => { throw new Error("offline"); } }))[0]).toEqual({ status: "UNAVAILABLE", reason: "UNAVAILABLE" });
  });

  it("times out slow providers", async () => {
    const slow = (_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect((await getForecasts([POINT], { now, timeoutMs: 10, fetcher: slow as typeof fetch }))[0]).toEqual({ status: "UNAVAILABLE", reason: "TIMEOUT" });
  });

  it("caches available results for an hour and never caches failures", async () => {
    let calls = 0;
    const counting = async () => { calls++; return new Response(JSON.stringify(openMeteoLocation(hoursOf("2026-11-18")))); };
    await getForecasts([POINT], { now, fetcher: counting });
    await getForecasts([POINT], { now, fetcher: counting });
    expect(calls).toBe(1);
    await getForecasts([POINT], { now: () => new Date("2026-11-18T01:01:00Z"), fetcher: counting });
    expect(calls).toBe(2);
    clearForecastCache();
    let failures = 0;
    const failing = async () => { failures++; return new Response("", { status: 500 }); };
    await getForecasts([POINT], { now, fetcher: failing });
    await getForecasts([POINT], { now, fetcher: failing });
    expect(failures).toBe(2);
  });

  it("summarizes days and computes when a far date becomes forecastable", () => {
    const [day] = summarizeDays([
      { time: "2026-11-18T08:00", temperatureC: 12, precipitationProbability: 80, precipitationMm: 1.25, visibilityM: 800, windGustKmh: 30, weatherCode: 61 },
      { time: "2026-11-18T09:00", temperatureC: 15, precipitationProbability: null, precipitationMm: 2, visibilityM: null, windGustKmh: 45, weatherCode: 61 },
    ]);
    expect(day).toEqual({ date: "2026-11-18", minTemperatureC: 12, maxTemperatureC: 15, maxPrecipitationProbability: 80, totalPrecipitationMm: 3.3, minVisibilityM: 800, maxWindGustKmh: 45 });
    expect(forecastStartDateFor("2026-12-20")).toBe("2026-12-05");
  });
});

describe("destination forecast", () => {
  const row = { id: "d1", name: "Đồng Văn", description: "Cao nguyên đá.", area: "Đồng Văn", category: "thiên nhiên", latitude: POINT.latitude, longitude: POINT.longitude, suggestedDurationMinutes: 60, cultureLinks: [],
    openingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] })) };
  const database = { destination: { findUnique: async () => row } } as never;

  it("returns the selected day's hours with source", async () => {
    const result = await getDestinationWeather("d1", "2026-11-19", database, { now, fetcher: json(openMeteoLocation([...hoursOf("2026-11-18"), ...hoursOf("2026-11-19")])) });
    expect(result.forecast.status).toBe("AVAILABLE");
    if (result.forecast.status === "AVAILABLE") { expect(result.forecast.hours).toHaveLength(24); expect(result.forecast.hours[0]!.time).toBe("2026-11-19T00:00"); expect(result.forecast.days).toHaveLength(2); }
  });

  it("marks dates beyond the horizon as not yet available, and outages as unavailable while keeping sun times", async () => {
    const far = await getDestinationWeather("d1", "2026-12-20", database, { now, fetcher: json(openMeteoLocation(hoursOf("2026-11-18"))) });
    expect(far.forecast).toMatchObject({ status: "NOT_YET_AVAILABLE", availableFrom: "2026-12-05" });
    clearForecastCache();
    const down = await getDestinationWeather("d1", "2026-11-18", database, { now, fetcher: json({}, 500) });
    expect(down.forecast).toEqual({ status: "UNAVAILABLE", reason: "UNAVAILABLE" });
    expect(down.sunTimes.sunriseMinute).not.toBeNull();
  });

  it("renders hourly table, not-yet-available and unavailable states", () => {
    const html = (forecast: Parameters<typeof ForecastView>[0]["forecast"]) => renderToStaticMarkup(createElement(ForecastView, { forecast, today: "2026-11-18" }));
    const available = html({ status: "AVAILABLE", provider: "OPEN_METEO", fetchedAt: "2026-11-18T00:00:00Z", hours: [{ time: "2026-11-18T08:00", temperatureC: 12, precipitationProbability: 80, precipitationMm: 1.2, visibilityM: 800, windGustKmh: 30, weatherCode: 61 }], days: [] });
    expect(available).toContain("Open-Meteo"); expect(available).toContain("08:00"); expect(available).toContain("0.8 km");
    const pending = html({ status: "NOT_YET_AVAILABLE", availableFrom: "2026-12-05", days: [] });
    expect(pending).toContain("sẽ có từ ngày 05/12");
    expect(pending).not.toContain("2026-12-05");
    const down = html({ status: "UNAVAILABLE", reason: "TIMEOUT" });
    expect(down).toContain("Không lấy được dự báo"); expect(down).not.toContain("Open-Meteo");
  });
});
