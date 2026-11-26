import type { PlannerResult } from "../trip-planner/planner-contract";
import { haversine } from "../trip-planner/planner-geography";
import {
  cleanPlaceDisplayName,
  isGenericActivityPlaceName,
  OVERNIGHT_TOWN_CENTERS,
  resolveOvernightAreaLabel,
} from "../../lib/traveler-display-clean";

export { OVERNIGHT_TOWN_CENTERS };
import type { ExternalPlaceSuggestion, PlacesSearch } from "./tripsage-places";
import { EARLY_DAY_END_MINUTE, suggestionSchema, type TimelineSuggestion } from "./tripsage-timeline";

/**
 * Nearby activity suggestions (ADR-45): after a plan is built the server looks up places to visit or play near each
 * stop and near each overnight stay. Results are Google Maps data, unchecked, and never change a time or become a visit.
 * The model does not choose them; it only learns that they exist.
 */
export const ACTIVITY_RADIUS_KM = { ACTIVITY: 5, FREE: 8, EVENING: 3 } as const;
export const ACTIVITY_PER_SLOT = 5;
/** PARITY BR-7: at most 3 evening eat/hangout places per night within 3 km. */
export const EVENING_PER_SLOT = 3;
/** Upper bound of Places calls per plan (stops first, then nights); the 4-call cap of `searchPlaces` is a separate, model-facing budget. */
export const ACTIVITY_MAX_ANCHORS = 16;

/** PARITY BR-8 & BR-10: Google Places lodging types excluded from ACTIVITY, FREE, and EVENING suggestions. */
export const LODGING_PLACE_TYPES = new Set<string>([
  "lodging",
  "hotel",
  "resort_hotel",
  "resort",
  "homestay",
  "motel",
  "bed_and_breakfast",
  "guest_house",
  "hostel",
  "campground",
  "camping_cabin",
  "cottage",
  "extended_stay_hotel",
  "farmstay",
  "inn",
  "mobile_home_park",
  "private_guest_room",
  "rv_park",
]);

const LODGING_NAME_PATTERN =
  /\b(?:homestay|home\s*stay|hotel|khach\s+san|resort|nha\s+nghi|guest\s*house|hostel|motel|lodge|bungalow|campground|camping|retreat)\b/iu;

function foldName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** True when a place is a hotel, homestay, resort, guest house, hostel, or campground (by Places types or name). */
export function isLodgingPlace(place: { name: string; types?: readonly string[] }): boolean {
  if (place.types?.some(type => LODGING_PLACE_TYPES.has(type.toLowerCase()))) return true;
  return LODGING_NAME_PATTERN.test(foldName(place.name));
}
const QUERIES = {
  ACTIVITY: "điểm tham quan vui chơi giải trí",
  FREE: "quán cà phê view đẹp điểm check-in chụp ảnh",
  EVENING: "quán ăn nhà hàng quán cà phê chợ đêm",
} as const;
const EVENING_FALLBACK_QUERY = "quán ăn";
const VENUE_PREFIX_PATTERN = /^(?:qu[aá]n|nh[aà]\s+h[aà]ng|c[aà]\s+ph[eê]|cafe|coffee|ch[oợ]\s+đ[eê]m|l[aẩ]u|b[uú]n|ph[oở]|tr[aà]|bar|pub|bia)(?=$|[^\p{L}\p{N}])/iu;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;

type Kind = keyof typeof QUERIES;
export type EveningAnchorSource = "chosen_lodging" | "lodging_suggestion" | "town_center" | "last_stop";
export type OvernightLodgingPoint = { latitude: number; longitude: number; source: "chosen_lodging" | "lodging_suggestion" };
export type EveningAnchorDiagnostic = {
  slotId: string;
  area?: string;
  anchorSource: EveningAnchorSource;
  count: number;
  reason: "ok" | "no_places_within_3km" | "all_filtered_out" | "places_unavailable" | "budget_exhausted";
};

/** `FREE` is the free afternoon after the last stop; it shows as an `ACTIVITY` suggestion found with its own query. */
export type ActivityAnchor = {
  slotId: string;
  kind: Kind;
  latitude: number;
  longitude: number;
  anchorSource?: EveningAnchorSource;
  areaLabel?: string;
};

