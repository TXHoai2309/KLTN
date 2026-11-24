/**
 * Client-safe display cleanup for traveler-facing screens (Slim D23, Ticket 04).
 * Strips internal prefixes like "[Tạm]", hides generic placeholder areas ("khu vực hà giang"),
 * and fixes capitalization of Hà Giang place names.
 */

const TEMP_PREFIX = /^(?:\s*\[\s*t[aạ]m\s*\][\s:\-–—]*)+/iu;
const INLINE_TEMP_PREFIX =
  /(?:^|(?<=[\s(\["'“‘:：\-–—*_>]))(?:\[\s*t[aạ]m\s*\][^\S\n]*[:\-–—]?[^\S\n]*)+/giu;

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
  [/(?<=^|[^\p{L}\p{N}])m[aã]\s+p[iíì]\s+l[eè]ng(?=$|[^\p{L}\p{N}])/giu, "Mã Pì Lèng"],
  [/(?<=^|[^\p{L}\p{N}])du\s+gi[aà](?=$|[^\p{L}\p{N}])/giu, "Du Già"],
  [/(?<=^|[^\p{L}\p{N}])l[oô]\s+l[oô]\s+ch[aả]i(?=$|[^\p{L}\p{N}])/giu, "Lô Lô Chải"],
  [/(?<=^|[^\p{L}\p{N}])nho\s+qu[eế](?=$|[^\p{L}\p{N}])/giu, "Nho Quế"],
  [/(?<=^|[^\p{L}\p{N}])s[uủ]ng\s+l[aà](?=$|[^\p{L}\p{N}])/giu, "Sủng Là"],
  [/(?<=^|[^\p{L}\p{N}])ph[oó]\s+b[aả]ng(?=$|[^\p{L}\p{N}])/giu, "Phó Bảng"],
  [/(?<=^|[^\p{L}\p{N}])kh[aâ]u\s+vai(?=$|[^\p{L}\p{N}])/giu, "Khâu Vai"],
  [/(?<=^|[^\p{L}\p{N}])c[aă]ng\s+b[aắ]c\s+m[eê](?=$|[^\p{L}\p{N}])/giu, "Căng Bắc Mê"],
  [/(?<=^|[^\p{L}\p{N}])l[uù]ng\s+t[aá]m(?=$|[^\p{L}\p{N}])/giu, "Lùng Tám"],
  [/(?<=^|[^\p{L}\p{N}])l[uù]ng\s+kh[uú]y(?=$|[^\p{L}\p{N}])/giu, "Lùng Khúy"],
  [/(?<=^|[^\p{L}\p{N}])l[uũ]ng\s+c[aẩ]m(?=$|[^\p{L}\p{N}])/giu, "Lũng Cẩm"],
  [/(?<=^|[^\p{L}\p{N}])n[aặ]m\s+đ[aă]m(?=$|[^\p{L}\p{N}])/giu, "Nặm Đăm"],
  [/(?<=^|[^\p{L}\p{N}])h[aạ]\s+th[aà]nh(?=$|[^\p{L}\p{N}])/giu, "Hạ Thành"],
  [/(?<=^|[^\p{L}\p{N}])p[aả]\s+vi\s+h[aạ](?=$|[^\p{L}\p{N}])/giu, "Pả Vi Hạ"],
  [/(?<=^|[^\p{L}\p{N}])p[aả]\s+vi\s+th[uư][oợ]ng(?=$|[^\p{L}\p{N}])/giu, "Pả Vi Thượng"],
  [/(?<=^|[^\p{L}\p{N}])p[aả]\s+vi(?=$|[^\p{L}\p{N}])/giu, "Pả Vi"],
  [/(?<=^|[^\p{L}\p{N}])s[aà]\s+ph[iì]n(?=$|[^\p{L}\p{N}])/giu, "Sà Phìn"],
  [/(?<=^|[^\p{L}\p{N}])h[oọ]\s+v[uư][oơ]ng(?=$|[^\p{L}\p{N}])/giu, "họ Vương"],
  [/(?<=^|[^\p{L}\p{N}])nh[aà]\s+v[uư][oơ]ng(?=$|[^\p{L}\p{N}])/giu, "Nhà Vương"],
  [/(?<=^|[^\p{L}\p{N}])vua\s+m[eè]o(?=$|[^\p{L}\p{N}])/giu, "Vua Mèo"],
  [/(?<=^|[^\p{L}\p{N}])c[oô]\s+ti[eê]n(?=$|[^\p{L}\p{N}])/giu, "Cô Tiên"],
  [/(?<=^|[^\p{L}\p{N}])tu\s+s[aả]n(?=$|[^\p{L}\p{N}])/giu, "Tu Sản"],
  [/(?<=^|[^\p{L}\p{N}])b[aắ]c\s+sum(?=$|[^\p{L}\p{N}])/giu, "Bắc Sum"],
  [/(?<=^|[^\p{L}\p{N}])th[aẩ]m\s+m[aã](?=$|[^\p{L}\p{N}])/giu, "Thẩm Mã"],
  [/(?<=^|[^\p{L}\p{N}])đ[iìỉ]nh\s+chi[eêề]u\s+l[aầ]u\s+thi(?=$|[^\p{L}\p{N}])/giu, "Đỉnh Chiêu Lầu Thi"],
  [/(?<=^|[^\p{L}\p{N}])chi[eêề]u\s+l[aầ]u\s+thi(?=$|[^\p{L}\p{N}])/giu, "Chiêu Lầu Thi"],
];

const AREA_PREFIX_NAMES: readonly [RegExp, string][] = [
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

export function capitalizeKnownPlaces(value: string): string {
  let out = value;
  for (const [pattern, replacement] of KNOWN_PLACE_NAMES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function capitalizeAreaPrefixes(value: string): string {
  let out = value;
  for (const [pattern, replacement] of AREA_PREFIX_NAMES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Strips leading or inline internal "[Tạm]" / "[Tam]" prefixes, collapses whitespace, and normalizes
 * capitalization of known Hà Giang place names for display. Never alters stored DB values.
 */
export function cleanTravelerDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = raw
    .normalize("NFC")
    .replace(TEMP_PREFIX, "")
    .replace(INLINE_TEMP_PREFIX, "")
    .replace(/\s+/gu, " ")
    .trim();
  return capitalizeKnownPlaces(normalized);
}

/**
 * Strips leading and inline "[Tam]" / "[Tạm]" prefixes from multi-line prose/replies
 * while preserving line breaks and bulleted formatting.
 */
export function cleanTravelerProse(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFC")
    .replace(TEMP_PREFIX, "")
    .replace(INLINE_TEMP_PREFIX, "")
    .replace(/[^\S\n]{2,}/gu, " ")
    .replace(/^[^\S\n]+|[^\S\n]+$/gmu, "")
    .trim();
}

/** Strips internal "[Tạm]" prefix, normalizes whitespace, and standardizes known place names. */
export function cleanPlaceDisplayName(raw: string): string {
  return cleanTravelerDisplay(raw);
}

/** Normalizes capitalization and whitespace inside reviewed RAG/culture source titles for display. */
export function cleanDocumentSourceTitle(raw: string | null | undefined): string {
  return cleanTravelerDisplay(raw);
}

/** Formats category labels in Vietnamese sentence case without changing underlying filter keys or DB values. */
export function cleanCategoryDisplayLabel(raw: string | null | undefined): string {
  const cleaned = cleanTravelerDisplay(raw);
  if (!cleaned) return "";
  return cleaned.replace(/^\p{L}/u, (first) => first.toLocaleUpperCase("vi-VN"));
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
  return capitalizeAreaPrefixes(cleaned);
}

/** Cleans an overnight area name for headings ("Nghỉ đêm khu vực ..." / "Tối nay · nghỉ ở ..."). */
export function cleanOvernightAreaLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const stripped = cleanPlaceDisplayName(raw).replace(/^(?:khu\s+v[uự]c\s+)+/iu, "").trim();
  if (!stripped) return "";
  return capitalizeKnownPlaces(stripped);
}

const SPECIFIC_HA_GIANG_AREAS: readonly [RegExp, string][] = [
  [/(?<=^|[^\p{L}\p{N}])tp\.?\s*h[aà]\s+giang(?=$|[^\p{L}\p{N}])/iu, "TP Hà Giang"],
  [/(?<=^|[^\p{L}\p{N}])s[aà]\s+ph[iì]n(?=$|[^\p{L}\p{N}])/iu, "Sà Phìn"],
  [/(?<=^|[^\p{L}\p{N}])p[aả]i\s+l[uủ]ng(?=$|[^\p{L}\p{N}])/iu, "Pải Lủng"],
  [/(?<=^|[^\p{L}\p{N}])s[uủ]ng\s+l[aà](?=$|[^\p{L}\p{N}])/iu, "Sủng Là"],
  [/(?<=^|[^\p{L}\p{N}])ph[oó]\s+b[aả]ng(?=$|[^\p{L}\p{N}])/iu, "Phó Bảng"],
  [/(?<=^|[^\p{L}\p{N}])l[oô]\s+l[oô]\s+ch[aả]i(?=$|[^\p{L}\p{N}])/iu, "Lô Lô Chải"],
  [/(?<=^|[^\p{L}\p{N}])n[aặ]m\s+đ[aă]m(?=$|[^\p{L}\p{N}])/iu, "Nặm Đăm"],
  [/(?<=^|[^\p{L}\p{N}])p[aả]\s+vi(?=$|[^\p{L}\p{N}])/iu, "Pả Vi"],
  [/(?<=^|[^\p{L}\p{N}])du\s+gi[aà](?=$|[^\p{L}\p{N}])/iu, "Du Già"],
  [/(?<=^|[^\p{L}\p{N}])l[uũ]ng\s+c[uú](?=$|[^\p{L}\p{N}])/iu, "Lũng Cú"],
  [/(?<=^|[^\p{L}\p{N}])tam\s+s[oơ]n(?=$|[^\p{L}\p{N}])/iu, "Tam Sơn"],
  [/(?<=^|[^\p{L}\p{N}])l[uũ]ng\s+t[aá]m(?=$|[^\p{L}\p{N}])/iu, "Lũng Tám"],
  [/(?<=^|[^\p{L}\p{N}])th[aá]i\s+an(?=$|[^\p{L}\p{N}])/iu, "Thái An"],
  [/(?<=^|[^\p{L}\p{N}])m[aậ]u\s+du[eệ](?=$|[^\p{L}\p{N}])/iu, "Mậu Duệ"],
  [/(?<=^|[^\p{L}\p{N}])l[uũ]ng\s+ph[iì]n(?=$|[^\p{L}\p{N}])/iu, "Lũng Phìn"],
  [/(?<=^|[^\p{L}\p{N}])x[ií]n\s+c[aá]i(?=$|[^\p{L}\p{N}])/iu, "Xín Cái"],
  [/(?<=^|[^\p{L}\p{N}])s[oơ]n\s+v[iĩ](?=$|[^\p{L}\p{N}])/iu, "Sơn Vĩ"],
  [/(?<=^|[^\p{L}\p{N}])đ[oồ]ng\s+v[aă]n(?=$|[^\p{L}\p{N}])/iu, "Đồng Văn"],
  [/(?<=^|[^\p{L}\p{N}])m[eè]o\s+v[aạ]c(?=$|[^\p{L}\p{N}])/iu, "Mèo Vạc"],
  [/(?<=^|[^\p{L}\p{N}])qu[aả]n\s+b[aạ](?=$|[^\p{L}\p{N}])/iu, "Quản Bạ"],
  [/(?<=^|[^\p{L}\p{N}])y[eê]n\s+minh(?=$|[^\p{L}\p{N}])/iu, "Yên Minh"],
  [/(?<=^|[^\p{L}\p{N}])ho[aà]ng\s+su\s+ph[iì](?=$|[^\p{L}\p{N}])/iu, "Hoàng Su Phì"],
  [/(?<=^|[^\p{L}\p{N}])x[ií]n\s+m[aầ]n(?=$|[^\p{L}\p{N}])/iu, "Xín Mần"],
  [/(?<=^|[^\p{L}\p{N}])v[iị]\s+xuy[eê]n(?=$|[^\p{L}\p{N}])/iu, "Vị Xuyên"],
  [/(?<=^|[^\p{L}\p{N}])b[aắ]c\s+quang(?=$|[^\p{L}\p{N}])/iu, "Bắc Quang"],
  [/(?<=^|[^\p{L}\p{N}])b[aắ]c\s+m[eê](?=$|[^\p{L}\p{N}])/iu, "Bắc Mê"],
  [/(?<=^|[^\p{L}\p{N}])quang\s+b[iì]nh(?=$|[^\p{L}\p{N}])/iu, "Quang Bình"],
];

/** Reference town centers for Hà Giang overnight areas, shared by EVENING anchor lookup and overnight label fallback. */
export const OVERNIGHT_TOWN_CENTERS: Readonly<Record<string, { latitude: number; longitude: number }>> = {
  "Yên Minh": { latitude: 23.1175, longitude: 105.1425 },
  "Đồng Văn": { latitude: 23.2783, longitude: 105.3614 },
  "Mèo Vạc": { latitude: 23.1638, longitude: 105.4091 },
  "Quản Bạ": { latitude: 23.0703, longitude: 104.9798 },
  "TP Hà Giang": { latitude: 22.8233, longitude: 104.9836 },
  "Du Già": { latitude: 22.9303, longitude: 105.2232 },
  "Lũng Cú": { latitude: 23.3622, longitude: 105.3127 },
  "Hoàng Su Phì": { latitude: 22.7436, longitude: 104.6775 },
  "Bắc Mê": { latitude: 22.7536, longitude: 105.2877 },
};

const LANDMARK_PREFIX = /^(?:đèo|deo|sông|song|dinh\s+thự|dinh\s+thu|cột\s+cờ|cot\s+co|rừng\s+thông|rung\s+thong|thác|thac|hang|núi|nui|cổng\s+trời|cong\s+troi|hẻm|hem|bến\s+thuyền|ben\s+thuyen|hồ|ho\s+|cầu|cau\s+|chùa|chua|đền|den|nhà\s+của|nha\s+cua|mã\s+p[íì]\s+lèng|ma\s+pi\s+leng|nho\s+quế|nho\s+que)\b/iu;

const PROVINCE_ONLY = new Set(["ha giang", "tinh ha giang", "tuyen quang", "tinh tuyen quang"]);

/** Extracts an administrative commune/town name (xã / thị trấn / phường) or known Hà Giang commune/town from text. */
export function extractAdminCommuneOrTown(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = cleanPlaceDisplayName(raw);
  if (!cleaned) return null;
  // Explicit Vietnamese commune/town phrase in an address, e.g. "Thôn Sà Phìn, xã Sà Phìn, tỉnh Tuyên Quang" -> "Sà Phìn".
  const adminMatch = /(?:^|[,\-(]\s*)(?:x[aã]|th[iị]\s+tr[aấ]n|ph[uư][oờ]ng)\s+([^,()\-–;]+?)(?=[,()\-–;]|$)/iu.exec(cleaned);
  if (adminMatch?.[1]) {
    const candidate = capitalizeKnownPlaces(adminMatch[1].trim());
    const foldedCandidate = fold(candidate);
    if (foldedCandidate && !PROVINCE_ONLY.has(foldedCandidate) && !LANDMARK_PREFIX.test(candidate)) {
      if (/^ha\s+giang(?:\s+\d+)?$/u.test(foldedCandidate)) return "TP Hà Giang";
      return candidate;
    }
  }
  for (const [pattern, label] of SPECIFIC_HA_GIANG_AREAS) {
    if (pattern.test(cleaned)) return label;
  }
  return null;
}

/** Returns the nearest Hà Giang overnight town center name for given coordinates. */
export function nearestOvernightTown(point: { latitude: number; longitude: number }): string | null {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  let bestName: string | null = null;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (const [name, center] of Object.entries(OVERNIGHT_TOWN_CENTERS)) {
    const dLat = center.latitude - point.latitude;
    const dLng = (center.longitude - point.longitude) * Math.cos((point.latitude * Math.PI) / 180);
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestName = name;
    }
  }
  return bestName;
}

export type OvernightAreaContext = {
  chosenLodgingName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Bug 9: resolves a commune or town name for "Tối nay · nghỉ ở {khu vực}" — never a landmark, pass, or river.
 * Priority:
 *   1. Chosen lodging's commune/town (when chosen lodging names one)
 *   2. Administrative commune/town of the day's last stop (address -> non-landmark area -> known town in stop name)
 *   3. Nearest town in `OVERNIGHT_TOWN_CENTERS` from coordinates
 *   4. Fallback generic area (never a sightseeing attraction, pass, or river name).
 */
export function resolveOvernightAreaLabel(
  area: string | null | undefined,
  lastStopName?: string | null | undefined,
  context?: OvernightAreaContext,
): string {
  // 1. Chosen lodging (extract town/commune if named, e.g. "Sà Phìn Homestay" -> "Sà Phìn")
  const fromLodging = extractAdminCommuneOrTown(context?.chosenLodgingName);
  if (fromLodging) return fromLodging;

  // 2a. Administrative commune/town from last stop's address field (e.g. "xã Sà Phìn" -> "Sà Phìn", "xã Mèo Vạc" -> "Mèo Vạc")
  const fromAddress = extractAdminCommuneOrTown(context?.address);
  if (fromAddress) return fromAddress;

  // 2b. Explicit non-generic, non-landmark `area` field
  const specificArea = cleanAreaDisplayLabel(area);
  if (specificArea) {
    const cleanedArea = cleanOvernightAreaLabel(specificArea);
    if (cleanedArea && !LANDMARK_PREFIX.test(cleanedArea)) {
      return cleanedArea;
    }
  }

  // 2c. Known town/commune embedded in lastStopName (e.g. "[Tam] Rừng thông Yên Minh" -> "Yên Minh"), never raw landmark names
  const fromStopName = extractAdminCommuneOrTown(lastStopName);
  if (fromStopName) return fromStopName;

  // 3. Nearest town in OVERNIGHT_TOWN_CENTERS using coordinates
  if (
    typeof context?.latitude === "number"
    && typeof context?.longitude === "number"
    && Number.isFinite(context.latitude)
    && Number.isFinite(context.longitude)
  ) {
    const nearest = nearestOvernightTown({ latitude: context.latitude, longitude: context.longitude });
    if (nearest) return nearest;
  }

  // 4. Never fall back to a landmark/pass/river name like "Dinh thự họ Vương", "Sông Nho Quế", "Đèo Mã Pì Lèng"
  const fallbackArea = cleanOvernightAreaLabel(area);
  if (fallbackArea && !LANDMARK_PREFIX.test(fallbackArea)) return fallbackArea;
  return "";
}

/** True when a Google Places result has a meaningless generic name like "Khu Vui Chơi". */
export function isGenericActivityPlaceName(name: string): boolean {
  const folded = fold(cleanPlaceDisplayName(name));
  return !folded || GENERIC_ACTIVITY_NAMES.has(folded);
}
