import { describe, expect, it } from "vitest";
import type { PointForecast } from "../trip-weather/forecast";
import type { TripDetail, TripSummary } from "../trip-read/trip-read-service";
import { infoToolInstructions } from "./tripsage-chat-service";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import { createTripsageInfoTools, type TripsageMyTrips } from "./tripsage-info-tools";

const NOW = () => new Date("2026-11-26T03:00:00Z"); // 10:00 in Vietnam
const options = { toolCallId: "t", messages: [] } as never;
type Exec = { execute: (input: unknown, opts: never) => Promise<Record<string, unknown>> };
const run = (tools: Record<string, unknown>, name: string, input: unknown = {}) => (tools[name] as Exec).execute(input, options);

const hoursFor = (date: string, temps: [number, number], rain: number) =>
  Array.from({ length: 24 }, (_, h) => ({
    time: `${date}T${String(h).padStart(2, "0")}:00`,
    temperatureC: h < 12 ? temps[0] : temps[1],
    precipitationProbability: rain,
    precipitationMm: 0,
    visibilityM: 8000,
    windGustKmh: 20,
    weatherCode: 3,
  }));
const forecast: PointForecast = {
  status: "AVAILABLE",
  provider: "OPEN_METEO",
  fetchedAt: "2026-11-26T02:00:00Z",
  hours: [...hoursFor("2026-11-26", [9, 17], 10), ...hoursFor("2026-11-27", [8, 15], 60)],
};

describe("getWeatherForecast", () => {
  it("summarises the requested days and marks days beyond the forecast", async () => {
    const tools = createTripsageInfoTools({ now: NOW, weather: async () => [forecast] });
    const res = await run(tools, "getWeatherForecast", { area: "Đồng Văn", days: 3 }) as { ok: boolean; area: string; days: Array<Record<string, unknown>> };
    expect(res.ok).toBe(true);
    expect(res.area).toBe("Đồng Văn");
    expect(res.days).toHaveLength(3);
    expect(res.days[0]).toMatchObject({ date: "26/11", status: "AVAILABLE", minTemperatureC: 9, maxTemperatureC: 17, maxRainChancePercent: 10 });
    expect(res.days[1]).toMatchObject({ date: "27/11", maxRainChancePercent: 60 });
    expect(res.days[2]).toMatchObject({ date: "28/11", status: "NO_DATA" });
    expect(typeof res.days[0]!.sunrise).toBe("string");

    const far = await run(tools, "getWeatherForecast", { startDate: "2027-01-20", days: 1 }) as { days: Array<Record<string, unknown>> };
    expect(far.days[0]).toMatchObject({ status: "NOT_YET_AVAILABLE" });
  });

  it("reports an unavailable forecast instead of guessing, and caps calls per turn", async () => {
    const down = createTripsageInfoTools({ now: NOW, weather: async () => [{ status: "UNAVAILABLE", reason: "TIMEOUT" }] });
    expect(await run(down, "getWeatherForecast")).toMatchObject({ ok: false, code: "WEATHER_UNAVAILABLE" });
    const tools = createTripsageInfoTools({ now: NOW, weather: async () => [forecast] });
    await run(tools, "getWeatherForecast");
    await run(tools, "getWeatherForecast");
    expect(await run(tools, "getWeatherForecast")).toMatchObject({ ok: false, code: "WEATHER_LIMIT" });
  });
});

describe("listMyTrips / getMyTrip", () => {
  const summary = { id: "trip-1", startDate: "2026-12-20", endDate: "2026-12-24", durationDays: 5, transport: "MOTORCYCLE", status: "UPCOMING", visitCount: 11, originLabel: "Hà Nội", lastArea: "Mèo Vạc" } as unknown as TripSummary;
  const detail = {
    ...summary,
    days: [{ id: "d1", dayIndex: 1, localDate: "2026-12-20", visits: [{ id: "v1", order: 1, startMinute: 480, plannedDurationMinutes: 60, destination: { id: "x", name: "Cổng trời Quản Bạ" } }] }],
    chosenLodgings: [{ id: "l1", nightIndex: 1, placeId: "p", name: "Tì Lu Homestay" }],
    pinnedItems: [{ kind: "COST", cost: { total: 10031531, travelers: 4, days: 5 } }],
  } as unknown as TripDetail;
  const myTrips: TripsageMyTrips = {
    list: async () => ({ items: [summary] }),
    get: async id => { if (id !== "trip-1") throw new Error("NOT_FOUND"); return detail; },
  };

  it("lists and reads only the traveler's own trips", async () => {
    const tools = createTripsageInfoTools({ now: NOW, myTrips });
    expect(await run(tools, "listMyTrips")).toMatchObject({ ok: true, count: 1, trips: [{ tripId: "trip-1", dates: "20/12–24/12", transport: "Xe máy", stops: 11 }] });
    expect(await run(tools, "getMyTrip", { tripId: "trip-1" })).toMatchObject({
      ok: true,
      days: [{ day: 1, date: "20/12", stops: ["08:00 Cổng trời Quản Bạ (60 phút)"] }],
      chosenLodgings: [{ night: 1, name: "Tì Lu Homestay" }],
      costEstimate: { totalVnd: 10031531, travelers: 4, days: 5 },
    });
    expect(await run(tools, "getMyTrip", { tripId: "someone-else" })).toMatchObject({ ok: false, code: "TRIP_NOT_FOUND" });
  });
});

describe("wiring", () => {
  it("offers the info tools and their instructions only when configured", () => {
    const planning = { candidates: async () => [], routes: {} as never };
    expect(Object.keys(createTripsageChatTools({ planning, emitItinerary: () => {} }))).not.toContain("getWeatherForecast");
    const withInfo = Object.keys(createTripsageChatTools({ planning, emitItinerary: () => {}, info: { weather: true, myTrips: { list: async () => ({ items: [] }), get: async () => { throw new Error(); } } } }));
    expect(withInfo).toEqual(expect.arrayContaining(["getWeatherForecast", "listMyTrips", "getMyTrip"]));
    expect(infoToolInstructions(undefined)).toBe("");
    expect(infoToolInstructions({ weather: true })).toContain("getWeatherForecast");
    expect(infoToolInstructions({ weather: true })).not.toContain("listMyTrips");
  });
});
