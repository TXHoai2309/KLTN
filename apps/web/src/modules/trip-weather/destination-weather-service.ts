import type { Database } from "@KLTN/db";
import { getPublicDestination } from "@/modules/destination/public-destination-service";
import { computeSunTimes, parseLocalDate, type SunTimes } from "./sun-times";
import { forecastStartDateFor, getForecasts, summarizeDays, type DaySummary, type ForecastHour, type ForecastOptions, type ForecastUnavailableReason } from "./forecast";

export type DestinationForecast =
  | { status: "AVAILABLE"; provider: "OPEN_METEO"; fetchedAt: string; hours: ForecastHour[]; days: DaySummary[] }
  | { status: "NOT_YET_AVAILABLE"; availableFrom: string; days: DaySummary[] }
  | { status: "UNAVAILABLE"; reason: ForecastUnavailableReason };
export type DestinationWeather = { destinationId: string; date: string; sunTimes: SunTimes; forecast: DestinationForecast };

/** Public read: visibility is enforced by the public destination service (404/410 for hidden or missing). */
export async function getDestinationWeather(id: string, date: string, database: Pick<Database, "destination">, options: ForecastOptions = {}): Promise<DestinationWeather> {
  const day = parseLocalDate(date);
  const destination = await getPublicDestination(id, database);
  const [point] = await getForecasts([{ latitude: destination.latitude, longitude: destination.longitude }], options);
  let forecast: DestinationForecast;
  if (point!.status === "UNAVAILABLE") forecast = point!;
  else {
    const hours = point!.hours.filter(h => h.time.startsWith(day));
    const days = summarizeDays(point!.hours);
    forecast = hours.length ? { status: "AVAILABLE", provider: point!.provider, fetchedAt: point!.fetchedAt, hours, days } : { status: "NOT_YET_AVAILABLE", availableFrom: forecastStartDateFor(day), days };
  }
  return { destinationId: destination.id, date: day, sunTimes: computeSunTimes(destination.latitude, destination.longitude, day), forecast };
}
