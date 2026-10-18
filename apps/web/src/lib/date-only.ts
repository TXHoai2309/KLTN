import { isValidCalendarDate } from "@/modules/trip-requirement/trip-requirement-contract";

/** Date-only display: no Date/timezone conversion and no browser-locale dependency. */
export function formatVietnameseDate(value: string): string {
  if (!isValidCalendarDate(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** Keep incomplete/invalid text for field validation instead of erasing or guessing it. */
export function vietnameseDateInputValue(text: string): string {
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  if (!match) return text;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidCalendarDate(iso) ? iso : text;
}