/**
 * Resolves the EVENING search anchor for a night in strict priority order:
 * (1) chosen lodging coordinates, (2) nearest lodging suggestion coordinates,
 * (3) overnight area town center (e.g. TT Yên Minh), (4) day's last stop coordinates.
 */
export function resolveEveningAnchorPoint(input: {
  lastStop: { name?: string | null; area?: string | null; address?: string | null; latitude: number; longitude: number };
  lodging?: OvernightLodgingPoint | null;
  /** Canonical overnight town center from `journeyPlan.overnightStays` (D3 / B3). */
  overnightStay?: { area: string; latitude: number; longitude: number } | null;
}): { latitude: number; longitude: number; anchorSource: EveningAnchorSource; areaLabel?: string } {
  const stayArea = input.overnightStay?.area?.trim() || undefined;
  // Only snap the EVENING Places search anchor to a town center when the stop's area/address/name
  // actually belongs to that town (not by snapping an unrelated distant stop to a faraway town).
  const areaLabel =
    stayArea ||
    resolveOvernightAreaLabel(input.lastStop.area, input.lastStop.name, {
      address: input.lastStop.address ?? null,
    }) ||
    undefined;
  if (input.lodging && Number.isFinite(input.lodging.latitude) && Number.isFinite(input.lodging.longitude)) {
    return {
      latitude: input.lodging.latitude,
      longitude: input.lodging.longitude,
      anchorSource: input.lodging.source,
      areaLabel,
    };
  }
  if (
    input.overnightStay &&
    Number.isFinite(input.overnightStay.latitude) &&
    Number.isFinite(input.overnightStay.longitude)
  ) {
    return {
      latitude: input.overnightStay.latitude,
      longitude: input.overnightStay.longitude,
      anchorSource: "town_center",
      areaLabel: stayArea ?? areaLabel,
    };
  }
  const townCenter = areaLabel ? OVERNIGHT_TOWN_CENTERS[areaLabel] : undefined;
  if (townCenter) {
    return {
      latitude: townCenter.latitude,
      longitude: townCenter.longitude,
      anchorSource: "town_center",
      areaLabel,
    };
  }
  return {
    latitude: input.lastStop.latitude,
    longitude: input.lastStop.longitude,
    anchorSource: "last_stop",
    areaLabel,
  };
}

/** shortcut: per-instance memory cache of lookups (keyed by rounded point and kind); upgrade to a shared cache if instances multiply. */
const cache = new Map<string, { at: number; places: ExternalPlaceSuggestion[] }>();

const norm = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/gu, " ").trim();

