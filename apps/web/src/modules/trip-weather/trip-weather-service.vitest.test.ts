import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { clearForecastCache } from "./forecast";
import { getTripWeather, sampleLine, weatherAdvisories, type TripWeatherRequest } from "./trip-weather-service";
import { TripWeatherView, toTripWeatherRequest } from "./trip-weather-panel";
import { computeSunTimes } from "./sun-times";

const now = () => new Date("2026-11-18T00:00:00Z");
const DATE = "2026-11-20";
const DONG_VAN = { id: "dongvan", latitude: 23.2667, longitude: 105.3667, isOutdoor: true };
const MUSEUM = { id: "museum", latitude: 22.82, longitude: 104.98, isOutdoor: false };
const db = (rows = [DONG_VAN, MUSEUM]) => ({ destination: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => rows.filter(r => where.id.in.includes(r.id)) } }) as never;
const hours = (date: string, over: (h: number) => Partial<Record<string, number | null>> = () => ({})) => Array.from({ length: 24 }, (_, h) => ({ h, time: `${date}T${String(h).padStart(2, "0")}:00`, ...over(h) }));
function provider(over: (h: number) => Partial<Record<string, number | null>> = () => ({}), dates = ["2026-11-18", "2026-11-19", DATE]) {
  const list = dates.flatMap(d => hours(d, over));
  const location = { hourly: {
    time: list.map(x => x.time),
    temperature_2m: list.map(x => (x as Record<string, unknown>).temperature_2m as number ?? 15),
    precipitation_probability: list.map(x => (x as Record<string, unknown>).precipitation_probability as number ?? 10),
    precipitation: list.map(x => (x as Record<string, unknown>).precipitation as number ?? 0),
    visibility: list.map(x => (x as Record<string, unknown>).visibility as number ?? 20000),
    wind_gusts_10m: list.map(x => (x as Record<string, unknown>).wind_gusts_10m as number ?? 10),
    weather_code: list.map(() => 1),
  } };
  return async (url: string | URL | Request) => {
    const count = new URL(String(url)).searchParams.get("latitude")!.split(",").length;
    return new Response(JSON.stringify(count === 1 ? location : Array.from({ length: count }, () => location)));
  };
}
const request = (over: Partial<TripWeatherRequest> = {}): TripWeatherRequest => ({
  days: [{ day: 1, date: DATE, stops: [{ destinationId: "museum", arrivalMinute: 9 * 60, departureMinute: 10 * 60 }, { destinationId: "dongvan", arrivalMinute: 14 * 60, departureMinute: 15 * 60 + 30 }] }],
  legs: [], ...over,
});

beforeEach(() => clearForecastCache());

