import { isValidCalendarDate } from "./trip-requirement-contract";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().trim();
}

const ISO_DATE = /(?<![\d./-])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d|[./-]\d)/gu;
const LOCAL_DATE = /(?<![\d./-])(\d{1,2})([./-])(\d{1,2})\2(\d{4})(?!\d|[./-]\d)/gu;
const WRITTEN_DATE = /(?<![\p{L}\d])(?:ngay\s+)?(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})(?![\p{L}\d])/gu;

function canonical(year: string, month: string, day: string): string | null {
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidCalendarDate(date) ? date : null;
}

/** Read only fully specified calendar dates; never infer a year or relative date. */
export function explicitTripDatesInSource(source: string): string[] {
  const text = normalize(source);
  const dates = new Set<string>();
  const add = (year: string, month: string, day: string) => {
    const date = canonical(year, month, day);
    if (date) dates.add(date);
  };
  for (const match of text.matchAll(ISO_DATE)) add(match[1], match[2], match[3]);
  for (const match of text.matchAll(LOCAL_DATE)) add(match[4], match[3], match[1]);
  for (const match of text.matchAll(WRITTEN_DATE)) add(match[3], match[2], match[1]);
  return [...dates];
}

/** Normalize the entire model value, rather than accepting a date embedded in prose. */
export function normalizeExplicitTripDate(value: string): string | null {
  const text = normalize(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
  if (iso) return canonical(iso[1], iso[2], iso[3]);
  const local = text.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/u);
  if (local) return canonical(local[4], local[3], local[1]);
  const written = text.match(/^(?:ngay\s+)?(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})$/u);
  return written ? canonical(written[3], written[2], written[1]) : null;
}