/** Anchors in plan order: every stop first (`dN-visit-K`), then free afternoons (`dN-free`), then each night (`dN-overnight`, anchored by lodging → town center → last stop). */
export function activityAnchors(
  result: PlannerResult,
  options?: { overnightLodgings?: Readonly<Record<number, OvernightLodgingPoint>> },
): { anchors: ActivityAnchor[]; stopNames: string[] } {
  const visits: ActivityAnchor[] = []; const frees: ActivityAnchor[] = []; const nights: ActivityAnchor[] = []; const stopNames: string[] = [];
  result.days.forEach((day, index) => {
    day.stops.forEach((stop, stopIndex) => {
      stopNames.push(stop.destination.name);
      visits.push({ slotId: `d${day.day}-visit-${stopIndex + 1}`, kind: "ACTIVITY", latitude: stop.destination.latitude, longitude: stop.destination.longitude });
    });
    const last = day.stops.at(-1);
    const freeAfternoon = last && index < result.days.length - 1 && last.departureMinute !== null && last.departureMinute < EARLY_DAY_END_MINUTE;
    if (last && freeAfternoon) frees.push({ slotId: `d${day.day}-free`, kind: "FREE", latitude: last.destination.latitude, longitude: last.destination.longitude });
    if (index < result.days.length - 1) {
      const overnightStay = result.journeyPlan?.overnightStays?.find((stay) => stay.day === day.day) ?? null;
      if (last) {
        const resolved = resolveEveningAnchorPoint({
          lastStop: {
            name: last.destination.name,
            area: last.destination.area,
            latitude: last.destination.latitude,
            longitude: last.destination.longitude,
          },
          lodging: options?.overnightLodgings?.[day.day] ?? null,
          overnightStay,
        });
        nights.push({
          slotId: `d${day.day}-overnight`,
          kind: "EVENING",
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          anchorSource: resolved.anchorSource,
          areaLabel: resolved.areaLabel,
        });
      } else {
        // D6 (B6): Day 1 OUTBOUND_ONLY (0 sightseeing stops) arrives at TP Hà Giang — still anchor d1-overnight!
        const isOutboundOnlyDay1 =
          day.day === 1
          && (day.journeyDayKind === "OUTBOUND_ONLY"
            || Boolean(result.journeyPlan?.legs.some(leg => leg.day === 1 && leg.kind === "OUTBOUND")));
        if (overnightStay || isOutboundOnlyDay1) {
          const areaLabel = overnightStay?.area ?? "TP Hà Giang";
          const center = overnightStay
            ? { latitude: overnightStay.latitude, longitude: overnightStay.longitude }
            : OVERNIGHT_TOWN_CENTERS[areaLabel] ?? OVERNIGHT_TOWN_CENTERS["TP Hà Giang"]!;
          const lodging = options?.overnightLodgings?.[day.day] ?? null;
          nights.push({
            slotId: `d${day.day}-overnight`,
            kind: "EVENING",
            latitude: lodging?.latitude ?? center.latitude,
            longitude: lodging?.longitude ?? center.longitude,
            anchorSource: lodging ? lodging.source : "town_center",
            areaLabel,
          });
        }
      }
    }
  });
  // Reserve anchor budget for every night (Days 1..N-1) so multi-day trips never lose their "Tối nay" slots (PARITY AC-6).
  const reservedNights = nights.slice(0, ACTIVITY_MAX_ANCHORS);
  const maxDaytime = Math.max(0, ACTIVITY_MAX_ANCHORS - reservedNights.length);
  return { anchors: [...[...visits, ...frees].slice(0, maxDaytime), ...reservedNights], stopNames };
}

