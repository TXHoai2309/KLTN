import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { getForecasts, type ForecastOptions, type PointForecast } from "../trip-weather/forecast";
import { computeSunTimes } from "../trip-weather/sun-times";
import { weatherAdvisories, windowWeather } from "../trip-weather/trip-weather-service";
import type { PlannerCandidate } from "./planner-candidates";
import type { CheckStatus, PlannerCheck, PlannerDay, PlannerResult } from "./planner-contract";
import { haversine } from "./planner-geography";

export const WEATHER_PREFERENCE_TIMEOUT_MS = 2500;
const NO_DATE_OUTDOOR_CUTOFF_MINUTE = 1020; // 17:00 fallback when startDate is omitted
const MAX_PERMUTATIONS_PER_DAY = 6;
const MAX_CROSS_DAY_SWAPS = 6;
const MAX_DETOUR_RATIO = 0.2;
const MAX_DETOUR_SECONDS_PER_DAY = 30 * 60;

export const WEATHER_PREFERENCE_WARNING: PlannerResult["warnings"][number] = {
  code: "WEATHER_PREFERENCE_APPLIED",
  message: "Đã ưu tiên sắp xếp thứ tự tham quan theo giờ mặt trời và dự báo thời tiết (chỉ mang tính tham khảo).",
  day: null,
  destinationId: null,
};

export type EvaluatedSchedule = {
  scheduled: PlannerDay[];
  checks: PlannerCheck[];
  stopStatuses: Map<string, CheckStatus>;
  totalTravelSeconds: number;
};

export type WeatherPreferenceInput = {
  requirement: TripRequirementInput;
  baselineDays: readonly PlannerCandidate[][];
  baseline: EvaluatedSchedule;
  scheduleAndValidate: (days: readonly PlannerCandidate[][]) => Promise<EvaluatedSchedule>;
  forecast?: ForecastOptions;
  allowedDayIndices?: readonly number[];
  lockedStopIds?: ReadonlySet<string>;
};

export type WeatherPreferenceResult = {
  adjusted: boolean;
  days: PlannerCandidate[][];
  evaluated: EvaluatedSchedule;
};

function sumTravelSeconds(days: readonly PlannerDay[]): number {
  return days.reduce((sum, day) => {
    if (day.travelSeconds !== null) return sum + day.travelSeconds;
    return sum + day.stops.reduce((s, stop) => s + (stop.inbound?.durationSeconds ?? 0), 0);
  }, 0);
}

function scoreScheduledDays(
  days: readonly PlannerDay[],
  candidatesById: ReadonlyMap<string, PlannerCandidate>,
  forecastsById: ReadonlyMap<string, PointForecast>,
): { total: number; perDay: number[] } {
  const perDay = days.map(day => {
    let penalty = 0;
    for (const stop of day.stops) {
      const candidate = candidatesById.get(stop.destination.id);
      if (!candidate) continue;

      if (candidate.isOutdoor && stop.departureMinute !== null) {
        if (day.date !== null) {
          const sunset = computeSunTimes(candidate.latitude, candidate.longitude, day.date).sunsetMinute;
          if (sunset !== null && stop.departureMinute > sunset) penalty += 100;
        } else if (stop.departureMinute > NO_DATE_OUTDOOR_CUTOFF_MINUTE) {
          penalty += 100;
        }
      }

      if (day.date !== null && stop.arrivalMinute !== null) {
        const forecast = forecastsById.get(candidate.id);
        if (forecast?.status === "AVAILABLE") {
          const w = windowWeather(forecast, day.date, stop.arrivalMinute, stop.departureMinute ?? stop.arrivalMinute + 1);
          if (w.status === "AVAILABLE") {
            const advs = weatherAdvisories(w.summary, day.day, { type: "VISIT", destinationId: candidate.id });
            penalty += advs.length * (candidate.isOutdoor ? 120 : 80);
          }
        }
      }
    }
    return penalty;
  });

  return { total: perDay.reduce((a, b) => a + b, 0), perDay };
}

