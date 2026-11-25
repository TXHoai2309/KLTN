import { cleanAreaDisplayLabel, OVERNIGHT_TOWN_CENTERS, resolveOvernightAreaLabel } from "./traveler-display-clean";

/** Minimum straight-line distance (km) from a day's last stop to the town center before adding an overnight detour. */
export const OVERNIGHT_CHECKIN_DETOUR_MIN_KM = 1.0;
/** Maximum distance (km) within Hà Giang for coordinate-based overnight town snapping. */
export const MAX_OVERNIGHT_CENTER_DISTANCE_KM = 45;
const MOUNTAIN_TORTUOSITY = 1.35;

const EARTH_RADIUS_KM = 6371;

export function distanceBetweenKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface OvernightAnchorTown {
  area: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  needsCheckinLeg: boolean;
}

/**
 * Resolves the fixed overnight town center (`OVERNIGHT_TOWN_CENTERS`) for a day's final stop.
 * Never depends on `chosenLodging` so lodging selection cannot alter routing or validation.
 */
export function resolveOvernightAnchorTown(stop: {
  area?: string | null;
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): OvernightAnchorTown | null {
  if (
    typeof stop.latitude !== "number"
    || !Number.isFinite(stop.latitude)
    || typeof stop.longitude !== "number"
    || !Number.isFinite(stop.longitude)
  ) {
    return null;
  }
  if (stop.area?.trim().toLowerCase() === "khu vực kiểm thử") {
    return null;
  }

  const cleanedArea = cleanAreaDisplayLabel(stop.area);
  const explicitTownEntry = cleanedArea
    ? Object.entries(OVERNIGHT_TOWN_CENTERS).find(
        ([town]) => town.toLocaleLowerCase("vi") === cleanedArea.toLocaleLowerCase("vi"),
      )
    : undefined;

  let bestArea: string | null = null;
  let bestCenter: { latitude: number; longitude: number } | null = null;
  let bestDistanceKm = Number.POSITIVE_INFINITY;

  if (explicitTownEntry) {
    bestArea = explicitTownEntry[0];
    bestCenter = explicitTownEntry[1];
    bestDistanceKm = distanceBetweenKm(
      { latitude: stop.latitude, longitude: stop.longitude },
      bestCenter,
    );
  } else {
    for (const [town, center] of Object.entries(OVERNIGHT_TOWN_CENTERS)) {
      const km = distanceBetweenKm(
        { latitude: stop.latitude, longitude: stop.longitude },
        center,
      );
      if (Number.isFinite(km) && km < bestDistanceKm) {
        bestDistanceKm = km;
        bestArea = town;
        bestCenter = center;
      }
    }
  }

  if (!bestArea || !bestCenter || !Number.isFinite(bestDistanceKm) || bestDistanceKm > MAX_OVERNIGHT_CENTER_DISTANCE_KM) {
    return null;
  }

  return {
    area: bestArea,
    latitude: bestCenter.latitude,
    longitude: bestCenter.longitude,
    distanceKm: Math.round(bestDistanceKm * 10) / 10,
    needsCheckinLeg: bestDistanceKm > OVERNIGHT_CHECKIN_DETOUR_MIN_KM,
  };
}

function estimateAnchorDriveMinutes(distanceKm: number, transport: "MOTORCYCLE" | "CAR" | string): number {
  const speedKmH = transport === "CAR" ? 38 : 32;
  if (distanceKm <= 0.3) return 5;
  const rawMinutes = ((distanceKm * MOUNTAIN_TORTUOSITY) / speedKmH) * 60;
  return Math.max(10, Math.round(rawMinutes / 5) * 5);
}

/**
 * Formats non-blocking evening check-in route info & clock estimate from fixed overnight town anchors
 * (ADR-57 D2). Never reads `chosenLodging` so picking/clearing lodging never changes route timing.
 */
export function resolveOvernightCheckinPresentation(input: {
  overnightStay?: {
    area: string;
    distanceFromLastStopKm: number;
    checkinRoute?: {
      status: "VERIFIED" | "INSUFFICIENT_DATA";
      durationSeconds: number | null;
      distanceMeters: number | null;
    } | null;
  } | null;
  lastStop?: {
    area?: string | null;
    name?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  transport: "MOTORCYCLE" | "CAR" | string;
}): {
  area: string | null;
  estimatedCheckinTravelMinutes: number | null;
  checkinRouteSummary: string | null;
} {
  const stay = input.overnightStay;
  if (stay) {
    const route = stay.checkinRoute;
    if (route?.status === "VERIFIED" && route.durationSeconds != null && route.distanceMeters != null) {
      const mins = Math.max(5, Math.ceil(route.durationSeconds / 60));
      const km = Math.round((route.distanceMeters / 1000) * 10) / 10;
      const kmText = `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(km)} km`;
      return {
        area: stay.area,
        estimatedCheckinTravelMinutes: mins,
        checkinRouteSummary: `Về khu vực ${stay.area}: ${kmText} · khoảng ${mins} phút`,
      };
    }
    if (stay.distanceFromLastStopKm > OVERNIGHT_CHECKIN_DETOUR_MIN_KM) {
      const mins = estimateAnchorDriveMinutes(stay.distanceFromLastStopKm, input.transport);
      const kmText = `~${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(stay.distanceFromLastStopKm)} km`;
      return {
        area: stay.area,
        estimatedCheckinTravelMinutes: mins,
        checkinRouteSummary: `Về khu vực ${stay.area}: ${kmText} · khoảng ${mins} phút (ước tính theo tâm khu vực)`,
      };
    }
    return { area: stay.area, estimatedCheckinTravelMinutes: 5, checkinRouteSummary: null };
  }

  if (input.lastStop) {
    const anchor = resolveOvernightAnchorTown(input.lastStop);
    if (anchor) {
      if (anchor.needsCheckinLeg) {
        const mins = estimateAnchorDriveMinutes(anchor.distanceKm, input.transport);
        const kmText = `~${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(anchor.distanceKm)} km`;
        return {
          area: anchor.area,
          estimatedCheckinTravelMinutes: mins,
          checkinRouteSummary: `Về khu vực ${anchor.area}: ${kmText} · khoảng ${mins} phút (ước tính theo tâm khu vực)`,
        };
      }
      return { area: anchor.area, estimatedCheckinTravelMinutes: 5, checkinRouteSummary: null };
    }
  }

  return { area: null, estimatedCheckinTravelMinutes: null, checkinRouteSummary: null };
}

/**
 * Resolves the overnight area label from the most recent sightseeing day prior to `dayIndex`
 * for building `<Khu vực nghỉ đêm ngày N-1> → ...` route headers.
 */
export function resolvePreviousOvernightArea(input: {
  dayIndex: number;
  overnightStays?: readonly { day: number; area: string }[] | null;
  previousDays: readonly {
    dayIndex: number;
    lastStop?: {
      area?: string | null;
      name?: string | null;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
  }[];
}): string | null {
  if (input.dayIndex <= 1) return null;
  const latest = [...input.previousDays]
    .filter((d) => d.dayIndex < input.dayIndex && d.lastStop)
    .sort((a, b) => b.dayIndex - a.dayIndex)[0];
  if (!latest?.lastStop) return null;
  const fromPlan = input.overnightStays?.find((s) => s.day === latest.dayIndex)?.area;
  if (fromPlan) return fromPlan;
  const anchor = resolveOvernightAnchorTown(latest.lastStop);
  if (anchor) return anchor.area;
  const label = resolveOvernightAreaLabel(latest.lastStop.area, latest.lastStop.name, {
    address: latest.lastStop.address ?? null,
    latitude: latest.lastStop.latitude ?? null,
    longitude: latest.lastStop.longitude ?? null,
  });
  return label || null;
}
