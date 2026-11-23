/**
 * Client-safe display cleanup for traveler-facing screens (Slim D23, Ticket 04).
 * Strips internal prefixes like "[Tạm]", hides generic placeholder areas ("khu vực hà giang"),
 * and fixes capitalization of Hà Giang place names.
 */

const TEMP_PREFIX = /^(?:\s*\[\s*t[aạ]m\s*\][\s:\-–—]*)+/iu;

const PLACEHOLDER_AREAS = new Set([
  "khu vuc ha giang",
  "khu vuc tinh ha giang",
  "ha giang",
  "tinh ha giang",
]);

const KNOWN_PLACE_NAMES: readonly [RegExp, string][] = [
  [/(?<=^|[^\p{L}\p{N}])tp\.?\s*h[aà]\s+giang(?=$|[^\p{L}\p{N}])/giu, "TP Hà Giang"],
  [/(?<=^|[^\p{L}\p{N}])h[aà]\s+giang(?=$|[^\p{L}\p{N}])/giu, "Hà Giang"],
  [/(?<=^|[^\p{L}\p{N}])đ[oồ]ng\s+v[aă]n(?=$|[^\p{L}\p{N}])/giu, "Đồng Văn"],
  [/(?<=^|[^\p{L}\p{N}])m[eè]o\s+v[aạ]c(?=$|[^\p{L}\p{N}])/giu, "Mèo Vạc"],
  [/(?<=^|[^\p{L}\p{N}])qu[aả]n\s+b[aạ](?=$|[^\p{L}\p{N}])/giu, "Quản Bạ"],
  [/(?<=^|[^\p{L}\p{N}])y[eê]n\s+minh(?=$|[^\p{L}\p{N}])/giu, "Yên Minh"],
  [/(?<=^|[^\p{L}\p{N}])ho[aà]ng\s+su\s+ph[iì](?=$|[^\p{L}\p{N}])/giu, "Hoàng Su Phì"],
  [/(?<=^|[^\p{L}\p{N}])x[ií]n\s+m[aầ]n(?=$|[^\p{L}\p{N}])/giu, "Xín Mần"],
  [/(?<=^|[^\p{L}\p{N}])v[iị]\s+xuy[eê]n(?=$|[^\p{L}\p{N}])/giu, "Vị Xuyên"],
  [/(?<=^|[^\p{L}\p{N}])b[aắ]c\s+quang(?=$|[^\p{L}\p{N}])/giu, "Bắc Quang"],
  [/(?<=^|[^\p{L}\p{N}])b[aắ]c\s+m[eê](?=$|[^\p{L}\p{N}])/giu, "Bắc Mê"],
  [/(?<=^|[^\p{L}\p{N}])quang\s+b[iì]nh(?=$|[^\p{L}\p{N}])/giu, "Quang Bình"],
  [/(?<=^|[^\p{L}\p{N}])l[uũ]ng\s+c[uú](?=$|[^\p{L}\p{N}])/giu, "Lũng Cú"],
  [/(?<=^|[^\p{L}\p{N}])m[aã]\s+p[ií]\s+l[eè]ng(?=$|[^\p{L}\p{N}])/giu, "Mã Pí Lèng"],
  [/(?<=^|[^\p{L}\p{N}])du\s+gi[aà](?=$|[^\p{L}\p{N}])/giu, "Du Già"],
  [/(?<=^|[^\p{L}\p{N}])l[oô]\s+l[oô]\s+ch[aả]i(?=$|[^\p{L}\p{N}])/giu, "Lô Lô Chải"],
  [/(?<=^|[^\p{L}\p{N}])nho\s+qu[eế](?=$|[^\p{L}\p{N}])/giu, "Nho Quế"],
  [/(?<=^|[^\p{L}\p{N}])s[uủ]ng\s+l[aà](?=$|[^\p{L}\p{N}])/giu, "Sủng Là"],
  [/(?<=^|[^\p{L}\p{N}])ph[oó]\s+b[aả]ng(?=$|[^\p{L}\p{N}])/giu, "Phó Bảng"],
  [/(?<=^|[^\p{L}\p{N}])th[iị]\s+tr[aấ]n(?=$|[^\p{L}\p{N}])/giu, "Thị trấn"],
  [/(?<=^|[^\p{L}\p{N}])khu\s+v[uự]c(?=$|[^\p{L}\p{N}])/giu, "Khu vực"],
];

const GENERIC_ACTIVITY_NAMES = new Set([
  "khu vui choi",
  "khu vui choi giai tri",
  "diem tham quan",
  "dia diem du lich",
  "dia diem tham quan",
  "cong vien",
  "cho choi",
  "khu du lich",
]);

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function capitalizeKnownPlaces(value: string): string {
  let out = value;
  for (const [pattern, replacement] of KNOWN_PLACE_NAMES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Strips leading internal "[Tạm]" / "[Tam]" prefixes and collapses whitespace for display.
 * Safe for both destination names and descriptions; never alters stored DB values.
 */
export function cleanTravelerDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFC")
    .replace(TEMP_PREFIX, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Strips internal "[Tạm]" prefix and collapses whitespace for display. */
export function cleanPlaceDisplayName(raw: string): string {
  return cleanTravelerDisplay(raw);
}

/**
 * Cleans an area/address label for display. Returns null when the value is empty
 * or only a generic placeholder such as "khu vực hà giang" (design §3.3, slim D23).
 */
export function cleanAreaDisplayLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = cleanPlaceDisplayName(raw);
  if (!cleaned) return null;
  if (PLACEHOLDER_AREAS.has(fold(cleaned))) return null;
  return capitalizeKnownPlaces(cleaned);
}

/** Cleans an overnight area name for headings ("Nghỉ đêm khu vực ..." / "Tối nay · nghỉ ở ..."). */
export function cleanOvernightAreaLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const stripped = cleanPlaceDisplayName(raw).replace(/^(?:khu\s+v[uự]c\s+)+/iu, "").trim();
  if (!stripped) return "";
  return capitalizeKnownPlaces(stripped);
}

/** True when a Google Places result has a meaningless generic name like "Khu Vui Chơi". */
export function isGenericActivityPlaceName(name: string): boolean {
  const folded = fold(cleanPlaceDisplayName(name));
  return !folded || GENERIC_ACTIVITY_NAMES.has(folded);
}
