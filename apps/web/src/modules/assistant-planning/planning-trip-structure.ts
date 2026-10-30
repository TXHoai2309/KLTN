/** Days and nights are separate user facts. Nights are never derived from days;
 * more nights than days cannot fit one itinerary and must be clarified, not fixed. */
export type TripShape = { kind: "UNSTATED" } | { kind: "OK"; durationDays: number | null; overnightCount: number } | { kind: "INCONSISTENT"; durationDays: number; overnightCount: number };

export function assessTripShape(durationDays: number | null | undefined, overnightCount: number | null | undefined): TripShape {
  if (overnightCount === null || overnightCount === undefined) return { kind: "UNSTATED" };
  if (durationDays !== null && durationDays !== undefined && overnightCount > durationDays) return { kind: "INCONSISTENT", durationDays, overnightCount };
  return { kind: "OK", durationDays: durationDays ?? null, overnightCount };
}
/** Nights that fall between two itinerary days; extra nights (e.g. before day 1) have no day boundary. */
export const betweenDayNights = (durationDays: number, overnightCount: number) => Math.min(overnightCount, Math.max(durationDays - 1, 0));

export type OvernightArea = { afterDay: number; area: string };
export type UnmetOvernight = { afterDay: number; wantedArea: string; actualArea: string | null };
const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export const sameArea = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && plain(a) === plain(b);
export const knownAreas = (candidates: readonly { area: string }[]) => [...new Set(candidates.map(candidate => candidate.area.trim()).filter(Boolean))];

/** Grounding: a stated area counts only if some destination in the data belongs to it. */
export function resolveOvernightArea(name: string, candidates: readonly { area: string }[]): string | null {
  const wanted = plain(name);
  if (wanted.length < 2) return null;
  const areas = knownAreas(candidates);
  return areas.find(area => plain(area) === wanted) ?? areas.find(area => wanted.length >= 3 && (plain(area).includes(wanted) || wanted.includes(plain(area)))) ?? null;
}
/** Latest explicit choice for a night replaces the earlier one. */
export const mergeOvernightAreas = (existing: readonly OvernightArea[] | undefined, incoming: OvernightArea) =>
  [...(existing ?? []).filter(item => item.afterDay !== incoming.afterDay), incoming].sort((a, b) => a.afterDay - b.afterDay);

/** A preference, not a Validator rule: the itinerary stays valid either way. */
export function unmetOvernightAreas(areas: readonly OvernightArea[], days: readonly (readonly { area: string }[])[]): UnmetOvernight[] {
  return areas.flatMap(wanted => {
    const actual = days[wanted.afterDay - 1]?.at(-1)?.area ?? null;
    return sameArea(actual, wanted.area) ? [] : [{ afterDay: wanted.afterDay, wantedArea: wanted.area, actualArea: actual }];
  });
}

/** Deterministic arrangement: make a day end in the wanted area by reordering inside that day, or by swapping its
 * last stop with a stop of that area from another day. Stop counts, the set of stops and every other day's
 * length are unchanged, so pace limits and required stops are untouched. The Validator still judges the result.
 * No model call, no routing change; if no selected stop belongs to the area, the selection is left as is. */
export function arrangeOvernightAreas(days: readonly (readonly string[])[], areas: readonly OvernightArea[], byId: ReadonlyMap<string, { area: string }>): string[][] {
  const next = days.map(day => [...day]);
  const satisfied = (wanted: OvernightArea) => sameArea(byId.get(next[wanted.afterDay - 1]?.at(-1) ?? "")?.area, wanted.area);
  for (const wanted of [...areas].sort((a, b) => a.afterDay - b.afterDay)) {
    const day = next[wanted.afterDay - 1];
    if (!day?.length || satisfied(wanted)) continue;
    const protectedEnds = new Set(areas.filter(other => other !== wanted && satisfied(other)).map(other => next[other.afterDay - 1]!.at(-1)!));
    const order = [wanted.afterDay - 1, wanted.afterDay, ...next.map((_, index) => index).filter(index => index !== wanted.afterDay - 1 && index !== wanted.afterDay)];
    for (const index of order) {
      const donor = next[index];
      if (!donor) continue;
      const position = donor.findIndex((id, at) => sameArea(byId.get(id)?.area, wanted.area) && !protectedEnds.has(id) && !(index === wanted.afterDay - 1 && at === day.length - 1));
      if (position < 0) continue;
      [donor[position], day[day.length - 1]] = [day[day.length - 1]!, donor[position]!];
      break;
    }
  }
  return next;
}
