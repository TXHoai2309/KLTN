export type TravelerLocale = "vi" | "en";

function intlLocale(lang: TravelerLocale = "vi"): string {
  return lang === "en" ? "en-US" : "vi-VN";
}

/**
 * Formats a numeric value using locale-aware decimal and grouping separators (`vi-VN` by default).
 */
export function formatDecimalNumber(
  value: number,
  lang: TravelerLocale = "vi",
  maximumFractionDigits = 1,
): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(intlLocale(lang), {
    maximumFractionDigits,
  }).format(value);
}

/**
 * Formats a distance in kilometers for traveler-facing copy (`"34,4 km"`, `"107 m"`, `"2,3 km"` in `vi`;
 * `"34.4 km"`, `"107 m"`, `"2.3 km"` in `en`).
 */
export function formatDistanceKm(distanceKm: number, lang: TravelerLocale = "vi"): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return "";
  if (distanceKm === 0) return "0 km";
  if (distanceKm < 1) {
    const meters = Math.max(1, Math.round(distanceKm * 1000));
    return `${formatDecimalNumber(meters, lang, 0)} m`;
  }
  const roundedKm = Math.round((distanceKm + Number.EPSILON) * 10) / 10;
  return `${formatDecimalNumber(roundedKm, lang, 1)} km`;
}

/**
 * Formats a distance in meters using the shared `formatDistanceKm` convention.
 */
export function formatDistanceMeters(distanceMeters: number, lang: TravelerLocale = "vi"): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return "";
  if (distanceMeters === 0) return "0 m";
  return formatDistanceKm(distanceMeters / 1000, lang);
}