/** Looks up places near every anchor (a few at a time) and returns at most `ACTIVITY_PER_SLOT` per slot, nearest first, each place once. */
export async function nearbyActivitySuggestions(input: {
  places: PlacesSearch;
  anchors: readonly ActivityAnchor[];
  stopNames: readonly string[];
  signal?: AbortSignal;
  now?: () => number;
  onEveningDiagnostics?: (details: EveningAnchorDiagnostic[]) => void;
}): Promise<TimelineSuggestion[]> {
  const now = input.now ?? Date.now;
  const excluded = input.stopNames.map(name => norm(cleanPlaceDisplayName(name) || name)).filter(Boolean);
  const isStop = (name: string) => {
    const n = norm(cleanPlaceDisplayName(name) || name);
    if (!n) return true;
    const isFoodOrEveningVenue = VENUE_PREFIX_PATTERN.test(n);
    return excluded.some(stop => {
      if (n === stop) return true;
      if (stop.includes(n) && n.length >= 4) return true;
      // Do not drop cafes/restaurants/night markets whose name contains a town/stop name (e.g. "Chợ đêm Phố cổ Đồng Văn").
      if (!isFoodOrEveningVenue && n.includes(stop)) return true;
      return false;
    });
  };

  const rankValid = (anchor: ActivityAnchor, places: readonly ExternalPlaceSuggestion[]) =>
    places
      .map(place => ({ place: { ...place, name: cleanPlaceDisplayName(place.name) }, distanceKm: haversine(anchor, place) }))
      .filter(({ place, distanceKm }) =>
        distanceKm <= ACTIVITY_RADIUS_KM[anchor.kind]
        && !isStop(place.name)
        && !isLodgingPlace(place)
        && !isGenericActivityPlaceName(place.name),
      )
      .sort((a, b) => a.distanceKm - b.distanceKm);

  const found: ({ anchor: ActivityAnchor; places: ExternalPlaceSuggestion[]; outcomeStatus?: "RESULTS" | "NO_RESULTS" | "UNAVAILABLE" | "BUDGET_EXHAUSTED" } | undefined)[] = new Array(input.anchors.length);
  // Prioritize EVENING anchors first in execution order so "Tối nay" (and its fallback query) never starves behind daytime stops.
  const executionOrder = [
    ...input.anchors.map((anchor, index) => ({ anchor, index })).filter(e => e.anchor.kind === "EVENING"),
    ...input.anchors.map((anchor, index) => ({ anchor, index })).filter(e => e.anchor.kind !== "EVENING"),
  ];
  let cursor = 0;
  let callsMade = 0;
  const worker = async () => {
    for (;;) {
      const next = executionOrder[cursor++];
      if (!next || input.signal?.aborted) return;
      const { anchor, index } = next;
      const key = `${anchor.kind}|${anchor.latitude.toFixed(3)}|${anchor.longitude.toFixed(3)}`;
      const hit = cache.get(key);
      if (hit && now() >= hit.at && now() - hit.at < CACHE_TTL_MS) { found[index] = { anchor, places: hit.places, outcomeStatus: "RESULTS" }; continue; }
      if (callsMade >= ACTIVITY_MAX_ANCHORS) {
        found[index] = { anchor, places: [], outcomeStatus: "BUDGET_EXHAUSTED" };
        continue;
      }
      try {
        callsMade += 1;
        const outcome = await input.places(QUERIES[anchor.kind], input.signal, { latitude: anchor.latitude, longitude: anchor.longitude, radiusKm: ACTIVITY_RADIUS_KM[anchor.kind] });
        let combinedPlaces: ExternalPlaceSuggestion[] = outcome.status === "RESULTS" ? outcome.places : [];
        let finalStatus: "RESULTS" | "NO_RESULTS" | "UNAVAILABLE" = outcome.status;
        // If the primary EVENING query yields 0 surviving non-lodging places within 3 km and call budget remains, try a simpler food query.
        if (
          anchor.kind === "EVENING"
          && rankValid(anchor, combinedPlaces).length === 0
          && callsMade < ACTIVITY_MAX_ANCHORS
          && !input.signal?.aborted
        ) {
          callsMade += 1;
          const fallback = await input.places(EVENING_FALLBACK_QUERY, input.signal, { latitude: anchor.latitude, longitude: anchor.longitude, radiusKm: ACTIVITY_RADIUS_KM.EVENING });
          if (fallback.status === "RESULTS") {
            finalStatus = "RESULTS";
            const seenIds = new Set(combinedPlaces.map(p => p.placeId));
            combinedPlaces = [...combinedPlaces, ...fallback.places.filter(p => !seenIds.has(p.placeId))];
          } else if (finalStatus === "UNAVAILABLE" && fallback.status === "NO_RESULTS") {
            finalStatus = "NO_RESULTS";
          }
        }
        if (combinedPlaces.length > 0) {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
          cache.set(key, { at: now(), places: combinedPlaces });
        }
        found[index] = { anchor, places: combinedPlaces, outcomeStatus: finalStatus };
      } catch {
        found[index] = { anchor, places: [], outcomeStatus: "UNAVAILABLE" };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, executionOrder.length) }, worker));

  const usedBy = { ACTIVITY: new Set<string>(), EVENING: new Set<string>() };
  const out: TimelineSuggestion[] = [];
  const eveningDiagnostics: EveningAnchorDiagnostic[] = [];
  for (const entry of found) {
    if (!entry) continue;
    const ranked = rankValid(entry.anchor, entry.places);
    const outKind = entry.anchor.kind === "EVENING" ? "EVENING" : "ACTIVITY"; const used = usedBy[outKind];
    const slotLimit = outKind === "EVENING" ? EVENING_PER_SLOT : ACTIVITY_PER_SLOT;
    const takenNames = new Set<string>();
    let taken = 0;
    for (const { place, distanceKm } of ranked) {
      if (taken >= slotLimit) break;
      const foldedName = place.name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\p{M}\p{Cf}]/gu, "")
        .replace(/đ/gu, "d")
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
      if (used.has(place.placeId) || (foldedName && takenNames.has(foldedName))) continue;
      const parsed = suggestionSchema.safeParse({ slotId: entry.anchor.slotId, kind: outKind, title: place.name, place: { placeId: place.placeId, name: place.name, distanceKm: Math.round(distanceKm * 10) / 10 } });
      if (!parsed.success) continue;
      used.add(place.placeId);
      if (foldedName) takenNames.add(foldedName);
      out.push(parsed.data); taken += 1;
    }
    if (entry.anchor.kind === "EVENING") {
      const reason: EveningAnchorDiagnostic["reason"] = taken > 0
        ? "ok"
        : entry.outcomeStatus === "BUDGET_EXHAUSTED"
          ? "budget_exhausted"
          : entry.outcomeStatus === "UNAVAILABLE"
            ? "places_unavailable"
            : entry.places.length > 0
              ? "all_filtered_out"
              : "no_places_within_3km";
      eveningDiagnostics.push({
        slotId: entry.anchor.slotId,
        ...(entry.anchor.areaLabel ? { area: entry.anchor.areaLabel } : {}),
        anchorSource: entry.anchor.anchorSource ?? "last_stop",
        count: taken,
        reason,
      });
    }
  }
  if (input.onEveningDiagnostics && eveningDiagnostics.length > 0) {
    input.onEveningDiagnostics(eveningDiagnostics);
  }
  return out;
}