function hasNewViolation(baseline: readonly PlannerCheck[], candidate: readonly PlannerCheck[]): boolean {
  const baseMap = new Map(baseline.map(c => [c.key, c.status]));
  let baseViolations = 0;
  let candViolations = 0;
  for (const check of baseline) if (check.status === "VIOLATION") baseViolations++;
  for (const check of candidate) {
    if (check.status === "VIOLATION") {
      candViolations++;
      if (baseMap.get(check.key) !== "VIOLATION") return true;
    }
  }
  return candViolations > baseViolations;
}

function withinDetourCap(baselineSeconds: number, candidateSeconds: number, affectedDayCount: number): boolean {
  const delta = candidateSeconds - baselineSeconds;
  if (delta <= 0) return true;
  const maxPerDays = MAX_DETOUR_SECONDS_PER_DAY * Math.max(1, affectedDayCount);
  const cap = baselineSeconds > 0 ? Math.min(baselineSeconds * MAX_DETOUR_RATIO, maxPerDays) : maxPerDays;
  return delta <= cap;
}

function daySpreadScore(stops: readonly PlannerCandidate[]): number {
  let dist = 0;
  for (let i = 1; i < stops.length; i++) dist += haversine(stops[i - 1]!, stops[i]!);
  return dist;
}

function generateUnlockedPermutations(
  day: readonly PlannerCandidate[],
  lockedStopIds: ReadonlySet<string>,
): PlannerCandidate[][] {
  const unlockedIndices: number[] = [];
  const unlockedItems: PlannerCandidate[] = [];
  day.forEach((c, idx) => {
    if (!lockedStopIds.has(c.id)) {
      unlockedIndices.push(idx);
      unlockedItems.push(c);
    }
  });
  if (unlockedItems.length < 2) return [];

  const perms: PlannerCandidate[][] = [];
  const used = new Array<boolean>(unlockedItems.length).fill(false);
  const current: PlannerCandidate[] = [];

  function backtrack() {
    if (current.length === unlockedItems.length) {
      const rebuilt = [...day];
      unlockedIndices.forEach((slotIdx, i) => { rebuilt[slotIdx] = current[i]!; });
      const sameAsInput = rebuilt.every((c, i) => c.id === day[i]!.id);
      if (!sameAsInput) perms.push(rebuilt);
      return;
    }
    for (let i = 0; i < unlockedItems.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      current.push(unlockedItems[i]!);
      backtrack();
      current.pop();
      used[i] = false;
    }
  }
  backtrack();

  const outdoorEarliness = (stops: readonly PlannerCandidate[]) =>
    stops.reduce((acc, c, idx) => acc + (c.isOutdoor ? idx * 10 : 0), 0);

  return perms
    .sort((a, b) => outdoorEarliness(a) - outdoorEarliness(b) || daySpreadScore(a) - daySpreadScore(b))
    .slice(0, MAX_PERMUTATIONS_PER_DAY);
}

async function fetchForecastsSafely(
  startDate: string | null,
  candidates: readonly PlannerCandidate[],
  forecast?: ForecastOptions,
): Promise<Map<string, PointForecast>> {
  const map = new Map<string, PointForecast>();
  if (!startDate || !candidates.length) return map;
  try {
    const results = await getForecasts(
      candidates.map(c => ({ latitude: c.latitude, longitude: c.longitude })),
      { timeoutMs: WEATHER_PREFERENCE_TIMEOUT_MS, ...forecast },
    );
    candidates.forEach((c, i) => {
      const res = results[i];
      if (res) map.set(c.id, res);
    });
  } catch {
    // Graceful degradation: forecast provider errors never block scheduling.
  }
  return map;
}

/**
 * Applies soft weather & sun-time preferences to reorder stops within allowed days
 * or swap unlocked days, without changing Constraint Validator rules or blocking saves.
 */
