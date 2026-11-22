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
export const ACTIVITY_RADIUS_KM = { ACTIVITY: 5, FREE: 8, EVENING: 5 } as const;
export const ACTIVITY_PER_SLOT = 5;
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
  EVENING: "quán cà phê chợ đêm phố đi bộ buổi tối",
} as const;
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
  return { anchors: [...visits, ...frees, ...nights].slice(0, ACTIVITY_MAX_ANCHORS), stopNames };
}

/** Looks up places near every anchor (a few at a time) and returns at most `ACTIVITY_PER_SLOT` per slot, nearest first, each place once. */
export async function nearbyActivitySuggestions(input: { places: PlacesSearch; anchors: readonly ActivityAnchor[]; stopNames: readonly string[]; signal?: AbortSignal; now?: () => number }): Promise<TimelineSuggestion[]> {
  const now = input.now ?? Date.now;
  const excluded = input.stopNames.map(norm).filter(Boolean);
  const isStop = (name: string) => { const n = norm(name); return excluded.some(stop => n === stop || n.includes(stop) || stop.includes(n)); };
  const found: { anchor: ActivityAnchor; places: ExternalPlaceSuggestion[] }[] = new Array(input.anchors.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      const anchor = input.anchors[index];
      if (!anchor || input.signal?.aborted) return;
      const key = `${anchor.kind}|${anchor.latitude.toFixed(3)}|${anchor.longitude.toFixed(3)}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_TTL_MS) { found[index] = { anchor, places: hit.places }; continue; }
      try {
        const outcome = await input.places(QUERIES[anchor.kind], input.signal, { latitude: anchor.latitude, longitude: anchor.longitude, radiusKm: ACTIVITY_RADIUS_KM[anchor.kind] });
        if (outcome.status !== "RESULTS") continue;
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: now(), places: outcome.places });
        found[index] = { anchor, places: outcome.places };
      } catch { /* a failed lookup only means no suggestions for that slot */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, input.anchors.length) }, worker));

  const usedBy = { ACTIVITY: new Set<string>(), EVENING: new Set<string>() }; const out: TimelineSuggestion[] = [];
  for (const entry of found) {
    if (!entry) continue;
    const ranked = entry.places
      .map(place => ({ place: { ...place, name: cleanPlaceDisplayName(place.name) }, distanceKm: haversine(entry.anchor, place) }))
      .filter(({ place, distanceKm }) =>
        distanceKm <= ACTIVITY_RADIUS_KM[entry.anchor.kind]
        && !isStop(place.name)
        && !isLodgingPlace(place)
        && !isGenericActivityPlaceName(place.name),
      )
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const outKind = entry.anchor.kind === "EVENING" ? "EVENING" : "ACTIVITY"; const used = usedBy[outKind];
    let taken = 0;
    for (const { place, distanceKm } of ranked) {
      if (taken >= ACTIVITY_PER_SLOT) break;
      if (used.has(place.placeId)) continue;
      const parsed = suggestionSchema.safeParse({ slotId: entry.anchor.slotId, kind: outKind, title: place.name, place: { placeId: place.placeId, name: place.name, distanceKm: Math.round(distanceKm * 10) / 10 } });
      if (!parsed.success) continue;
      used.add(place.placeId); out.push(parsed.data); taken += 1;
    }
  }
  return out;
}
