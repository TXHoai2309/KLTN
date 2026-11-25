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

function foldViKey(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/\s+/gu, " ")
    .trim();
}

const VIETNAM_CITY_PROVINCE_MAP = new Map<string, string>([
  ["ha noi", "Hà Nội"],
  ["thu do ha noi", "Hà Nội"],
  ["hanoi", "Hà Nội"],
  ["ho chi minh", "TP Hồ Chí Minh"],
  ["tp ho chi minh", "TP Hồ Chí Minh"],
  ["tp. ho chi minh", "TP Hồ Chí Minh"],
  ["thanh pho ho chi minh", "TP Hồ Chí Minh"],
  ["tp hcm", "TP Hồ Chí Minh"],
  ["tp.hcm", "TP Hồ Chí Minh"],
  ["tphcm", "TP Hồ Chí Minh"],
  ["hcm", "TP Hồ Chí Minh"],
  ["sai gon", "TP Hồ Chí Minh"],
  ["saigon", "TP Hồ Chí Minh"],
  ["ho chi minh city", "TP Hồ Chí Minh"],
  ["da nang", "Đà Nẵng"],
  ["danang", "Đà Nẵng"],
  ["hai phong", "Hải Phòng"],
  ["haiphong", "Hải Phòng"],
  ["can tho", "Cần Thơ"],
  ["cantho", "Cần Thơ"],
  ["hue", "Huế"],
  ["thua thien hue", "Huế"],
  ["thua thien - hue", "Huế"],
  ["ha giang", "Hà Giang"],
  ["an giang", "An Giang"],
  ["ba ria - vung tau", "Bà Rịa – Vũng Tàu"],
  ["ba ria vung tau", "Bà Rịa – Vũng Tàu"],
  ["vung tau", "Vũng Tàu"],
  ["bac giang", "Bắc Giang"],
  ["bac kan", "Bắc Kạn"],
  ["bac lieu", "Bạc Liêu"],
  ["bac ninh", "Bắc Ninh"],
  ["ben tre", "Bến Tre"],
  ["binh dinh", "Bình Định"],
  ["quy nhon", "Quy Nhơn"],
  ["binh duong", "Bình Dương"],
  ["thu dau mot", "Thủ Dầu Một"],
  ["binh phuoc", "Bình Phước"],
  ["binh thuan", "Bình Thuận"],
  ["phan thiet", "Phan Thiết"],
  ["ca mau", "Cà Mau"],
  ["cao bang", "Cao Bằng"],
  ["dak lak", "Đắk Lắk"],
  ["buon ma thuot", "Buôn Ma Thuột"],
  ["dak nong", "Đắk Nông"],
  ["dien bien", "Điện Biên"],
  ["dien bien phu", "Điện Biên Phủ"],
  ["dong nai", "Đồng Nai"],
  ["bien hoa", "Biên Hòa"],
  ["dong thap", "Đồng Tháp"],
  ["gia lai", "Gia Lai"],
  ["pleiku", "Pleiku"],
  ["ha nam", "Hà Nam"],
  ["ha tinh", "Hà Tĩnh"],
  ["hai duong", "Hải Dương"],
  ["hau giang", "Hậu Giang"],
  ["hoa binh", "Hòa Bình"],
  ["hung yen", "Hưng Yên"],
  ["khanh hoa", "Khánh Hòa"],
  ["nha trang", "Nha Trang"],
  ["cam ranh", "Cam Ranh"],
  ["kien giang", "Kiên Giang"],
  ["phu quoc", "Phú Quốc"],
  ["rach gia", "Rạch Giá"],
  ["kon tum", "Kon Tum"],
  ["lai chau", "Lai Châu"],
  ["lam dong", "Lâm Đồng"],
  ["da lat", "Đà Lạt"],
  ["dalat", "Đà Lạt"],
  ["lang son", "Lạng Sơn"],
  ["lao cai", "Lào Cai"],
  ["sa pa", "Sa Pa"],
  ["sapa", "Sa Pa"],
  ["long an", "Long An"],
  ["nam dinh", "Nam Định"],
  ["nghe an", "Nghệ An"],
  ["vinh", "Vinh"],
  ["ninh binh", "Ninh Bình"],
  ["ninh thuan", "Ninh Thuận"],
  ["phan rang", "Phan Rang"],
  ["phu tho", "Phú Thọ"],
  ["viet tri", "Việt Trì"],
  ["phu yen", "Phú Yên"],
  ["tuy hoa", "Tuy Hòa"],
  ["quang binh", "Quảng Bình"],
  ["dong hoi", "Đồng Hới"],
  ["quang nam", "Quảng Nam"],
  ["hoi an", "Hội An"],
  ["tam ky", "Tam Kỳ"],
  ["quang ngai", "Quảng Ngãi"],
  ["quang ninh", "Quảng Ninh"],
  ["ha long", "Hạ Long"],
  ["quang tri", "Quảng Trị"],
  ["dong ha", "Đông Hà"],
  ["soc trang", "Sóc Trăng"],
  ["son la", "Sơn La"],
  ["tay ninh", "Tây Ninh"],
  ["thai binh", "Thái Bình"],
  ["thai nguyen", "Thái Nguyên"],
  ["thanh hoa", "Thanh Hóa"],
  ["tien giang", "Tiền Giang"],
  ["my tho", "Mỹ Tho"],
  ["tra vinh", "Trà Vinh"],
  ["tuyen quang", "Tuyên Quang"],
  ["vinh long", "Vĩnh Long"],
  ["vinh phuc", "Vĩnh Phúc"],
  ["yen bai", "Yên Bái"],
]);

