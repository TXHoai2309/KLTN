/**
 * Time utility functions for Trip Journey (0..1439 minutes in day).
 * All times are interpreted in Asia/Ho_Chi_Minh.
 */

export function minuteToTimeString(minute: number | null | undefined): string {
  if (minute == null || !Number.isFinite(minute)) return "";
  const clamped = Math.max(0, Math.min(1439, Math.floor(minute)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeStringToMinute(value: string): number | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

export function formatMinuteLabel(minute: number | null | undefined): string {
  const timeString = minuteToTimeString(minute);
  if (!timeString) return "Chưa chọn giờ";
  return `${timeString}`;
}

