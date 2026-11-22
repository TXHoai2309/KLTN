import { z } from "zod";

/** One forecast hour at a point. Values the provider omits stay null; nothing is defaulted. */
export type ForecastHour = {
  time: string; // local Asia/Ho_Chi_Minh, "YYYY-MM-DDTHH:00"
  temperatureC: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  visibilityM: number | null;
  windGustKmh: number | null;
  weatherCode: number | null;
};
export type ForecastUnavailableReason = "TIMEOUT" | "UNAVAILABLE" | "INVALID_RESPONSE";
export type PointForecast =
  | { status: "AVAILABLE"; provider: "OPEN_METEO"; fetchedAt: string; hours: ForecastHour[] }
  | { status: "UNAVAILABLE"; reason: ForecastUnavailableReason };
export type Point = { latitude: number; longitude: number };
export type ForecastOptions = { fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; now?: () => Date };

export const FORECAST_DAYS = 16;
const VARIABLES = ["temperature_2m", "precipitation_probability", "precipitation", "visibility", "wind_gusts_10m", "weather_code"] as const;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_POINTS_PER_REQUEST = 50;

const series = z.array(z.number().nullable());
const locationSchema = z.object({
  hourly: z.object({ time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)), ...Object.fromEntries(VARIABLES.map(v => [v, series])) as Record<(typeof VARIABLES)[number], typeof series> }),
});

// shortcut: in-memory cache is per server instance; move to a shared store if deployed on several instances.
const cache = new Map<string, { expiresAt: number; value: PointForecast }>();
const cacheKey = (p: Point) => `${p.latitude.toFixed(2)},${p.longitude.toFixed(2)}`;
export function clearForecastCache() { cache.clear(); }

function normalize(raw: z.infer<typeof locationSchema>, fetchedAt: string): PointForecast {
  const h = raw.hourly;
  if (VARIABLES.some(v => h[v].length !== h.time.length)) return { status: "UNAVAILABLE", reason: "INVALID_RESPONSE" };
  return {
    status: "AVAILABLE", provider: "OPEN_METEO", fetchedAt,
    hours: h.time.map((time, i) => ({
      time,
      temperatureC: h.temperature_2m[i] ?? null,
      precipitationProbability: h.precipitation_probability[i] ?? null,
      precipitationMm: h.precipitation[i] ?? null,
      visibilityM: h.visibility[i] ?? null,
      windGustKmh: h.wind_gusts_10m[i] ?? null,
      weatherCode: h.weather_code[i] ?? null,
    })),
  };
}

async function request(points: Point[], options: ForecastOptions): Promise<PointForecast[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", points.map(p => p.latitude.toFixed(4)).join(","));
  url.searchParams.set("longitude", points.map(p => p.longitude.toFixed(4)).join(","));
  url.searchParams.set("hourly", VARIABLES.join(","));
  url.searchParams.set("timezone", "Asia/Ho_Chi_Minh");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  url.searchParams.set("wind_speed_unit", "kmh");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const fail = (reason: ForecastUnavailableReason) => points.map((): PointForecast => ({ status: "UNAVAILABLE", reason }));
  try {
    const response = await (options.fetcher ?? ((u, init) => globalThis.fetch(u, init)))(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return fail("UNAVAILABLE");
    const body: unknown = await response.json();
    const list = Array.isArray(body) ? body : [body];
    if (list.length !== points.length) return fail("INVALID_RESPONSE");
    const fetchedAt = (options.now?.() ?? new Date()).toISOString();
    return list.map(item => {
      const parsed = locationSchema.safeParse(item);
      return parsed.success ? normalize(parsed.data, fetchedAt) : { status: "UNAVAILABLE", reason: "INVALID_RESPONSE" } as const;
    });
  } catch {
    return fail(controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE");
  } finally { clearTimeout(timer); }
}

/** Server-only. One result per input point, same order. Only AVAILABLE results are cached. */
export async function getForecasts(points: Point[], options: ForecastOptions = {}): Promise<PointForecast[]> {
  const nowMs = (options.now?.() ?? new Date()).getTime();
  const results: Array<PointForecast | undefined> = points.map(p => { const hit = cache.get(cacheKey(p)); return hit && hit.expiresAt > nowMs ? hit.value : undefined; });
  const missing = [...new Map(points.flatMap((p, i) => results[i] ? [] : [[cacheKey(p), p] as const])).values()];
  for (let start = 0; start < missing.length; start += MAX_POINTS_PER_REQUEST) {
    const batch = missing.slice(start, start + MAX_POINTS_PER_REQUEST);
    const fetched = await request(batch, options);
    batch.forEach((p, i) => { if (fetched[i]!.status === "AVAILABLE") cache.set(cacheKey(p), { expiresAt: nowMs + CACHE_TTL_MS, value: fetched[i]! }); });
    const byKey = new Map(batch.map((p, i) => [cacheKey(p), fetched[i]!]));
    points.forEach((p, i) => { results[i] ??= byKey.get(cacheKey(p)); });
  }
  return results.map(r => r ?? { status: "UNAVAILABLE", reason: "UNAVAILABLE" });
}

/** First date on which a forecast covering `date` becomes available. */
export function forecastStartDateFor(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (FORECAST_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

export type DaySummary = { date: string; minTemperatureC: number | null; maxTemperatureC: number | null; maxPrecipitationProbability: number | null; totalPrecipitationMm: number | null; minVisibilityM: number | null; maxWindGustKmh: number | null };
const pick = (values: Array<number | null>, f: (...n: number[]) => number) => { const v = values.filter((x): x is number => x !== null); return v.length ? f(...v) : null; };
export function summarizeDays(hours: ForecastHour[]): DaySummary[] {
  const byDate = new Map<string, ForecastHour[]>();
  for (const hour of hours) byDate.set(hour.time.slice(0, 10), [...(byDate.get(hour.time.slice(0, 10)) ?? []), hour]);
  return [...byDate].map(([date, list]) => ({
    date,
    minTemperatureC: pick(list.map(h => h.temperatureC), Math.min),
    maxTemperatureC: pick(list.map(h => h.temperatureC), Math.max),
    maxPrecipitationProbability: pick(list.map(h => h.precipitationProbability), Math.max),
    totalPrecipitationMm: pick(list.map(h => h.precipitationMm), (...n) => Math.round(n.reduce((a, b) => a + b, 0) * 10) / 10),
    minVisibilityM: pick(list.map(h => h.visibilityM), Math.min),
    maxWindGustKmh: pick(list.map(h => h.windGustKmh), Math.max),
  }));
}
