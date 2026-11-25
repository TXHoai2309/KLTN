import { cleanAreaDisplayLabel, cleanPlaceDisplayName } from "@/lib/traveler-display-clean";
import type {
  DayTimelineChosenLodging,
  DayTimelineEveningPlan,
  DayTimelineNearbyItem,
  DayTimelineStop,
} from "./day-timeline";

export type TimelineSuggestionMarkerKind = "FREE_TIME" | "CHECKIN" | "DINNER";

export interface TimelineSuggestionMarker {
  id: string;
  kind: TimelineSuggestionMarkerKind;
  minute: number | null;
  timeText: string | null;
  badgeText: "gợi ý";
  title: string;
  infoTooltip: string;
  freeItems?: readonly DayTimelineNearbyItem[];
  checkinRouteSummary?: string | null;
  chosenLodging?: {
    nightIndex: number;
    name: string;
    previewTarget?: DayTimelineNearbyItem["previewTarget"];
  } | null;
  lodgingSuggestions?: DayTimelineEveningPlan["lodgingSuggestions"];
  eveningPlaces?: readonly DayTimelineNearbyItem[];
  dinnerEmptyText?: string;
}

const EARTH_RADIUS_KM = 6371;
const MOUNTAIN_TORTUOSITY = 1.35;

export function isSameTravelArea(areaA?: string | null, areaB?: string | null): boolean {
  const cleanA = cleanAreaDisplayLabel(areaA)?.toLocaleLowerCase("vi");
  const cleanB = cleanAreaDisplayLabel(areaB)?.toLocaleLowerCase("vi");
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
}