export async function optimizeScheduleForWeather(input: WeatherPreferenceInput): Promise<WeatherPreferenceResult> {
  const baselineDays = input.baselineDays.map(day => [...day]);
  const allCandidates = baselineDays.flat();
  if (!allCandidates.length) {
    return { adjusted: false, days: baselineDays, evaluated: input.baseline };
  }

  const candidatesById = new Map(allCandidates.map(c => [c.id, c]));
  const forecastsById = await fetchForecastsSafely(input.requirement.startDate, allCandidates, input.forecast);
  const baselineScore = scoreScheduledDays(input.baseline.scheduled, candidatesById, forecastsById);
  if (baselineScore.total === 0) {
    return { adjusted: false, days: baselineDays, evaluated: input.baseline };
  }

  const lockedStopIds = input.lockedStopIds ?? new Set<string>();
  const allowedIndices = input.allowedDayIndices
    ? input.allowedDayIndices.filter(i => i >= 0 && i < baselineDays.length)
    : baselineDays.map((_, i) => i);
  const affectedDayCount = Math.max(1, allowedIndices.length);
  const baselineTravelSeconds = input.baseline.totalTravelSeconds || sumTravelSeconds(input.baseline.scheduled);

  let bestDays = baselineDays;
  let bestEvaluated = input.baseline;
  let bestScore = baselineScore;
  let adjusted = false;

  const tryCandidate = async (candidateDays: PlannerCandidate[][]) => {
    const evaluated = await input.scheduleAndValidate(candidateDays);
    if (hasNewViolation(input.baseline.checks, evaluated.checks)) return;
    const travelSeconds = evaluated.totalTravelSeconds || sumTravelSeconds(evaluated.scheduled);
    if (!withinDetourCap(baselineTravelSeconds, travelSeconds, affectedDayCount)) return;
    const score = scoreScheduledDays(evaluated.scheduled, candidatesById, forecastsById);
    if (score.total < bestScore.total) {
      bestDays = candidateDays;
      bestEvaluated = evaluated;
      bestScore = score;
      adjusted = true;
    }
  };

  // 1. Within-day reorderings for allowed days with positive penalty.
  for (const dayIdx of allowedIndices) {
    if ((bestScore.perDay[dayIdx] ?? 0) === 0) continue;
    const perms = generateUnlockedPermutations(bestDays[dayIdx]!, lockedStopIds);
    for (const perm of perms) {
      const candidateDays = bestDays.map((d, idx) => (idx === dayIdx ? perm : [...d]));
      await tryCandidate(candidateDays);
    }
  }

  // 2. Whole-day swaps between unlocked allowed days when penalty remains.
  if (bestScore.total > 0 && allowedIndices.length >= 2) {
    let swapAttempts = 0;
    for (let a = 0; a < allowedIndices.length && swapAttempts < MAX_CROSS_DAY_SWAPS; a++) {
      const i = allowedIndices[a]!;
      if (bestDays[i]!.some(c => lockedStopIds.has(c.id))) continue;
      for (let b = a + 1; b < allowedIndices.length && swapAttempts < MAX_CROSS_DAY_SWAPS; b++) {
        const j = allowedIndices[b]!;
        if (bestDays[j]!.some(c => lockedStopIds.has(c.id))) continue;
        if ((bestScore.perDay[i] ?? 0) === 0 && (bestScore.perDay[j] ?? 0) === 0) continue;
        if (!bestDays[i]!.length && !bestDays[j]!.length) continue;
        swapAttempts++;
        const candidateDays = bestDays.map((d, idx) => (idx === i ? [...bestDays[j]!] : idx === j ? [...bestDays[i]!] : [...d]));
        await tryCandidate(candidateDays);
      }
    }
  }

  return { adjusted, days: bestDays, evaluated: bestEvaluated };
}
