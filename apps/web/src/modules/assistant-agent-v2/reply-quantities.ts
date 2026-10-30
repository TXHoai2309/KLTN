import type { PlanningResponsePlan } from "./planning-response";

const plainText = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Quantities the reply may state, grouped by what they measure. A number counts only
 * as a fact of its own kind: a travel time of 38 minutes never licenses "38 điểm". */
type TypedFacts = { minutes: Set<number>; stops: Set<number>; days: Set<number>; nights: Set<number>; clocks: Set<string> };

export function typedFacts(plan: PlanningResponsePlan): TypedFacts {
  const facts: TypedFacts = { minutes: new Set(), stops: new Set(), days: new Set(), nights: new Set(), clocks: new Set() };
  const add = (set: Set<number>, ...values: (number | null | undefined)[]) => values.forEach(value => { if (typeof value === "number") set.add(value); });
  const guidance = plan.guidance;
  add(facts.days, plan.knownFacts.durationDays, plan.tripShapeConflict?.durationDays);
  add(facts.nights, plan.tripStructure?.overnightCount, plan.tripShapeConflict?.overnightCount);
  plan.tripStructure?.overnightAreas?.forEach(item => add(facts.nights, item.afterDay));
  plan.overnightUnmet?.forEach(item => add(facts.days, item.afterDay));
  let total = 0;
  for (const day of guidance?.days ?? []) {
    add(facts.days, day.day); add(facts.stops, day.stopCount); add(facts.minutes, day.travelMinutes); total += day.stopCount;
    if (day.finishMinute !== null) facts.clocks.add(clock(day.finishMinute));
  }
  if (total) facts.stops.add(total);
  for (const night of guidance?.overnights ?? []) { add(facts.days, night.afterDay, night.afterDay + 1); add(facts.nights, night.afterDay); add(facts.minutes, night.nextDayLegMinutes); }
  for (const signal of guidance?.signals ?? []) {
    if ("day" in signal) add(facts.days, signal.day);
    if (signal.code === "DENSER_DAY") { add(facts.days, signal.lighterDay); add(facts.stops, signal.stopCount, signal.lighterStopCount); }
    if (signal.code === "LONG_TRAVEL_DAY") add(facts.minutes, signal.travelMinutes);
    if (signal.code === "LATE_FINISH" || signal.code === "LATE_ARRIVAL_TO_OVERNIGHT") facts.clocks.add(clock(signal.finishMinute));
    if (signal.code === "BALANCED_LOAD") { add(facts.stops, signal.maxStopCount); add(facts.minutes, signal.maxTravelMinutes); }
  }
  guidance?.fallbackSuggestions.forEach(item => add(facts.days, item.day));
  plan.replanDelta?.affectedDays.forEach(day => add(facts.days, day)); plan.replanDelta?.dependencyDays.forEach(day => add(facts.days, day));
  return facts;
}

/** Returns a reason when the reply states a quantity no fact of that kind supports; null otherwise.
 * Units without any supporting fact kind (hours, kilometres) are never accepted. Numbers with no
 * recognised unit (list numbers, group sizes) fall back to the plan-wide digit pool. */
export function unsupportedQuantity(message: string, plan: PlanningResponsePlan, digitPool: ReadonlySet<string>): string | null {
  const text = plainText(message), facts = typedFacts(plan);
  for (const match of text.matchAll(/(\d{1,2}):(\d{2})/g)) {
    if (!facts.clocks.has(`${match[1]!.padStart(2, "0")}:${match[2]}`)) return `The time ${match[0]} is not in the facts.`;
  }
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(phut|diem|ngay|dem|gio|tieng|km|kilomet)\b/g)) {
    const value = Number(match[1]!.replace(",", ".")), unit = match[2]!;
    const set = unit === "phut" ? facts.minutes : unit === "diem" ? facts.stops : unit === "ngay" ? facts.days : unit === "dem" ? facts.nights : null;
    if (!set || !set.has(value)) return `State no "${match[0]}": no ${unit === "gio" || unit === "tieng" ? "hour" : unit === "km" || unit === "kilomet" ? "distance" : "matching"} fact supports it.`;
  }
  for (const match of text.matchAll(/\b(ngay|dem)\s+(\d{1,2})\b/g)) {
    if (!(match[1] === "ngay" ? facts.days : facts.nights).has(Number(match[2]))) return `"${match[0]}" is not a day or night of this trip.`;
  }
  const covered = text.replace(/(\d{1,2}):(\d{2})/g, " ").replace(/(\d+(?:[.,]\d+)?)\s*(phut|diem|ngay|dem|gio|tieng|km|kilomet)\b/g, " ").replace(/\b(ngay|dem)\s+\d{1,2}\b/g, " ");
  for (const token of covered.match(/\d+/g) ?? []) if (!digitPool.has(token)) return `The number ${token} is not in the facts.`;
  return null;
}