export function formatApproximateMinute(minute: number | null): string | null {
  if (minute === null || !Number.isFinite(minute)) return null;
  const normalized = Math.max(0, Math.round(minute));
  const hours = String(Math.floor(normalized / 60) % 24).padStart(2, "0");
  const mins = String(normalized % 60).padStart(2, "0");
  return `~${hours}:${mins}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimates travel minutes from the day's last stop to the chosen overnight area/lodging
 * purely for display marker placement. Returns `null` when coordinates/distance are missing
 * so the UI never fabricates an artificial check-in clock.
 */
export function estimateCheckinTravelMinutes(input: {
  lastStopLat?: number | null;
  lastStopLng?: number | null;
  targetLat?: number | null;
  targetLng?: number | null;
  sameAreaDistanceKm?: number | null;
  transport?: string | null;
}): number | null {
  const speedKmH = input.transport === "CAR" ? 38 : 32;
  let km: number | null = null;
  if (
    typeof input.lastStopLat === "number" &&
    Number.isFinite(input.lastStopLat) &&
    typeof input.lastStopLng === "number" &&
    Number.isFinite(input.lastStopLng) &&
    typeof input.targetLat === "number" &&
    Number.isFinite(input.targetLat) &&
    typeof input.targetLng === "number" &&
    Number.isFinite(input.targetLng)
  ) {
    km = haversineKm(input.lastStopLat, input.lastStopLng, input.targetLat, input.targetLng);
  } else if (
    typeof input.sameAreaDistanceKm === "number" &&
    Number.isFinite(input.sameAreaDistanceKm) &&
    input.sameAreaDistanceKm >= 0
  ) {
    km = input.sameAreaDistanceKm;
  }

  if (km === null) return null;
  if (km <= 0.3) return 5;
  const rawMinutes = ((km * MOUNTAIN_TORTUOSITY) / speedKmH) * 60;
  return Math.max(10, Math.round(rawMinutes / 5) * 5);
}

/**
 * Splits persisted `TripNearbySuggestion` ACTIVITY items by `slot`:
 * - `visit-K` attaches directly underneath that visit card (`nearbyAfter`)
 * - `free` or orphan items feed the day's `Thời gian trống · có thể ghé` timeline marker.
 */
export function splitTripNearbyBySlot<
  T extends { slot: string; kind: string; placeId: string; name: string; distanceKm: number },
>(
  activityItems: readonly T[],
  stops: readonly { order: number }[],
  mapItem: (item: T) => DayTimelineNearbyItem,
): {
  nearbyByStopOrder: Map<number, DayTimelineNearbyItem[]>;
  freeTimeSuggestions: DayTimelineNearbyItem[];
} {
  const nearbyByStopOrder = new Map<number, DayTimelineNearbyItem[]>();
  const freeTimeSuggestions: DayTimelineNearbyItem[] = [];
  const validOrders = new Set(stops.map((s) => s.order));

  for (const item of activityItems) {
    const mapped = mapItem(item);
    const visitMatch = /^visit-(\d{1,2})$/.exec(item.slot);
    if (visitMatch) {
      const parsedOrder = Number(visitMatch[1]);
      const targetOrder =
        validOrders.has(parsedOrder)
          ? parsedOrder
          : parsedOrder === 0 && stops[0]
            ? stops[0].order
            : parsedOrder >= 1 && parsedOrder <= stops.length
              ? stops[parsedOrder - 1]!.order
              : null;
      if (targetOrder !== null) {
        const list = nearbyByStopOrder.get(targetOrder) ?? [];
        list.push(mapped);
        nearbyByStopOrder.set(targetOrder, list);
        continue;
      }
    }
    freeTimeSuggestions.push(mapped);
  }

  return { nearbyByStopOrder, freeTimeSuggestions };
}

/**
 * Builds non-binding chronological timeline suggestion markers for display inside `DayTimeline`.
 * Pure presentation helper: never mutates stop clocks, Constraint Validator output, or costs.
 */
export function buildDaySuggestionMarkers(input: {
  dayIndex: number;
  orderedStops: readonly DayTimelineStop[];
  freeTimeSuggestions?: readonly DayTimelineNearbyItem[];
  nearbySuggestions?: readonly DayTimelineNearbyItem[];
  eveningPlan?: DayTimelineEveningPlan | null;
  chosenLodging?: DayTimelineChosenLodging | null;
  estimatedCheckinTravelMinutes?: number | null;
  checkinRouteSummary?: string | null;
}): TimelineSuggestionMarker[] {
  const markers: TimelineSuggestionMarker[] = [];

  let lastStopEndMinute: number | null = null;
  for (const stop of input.orderedStops) {
    if (stop.startMinute !== null) {
      lastStopEndMinute = stop.startMinute + (stop.durationMinutes ?? 0);
    }
  }

  const rawFreeItems =
    input.freeTimeSuggestions !== undefined
      ? input.freeTimeSuggestions
      : (input.nearbySuggestions ?? []);
  const freeItems = rawFreeItems.slice(0, 3);
  if (freeItems.length > 0) {
    markers.push({
      id: `d${input.dayIndex}-marker-free`,
      kind: "FREE_TIME",
      minute: lastStopEndMinute,
      timeText: formatApproximateMinute(lastStopEndMinute),
      badgeText: "gợi ý",
      title: "Thời gian trống · có thể ghé",
      infoTooltip: "Gợi ý từ Google Maps · Chưa kiểm tra · Không nằm trong lịch",
      freeItems,
    });
  }

  const travelMin = input.estimatedCheckinTravelMinutes;
  const hasTravelEstimate =
    lastStopEndMinute !== null &&
    typeof travelMin === "number" &&
    Number.isFinite(travelMin) &&
    travelMin >= 0;
  const checkinMinute = hasTravelEstimate ? lastStopEndMinute! + Math.round(travelMin!) : null;

  if (input.eveningPlan) {
    const overnightArea = input.eveningPlan.overnightArea.trim();
    const chosen = input.eveningPlan.chosenLodging;
    markers.push({
      id: `d${input.dayIndex}-marker-checkin`,
      kind: "CHECKIN",
      minute: checkinMinute,
      timeText: formatApproximateMinute(checkinMinute),
      badgeText: "gợi ý",
      title: overnightArea ? `Nhận phòng · ${overnightArea}` : "Nhận phòng",
      infoTooltip: chosen
        ? "Chưa kiểm tra · Không phải đặt phòng"
        : "Gợi ý từ Google Maps · Chưa kiểm tra · Không phải đặt phòng",
      ...(input.checkinRouteSummary ? { checkinRouteSummary: input.checkinRouteSummary } : {}),
      chosenLodging: chosen
        ? {
            nightIndex: input.eveningPlan.nightIndex,
            name: cleanPlaceDisplayName(chosen.name) || chosen.name,
            previewTarget: chosen.previewTarget,
          }
        : null,
      lodgingSuggestions:
        !chosen && input.eveningPlan.lodgingSuggestions
          ? input.eveningPlan.lodgingSuggestions.slice(0, 3)
          : undefined,
    });

    const baseDinnerMinute = 19 * 60;
    const dinnerMinute =
      checkinMinute !== null && checkinMinute >= baseDinnerMinute
        ? Math.min(22 * 60, checkinMinute + 30)
        : lastStopEndMinute !== null && lastStopEndMinute >= baseDinnerMinute
          ? Math.min(22 * 60, lastStopEndMinute + 30)
          : baseDinnerMinute;

    markers.push({
      id: `d${input.dayIndex}-marker-dinner`,
      kind: "DINNER",
      minute: dinnerMinute,
      timeText: formatApproximateMinute(dinnerMinute),
      badgeText: "gợi ý",
      title: "Ăn tối gần chỗ nghỉ",
      infoTooltip: "Gợi ý từ Google Maps · Chưa kiểm tra · Không nằm trong lịch",
      eveningPlaces: input.eveningPlan.eveningPlaces.slice(0, 3),
      dinnerEmptyText:
        input.eveningPlan.eveningPlaces.length === 0 ? "Chưa tìm được gợi ý buổi tối" : undefined,
    });
  } else if (input.chosenLodging) {
    markers.push({
      id: `d${input.dayIndex}-marker-checkin`,
      kind: "CHECKIN",
      minute: checkinMinute,
      timeText: formatApproximateMinute(checkinMinute),
      badgeText: "gợi ý",
      title: "Nhận phòng",
      infoTooltip: "Chưa kiểm tra · Không phải đặt phòng",
      chosenLodging: {
        nightIndex: input.chosenLodging.nightIndex,
        name: cleanPlaceDisplayName(input.chosenLodging.name) || input.chosenLodging.name,
        previewTarget: input.chosenLodging.previewTarget,
      },
    });
  }

  return markers;
}