describe("trip weather service", () => {
  it("gives each day sun times from its first destination and each visit its weather window", async () => {
    const result = await getTripWeather(request(), { database: db(), forecast: { now, fetcher: provider(h => h === 15 ? { precipitation_probability: 60 } : {}) as typeof fetch } });
    expect(result.days[0]!.sunTimes).toEqual(computeSunTimes(MUSEUM.latitude, MUSEUM.longitude, DATE));
    const dongVan = result.days[0]!.visits[1]!;
    expect(dongVan.weather.status).toBe("AVAILABLE");
    // The worst hour within the visit (14:00–15:30) is 15:00.
    if (dongVan.weather.status === "AVAILABLE") { expect(dongVan.weather.summary.maxPrecipitationProbability).toBe(60); expect(dongVan.weather.summary.toTime).toBe(`${DATE}T15:00`); }
    expect(result.source?.provider).toBe("OPEN_METEO");
    expect(result.advisories).toEqual([]);
  });

  it("raises advisories exactly at the thresholds and not just below", () => {
    const base = { fromTime: "a", toTime: "b", minTemperatureC: 10, maxTemperatureC: 12, maxPrecipitationProbability: 69, maxPrecipitationMm: 4.9, minVisibilityM: 1000, maxWindGustKmh: 39.9 };
    const at = { type: "VISIT" as const, destinationId: "x" };
    expect(weatherAdvisories(base, 1, at)).toEqual([]);
    expect(weatherAdvisories({ ...base, maxPrecipitationProbability: 70 }, 1, at).map(a => a.kind)).toEqual(["RAIN"]);
    expect(weatherAdvisories({ ...base, maxPrecipitationMm: 5 }, 1, at).map(a => a.kind)).toEqual(["RAIN"]);
    expect(weatherAdvisories({ ...base, minVisibilityM: 999 }, 1, at).map(a => a.kind)).toEqual(["FOG"]);
    expect(weatherAdvisories({ ...base, maxWindGustKmh: 40 }, 1, at).map(a => a.kind)).toEqual(["WIND"]);
    expect(weatherAdvisories({ ...base, maxPrecipitationProbability: null, maxPrecipitationMm: null, minVisibilityM: null, maxWindGustKmh: null }, 1, at)).toEqual([]);
  });

  it("warns after sunset only for outdoor destinations, even when the forecast is down", async () => {
    const late = request({ days: [{ day: 1, date: DATE, stops: [{ destinationId: "museum", arrivalMinute: 17 * 60, departureMinute: 19 * 60 }, { destinationId: "dongvan", arrivalMinute: 17 * 60, departureMinute: 18 * 60 + 30 }] }] });
    const result = await getTripWeather(late, { database: db(), forecast: { now, fetcher: (async () => new Response("", { status: 500 })) as typeof fetch } });
    expect(result.advisories.map(a => [a.kind, a.location.type === "VISIT" && a.location.destinationId])).toEqual([["AFTER_SUNSET", "dongvan"]]);
    expect(result.days[0]!.visits.every(v => v.weather.status === "UNAVAILABLE")).toBe(true);
    expect(result.source).toBeNull();
    const early = await getTripWeather(request(), { database: db(), forecast: { now, fetcher: (async () => new Response("", { status: 500 })) as typeof fetch } });
    expect(early.advisories).toEqual([]);
  });

  it("marks days beyond the forecast horizon as not yet available and produces no weather advisories", async () => {
    const far = request({ days: [{ day: 1, date: "2027-01-10", stops: [{ destinationId: "dongvan", arrivalMinute: 600, departureMinute: 660 }] }] });
    const result = await getTripWeather(far, { database: db(), forecast: { now, fetcher: provider(() => ({ precipitation_probability: 100 })) as typeof fetch } });
    expect(result.days[0]!.visits[0]!.weather).toEqual({ status: "NOT_YET_AVAILABLE", availableFrom: "2026-12-26" });
    expect(result.advisories).toEqual([]);
  });

  it("never reveals hidden destinations and handles missing dates", async () => {
    const result = await getTripWeather(request({ days: [{ day: 1, date: null, stops: [{ destinationId: "museum", arrivalMinute: 600, departureMinute: 660 }, { destinationId: "gone", arrivalMinute: 700, departureMinute: 760 }] }] }), { database: db(), forecast: { now, fetcher: provider() as typeof fetch } });
    expect(result.days[0]!.sunTimes).toBeNull();
    expect(result.days[0]!.visits.map(v => v.weather)).toEqual([{ status: "UNAVAILABLE", reason: "NO_DATE" }, { status: "UNAVAILABLE", reason: "DESTINATION_UNAVAILABLE" }]);
  });

  it("samples leg weather along verified routes and flags legs without timing as insufficient", async () => {
    const line: Array<[number, number]> = [[104.98, 22.82], [105.36, 23.27]]; // ~63 km
    const legs: TripWeatherRequest["legs"] = [
      { day: 1, label: "Hà Giang → Đồng Văn", verified: true, startMinute: 10 * 60, endMinute: 12 * 60, geometry: { type: "LineString", coordinates: line } },
      { day: 1, label: "Không có tuyến", verified: false, startMinute: null, endMinute: null },
    ];
    const result = await getTripWeather(request({ legs }), { database: db(), forecast: { now, fetcher: provider(h => h === 11 ? { visibility: 500 } : {}) as typeof fetch } });
    const [leg, missing] = result.legs;
    expect(missing).toEqual({ status: "INSUFFICIENT_DATA" });
    expect(leg!.status).toBe("AVAILABLE");
    if (leg!.status === "AVAILABLE") {
      expect(leg.approximation).toBe("LINEAR_APPROXIMATION");
      expect(leg.samples.length).toBe(5);
      expect(leg.samples.map(s => s.time.slice(11))).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
    }
    expect(result.advisories.filter(a => a.location.type === "LEG").map(a => a.kind)).toEqual(["FOG"]);
  });

  it("caps samples per leg", () => {
    expect(sampleLine([[104, 22], [106, 24]])).toHaveLength(8);
    expect(sampleLine([[104, 22], [104.001, 22]])).toHaveLength(2);
  });

  it("renders the advisory count, day sun times and the uncalibrated-threshold note", async () => {
    const result = await getTripWeather(request(), { database: db(), forecast: { now, fetcher: provider(() => ({ wind_gusts_10m: 50 })) as typeof fetch } });
    const plannerDays = [{ day: 1, date: DATE, distanceMeters: null, travelSeconds: null, stops: [] }] as never;
    const html = renderToStaticMarkup(createElement(TripWeatherView, { weather: result, days: plannerDays, legLabels: [] }));
    expect(html).toContain("2 cảnh báo");
    expect(html).toContain("Bình minh");
    expect(html).toContain("chưa hiệu chuẩn");
    expect(html).toContain("Open-Meteo");
  });

  it("builds a request from planner days, falling back to stop-to-stop legs without a journey plan", () => {
    const stop = (id: string, arrival: number, departure: number, inbound: unknown = null) => ({ order: 1, destination: { id, name: id.toUpperCase() }, arrivalMinute: arrival, departureMinute: departure, visitDurationMinutes: 60, scheduleState: "PLANNED", inbound, validationStatus: "PASS" });
    const days = [{ day: 1, date: DATE, distanceMeters: null, travelSeconds: null, stops: [stop("a", 480, 540), stop("b", 600, 660, { status: "VERIFIED", geometry: { type: "LineString", coordinates: [[104.98, 22.82], [105.36, 23.27]] } })] }] as never;
    const built = toTripWeatherRequest(days, null);
    expect(built.days[0]!.stops).toEqual([{ destinationId: "a", arrivalMinute: 480, departureMinute: 540 }, { destinationId: "b", arrivalMinute: 600, departureMinute: 660 }]);
    expect(built.legs).toEqual([{ day: 1, label: "A → B", verified: true, startMinute: 540, endMinute: 600, geometry: { type: "LineString", coordinates: [[104.98, 22.82], [105.36, 23.27]] } }]);
  });
});
