import {
  cleanOvernightAreaLabel,
  cleanPlaceDisplayName,
  OVERNIGHT_TOWN_CENTERS,
  resolveOvernightAreaLabel,
} from "../../lib/traveler-display-clean";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { haversine } from "../trip-planner/planner-geography";
import {
  overnightAreaConstraintSchema,
  type OvernightAreaConstraint,
} from "./tripsage-chat-context";

/**
 * Deterministic helpers for traveler-stated overnight area constraints
 * (Point 1: "tối ngày N nghỉ ở khu vực X").
 *
 * This is a scheduling/arrangement constraint, never a Validator bypass: the deterministic
 * Constraint Validator still judges all five check groups independently.
 */

export const OVERNIGHT_ROAD_RADIUS_KM = 15;
/** Mountain road winding factor in Hà Giang (15 km road ≈ 10.3 km straight-line). */
const MOUNTAIN_ROAD_FACTOR = 1.45;

export { overnightAreaConstraintSchema, type OvernightAreaConstraint };

export type OvernightStopGeo = {
  id: string;
  name: string;
  area: string;
  address?: string | null;
  latitude: number;
  longitude: number;
};

export type UnmetOvernightConstraint = {
  afterDay: number;
  wantedArea: string;
  actualArea: string | null;
  reason: "NO_SUCH_NIGHT" | "EMPTY_DAY" | "WRONG_END_AREA";
  estimatedRoadKm: number | null;
  explanation: string;
  chips: string[];
};

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

function sameAreaFold(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return false;
  return fa === fb || (fa.length >= 4 && fb.length >= 4 && (fa.includes(fb) || fb.includes(fa)));
}

/** Canonicalizes a Hà Giang overnight area name using known town centers when possible. */
export function normalizeOvernightAreaName(raw: string): string {
  const cleaned = cleanOvernightAreaLabel(raw);
  if (!cleaned) return "";
  const folded = fold(cleaned);
  for (const town of Object.keys(OVERNIGHT_TOWN_CENTERS)) {
    if (fold(town) === folded) return town;
  }
  return cleaned;
}

/** Resolves coordinates of a target overnight area from `OVERNIGHT_TOWN_CENTERS` or matching catalog stops. */
export function resolveTargetOvernightPoint(
  wantedArea: string,
  candidates: readonly OvernightStopGeo[],
): { latitude: number; longitude: number } | null {
  const folded = fold(wantedArea);
  if (!folded) return null;
  for (const [town, coords] of Object.entries(OVERNIGHT_TOWN_CENTERS)) {
    const townFold = fold(town);
    if (townFold === folded || (folded.length >= 4 && (townFold.includes(folded) || folded.includes(townFold)))) {
      return coords;
    }
  }
  const matched = candidates.find(c =>
    sameAreaFold(cleanPlaceDisplayName(c.name), wantedArea)
    || sameAreaFold(c.address, wantedArea)
    || sameAreaFold(c.area, wantedArea),
  );
  return matched ? { latitude: matched.latitude, longitude: matched.longitude } : null;
}

/**
 * Checks whether a stop is in `wantedArea` or within `OVERNIGHT_ROAD_RADIUS_KM` (15 km estimated road distance)
 * of the area center.
 */
export function isStopNearOvernightArea(
  stop: Pick<OvernightStopGeo, "name" | "area" | "address" | "latitude" | "longitude">,
  wantedArea: string,
  candidates: readonly OvernightStopGeo[] = [],
): boolean {
  const resolvedLabel = resolveOvernightAreaLabel(stop.area, stop.name, {
    address: stop.address,
    latitude: stop.latitude,
    longitude: stop.longitude,
  });
  if (resolvedLabel && sameAreaFold(resolvedLabel, wantedArea)) return true;
  if (sameAreaFold(cleanPlaceDisplayName(stop.name), wantedArea)) return true;

  const target = resolveTargetOvernightPoint(wantedArea, candidates);
  if (!target) return false;
  const roadKm = haversine(stop, target) * MOUNTAIN_ROAD_FACTOR;
  return roadKm <= OVERNIGHT_ROAD_RADIUS_KM;
}

export function estimatedRoadKmToArea(
  stop: Pick<OvernightStopGeo, "latitude" | "longitude">,
  wantedArea: string,
  candidates: readonly OvernightStopGeo[] = [],
): number | null {
  const target = resolveTargetOvernightPoint(wantedArea, candidates);
  if (!target) return null;
  return Math.round(haversine(stop, target) * MOUNTAIN_ROAD_FACTOR * 10) / 10;
}

