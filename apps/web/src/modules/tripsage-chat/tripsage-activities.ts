import type { PlannerResult } from "../trip-planner/planner-contract";
import { haversine } from "../trip-planner/planner-geography";
import { cleanPlaceDisplayName, isGenericActivityPlaceName } from "../../lib/traveler-display-clean";
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
  /\b(?:homestay|home\s*stay|hotel|khach\s+san|resort|nha\s+nghi|guest\s*house|hostel|motel|lodge|bungalow|campground|retreat)\b/iu;

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
/** `FREE` is the free afternoon after the last stop; it shows as an `ACTIVITY` suggestion found with its own query. */
export type ActivityAnchor = { slotId: string; kind: Kind; latitude: number; longitude: number };

/** shortcut: per-instance memory cache of lookups (keyed by rounded point and kind); upgrade to a shared cache if instances multiply. */
const cache = new Map<string, { at: number; places: ExternalPlaceSuggestion[] }>();

const norm = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/gu, " ").trim();

/** Anchors in plan order: every stop first (`dN-visit-K`), then free afternoons (`dN-free`), then each night (`dN-overnight`), the last two anchored at the day's last stop. */
export function activityAnchors(result: PlannerResult): { anchors: ActivityAnchor[]; stopNames: string[] } {
  const visits: ActivityAnchor[] = []; const frees: ActivityAnchor[] = []; const nights: ActivityAnchor[] = []; const stopNames: string[] = [];
  result.days.forEach((day, index) => {
    day.stops.forEach((stop, stopIndex) => {
      stopNames.push(stop.destination.name);
      visits.push({ slotId: `d${day.day}-visit-${stopIndex + 1}`, kind: "ACTIVITY", latitude: stop.destination.latitude, longitude: stop.destination.longitude });
    });
    const last = day.stops.at(-1);
    const freeAfternoon = last && index < result.days.length - 1 && last.departureMinute !== null && last.departureMinute < EARLY_DAY_END_MINUTE;
    if (last && freeAfternoon) frees.push({ slotId: `d${day.day}-free`, kind: "FREE", latitude: last.destination.latitude, longitude: last.destination.longitude });
    if (last && index < result.days.length - 1) nights.push({ slotId: `d${day.day}-overnight`, kind: "EVENING", latitude: last.destination.latitude, longitude: last.destination.longitude });
  });
  // Reserve anchor budget for every night (Days 1..N-1) so multi-day trips never lose their "Tối nay" slots (PARITY AC-6).
  const reservedNights = nights.slice(0, ACTIVITY_MAX_ANCHORS);
  const maxDaytime = Math.max(0, ACTIVITY_MAX_ANCHORS - reservedNights.length);
  return { anchors: [...[...visits, ...frees].slice(0, maxDaytime), ...reservedNights], stopNames };
}

/** Looks up places near every anchor (a few at a time) and returns at most `ACTIVITY_PER_SLOT` per slot, nearest first, each place once. */
export async function nearbyActivitySuggestions(input: { places: PlacesSearch; anchors: readonly ActivityAnchor[]; stopNames: readonly string[]; signal?: AbortSignal; now?: () => number }): Promise<TimelineSuggestion[]> {
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

  const found: { anchor: ActivityAnchor; places: ExternalPlaceSuggestion[] }[] = new Array(input.anchors.length);
  // Prioritize EVENING anchors first in execution order so "Tối nay" never starves behind daytime stops under deadline.
  const executionOrder = [
    ...input.anchors.map((anchor, index) => ({ anchor, index })).filter(e => e.anchor.kind === "EVENING"),
    ...input.anchors.map((anchor, index) => ({ anchor, index })).filter(e => e.anchor.kind !== "EVENING"),
  ];
  let cursor = 0;
  let callsUsed = input.anchors.length;
  const worker = async () => {
    for (;;) {
      const next = executionOrder[cursor++];
      if (!next || input.signal?.aborted) return;
      const { anchor, index } = next;
      const key = `${anchor.kind}|${anchor.latitude.toFixed(3)}|${anchor.longitude.toFixed(3)}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_TTL_MS) { found[index] = { anchor, places: hit.places }; continue; }
      try {
        const outcome = await input.places(QUERIES[anchor.kind], input.signal, { latitude: anchor.latitude, longitude: anchor.longitude, radiusKm: ACTIVITY_RADIUS_KM[anchor.kind] });
        let combinedPlaces: ExternalPlaceSuggestion[] = outcome.status === "RESULTS" ? outcome.places : [];
        // If the primary EVENING query yields 0 surviving non-lodging places within 3 km and budget remains, try a simpler food query.
        if (
          anchor.kind === "EVENING"
          && rankValid(anchor, combinedPlaces).length === 0
          && callsUsed < ACTIVITY_MAX_ANCHORS
          && !input.signal?.aborted
        ) {
          callsUsed += 1;
          const fallback = await input.places(EVENING_FALLBACK_QUERY, input.signal, { latitude: anchor.latitude, longitude: anchor.longitude, radiusKm: ACTIVITY_RADIUS_KM.EVENING });
          if (fallback.status === "RESULTS") {
            const seenIds = new Set(combinedPlaces.map(p => p.placeId));
            combinedPlaces = [...combinedPlaces, ...fallback.places.filter(p => !seenIds.has(p.placeId))];
          }
        }
        if (combinedPlaces.length === 0) continue;
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: now(), places: combinedPlaces });
        found[index] = { anchor, places: combinedPlaces };
      } catch { /* a failed lookup only means no suggestions for that slot */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, executionOrder.length) }, worker));

  const usedBy = { ACTIVITY: new Set<string>(), EVENING: new Set<string>() }; const out: TimelineSuggestion[] = [];
  for (const entry of found) {
    if (!entry) continue;
    const ranked = rankValid(entry.anchor, entry.places);
    const outKind = entry.anchor.kind === "EVENING" ? "EVENING" : "ACTIVITY"; const used = usedBy[outKind];
    const slotLimit = outKind === "EVENING" ? EVENING_PER_SLOT : ACTIVITY_PER_SLOT;
    let taken = 0;
    for (const { place, distanceKm } of ranked) {
      if (taken >= slotLimit) break;
      if (used.has(place.placeId)) continue;
      const parsed = suggestionSchema.safeParse({ slotId: entry.anchor.slotId, kind: outKind, title: place.name, place: { placeId: place.placeId, name: place.name, distanceKm: Math.round(distanceKm * 10) / 10 } });
      if (!parsed.success) continue;
      used.add(place.placeId); out.push(parsed.data); taken += 1;
    }
  }
  return out;
}
