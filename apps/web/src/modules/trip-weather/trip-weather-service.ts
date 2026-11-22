import { z } from "zod";
import type { Database } from "@KLTN/db";
import { visibleDestinationWhere } from "@/modules/destination/destination-eligibility";
import { plannerRouteGeometrySchema } from "@/modules/trip-planner/planner-route-geometry";
import { computeSunTimes, type SunTimes } from "./sun-times";
import { forecastStartDateFor, getForecasts, type ForecastHour, type ForecastOptions, type ForecastUnavailableReason, type Point, type PointForecast } from "./forecast";

/** Owner-set, uncalibrated advisory thresholds (ADR-36). */
export const RAIN_PROBABILITY_THRESHOLD = 70; // %
export const RAIN_INTENSITY_THRESHOLD_MM = 5; // mm/h
export const FOG_VISIBILITY_THRESHOLD_M = 1000; // advisory when strictly below
export const WIND_GUST_THRESHOLD_KMH = 40;
const LEG_SAMPLE_SPACING_M = 20_000;
const LEG_MAX_SAMPLES = 8;

const minute = z.number().int().min(0).max(10080);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const tripWeatherRequestSchema = z.object({
  days: z.array(z.object({
    day: z.number().int().min(1).max(14),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    stops: z.array(z.object({ destinationId: id, arrivalMinute: minute.nullable(), departureMinute: minute.nullable() }).strict()).max(6),
  }).strict()).min(1).max(14),
  legs: z.array(z.object({
    day: z.number().int().min(1).max(14),
    label: z.string().max(300),
    verified: z.boolean(),
    startMinute: minute.nullable(),
    endMinute: minute.nullable(),
    geometry: plannerRouteGeometrySchema.optional(),
  }).strict()).max(60),
}).strict();
export type TripWeatherRequest = z.infer<typeof tripWeatherRequestSchema>;

export type WindowSummary = { fromTime: string; toTime: string; minTemperatureC: number | null; maxTemperatureC: number | null; maxPrecipitationProbability: number | null; maxPrecipitationMm: number | null; minVisibilityM: number | null; maxWindGustKmh: number | null };
export type WindowWeather =
  | { status: "AVAILABLE"; summary: WindowSummary }
  | { status: "NOT_YET_AVAILABLE"; availableFrom: string }
  | { status: "UNAVAILABLE"; reason: ForecastUnavailableReason | "NO_DATE" | "NO_TIME" | "DESTINATION_UNAVAILABLE" };
export type LegSample = { latitude: number; longitude: number; time: string; weather: WindowWeather };
export type LegWeather =
  | { status: "AVAILABLE"; approximation: "LINEAR_APPROXIMATION"; samples: LegSample[] }
  | { status: "INSUFFICIENT_DATA" };
export type AdvisoryKind = "RAIN" | "FOG" | "WIND" | "AFTER_SUNSET";
export type WeatherAdvisory = {
  kind: AdvisoryKind;
  day: number;
  location: { type: "VISIT"; destinationId: string } | { type: "LEG"; legIndex: number; label: string };
  fromTime: string; toTime: string;
  observed: number; threshold: number;
};
export type TripWeather = {
  days: Array<{ day: number; date: string | null; sunTimes: SunTimes | null; visits: Array<{ destinationId: string; isOutdoor: boolean; weather: WindowWeather }> }>;
  legs: LegWeather[];
  advisories: WeatherAdvisory[];
  source: { provider: "OPEN_METEO"; fetchedAt: string } | null;
};

const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
/** Local "YYYY-MM-DDTHH:00" for the hour containing `minuteOfTrip` minutes after the day's midnight. */
const hourKey = (date: string, minuteOfDay: number) => `${addDays(date, Math.floor(minuteOfDay / 1440))}T${String(Math.floor((minuteOfDay % 1440) / 60)).padStart(2, "0")}:00`;
const pick = (values: Array<number | null>, f: (...n: number[]) => number) => { const v = values.filter((x): x is number => x !== null); return v.length ? f(...v) : null; };

