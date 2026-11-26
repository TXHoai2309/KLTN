import SunCalc from "suncalc";
import { AppError } from "@/server/http/app-error";

/** Sun times as minutes of the day in Asia/Ho_Chi_Minh (UTC+7, no DST). Null when the sun does not rise/set. */
export type SunTimes = {
  date: string;
  sunriseMinute: number | null;
  sunsetMinute: number | null;
  morningGoldenEndMinute: number | null;
  eveningGoldenStartMinute: number | null;
};

const VIETNAM_OFFSET_MINUTES = 7 * 60;

export function parseLocalDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new AppError("INVALID_DATE", "Ngày không hợp lệ.", 400);
  return value;
}

export function todayInVietnam(now: Date = new Date()): string {
  return new Date(now.getTime() + VIETNAM_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

function toLocalMinute(instant: Date): number | null {
  const ms = instant.getTime();
  if (Number.isNaN(ms)) return null;
  return ((Math.round(ms / 60_000) + VIETNAM_OFFSET_MINUTES) % 1440 + 1440) % 1440;
}

export function computeSunTimes(latitude: number, longitude: number, date: string): SunTimes {
  // Local noon picks the solar day that belongs to this Vietnam calendar date.
  const times = SunCalc.getTimes(new Date(`${parseLocalDate(date)}T12:00:00+07:00`), latitude, longitude);
  return {
    date,
    sunriseMinute: toLocalMinute(times.sunrise),
    sunsetMinute: toLocalMinute(times.sunset),
    morningGoldenEndMinute: toLocalMinute(times.goldenHourEnd),
    eveningGoldenStartMinute: toLocalMinute(times.goldenHour),
  };
}

export function formatMinute(minute: number | null): string {
  if (minute === null) return "—";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** S13: Formats an ISO calendar date (`YYYY-MM-DD`) as Vietnamese `DD/MM` (e.g. `2026-12-06` → `06/12`). */
export function formatShortViDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso.trim());
  if (!match) return iso;
  return `${match[3]}/${match[2]}`;
}