const KNOWN_AREA_PATTERNS: readonly [RegExp, string][] = [
  [/tp\.?\s*h[aà]\s+giang|th[aà]nh\s+ph[oố]\s+h[aà]\s+giang/iu, "TP Hà Giang"],
  [/đ[oồ]ng\s+v[aă]n/iu, "Đồng Văn"],
  [/m[eè]o\s+v[aạ]c/iu, "Mèo Vạc"],
  [/qu[aả]n\s+b[aạ]|tam\s+s[oơ]n/iu, "Quản Bạ"],
  [/y[eê]n\s+minh/iu, "Yên Minh"],
  [/du\s+gi[aà]/iu, "Du Già"],
  [/l[uũ]ng\s+c[uú]|l[oô]\s+l[oô]\s+ch[aả]i/iu, "Lũng Cú"],
  [/ho[aà]ng\s+su\s+ph[iì]/iu, "Hoàng Su Phì"],
  [/b[aắ]c\s+m[eê]/iu, "Bắc Mê"],
  [/s[uủ]ng\s+l[aà]/iu, "Sủng Là"],
  [/n[aặ]m\s+đ[aă]m/iu, "Nặm Đăm"],
  [/p[aả]\s+vi/iu, "Pả Vi"],
];

function matchKnownAreaInText(text: string): string | null {
  for (const [pattern, label] of KNOWN_AREA_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

export type ExtractedOvernightDelta = {
  add: OvernightAreaConstraint[];
  removeAreas: string[];
  clearAll: boolean;
};

/**
 * Deterministic extractor for traveler-stated overnight preferences and cancellations,
 * e.g. "tối ngày 2 nghỉ ở Đồng Văn", "ngủ Đồng Văn đêm 1", "bỏ yêu cầu nghỉ Đồng Văn".
 */
export function extractOvernightConstraintsFromText(text: string): ExtractedOvernightDelta {
  const add: OvernightAreaConstraint[] = [];
  const removeAreas: string[] = [];
  let clearAll = false;
  if (!text.trim()) return { add, removeAreas, clearAll };

  // Removal / cancellation patterns
  const removeRegex = /(?:b[oỏ]|kh[oô]ng\s+c[aầ]n|h[uủ]y|th[oô]i)\s+(?:y[eê]u\s+c[aầ]u\s+)?(?:ngh[iỉ]|ng[uủ])(?:\s+đ[eê]m)?(?:\s+(?:ở|t[aạ]i))?\s*([^\n,.!?;]{2,40})?/giu;
  for (const match of text.matchAll(removeRegex)) {
    const tail = match[1] ?? "";
    const area = matchKnownAreaInText(tail);
    if (area) removeAreas.push(area);
    else if (/ngh[iỉ]\s+đ[eê]m|ng[uủ]\s+đ[eê]m/iu.test(match[0])) clearAll = true;
  }

  // Pattern A: "(tối|đêm) (ngày )?N (nghỉ|ngủ|ở lại) (đêm )?(ở|tại)? <area>"
  const patternA = /(?:t[oố]i|đ[eê]m)\s+(?:ng[aà]y\s+)?(\d{1,2})\s+(?:s[eẽ]\s+|mu[oố]n\s+|th[iì]\s+)?(?:ngh[iỉ]|ng[uủ]|ở\s+l[aạ]i)(?:\s+đ[eê]m)?(?:\s+(?:ở|t[aạ]i|khu\s+v[uự]c))?\s+([^\n,.!?;]{2,45})/giu;
  for (const match of text.matchAll(patternA)) {
    const afterDay = Number(match[1]);
    const area = matchKnownAreaInText(match[2] ?? "");
    if (afterDay >= 1 && afterDay <= 13 && area) {
      add.push({ afterDay, area });
    }
  }

  // Pattern B: "(nghỉ|ngủ) (đêm )?(ở|tại)? <area> (vào )?(tối|đêm) (ngày )?N"
  const patternB = /(?:ngh[iỉ]|ng[uủ]|ở\s+l[aạ]i)(?:\s+đ[eê]m)?(?:\s+(?:ở|t[aạ]i|khu\s+v[uự]c))?\s+([^\n,.!?;]{2,40}?)\s+(?:v[aà]o\s+)?(?:t[oố]i|đ[eê]m)\s+(?:ng[aà]y\s+)?(\d{1,2})\b/giu;
  for (const match of text.matchAll(patternB)) {
    const afterDay = Number(match[2]);
    const area = matchKnownAreaInText(match[1] ?? "");
    if (afterDay >= 1 && afterDay <= 13 && area && !removeAreas.some(r => sameAreaFold(r, area))) {
      add.push({ afterDay, area });
    }
  }

  // Pattern C: "(nghỉ|ngủ) đêm (ngày )?N (ở|tại) <area>"
  const patternC = /(?:ngh[iỉ]|ng[uủ])\s+(?:đ[eê]m|t[oố]i)\s+(?:ng[aà]y\s+)?(\d{1,2})\s+(?:ở|t[aạ]i|khu\s+v[uự]c)\s+([^\n,.!?;]{2,45})/giu;
  for (const match of text.matchAll(patternC)) {
    const afterDay = Number(match[1]);
    const area = matchKnownAreaInText(match[2] ?? "");
    if (afterDay >= 1 && afterDay <= 13 && area) {
      add.push({ afterDay, area });
    }
  }

  // Deduplicate by afterDay (latest mention wins)
  const deduped = new Map<number, OvernightAreaConstraint>();
  for (const item of add) deduped.set(item.afterDay, item);
  return { add: [...deduped.values()], removeAreas: [...new Set(removeAreas)], clearAll };
}

export function mergeOvernightAreaConstraints(
  existing: readonly OvernightAreaConstraint[] | undefined,
  delta: ExtractedOvernightDelta,
): OvernightAreaConstraint[] {
  if (delta.clearAll) return [];
  let next = [...(existing ?? [])];
  if (delta.removeAreas.length > 0) {
    next = next.filter(item => !delta.removeAreas.some(rem => sameAreaFold(item.area, rem)));
  }
  for (const incoming of delta.add) {
    // If user explicitly shifts the same area to another night (e.g. "2 ngày, ngủ Đồng Văn đêm 1" after earlier "đêm 2"),
    // drop stale same-area constraints only when the new night is for the same area? Keep distinct nights unless same day.
    next = next.filter(item => item.afterDay !== incoming.afterDay);
    next.push({ afterDay: incoming.afterDay, area: normalizeOvernightAreaName(incoming.area) || incoming.area });
  }
  return next.sort((a, b) => a.afterDay - b.afterDay);
}

/**
 * Deterministic arrangement: makes day `afterDay` end at a stop in or within 15 km (road) of `wantedArea`
 * by reordering stops within that day or swapping its last stop with a matching stop from another day.
 * Never changes total stops, day lengths, pace limits, or required stops.
 */
export function arrangeSelectionForOvernightAreas(
  days: readonly (readonly string[])[],
  constraints: readonly OvernightAreaConstraint[],
  byId: ReadonlyMap<string, OvernightStopGeo>,
  allCandidates: readonly OvernightStopGeo[],
): string[][] {
  if (!constraints.length) return days.map(day => [...day]);
  const next = days.map(day => [...day]);
  const matches = (id: string | undefined, area: string) => {
    if (!id) return false;
    const stop = byId.get(id);
    return stop ? isStopNearOvernightArea(stop, area, allCandidates) : false;
  };
  const validConstraints = [...constraints]
    .filter(c => c.afterDay >= 1 && c.afterDay < next.length)
    .sort((a, b) => a.afterDay - b.afterDay);

  for (const wanted of validConstraints) {
    const dayIdx = wanted.afterDay - 1;
    const day = next[dayIdx];
    if (!day || day.length === 0) continue;
    if (matches(day.at(-1), wanted.area)) continue;

    // 1. Reorder within the same day (move the matching stop to the end of that day)
    const inSameDay = day.findIndex(id => matches(id, wanted.area));
    if (inSameDay >= 0) {
      const [picked] = day.splice(inSameDay, 1);
      day.push(picked!);
      continue;
    }

    // 2. Swap with a matching stop from another day (not protecting another already-satisfied overnight end)
    const protectedEnds = new Set(
      validConstraints
        .filter(other => other !== wanted && matches(next[other.afterDay - 1]?.at(-1), other.area))
        .map(other => next[other.afterDay - 1]!.at(-1)!),
    );
    const searchOrder = [
      dayIdx + 1,
      dayIdx - 1,
      ...next.map((_, i) => i).filter(i => i !== dayIdx && i !== dayIdx + 1 && i !== dayIdx - 1),
    ].filter(i => i >= 0 && i < next.length);

    for (const donorIdx of searchOrder) {
      const donor = next[donorIdx]!;
      const pos = donor.findIndex(id => matches(id, wanted.area) && !protectedEnds.has(id));
      if (pos < 0) continue;
      const swapped = day[day.length - 1]!;
      day[day.length - 1] = donor[pos]!;
      donor[pos] = swapped;
      break;
    }
  }
  return next;
}

function clipChip(text: string): string {
  return text.length <= 40 ? text : `${text.slice(0, 39).trimEnd()}…`;
}

function buildOvernightResolutionChips(area: string, afterDay: number, durationDays: number): string[] {
  const cleanArea = normalizeOvernightAreaName(area) || area;
  const maxNight = Math.max(1, durationDays - 1);
  const altNight = afterDay > maxNight ? maxNight : afterDay > 1 ? afterDay - 1 : Math.min(maxNight, afterDay + 1);
  const chips: string[] = [];
  if (durationDays >= 2 && altNight !== afterDay && altNight >= 1 && altNight < durationDays) {
    chips.push(clipChip(`Nghỉ ${cleanArea} đêm ${altNight}`));
  } else if (durationDays >= 2 && afterDay < durationDays) {
    chips.push(clipChip(`Đưa ${cleanArea} cuối ngày ${afterDay}`));
  }
  chips.push("Thêm 1 ngày");
  chips.push(clipChip(`Bỏ yêu cầu nghỉ ${cleanArea}`));
  return chips.slice(0, 3);
}

/** Evaluates all overnight constraints against the final validated `PlannerResult`. */
export function evaluateOvernightConstraints(
  constraints: readonly OvernightAreaConstraint[],
  result: PlannerResult,
  allCandidates: readonly OvernightStopGeo[],
): { met: OvernightAreaConstraint[]; unmet: UnmetOvernightConstraint[] } {
  const met: OvernightAreaConstraint[] = [];
  const unmet: UnmetOvernightConstraint[] = [];
  const durationDays = result.days.length;

  for (const wanted of constraints) {
    const cleanArea = normalizeOvernightAreaName(wanted.area) || wanted.area;
    if (wanted.afterDay >= durationDays) {
      const nights = Math.max(0, durationDays - 1);
      unmet.push({
        afterDay: wanted.afterDay,
        wantedArea: cleanArea,
        actualArea: null,
        reason: "NO_SUCH_NIGHT",
        estimatedRoadKm: null,
        explanation: nights === 0
          ? `Chuyến ${durationDays} ngày đi về trong ngày nên không có đêm nghỉ tại ${cleanArea}.`
          : `Chuyến ${durationDays} ngày chỉ có ${nights} đêm (ngày ${durationDays} là ngày về) nên không có đêm ngày ${wanted.afterDay} để nghỉ ở ${cleanArea}.`,
        chips: buildOvernightResolutionChips(cleanArea, wanted.afterDay, durationDays),
      });
      continue;
    }

    const day = result.days[wanted.afterDay - 1];
    const lastStop = day?.stops.at(-1)?.destination ?? null;
    if (!lastStop) {
      unmet.push({
        afterDay: wanted.afterDay,
        wantedArea: cleanArea,
        actualArea: null,
        reason: "EMPTY_DAY",
        estimatedRoadKm: null,
        explanation: `Ngày ${wanted.afterDay} hiện chưa có điểm dừng nên chưa xếp được nghỉ đêm tại ${cleanArea}.`,
        chips: buildOvernightResolutionChips(cleanArea, wanted.afterDay, durationDays),
      });
      continue;
    }

    if (isStopNearOvernightArea(lastStop, cleanArea, allCandidates)) {
      met.push({ afterDay: wanted.afterDay, area: cleanArea });
      continue;
    }

    const actualArea = resolveOvernightAreaLabel(lastStop.area, lastStop.name, {
      address: lastStop.address,
      latitude: lastStop.latitude,
      longitude: lastStop.longitude,
    }) || cleanPlaceDisplayName(lastStop.name);
    const roadKm = estimatedRoadKmToArea(lastStop, cleanArea, allCandidates);
    unmet.push({
      afterDay: wanted.afterDay,
      wantedArea: cleanArea,
      actualArea,
      reason: "WRONG_END_AREA",
      estimatedRoadKm: roadKm,
      explanation: `Ngày ${wanted.afterDay} đang kết thúc tại ${cleanPlaceDisplayName(lastStop.name)}${actualArea ? ` (khu vực ${actualArea})` : ""}${roadKm !== null ? `, cách ${cleanArea} khoảng ${Math.round(roadKm)} km đường bộ` : ""}, nên chưa khớp yêu cầu nghỉ đêm tại ${cleanArea}.`,
      chips: buildOvernightResolutionChips(cleanArea, wanted.afterDay, durationDays),
    });
  }

  return { met, unmet };
}