const SUB_CITY_PREFIX_RE =
  /^(?:p\.|phuong|q\.|quan|h\.|huyen|tx\.|thi xa|x\.|xa|tt\.|thi tran|thon|xom|ban|to|khu pho|kp\.|ap|ngo|ngach|hem|duong|d\.|pho|so|lo|toa|chung cu|ben xe|ga|san bay)\b/u;

const COUNTRY_SEGMENT_RE = /^(?:viet nam|vn|vietnam)$/u;

function matchCityProvinceSegment(rawSegment: string): string | null {
  const withoutPostal = rawSegment.replace(/\s+\d{5,6}$/u, "").trim();
  if (!withoutPostal || /\d/u.test(withoutPostal)) return null;

  const foldedRaw = foldViKey(withoutPostal);
  if (!foldedRaw || COUNTRY_SEGMENT_RE.test(foldedRaw) || SUB_CITY_PREFIX_RE.test(foldedRaw)) {
    return null;
  }

  const direct = VIETNAM_CITY_PROVINCE_MAP.get(foldedRaw);
  if (direct) return direct;

  const withoutCityPrefix = withoutPostal
    .replace(/^(?:t[pP]\.?\s+|thành phố\s+|tỉnh\s+)/iu, "")
    .trim();
  if (!withoutCityPrefix || /\d/u.test(withoutCityPrefix)) return null;

  const foldedStripped = foldViKey(withoutCityPrefix);
  if (!foldedStripped || SUB_CITY_PREFIX_RE.test(foldedStripped)) return null;

  return VIETNAM_CITY_PROVINCE_MAP.get(foldedStripped) ?? null;
}

/**
 * Extracts only a city/province-level name from an origin or homeCity label.
 * Never returns house numbers, street names, wards, districts, or coordinates.
 */
export function extractOriginCityProvince(
  label: string | null | undefined,
  options?: { allowHaGiang?: boolean },
): string | null {
  if (!label) return null;
  const normalized = label.normalize("NFC").trim();
  if (!normalized) return null;

  // Reject coordinate-like inputs immediately.
  if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/u.test(normalized)) return null;

  const strippedParens = normalized.replace(/\s*\([^)]*\)/gu, " ").replace(/\s+/gu, " ").trim();
  if (!strippedParens) return null;

  const parts = strippedParens
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]!;
    const matched = matchCityProvinceSegment(part);
    if (matched) {
      if (!options?.allowHaGiang && /^hà giang$/iu.test(matched)) return null;
      return matched;
    }

    if (/\s+[-–—]\s+/u.test(part)) {
      const subParts = part.split(/\s+[-–—]\s+/u).map((s) => s.trim()).filter(Boolean);
      for (let j = subParts.length - 1; j >= 0; j -= 1) {
        const subMatch = matchCityProvinceSegment(subParts[j]!);
        if (subMatch) {
          if (!options?.allowHaGiang && /^hà giang$/iu.test(subMatch)) return null;
          return subMatch;
        }
      }
    }
  }

  return null;
}

function shortOriginCity(label: string | null | undefined): string | null {
  return extractOriginCityProvince(label, { allowHaGiang: false });
}

/**
 * Formats an origin label for traveler display (ADR-57 D3):
 * for self-drive trips (`hasAccessLeg === false`), strips synthetic bus-station hub suffixes
 * such as " (bến xe Mỹ Đình)" while preserving explicit traveler stations like "Bến xe Giáp Bát".
 */
export function formatTravelerOriginLabel(
  rawLabel: string | null | undefined,
  hasAccessLeg: boolean,
): string {
  const text = rawLabel?.trim() ?? "";
  if (!text) return "";
  if (hasAccessLeg) return text;
  const cleaned = text
    .replace(/\s*\((?:bến xe|bx|trạm|ga)[^)]*\)\s*$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned || text;
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
export function buildDataTripTitle(
  input: DataTripTitleInput & {
    originAdminArea?: string | null;
    hubName?: string | null;
  },
): string {
  const custom = input.companionTitle?.trim();
  if (custom) return custom;

  const range = formatTripDateRangeShort(input.startDate, input.endDate);
  const departure =
    shortOriginCity(input.originAdminArea) ??
    shortOriginCity(input.homeCity) ??
    shortOriginCity(input.originLabel) ??
    shortOriginCity(input.hubName);
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