export const LODGING_PER_SLOT = 3;
export const LODGING_RADIUS_KM = 5;
const LODGING_QUERY = "homestay khách sạn nhà nghỉ";

/**
 * D6 (B6): Server-side lodging suggestion lookup anchored on the canonical D3 overnight stay town centers
 * (`dN-overnight`, including Day 1 OUTBOUND_ONLY at TP Hà Giang), so every overnight night reliably
 * receives up to 3 unchecked Google Maps lodging suggestions without relying on extra LLM steps.
 */
export async function nearbyLodgingSuggestions(input: {
  places: PlacesSearch;
  anchors: readonly ActivityAnchor[];
  signal?: AbortSignal;
  now?: () => number;
}): Promise<TimelineSuggestion[]> {
  const now = input.now ?? Date.now;
  const nightAnchors = input.anchors.filter(a => a.kind === "EVENING" && a.slotId.endsWith("-overnight"));
  if (nightAnchors.length === 0) return [];

  const found: ({ anchor: ActivityAnchor; places: ExternalPlaceSuggestion[] } | undefined)[] = new Array(nightAnchors.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      const anchor = nightAnchors[idx];
      if (!anchor || input.signal?.aborted) return;
      const key = `LODGING|${anchor.latitude.toFixed(3)}|${anchor.longitude.toFixed(3)}`;
      const hit = cache.get(key);
      if (hit && now() >= hit.at && now() - hit.at < CACHE_TTL_MS) {
        found[idx] = { anchor, places: hit.places };
        continue;
      }
      try {
        const outcome = await input.places(LODGING_QUERY, input.signal, {
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          radiusKm: LODGING_RADIUS_KM,
        });
        const places = outcome.status === "RESULTS" ? outcome.places : [];
        if (outcome.status === "RESULTS") {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
          cache.set(key, { at: now(), places });
        }
        found[idx] = { anchor, places };
      } catch {
        found[idx] = { anchor, places: [] };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, nightAnchors.length) }, worker));

  const out: TimelineSuggestion[] = [];
  for (const entry of found) {
    if (!entry) continue;
    const ranked = entry.places
      .map(place => ({
        place: { ...place, name: cleanPlaceDisplayName(place.name) },
        distanceKm: haversine(entry.anchor, place),
      }))
      .filter(({ place, distanceKm }) =>
        distanceKm <= LODGING_RADIUS_KM
        && isLodgingPlace(place)
        && !isGenericActivityPlaceName(place.name),
      )
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const takenIds = new Set<string>();
    const takenNames = new Set<string>();
    let taken = 0;
    for (const { place, distanceKm } of ranked) {
      if (taken >= LODGING_PER_SLOT) break;
      const folded = foldName(place.name);
      if (takenIds.has(place.placeId) || (folded && takenNames.has(folded))) continue;
      const parsed = suggestionSchema.safeParse({
        slotId: entry.anchor.slotId,
        kind: "LODGING",
        title: place.name,
        place: { placeId: place.placeId, name: place.name, distanceKm: Math.round(distanceKm * 10) / 10 },
      });
      if (!parsed.success) continue;
      takenIds.add(place.placeId);
      if (folded) takenNames.add(folded);
      out.push(parsed.data);
      taken += 1;
    }
  }
  return out;
}
