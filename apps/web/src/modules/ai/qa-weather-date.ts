import { FORECAST_DAYS, forecastStartDateFor } from "@/modules/trip-weather/forecast";
import { parseLocalDate, todayInVietnam } from "@/modules/trip-weather/sun-times";

export type WeatherDateCheck =
  | { status: "DEFAULT_TODAY"; date: string }
  | { status: "VALID"; date: string }
  | { status: "BEYOND_HORIZON"; date: string; availableFrom: string }
  | { status: "INVALID"; reason: "MALFORMED" | "PAST_DATE" };

function addUtcDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Server-side re-validation of `weatherDate` produced by question understanding.
 * Model dates are never trusted without checking YYYY-MM-DD calendar validity,
 * non-past relative to Vietnam today, and the 16-day forecast horizon.
 */
export function validateWeatherDate(
  weatherDate: string | null | undefined,
  now: Date = new Date(),
): WeatherDateCheck {
  const today = parseLocalDate(todayInVietnam(now));
  if (weatherDate === null || weatherDate === undefined) {
    return { status: "DEFAULT_TODAY", date: today };
  }
  let parsed: string;
  try {
    parsed = parseLocalDate(weatherDate);
  } catch {
    return { status: "INVALID", reason: "MALFORMED" };
  }
  if (parsed < today) {
    return { status: "INVALID", reason: "PAST_DATE" };
  }
  const horizonEnd = addUtcDays(today, FORECAST_DAYS - 1);
  if (parsed > horizonEnd) {
    return {
      status: "BEYOND_HORIZON",
      date: parsed,
      availableFrom: forecastStartDateFor(parsed),
    };
  }
  return { status: "VALID", date: parsed };
}