/** Worst value of each variable across the hours touched by [fromMinute, toMinute]. */
export function windowWeather(forecast: PointForecast, date: string, fromMinute: number, toMinute: number): WindowWeather {
  if (forecast.status === "UNAVAILABLE") return forecast;
  const keys = new Set<string>();
  for (let m = fromMinute - (fromMinute % 60); m <= Math.max(fromMinute, toMinute - 1); m += 60) keys.add(hourKey(date, m));
  const hours: ForecastHour[] = forecast.hours.filter(h => keys.has(h.time));
  if (!hours.length) return { status: "NOT_YET_AVAILABLE", availableFrom: forecastStartDateFor([...keys][0]!.slice(0, 10)) };
  return { status: "AVAILABLE", summary: {
    fromTime: hours[0]!.time, toTime: hours[hours.length - 1]!.time,
    minTemperatureC: pick(hours.map(h => h.temperatureC), Math.min), maxTemperatureC: pick(hours.map(h => h.temperatureC), Math.max),
    maxPrecipitationProbability: pick(hours.map(h => h.precipitationProbability), Math.max), maxPrecipitationMm: pick(hours.map(h => h.precipitationMm), Math.max),
    minVisibilityM: pick(hours.map(h => h.visibilityM), Math.min), maxWindGustKmh: pick(hours.map(h => h.windGustKmh), Math.max),
  } };
}

export function weatherAdvisories(summary: WindowSummary, day: number, location: WeatherAdvisory["location"]): WeatherAdvisory[] {
  const out: WeatherAdvisory[] = [];
  const base = { day, location, fromTime: summary.fromTime, toTime: summary.toTime };
  if (summary.maxPrecipitationProbability !== null && summary.maxPrecipitationProbability >= RAIN_PROBABILITY_THRESHOLD) out.push({ ...base, kind: "RAIN", observed: summary.maxPrecipitationProbability, threshold: RAIN_PROBABILITY_THRESHOLD });
  else if (summary.maxPrecipitationMm !== null && summary.maxPrecipitationMm >= RAIN_INTENSITY_THRESHOLD_MM) out.push({ ...base, kind: "RAIN", observed: summary.maxPrecipitationMm, threshold: RAIN_INTENSITY_THRESHOLD_MM });
  if (summary.minVisibilityM !== null && summary.minVisibilityM < FOG_VISIBILITY_THRESHOLD_M) out.push({ ...base, kind: "FOG", observed: summary.minVisibilityM, threshold: FOG_VISIBILITY_THRESHOLD_M });
  if (summary.maxWindGustKmh !== null && summary.maxWindGustKmh >= WIND_GUST_THRESHOLD_KMH) out.push({ ...base, kind: "WIND", observed: summary.maxWindGustKmh, threshold: WIND_GUST_THRESHOLD_KMH });
  return out;
}

function haversineM(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Points along a [lon,lat] line every ~20 km (max 8, including both ends), with the fraction of distance travelled. */
export function sampleLine(coordinates: Array<[number, number]>): Array<{ latitude: number; longitude: number; fraction: number }> {
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) cumulative.push(cumulative[i - 1]! + haversineM(coordinates[i - 1]!, coordinates[i]!));
  const total = cumulative[cumulative.length - 1]!;
  const count = Math.min(LEG_MAX_SAMPLES, Math.max(2, Math.ceil(total / LEG_SAMPLE_SPACING_M) + 1));
  return Array.from({ length: count }, (_, k) => {
    const target = total * k / (count - 1);
    let i = 1; while (i < cumulative.length - 1 && cumulative[i]! < target) i++;
    const span = cumulative[i]! - cumulative[i - 1]!, t = span > 0 ? (target - cumulative[i - 1]!) / span : 0;
    const [a, b] = [coordinates[i - 1]!, coordinates[i]!];
    return { longitude: a[0] + (b[0] - a[0]) * t, latitude: a[1] + (b[1] - a[1]) * t, fraction: total > 0 ? target / total : 0 };
  });
}

type DestinationRow = { id: string; latitude: number; longitude: number; isOutdoor: boolean };
export type TripWeatherDependencies = { database: Pick<Database, "destination">; forecast?: ForecastOptions };

