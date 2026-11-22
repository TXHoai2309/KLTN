import type { Database } from "@KLTN/db";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import type { ForecastOptions } from "../trip-weather/forecast";
import { computeSunTimes } from "../trip-weather/sun-times";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { AdviceTopic } from "./ai-workspace-plan";
import {
  addVisit,
  MAX_EDIT_VISITS,
  removeVisit,
  replaceVisit,
  type EditCandidate,
  type SavedTripForEdit,
} from "./edit-candidate";
import { minuteClockLabel } from "./edit-journey-helper";
import { autoShiftDayVisits } from "./edit-workspace-checks";
import {
  buildVerifiedAdvisoryFacts,
  composeGroundedAdviceWithFallback,
  deriveOverallStatus,
  dryRunAdvisoryRemedies,
  gatherWeatherAndSunDigest,
  type AdviceSuggestionCard,
  type AdvisoryCatalogDestination,
  type AdvisoryDayWeatherDigest,
  type RemedyBlueprint,
  type RunPreviewFn,
} from "./saved-trip-advisory";
import type { EditPlaceDetail, PreviewEditResult } from "./trip-edit-service";

export const MAX_DESTINATION_OPTIONS = 3;

export type UnavailableDraftStop = {
  visitId: string;
  destinationId: string;
  dayIndex: number;
  startMinute: number;
  area?: string;
};

export type ParsedRecommendRequest = {
  isRecommendScenario: boolean;
  intentKind: "HIDDEN_SWAP" | "SWAP" | "ADD";
  dayIndex: number | null;
  slotPreference: "MORNING" | "AFTERNOON" | "EVENING" | null;
};

export type DestinationRankOption = {
  destination: AdvisoryCatalogDestination;
  score: number;
  reasons: string[];
};

export type DestinationRecommendScenarioResult =
  | { kind: "NOT_APPLICABLE" }
  | {
      kind: "ADVISED";
      advice: string;
      suggestions: AdviceSuggestionCard[];
    };

