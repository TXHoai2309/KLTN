import "server-only";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { formatMinute } from "@/modules/trip-weather/sun-times";
import { toTripWeatherRequest } from "@/modules/trip-weather/trip-weather-request";
import {
  getTripWeather,
  type AdvisoryKind,
  type TripWeather,
  type TripWeatherDependencies,
  type WeatherAdvisory,
} from "@/modules/trip-weather/trip-weather-service";

export const PROPOSAL_WEATHER_TIMEOUT_MS = 2500;
export const MAX_PROPOSAL_REPLY_ADVISORIES = 2;

/**
 * Fixed severity order for proposal reply mentions (heaviest first):
 * 1. FOG (visibility < 1 km on mountain roads)
 * 2. RAIN (rain probability >= 70% or rainfall >= 5 mm/h)
 * 3. WIND (wind gusts >= 40 km/h)
 * 4. AFTER_SUNSET (outdoor visit ending after sunset)
 * Ties within the same kind break by greater relative threshold exceedance, then earlier day and start time.
 */
export const ADVISORY_KIND_PRIORITY: Readonly<Record<AdvisoryKind, number>> = {
  FOG: 4,
  RAIN: 3,
  WIND: 2,
  AFTER_SUNSET: 1,
};

export type ProposalWeatherAdvisoryItem = {
  kind: AdvisoryKind;
  day: number;
  targetKind: "VISIT" | "LEG";
  label: string;
  fromTime: string;
  toTime: string;
  observed: number;
  threshold: number;
};

export type ProposalWeatherEvaluator = (proposal: PlannerResult) => Promise<ProposalWeatherAdvisoryItem[]>;

function relativeExceedance(advisory: WeatherAdvisory): number {
  if (advisory.kind === "FOG") {
    return advisory.threshold > 0 ? (advisory.threshold - advisory.observed) / advisory.threshold : 0;
  }
  if (advisory.kind === "AFTER_SUNSET") {
    return (advisory.observed % 1440) - advisory.threshold;
  }
  return advisory.threshold > 0 ? advisory.observed / advisory.threshold : advisory.observed;
}

export function compareWeatherAdvisories(a: WeatherAdvisory, b: WeatherAdvisory): number {
  const rankDiff = ADVISORY_KIND_PRIORITY[b.kind] - ADVISORY_KIND_PRIORITY[a.kind];
  if (rankDiff !== 0) return rankDiff;
  const severityDiff = relativeExceedance(b) - relativeExceedance(a);
  if (severityDiff !== 0) return severityDiff;
  if (a.day !== b.day) return a.day - b.day;
  return a.fromTime.localeCompare(b.fromTime);
}

function hasAvailableForecast(weather: TripWeather): boolean {
  if (!weather.source) return false;
  return (
    weather.days.some(d => d.visits.some(v => v.weather.status === "AVAILABLE")) ||
    weather.legs.some(l => l.status === "AVAILABLE" && l.samples.some(s => s.weather.status === "AVAILABLE"))
  );
}

export function selectProposalWeatherAdvisories(
  weather: TripWeather,
  proposal: PlannerResult,
  limit = MAX_PROPOSAL_REPLY_ADVISORIES,
): ProposalWeatherAdvisoryItem[] {
  if (!hasAvailableForecast(weather) || weather.advisories.length === 0 || limit <= 0) {
    return [];
  }
  const names = new Map(proposal.days.flatMap(d => d.stops.map(s => [s.destination.id, s.destination.name] as const)));
  return [...weather.advisories]
    .sort(compareWeatherAdvisories)
    .slice(0, limit)
    .map(a => ({
      kind: a.kind,
      day: a.day,
      targetKind: a.location.type,
      label: a.location.type === "VISIT" ? names.get(a.location.destinationId) ?? "Điểm đến" : a.location.label,
      fromTime: a.fromTime,
      toTime: a.toTime,
      observed: a.observed,
      threshold: a.threshold,
    }));
}

function formatAdvisoryWindow(fromTime: string, toTime: string): string {
  const from = fromTime.slice(11, 16);
  const to = toTime.slice(11, 16);
  return from === to ? from : `${from}–${to}`;
}

function formatAdvisoryClause(item: ProposalWeatherAdvisoryItem): string {
  const where = item.targetKind === "VISIT" ? `tại ${item.label}` : `trên chặng ${item.label}`;
  const when = formatAdvisoryWindow(item.fromTime, item.toTime);
  const kindAndMetric =
    item.kind === "FOG"
      ? `cảnh báo sương mù (tầm nhìn ${(item.observed / 1000).toFixed(1)} km)`
      : item.kind === "RAIN"
        ? `cảnh báo mưa (${item.threshold < 10 ? `lượng mưa ${item.observed} mm/h` : `khả năng mưa ${item.observed}%`})`
        : item.kind === "WIND"
          ? `cảnh báo gió giật mạnh (${Math.round(item.observed)} km/h)`
          : `cảnh báo sau hoàng hôn (kết thúc ${formatMinute(item.observed % 1440)}, hoàng hôn ${formatMinute(item.threshold)})`;
  // Avoid "ngày N:" with a colon so AssistantPlanMessage's day-stop parser never treats this note as an itinerary day.
  return `ngày ${item.day} ${where} (${when}) có ${kindAndMetric}`;
}

/** Deterministic single-line weather advisory notice appended by code, never rewritten by the model. */
export function formatProposalWeatherAdvisoryLine(
  advisories: readonly ProposalWeatherAdvisoryItem[] | undefined,
): string | null {
  if (!advisories || advisories.length === 0) return null;
  const clauses = advisories.slice(0, MAX_PROPOSAL_REPLY_ADVISORIES).map(formatAdvisoryClause);
  return `Lưu ý thời tiết (chỉ để tham khảo): ${clauses.join("; ")} — bạn xem chi tiết ở bảng thời tiết bên dưới nhé.`;
}

export function createProposalWeatherEvaluator(
  deps: TripWeatherDependencies & { timeoutMs?: number },
): ProposalWeatherEvaluator {
  const timeoutMs = deps.timeoutMs ?? PROPOSAL_WEATHER_TIMEOUT_MS;
  return async (proposal: PlannerResult) => {
    if (!proposal.requirement.startDate || !proposal.days.some(d => d.date !== null)) {
      return [];
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = toTripWeatherRequest(proposal.days, proposal.journeyPlan);
      const weatherPromise = getTripWeather(request, {
        database: deps.database,
        forecast: {
          ...deps.forecast,
          timeoutMs,
          signal: controller.signal,
        },
      });
      const timeoutPromise = new Promise<null>(resolve => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeoutMs);
      });
      const weather = await Promise.race([weatherPromise, timeoutPromise]);
      if (!weather) return [];
      return selectProposalWeatherAdvisories(weather, proposal);
    } catch {
      return [];
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