export async function getTripWeather(input: TripWeatherRequest, deps: TripWeatherDependencies): Promise<TripWeather> {
  const ids = [...new Set(input.days.flatMap(d => d.stops.map(s => s.destinationId)))];
  const rows: DestinationRow[] = ids.length ? await deps.database.destination.findMany({ where: { id: { in: ids }, ...visibleDestinationWhere }, select: { id: true, latitude: true, longitude: true, isOutdoor: true } }) : [];
  const destinations = new Map(rows.map(r => [r.id, r]));

  const legPlans = input.legs.map(leg => {
    const date = input.days.find(d => d.day === leg.day)?.date ?? null;
    if (!leg.verified || !leg.geometry || leg.startMinute === null || leg.endMinute === null || leg.endMinute < leg.startMinute || date === null) return null;
    return { leg, date, samples: sampleLine(leg.geometry.coordinates) };
  });

  const points: Point[] = [...rows.map(r => ({ latitude: r.latitude, longitude: r.longitude })), ...legPlans.flatMap(p => p?.samples ?? [])];
  const forecasts = points.length ? await getForecasts(points, deps.forecast) : [];
  const destinationForecast = new Map(rows.map((r, i) => [r.id, forecasts[i]!]));
  let cursor = rows.length;
  const source = forecasts.find((f): f is Extract<PointForecast, { status: "AVAILABLE" }> => f.status === "AVAILABLE");
  const advisories: WeatherAdvisory[] = [];

  const days: TripWeather["days"] = input.days.map(day => {
    const first = day.stops.map(s => destinations.get(s.destinationId)).find(Boolean);
    const sunTimes = day.date && first ? computeSunTimes(first.latitude, first.longitude, day.date) : null;
    const visits = day.stops.map(stop => {
      const destination = destinations.get(stop.destinationId);
      let weather: WindowWeather;
      if (!destination) weather = { status: "UNAVAILABLE", reason: "DESTINATION_UNAVAILABLE" };
      else if (!day.date) weather = { status: "UNAVAILABLE", reason: "NO_DATE" };
      else if (stop.arrivalMinute === null) weather = { status: "UNAVAILABLE", reason: "NO_TIME" };
      else weather = windowWeather(destinationForecast.get(destination.id)!, day.date, stop.arrivalMinute, stop.departureMinute ?? stop.arrivalMinute + 1);
      if (weather.status === "AVAILABLE") advisories.push(...weatherAdvisories(weather.summary, day.day, { type: "VISIT", destinationId: stop.destinationId }));
      // Sun times are computed locally, so this advisory does not depend on the forecast provider.
      if (destination?.isOutdoor && day.date && stop.departureMinute !== null) {
        const sunset = computeSunTimes(destination.latitude, destination.longitude, day.date).sunsetMinute;
        if (sunset !== null && stop.departureMinute > sunset)
          advisories.push({ kind: "AFTER_SUNSET", day: day.day, location: { type: "VISIT", destinationId: stop.destinationId }, fromTime: hourKey(day.date, stop.arrivalMinute ?? stop.departureMinute).slice(0, 11) + clock(stop.arrivalMinute ?? stop.departureMinute), toTime: hourKey(day.date, stop.departureMinute).slice(0, 11) + clock(stop.departureMinute), observed: stop.departureMinute, threshold: sunset });
      }
      return { destinationId: stop.destinationId, isOutdoor: destination?.isOutdoor ?? false, weather };
    });
    return { day: day.day, date: day.date, sunTimes, visits };
  });

  const legs: LegWeather[] = legPlans.map((plan, legIndex) => {
    if (!plan) return { status: "INSUFFICIENT_DATA" };
    const { leg, date } = plan;
    const samples: LegSample[] = plan.samples.map(s => {
      const at = Math.round(leg.startMinute! + (leg.endMinute! - leg.startMinute!) * s.fraction);
      const weather = windowWeather(forecasts[cursor++]!, date, at, at + 1);
      return { latitude: s.latitude, longitude: s.longitude, time: hourKey(date, at).slice(0, 11) + clock(at), weather };
    });
    const seen = new Set<AdvisoryKind>();
    for (const sample of samples) if (sample.weather.status === "AVAILABLE")
      for (const a of weatherAdvisories(sample.weather.summary, leg.day, { type: "LEG", legIndex, label: leg.label })) if (!seen.has(a.kind)) { seen.add(a.kind); advisories.push(a); }
    return { status: "AVAILABLE", approximation: "LINEAR_APPROXIMATION", samples };
  });

  return { days, legs, advisories, source: source ? { provider: "OPEN_METEO", fetchedAt: source.fetchedAt } : null };
}

function clock(minuteOfDay: number) { const m = ((minuteOfDay % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