function foldVi(raw: string): string {
  return raw
    .normalize("NFC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase()
    .trim();
}

function weekdayOfLocalDate(localDate: string | null): string | null {
  if (!localDate) return null;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${localDate}T00:00:00Z`))
    .toUpperCase();
}

export function parseDestinationRecommendRequest(input: {
  message: string;
  mode: string;
  focusDayIndex: number | null;
  topic: AdviceTopic;
  hasUnavailableStops: boolean;
}): ParsedRecommendRequest {
  const folded = foldVi(input.message);
  const dayMatch = /\bngay\s*(\d{1,2})\b/u.exec(folded);
  const dayIndex = dayMatch ? Number(dayMatch[1]) : input.focusDayIndex;

  const slotPreference = /\b(?:chieu|buoi chieu)\b/u.test(folded)
    ? "AFTERNOON"
    : /\b(?:toi|buoi toi)\b/u.test(folded)
      ? "EVENING"
      : /\b(?:sang|buoi sang)\b/u.test(folded)
        ? "MORNING"
        : null;

  const hiddenSignal =
    input.topic === "HIDDEN_UNAVAILABLE" ||
    (input.hasUnavailableStops &&
      /(?:bi\s+an|khong\s+con\s+kha\s+dung|diem\s+an|xoa\s+diem|thay\s+the|doi\s+diem|goi\s+y|xu\s+ly)/u.test(
        folded,
      ));

  const openSwapSignal =
    /(?:doi\s+(?:dia\s+diem|diem|cho)|thay\s+(?:dia\s+diem|diem|cho)).*?(?:khac|hop\s+hon|nao|moi)|cho\s+nao\s+hop\s+hon/u.test(
      folded,
    ) ||
    /(?:co\s+cho\s+nao|nen\s+di\s+dau|con\s+trong.*?(?:di\s+dau|them\s+(?:gi|diem)|goi\s+y)|goi\s+y.*?(?:diem|dia\s+diem))/u.test(
      folded,
    );

  const isTopicTriggered =
    input.topic === "RECOMMEND_DESTINATION" || input.topic === "HIDDEN_UNAVAILABLE";

  const isRecommendScenario =
    input.mode !== "APPLY_BATCH" &&
    input.mode !== "CHANGE_ORIGIN_CLOCKS" &&
    (isTopicTriggered || hiddenSignal || openSwapSignal);

  const intentKind: ParsedRecommendRequest["intentKind"] = hiddenSignal
    ? "HIDDEN_SWAP"
    : /\b(?:doi|thay|bo\s+diem)\b/u.test(folded) && !/\b(?:them|con\s+trong|nen\s+di\s+dau)\b/u.test(folded)
      ? "SWAP"
      : "ADD";

  return {
    isRecommendScenario,
    intentKind,
    dayIndex: dayIndex && Number.isInteger(dayIndex) && dayIndex >= 1 ? dayIndex : null,
    slotPreference,
  };
}

/** Deterministic scorer ranking strictly VISIBLE public destinations not already in draft. */
export function rankPublicDestinationOptions(input: {
  eligibleDestinations: readonly AdvisoryCatalogDestination[];
  baseCandidate: EditCandidate;
  preferredAreas: readonly string[];
  targetDayIndex: number;
  slotStartMinute: number;
  weatherDigest?: AdvisoryDayWeatherDigest;
  message: string;
}): DestinationRankOption[] {
  const inDraftIds = new Set(
    input.baseCandidate.days.flatMap((d) => d.visits.map((v) => v.destinationId)),
  );
  const foldedMsg = foldVi(input.message);
  const preferredFolded = new Set(input.preferredAreas.map((a) => foldVi(a)).filter(Boolean));
  const localDate = tripDayDate(input.baseCandidate.startDate, input.targetDayIndex);
  const weekday = weekdayOfLocalDate(localDate);
  const hasWeatherRisk = Boolean(
    input.weatherDigest && input.weatherDigest.weatherNotices.length > 0,
  );
  const deadlineMinute = Math.min(1440, input.baseCandidate.journey?.returnDeadlineMinute ?? 1440);

  const ranked: DestinationRankOption[] = [];
  for (const dest of input.eligibleDestinations) {
    // Hard filter: never suggest stops already in the current Edit draft
    if (inDraftIds.has(dest.id)) continue;

    let score = 0;
    const reasons: string[] = [];
    const destArea = dest.area ?? "";
    const foldedArea = foldVi(destArea);

    if (foldedArea && (preferredFolded.has(foldedArea) || foldedMsg.includes(foldedArea))) {
      score += 50;
      reasons.push(`cùng khu vực ${destArea}`);
    } else if (destArea) {
      reasons.push(`khu vực ${destArea}`);
    }

    const dur = dest.suggestedDurationMinutes ?? dest.minimumDurationMinutes ?? 60;
    const slotEnd = input.slotStartMinute + dur;
    reasons.push(`thời lượng gợi ý ${dur} phút`);

    // Opening hours check
    if (weekday && dest.openingDays && dest.openingDays.length > 0) {
      const openDay = dest.openingDays.find((od) => od.dayOfWeek === weekday);
      if (!openDay || openDay.status === "UNKNOWN") {
        score += 5;
      } else if (openDay.status === "CLOSED") {
        score -= 120;
        reasons.push("đóng cửa ngày này");
      } else {
        const fitsWindow = openDay.intervals.some(
          (iv) => input.slotStartMinute >= iv.opensAtMinute && slotEnd <= iv.closesAtMinute,
        );
        if (fitsWindow) {
          score += 40;
          const iv = openDay.intervals.find(
            (x) => input.slotStartMinute >= x.opensAtMinute && slotEnd <= x.closesAtMinute,
          );
          if (iv) {
            reasons.push(`mở cửa ${minuteClockLabel(iv.opensAtMinute)}–${minuteClockLabel(iv.closesAtMinute)}`);
          }
        } else {
          score -= 80;
          reasons.push("ngoài khung giờ mở cửa");
        }
      }
    }

    // Time budget fit before 23:59 / return deadline
    if (slotEnd <= deadlineMinute) {
      score += 20;
    } else {
      score -= 50;
    }

    // Weather & after-sunset indoor vs outdoor suitability
    let isAfterSunset = false;
    if (
      localDate &&
      typeof dest.latitude === "number" &&
      typeof dest.longitude === "number"
    ) {
      const sun = computeSunTimes(dest.latitude, dest.longitude, localDate);
      if (sun.sunsetMinute !== null && slotEnd > sun.sunsetMinute) {
        isAfterSunset = true;
      }
    } else if (input.slotStartMinute >= 1020) {
      isAfterSunset = true;
    }

    if (hasWeatherRisk || isAfterSunset) {
      if (dest.isOutdoor === false) {
        score += 25;
        reasons.push(hasWeatherRisk ? "trong nhà phù hợp tránh thời tiết xấu" : "điểm trong nhà phù hợp buổi muộn");
      } else if (dest.isOutdoor === true) {
        score -= 25;
        reasons.push("ngoài trời (cần lưu ý thời tiết/hoàng hôn)");
      }
    } else if (dest.isOutdoor === false) {
      score += 8;
      reasons.push("trong nhà thuận tiện");
    } else {
      score += 10;
      reasons.push("tham quan ngoài trời");
    }

    ranked.push({ destination: dest, score, reasons });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.destination.name.localeCompare(b.destination.name, "vi");
  });

  // Prefer options with non-negative feasibility score unless catalog is very small
  const healthy = ranked.filter((r) => r.score >= 0);
  const chosen = (healthy.length > 0 ? healthy : ranked).slice(0, MAX_DESTINATION_OPTIONS);
  return chosen;
}

function toAddedPlaceDetail(dest: AdvisoryCatalogDestination): EditPlaceDetail {
  return {
    id: dest.id,
    name: dest.name,
    area: dest.area ?? "",
    ...(typeof dest.category === "string" ? { category: dest.category } : {}),
    ...(typeof dest.latitude === "number" ? { latitude: dest.latitude } : {}),
    ...(typeof dest.longitude === "number" ? { longitude: dest.longitude } : {}),
    suggestedDurationMinutes: dest.suggestedDurationMinutes ?? null,
    minimumDurationMinutes: dest.minimumDurationMinutes ?? null,
    ...(typeof dest.isOutdoor === "boolean" ? { isOutdoor: dest.isOutdoor } : {}),
    availability: "AVAILABLE",
    external: false,
  };
}

export async function runDestinationRecommendationScenario(input: {
  message: string;
  mode: string;
  baseCandidate: EditCandidate;
  savedShape: SavedTripForEdit & { manuallyCompletedAt?: Date | null };
  placeNames: ReadonlyMap<string, string>;
  placeDetailsById: ReadonlyMap<string, { isOutdoor?: boolean; availability?: string; external?: boolean }>;
  eligibleDestinations: readonly AdvisoryCatalogDestination[];
  allCatalogDestinations: readonly AdvisoryCatalogDestination[];
  unavailableStops: readonly UnavailableDraftStop[];
  candidateVisitIds: readonly string[];
  lockedVisitIds: ReadonlySet<string>;
  baselinePreview: PreviewEditResult;
  runPreview: RunPreviewFn;
  createVisitId: () => string;
  database: Pick<Database, "destination">;
  llm: StructuredLlmClient;
  forecast?: ForecastOptions;
  focusDayIndex: number | null;
  topic: AdviceTopic;
  timeReference: Date;
}): Promise<DestinationRecommendScenarioResult> {
  const parsed = parseDestinationRecommendRequest({
    message: input.message,
    mode: input.mode,
    focusDayIndex: input.focusDayIndex,
    topic: input.topic,
    hasUnavailableStops: input.unavailableStops.length > 0,
  });

  if (!parsed.isRecommendScenario) {
    return { kind: "NOT_APPLICABLE" };
  }

  const catalogById = new Map(input.allCatalogDestinations.map((d) => [d.id, d]));
  const weatherAndSun = await gatherWeatherAndSunDigest({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    catalogById,
    database: input.database,
    forecast: input.forecast,
    now: input.timeReference,
  });

  // 1. Choose target day & operation mode (HIDDEN_SWAP, SWAP, or ADD)
  let targetUnavailable: UnavailableDraftStop | undefined;
  let targetSwapVisit: { visitId: string; destinationId: string; dayIndex: number; startMinute: number; plannedDurationMinutes: number } | undefined;

  if (parsed.intentKind === "HIDDEN_SWAP" && input.unavailableStops.length > 0) {
    targetUnavailable =
      input.unavailableStops.find((u) => !input.lockedVisitIds.has(u.visitId)) ??
      input.unavailableStops[0];
  } else if (parsed.intentKind === "SWAP") {
    const requestedVisitId = input.candidateVisitIds[0];
    const unlockedVisits = input.baseCandidate.days.flatMap((d) =>
      d.visits
        .filter((v) => !input.lockedVisitIds.has(v.visitId))
        .map((v) => ({ ...v, dayIndex: d.dayIndex })),
    );
    targetSwapVisit =
      (requestedVisitId ? unlockedVisits.find((v) => v.visitId === requestedVisitId) : undefined) ??
      (parsed.dayIndex ? unlockedVisits.find((v) => v.dayIndex === parsed.dayIndex) : undefined) ??
      unlockedVisits[0];
  }

  const totalVisits = input.baseCandidate.days.reduce((s, d) => s + d.visits.length, 0);
  if (!targetUnavailable && !targetSwapVisit && totalVisits >= MAX_EDIT_VISITS) {
    return {
      kind: "ADVISED",
      advice: `Chuyến đi hiện đã đạt giới hạn tối đa ${MAX_EDIT_VISITS} lượt tham quan nên không thể thêm điểm mới. Bạn hãy xóa hoặc đổi bớt một lượt hiện có rồi hỏi lại nhé.`,
      suggestions: [],
    };
  }

  const resolvedDayIndex =
    targetUnavailable?.dayIndex ??
    targetSwapVisit?.dayIndex ??
    (parsed.dayIndex && input.baseCandidate.days.some((d) => d.dayIndex === parsed.dayIndex)
      ? parsed.dayIndex
      : input.baseCandidate.days[0]?.dayIndex ?? 1);

  const dayObj =
    input.baseCandidate.days.find((d) => d.dayIndex === resolvedDayIndex) ??
    input.baseCandidate.days[0];
  if (!dayObj) {
    return { kind: "NOT_APPLICABLE" };
  }

  // Preferred area inference: target hidden/swap stop area + areas of other public stops on that day
  const preferredAreas: string[] = [];
  if (targetUnavailable?.area) preferredAreas.push(targetUnavailable.area);
  if (targetSwapVisit) {
    const swapMeta = catalogById.get(targetSwapVisit.destinationId);
    if (swapMeta?.area) preferredAreas.push(swapMeta.area);
  }
  for (const v of dayObj.visits) {
    const d = catalogById.get(v.destinationId);
    if (d?.area && !preferredAreas.includes(d.area)) {
      preferredAreas.push(d.area);
    }
  }

  // Compute target start minute for swap or insert
  let slotStartMinute = 540;
  if (targetUnavailable) {
    slotStartMinute = targetUnavailable.startMinute;
  } else if (targetSwapVisit) {
    slotStartMinute = targetSwapVisit.startMinute;
  } else if (dayObj.visits.length === 0) {
    slotStartMinute =
      parsed.slotPreference === "AFTERNOON"
        ? 810
        : parsed.slotPreference === "EVENING"
          ? 1020
          : 540;
  } else if (parsed.slotPreference === "AFTERNOON") {
    const preAfternoonEnd = dayObj.visits
      .filter((v) => v.startMinute < 810)
      .reduce((max, v) => Math.max(max, v.startMinute + v.plannedDurationMinutes), 0);
    slotStartMinute = Math.max(810, preAfternoonEnd > 0 ? preAfternoonEnd + 30 : 810);
  } else {
    const last = dayObj.visits.at(-1)!;
    slotStartMinute = Math.min(1320, last.startMinute + last.plannedDurationMinutes + 30);
  }

  const dayWeather = weatherAndSun.find((w) => w.dayIndex === resolvedDayIndex);
  const rankedOptions = rankPublicDestinationOptions({
    eligibleDestinations: input.eligibleDestinations,
    baseCandidate: input.baseCandidate,
    preferredAreas,
    targetDayIndex: resolvedDayIndex,
    slotStartMinute,
    weatherDigest: dayWeather,
    message: input.message,
  });

  if (rankedOptions.length === 0) {
    const fallbackNoMatch =
      input.unavailableStops.length > 0
        ? `Chuyến đi đang có điểm không còn khả dụng tại Ngày ${resolvedDayIndex} (${minuteClockLabel(slotStartMinute)}), nhưng danh mục công khai hiện không còn điểm mới nào chưa có trong lịch. Bạn có thể bấm nút Xóa điểm không khả dụng trước khi lưu.`
        : `Tất cả điểm công khai trong danh mục phù hợp hiện đã nằm trong bản nháp chỉnh sửa của bạn.`;
    const blueprints: RemedyBlueprint[] =
      targetUnavailable && !input.lockedVisitIds.has(targetUnavailable.visitId)
        ? [
            {
              title: `Xóa điểm không còn khả dụng khỏi Ngày ${resolvedDayIndex}`,
              summary: `Loại bỏ điểm không còn khả dụng lúc ${minuteClockLabel(targetUnavailable.startMinute)} để làm sạch bản nháp.`,
              candidate: removeVisit(input.baseCandidate, targetUnavailable.visitId),
            },
          ]
        : [];
    const quickCards = await dryRunAdvisoryRemedies({
      blueprints,
      baseCandidate: input.baseCandidate,
      savedShape: input.savedShape,
      baselineValidation: input.baselinePreview.validation,
      baselineSaveEligibility: input.baselinePreview.saveEligibility,
      baseWeatherAndSun: weatherAndSun,
      placeNames: input.placeNames,
      catalogById,
      runPreview: input.runPreview,
      timeReference: input.timeReference,
      maxSuggestions: 1,
    });
    return {
      kind: "ADVISED",
      advice: fallbackNoMatch,
      suggestions: quickCards,
    };
  }

  // Build candidate remedies (up to 3 destination options + optional quick remove for hidden stop)
  const blueprints: RemedyBlueprint[] = [];
  const augmentedPlaceNames = new Map(input.placeNames);

  rankedOptions.forEach((opt, idx) => {
    const dest = opt.destination;
    augmentedPlaceNames.set(dest.id, dest.name);
    const dur = Math.max(30, dest.suggestedDurationMinutes ?? dest.minimumDurationMinutes ?? 60);
    const reasonText = opt.reasons.join(", ");
    const addedDetails = { [dest.id]: toAddedPlaceDetail(dest) };

    if (targetUnavailable && !input.lockedVisitIds.has(targetUnavailable.visitId)) {
      let cand = replaceVisit(input.baseCandidate, targetUnavailable.visitId, {
        destinationId: dest.id,
        startMinute: targetUnavailable.startMinute,
        plannedDurationMinutes: dur,
      });
      const dayVisits = cand.days.find((d) => d.dayIndex === resolvedDayIndex)?.visits ?? [];
      const vIdx = dayVisits.findIndex((v) => v.visitId === targetUnavailable!.visitId);
      if (vIdx >= 0) {
        const shifted = autoShiftDayVisits({
          candidate: cand,
          dayIndex: resolvedDayIndex,
          startFromIndex: vIdx,
          legMetrics: input.baselinePreview.legs ?? [],
          lockedVisitIds: input.lockedVisitIds,
        });
        if (shifted.overflowDayIndex === null) cand = shifted.candidate;
      }
      blueprints.push({
        title: `Lựa chọn #${idx + 1}: Thay bằng ${dest.name}`,
        summary: `Phù hợp vì ${reasonText}.`,
        candidate: cand,
        addedPlaceDetails: addedDetails,
      });
    } else if (targetSwapVisit) {
      let cand = replaceVisit(input.baseCandidate, targetSwapVisit.visitId, {
        destinationId: dest.id,
        startMinute: targetSwapVisit.startMinute,
        plannedDurationMinutes: dur,
      });
      const dayVisits = cand.days.find((d) => d.dayIndex === resolvedDayIndex)?.visits ?? [];
      const vIdx = dayVisits.findIndex((v) => v.visitId === targetSwapVisit!.visitId);
      if (vIdx >= 0) {
        const shifted = autoShiftDayVisits({
          candidate: cand,
          dayIndex: resolvedDayIndex,
          startFromIndex: vIdx,
          legMetrics: input.baselinePreview.legs ?? [],
          lockedVisitIds: input.lockedVisitIds,
        });
        if (shifted.overflowDayIndex === null) cand = shifted.candidate;
      }
      blueprints.push({
        title: `Lựa chọn #${idx + 1}: Đổi sang ${dest.name}`,
        summary: `Phù hợp vì ${reasonText}.`,
        candidate: cand,
        addedPlaceDetails: addedDetails,
      });
    } else {
      const clampedStart = Math.min(1439 - dur, Math.max(0, slotStartMinute));
      const newVisitId = input.createVisitId();
      const targetDay = input.baseCandidate.days.find((d) => d.dayIndex === resolvedDayIndex);
      const insertOrder = targetDay
        ? targetDay.visits.filter((v) => v.startMinute < clampedStart).length + 1
        : 1;
      let cand = addVisit(
        input.baseCandidate,
        resolvedDayIndex,
        {
          visitId: newVisitId,
          destinationId: dest.id,
          startMinute: clampedStart,
          plannedDurationMinutes: dur,
        },
        insertOrder,
      );
      const shifted = autoShiftDayVisits({
        candidate: cand,
        dayIndex: resolvedDayIndex,
        startFromIndex: Math.max(0, insertOrder - 1),
        legMetrics: input.baselinePreview.legs ?? [],
        lockedVisitIds: input.lockedVisitIds,
      });
      if (shifted.overflowDayIndex === null) cand = shifted.candidate;
      blueprints.push({
        title: `Lựa chọn #${idx + 1}: Thêm ${dest.name} (${minuteClockLabel(clampedStart)})`,
        summary: `Phù hợp vì ${reasonText}.`,
        candidate: cand,
        addedPlaceDetails: addedDetails,
      });
    }
  });

  if (targetUnavailable && !input.lockedVisitIds.has(targetUnavailable.visitId)) {
    blueprints.push({
      title: `Xóa điểm không còn khả dụng khỏi Ngày ${resolvedDayIndex}`,
      summary: `Loại bỏ nhanh lượt lúc ${minuteClockLabel(targetUnavailable.startMinute)} (Điểm đến không còn khả dụng) để lịch trình hợp lệ khi lưu.`,
      candidate: removeVisit(input.baseCandidate, targetUnavailable.visitId),
    });
  }

  const cards = await dryRunAdvisoryRemedies({
    blueprints,
    baseCandidate: input.baseCandidate,
    savedShape: input.savedShape,
    baselineValidation: input.baselinePreview.validation,
    baselineSaveEligibility: input.baselinePreview.saveEligibility,
    baseWeatherAndSun: weatherAndSun,
    placeNames: augmentedPlaceNames,
    catalogById,
    runPreview: input.runPreview,
    timeReference: input.timeReference,
    maxSuggestions: targetUnavailable ? 4 : 3,
  });

  const optionSummaries = rankedOptions
    .map(
      (opt, idx) =>
        `${idx + 1}) ${opt.destination.name} (${opt.reasons.slice(0, 3).join(", ")})`,
    )
    .join("; ");

  const deterministicText = targetUnavailable
    ? `Trong bản nháp Ngày ${resolvedDayIndex} lúc ${minuteClockLabel(targetUnavailable.startMinute)} đang có "Điểm đến không còn khả dụng"${targetUnavailable.area ? ` (khu vực ${targetUnavailable.area})` : ""}. Mình gợi ý ${rankedOptions.length} điểm công khai thay thế phù hợp nhất: ${optionSummaries}. Bạn có thể bấm chọn trực tiếp thẻ bên dưới hoặc nhắn số thứ tự/tên điểm để đổi (hoặc xóa nhanh).`
    : targetSwapVisit
      ? `Để thay thế lượt tham quan lúc ${minuteClockLabel(targetSwapVisit.startMinute)} Ngày ${resolvedDayIndex}, mình đã lọc ${rankedOptions.length} điểm công khai phù hợp nhất: ${optionSummaries}. Bấm thẻ bên dưới hoặc gõ tên/số thứ tự để áp dụng ngay lên bản nháp.`
      : `Với khung giờ trống lúc ${minuteClockLabel(slotStartMinute)} Ngày ${resolvedDayIndex}, mình gợi ý ${rankedOptions.length} điểm công khai hợp lý nhất: ${optionSummaries}. Bấm chọn 1 thẻ bên dưới để chèn ngay vào bản nháp và xem trên Timeline & Bản đồ.`;

  const facts = buildVerifiedAdvisoryFacts({
    candidate: input.baseCandidate,
    placeNames: augmentedPlaceNames,
    placeDetailsById: input.placeDetailsById,
    validation: input.baselinePreview.validation,
    legs: input.baselinePreview.legs ?? [],
    journeySummary: input.baselinePreview.journeySummary,
    saveEligibility: input.baselinePreview.saveEligibility,
    weatherAndSun,
    suggestions: cards,
    focusDayIndex: resolvedDayIndex,
    topic: input.topic,
  });

  const knownIds = new Set(input.allCatalogDestinations.map((d) => d.id));
  const advice = await composeGroundedAdviceWithFallback({
    message: `${input.message}\n[Gợi ý Destination option: ${optionSummaries}]`,
    facts,
    fallbackText: deterministicText,
    knownDestinationIds: knownIds,
    llm: input.llm,
  });

  return {
    kind: "ADVISED",
    advice,
    suggestions: cards,
  };
}
