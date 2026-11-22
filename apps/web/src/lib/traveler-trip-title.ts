import { cleanAreaDisplayLabel } from "./traveler-display-clean";

/**
 * Formats a compact Vietnamese date range for traveler titles (design §4.2, slim BR-7):
 * - Same month: "13–16/12"
 * - Different months, same year: "30/11–02/12"
 * - Different years: "30/12/2026–02/01/2027"
 * - Single day: "13/12"
 */
export function formatTripDateRangeShort(startDate: string, endDate: string): string {
  const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);
  if (!s) return startDate;
  const [, sy, sm, sd] = s;
  if (!e || startDate === endDate) return `${Number(sd)}/${Number(sm)}`;
  const [, ey, em, ed] = e;
  if (sy === ey && sm === em) return `${Number(sd)}–${Number(ed)}/${Number(sm)}`;
  if (sy === ey) return `${Number(sd)}/${Number(sm)}–${Number(ed)}/${Number(em)}`;
  return `${Number(sd)}/${Number(sm)}/${sy}–${Number(ed)}/${Number(em)}/${ey}`;
}

function shortOriginCity(label: string | null | undefined): string | null {
  if (!label) return null;
  const cleaned = label
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^(?:tp\.?|thành phố|tỉnh)\s+/iu, "")
    .split(",")[0]
    ?.trim();
  if (!cleaned) return null;
  if (/^hà giang$/iu.test(cleaned)) return null;
  return cleaned;
}

export interface DataTripTitleInput {
  companionTitle?: string | null;
  homeCity?: string | null;
  originLabel?: string | null;
  firstArea?: string | null;
  lastArea?: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
}

/**
 * Builds a data-driven Vietnamese trip title (slim BR-7, design §4.2 & §4.3),
 * e.g. "Đà Nẵng → Hà Giang, 13–16/12" or "Quản Bạ – Đồng Văn, 13–16/12".
 * Never returns the generic placeholder "Chuyến đi N ngày".
 */
export function buildDataTripTitle(input: DataTripTitleInput): string {
  const custom = input.companionTitle?.trim();
  if (custom) return custom;

  const range = formatTripDateRangeShort(input.startDate, input.endDate);
  const departure = shortOriginCity(input.homeCity) ?? shortOriginCity(input.originLabel);
  if (departure) {
    return `${departure} → Hà Giang, ${range}`;
  }

  const first = cleanAreaDisplayLabel(input.firstArea);
  const last = cleanAreaDisplayLabel(input.lastArea);
  if (first && last && first.toLocaleLowerCase("vi") !== last.toLocaleLowerCase("vi")) {
    return `${first} – ${last}, ${range}`;
  }
  if (first) {
    return `Hà Giang · ${first}, ${range}`;
  }
  return `Hà Giang, ${range}`;
}

/**
 * Positive number of days from `todayIso` (YYYY-MM-DD) until `startDate`, or null if today/past.
 */
export function daysUntilTrip(startDate: string, todayIso?: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const ref = todayIso && /^\d{4}-\d{2}-\d{2}$/.test(todayIso)
    ? todayIso
    : new Date().toISOString().slice(0, 10);
  const diffMs = Date.parse(`${startDate}T00:00:00Z`) - Date.parse(`${ref}T00:00:00Z`);
  const days = Math.ceil(diffMs / 86_400_000);
  return days > 0 ? days : null;
}
