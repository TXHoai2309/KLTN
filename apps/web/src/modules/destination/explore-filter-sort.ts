import {
  cleanAreaDisplayLabel,
  cleanPlaceDisplayName,
  extractAdminCommuneOrTown,
  OVERNIGHT_TOWN_CENTERS,
} from "@/lib/traveler-display-clean";

export type ExploreSortMode = "name" | "nearest" | "popular";

export type ExploreLocationCandidate = {
  id: string;
  name: string;
  area: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  inferredArea?: string;
  openToday?: boolean | null;
  favoriteCount?: number;
};

const COMMUNE_PATTERN =
  /(?:^|[\s,\-(])(?:x[aã]|th[iị]\s+tr[aấ]n|ph[uư][oờ]ng)\s+([^,()\-–;]+?)(?=[,()\-–;]|$)/iu;

const DISTRICT_PATTERN =
  /(?:^|[\s,\-(])(?:huy[eệ]n|th[aà]nh\s+ph[oố]|tp\.?)\s+([^,()\-–;]+?)(?=[,()\-–;]|$)/iu;

const PROVINCE_BLACKLIST = new Set(["ha giang", "tinh ha giang", "tuyen quang", "tinh tuyen quang"]);

function foldSimple(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Resolves a genuine district/commune/town display area for Explore cards and filters (P4).
 * Hides generic placeholders like "khu vực hà giang"; infers from existing `address` or
 * very close town-center proximity without fabricating an ungrounded area.
 */
export function resolveExploreDisplayArea(input: {
  area?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  inferredArea?: string | null;
}): string | null {
  if (input.inferredArea) {
    const cleanInferred = cleanAreaDisplayLabel(input.inferredArea);
    if (cleanInferred) return cleanInferred;
  }

  const explicit = cleanAreaDisplayLabel(input.area);
  if (explicit) return explicit;

  if (input.address) {
    const explicitCommune = COMMUNE_PATTERN.exec(input.address)?.[1]?.trim();
    if (explicitCommune && !PROVINCE_BLACKLIST.has(foldSimple(explicitCommune))) {
      const cleaned = cleanPlaceDisplayName(explicitCommune);
      if (cleaned) return cleaned;
    }

    const commune = extractAdminCommuneOrTown(input.address);
    if (commune) return commune;

    const districtMatch = DISTRICT_PATTERN.exec(input.address);
    if (districtMatch?.[1]) {
      const district = cleanPlaceDisplayName(districtMatch[1]);
      if (district && !PROVINCE_BLACKLIST.has(foldSimple(district))) {
        return /^h[aà]\s+giang$/iu.test(foldSimple(district)) ? "TP Hà Giang" : district;
      }
    }
  }

  // Only attribute to a known Hà Giang hub if coordinates sit right inside town (~2.5 km) so villages aren't mislabeled.
  if (
    typeof input.latitude === "number"
    && typeof input.longitude === "number"
    && Number.isFinite(input.latitude)
    && Number.isFinite(input.longitude)
  ) {
    let bestTown: string | null = null;
    let bestKm = Number.POSITIVE_INFINITY;
    for (const [town, center] of Object.entries(OVERNIGHT_TOWN_CENTERS)) {
      const km = haversineKm(input.latitude, input.longitude, center.latitude, center.longitude);
      if (km < bestKm) {
        bestKm = km;
        bestTown = town;
      }
    }
    if (bestTown && bestKm <= 2.5) return bestTown;
  }

  return null;
}

const WEEKDAY_SHORT_MAP: Record<string, string> = {
  Mon: "MONDAY",
  Tue: "TUESDAY",
  Wed: "WEDNESDAY",
  Thu: "THURSDAY",
  Fri: "FRIDAY",
  Sat: "SATURDAY",
  Sun: "SUNDAY",
};

export function vietnamWeekdayKey(now = new Date()): string {
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "short",
    }).format(now);
    return WEEKDAY_SHORT_MAP[short] ?? "MONDAY";
  } catch {
    return "MONDAY";
  }
}

export function isDestinationOpenToday(
  openingDays: readonly { dayOfWeek: string; status: string }[],
  now = new Date(),
): boolean | null {
  if (!openingDays.length) return null;
  const today = vietnamWeekdayKey(now);
  const entry = openingDays.find(day => day.dayOfWeek === today);
  if (!entry || entry.status === "UNKNOWN") return null;
  return entry.status === "OPEN";
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function exploreDistanceKm(
  item: Pick<ExploreLocationCandidate, "latitude" | "longitude">,
  userCoords: { latitude: number; longitude: number } | null | undefined,
): number | null {
  if (
    !userCoords
    || typeof item.latitude !== "number"
    || typeof item.longitude !== "number"
    || !Number.isFinite(item.latitude)
    || !Number.isFinite(item.longitude)
  ) {
    return null;
  }
  return haversineKm(userCoords.latitude, userCoords.longitude, item.latitude, item.longitude);
}

export function collectRealExploreAreas(items: readonly ExploreLocationCandidate[]): string[] {
  const unique = new Map<string, string>();
  for (const item of items) {
    const resolved = resolveExploreDisplayArea(item);
    if (!resolved) continue;
    const key = resolved.toLocaleLowerCase("vi-VN");
    if (!unique.has(key)) unique.set(key, resolved);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, "vi"));
}

export function filterAndSortExploreLocations<T extends ExploreLocationCandidate>(
  items: readonly T[],
  options: {
    region?: string;
    openTodayOnly?: boolean;
    sort?: ExploreSortMode;
    userCoords?: { latitude: number; longitude: number } | null;
  },
): T[] {
  const wantRegion = options.region?.trim().toLocaleLowerCase("vi-VN") ?? "";
  const filtered = items.filter(item => {
    if (wantRegion) {
      const areaLabel = resolveExploreDisplayArea(item);
      if (!areaLabel || areaLabel.toLocaleLowerCase("vi-VN") !== wantRegion) return false;
    }
    if (options.openTodayOnly && item.openToday !== true) return false;
    return true;
  });

  const sortMode = options.sort ?? "name";
  return [...filtered].sort((a, b) => {
    if (sortMode === "nearest" && options.userCoords) {
      const distA = exploreDistanceKm(a, options.userCoords);
      const distB = exploreDistanceKm(b, options.userCoords);
      if (distA !== null && distB !== null && distA !== distB) return distA - distB;
      if (distA !== null && distB === null) return -1;
      if (distA === null && distB !== null) return 1;
    } else if (sortMode === "popular") {
      const diff = (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0);
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name, "vi");
  });
}
