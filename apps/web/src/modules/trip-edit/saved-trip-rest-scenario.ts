import type { Database } from "@KLTN/db";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { computeSunTimes, formatMinute } from "../trip-weather/sun-times";
import type { ForecastOptions } from "../trip-weather/forecast";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { AdviceTopic } from "./ai-workspace-plan";
import {
  moveVisit,
  removeVisit,
  setVisitDuration,
  setVisitTime,
  type EditCandidate,
  type SavedTripForEdit,
} from "./edit-candidate";
import { minuteClockLabel } from "./edit-journey-helper";
import { autoFixItinerarySchedule, autoShiftDayVisits } from "./edit-workspace-checks";
import {
  buildDeterministicAdvisoryFallback,
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
import type { PreviewEditResult, PreviewLegMetric } from "./trip-edit-service";

export type ParsedRestBufferScenario = {
  isRestScenario: boolean;
  wantsDirectApply: boolean;
  dayIndex: number | null;
  targetStartMinute: number | null;
  delayMinutes: number | null;
  middayBreak: boolean;
  relaxedPace: boolean;
};

export type RestScenarioResult =
  | { kind: "NOT_APPLICABLE" }
  | {
      kind: "APPLY_DIRECT";
      analysisSummary: string;
      suggestion: AdviceSuggestionCard;
    }
  | {
      kind: "ADVISED";
      advice: string;
      suggestions: AdviceSuggestionCard[];
    };

function foldVietnamese(raw: string): string {
  return raw
    .normalize("NFC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase()
    .trim();
}

export function parseRestBufferRequest(
  message: string,
  focusDayIndex: number | null,
  topic: AdviceTopic,
): ParsedRestBufferScenario {
  const folded = foldVietnamese(message);

  const dayMatch = /\bngay\s*(\d{1,2})\b/u.exec(folded);
  const parsedDay = dayMatch ? Number(dayMatch[1]) : null;
  const dayIndex =
    parsedDay && Number.isInteger(parsedDay) && parsedDay >= 1 ? parsedDay : focusDayIndex;

  let targetStartMinute: number | null = null;
  const clockRegex =
    /(?:nghi(?:\s+ngoi|\s+an\s+sang|\s+trua)?|an\s+sang|doi|lui|xuat\s+phat|bat\s+dau|moi\s+di).*?(?:den|toi|sang|luc|vao)\s*(\d{1,2})\s*(?:h|:|gio)\s*(\d{1,2})?(\s*(?:chieu|toi|sang))?/u;
  const altClockRegex = /(?:den|toi)\s*(\d{1,2})\s*(?:h|:|gio)\s*(\d{1,2})?\s*moi\s*(?:di|xuat\s+phat|bat\s+dau|tham\s+quan)/u;
  const clockMatch = clockRegex.exec(folded) ?? altClockRegex.exec(folded);
  if (clockMatch) {
    let hour = Number(clockMatch[1]);
    const minute = clockMatch[2] ? Number(clockMatch[2]) : 0;
    const period = clockMatch[3]?.trim();
    if (period === "chieu" && hour < 12) hour += 12;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      targetStartMinute = hour * 60 + minute;
    }
  }

  let delayMinutes: number | null = null;
  const delayCuePresent =
    /(?:muon|tre|nghi\s+them|nghi\s+ngoi(?:\s+them)?|an\s+sang|nghi\s+trua|lui|cho\s+doan\s+nghi|khoang\s+nghi)/u.test(
      folded,
    );
  if (delayCuePresent && targetStartMinute === null) {
    const durRegex = /(\d+(?:[.,]\d+)?)\s*(tieng|gio|h|phut|p)\b/u;
    const durMatch = durRegex.exec(folded);
    if (durMatch) {
      const qty = Number(durMatch[1]!.replace(",", "."));
      const unit = durMatch[2]!;
      const rawMins = unit === "phut" || unit === "p" ? Math.round(qty) : Math.round(qty * 60);
      if (rawMins >= 5 && rawMins <= 480) {
        delayMinutes = rawMins;
      }
    }
  }

  const middayBreak =
    /\b(?:trua|buoi\s+trua|nghi\s+trua|an\s+trua|giua\s+ngay|dau\s+gio\s+chieu)\b/u.test(folded);
  const relaxedPace =
    /\b(?:thong\s+tha|nhe\s+nhang\s+hon|co\s+nguoi\s+met|doan\s+met|met\s+moi|bot\s+gap|gian\s+lich|cham\s+lai|nghi\s+nhieu\s+hon)\b/u.test(
      folded,
    );

  const wantsDirectApply =
    /\b(?:sua\s+giup\s+luon|sua\s+lai\s+giup(?:\s+\w+){0,2}\s+luon|chinh\s+giup(?:\s+\w+){0,2}\s+luon|chinh\s+lai\s+giup(?:\s+\w+){0,2}\s+luon|sua\s+luon|chinh\s+luon|tu\s+sua\s+giup|ap\s+dung\s+luon|dieu\s+chinh\s+giup(?:\s+\w+){0,2}\s+luon|toi\s+uu\s+giup(?:\s+\w+){0,2}\s+luon)\b/u.test(
      folded,
    ) ||
    /(?:neu|khi)\s+(?:gap|khong\s+kip|tre|muon|vuong|qua\s+day).*?(?:sua|chinh|doi|dieu\s+chinh|xu\s+ly)\s+(?:lai\s+)?(?:giup|ho)/u.test(
      folded,
    );

  const isRestKeyword =
    /(?:nghi\s+ngoi|nghi\s+an\s+sang|nghi\s+den|day\s+muon|xuat\s+phat\s+tre|den\s+muon|den\s+tre|nghi\s+them|nghi\s+trua|khoang\s+nghi)/u.test(
      folded,
    );

  const isRestScenario =
    topic === "REST_BUFFER" ||
    topic === "COMPOUND_EVALUATE_FIX" ||
    targetStartMinute !== null ||
    delayMinutes !== null ||
    relaxedPace ||
    isRestKeyword ||
    wantsDirectApply;

  return {
    isRestScenario,
    wantsDirectApply,
    dayIndex,
    targetStartMinute,
    delayMinutes,
    middayBreak,
    relaxedPace,
  };
}

function collectDayTraps(input: {
  shiftedCandidate: EditCandidate;
  overflowDayIndex: number | null;
  shiftedPreview?: PreviewEditResult;
  dayIndex: number;
  placeNames: ReadonlyMap<string, string>;
  catalogById: ReadonlyMap<string, AdvisoryCatalogDestination>;
}): {
  trappedDescriptions: string[];
  trappedVisitIds: string[];
  hasTrap: boolean;
} {
  const day = input.shiftedCandidate.days.find((d) => d.dayIndex === input.dayIndex);
  const trappedDescriptions: string[] = [];
  const trappedIds = new Set<string>();

  if (input.overflowDayIndex === input.dayIndex && day) {
    const tail = day.visits.at(-1);
    if (tail) {
      trappedIds.add(tail.visitId);
      trappedDescriptions.push(
        `${input.placeNames.get(tail.destinationId) ?? "điểm cuối ngày"} bị tràn qua 23:59`,
      );
    } else {
      trappedDescriptions.push(`lịch Ngày ${input.dayIndex} vượt quá 23:59`);
    }
  }

  if (day) {
    for (const v of day.visits) {
      if (v.startMinute + v.plannedDurationMinutes > 1440) {
        trappedIds.add(v.visitId);
        trappedDescriptions.push(
          `${input.placeNames.get(v.destinationId) ?? "điểm tham quan"} vượt quá 23:59`,
        );
      }
    }
  }

  const preview = input.shiftedPreview;
  if (preview) {
    for (const f of preview.validation.groups.openingHours.findings) {
      if (f.status !== "VIOLATION") continue;
      if (f.affectedVisitId) {
        trappedIds.add(f.affectedVisitId);
        const visit = input.shiftedCandidate.days.flatMap((d) => d.visits).find((v) => v.visitId === f.affectedVisitId);
        const name = visit ? (input.placeNames.get(visit.destinationId) ?? "điểm đến") : "điểm tham quan";
        trappedDescriptions.push(`${name}: ${f.message}`);
      } else {
        trappedDescriptions.push(f.message);
      }
    }

    for (const f of preview.validation.groups.travelTime.findings) {
      if (f.status !== "VIOLATION") continue;
      if (f.toVisitId) trappedIds.add(f.toVisitId);
      trappedDescriptions.push(f.message);
    }

    for (const f of preview.validation.groups.scheduleConflict.findings) {
      if (f.status !== "VIOLATION") continue;
      if (f.visitIds?.[1]) trappedIds.add(f.visitIds[1]);
      trappedDescriptions.push(f.message);
    }

    const localDate = tripDayDate(input.shiftedCandidate.startDate, input.dayIndex);
    if (day && localDate) {
      for (const v of day.visits) {
        const dest = input.catalogById.get(v.destinationId);
        if (!dest?.isOutdoor || typeof dest.latitude !== "number" || typeof dest.longitude !== "number") {
          continue;
        }
        const sun = computeSunTimes(dest.latitude, dest.longitude, localDate);
        const endMinute = v.startMinute + v.plannedDurationMinutes;
        if (sun.sunsetMinute !== null && endMinute > sun.sunsetMinute) {
          trappedIds.add(v.visitId);
          trappedDescriptions.push(
            `${input.placeNames.get(v.destinationId) ?? dest.name} (điểm ngoài trời) kết thúc lúc ${minuteClockLabel(Math.min(1439, endMinute))}, sau hoàng hôn (${formatMinute(sun.sunsetMinute)})`,
          );
        }
      }
    }

    if (
      preview.journeySummary?.estimatedReturnArrivalMinute != null &&
      preview.journeySummary.returnDeadlineMinute != null &&
      preview.journeySummary.estimatedReturnArrivalMinute > preview.journeySummary.returnDeadlineMinute
    ) {
      const last = day?.visits.at(-1);
      if (last) trappedIds.add(last.visitId);
      trappedDescriptions.push(
        `dự kiến về lúc ${minuteClockLabel(preview.journeySummary.estimatedReturnArrivalMinute)} sẽ trễ hạn trở về (${minuteClockLabel(preview.journeySummary.returnDeadlineMinute)})`,
      );
    }
  }

  return {
    trappedDescriptions: [...new Set(trappedDescriptions)],
    trappedVisitIds: [...trappedIds],
    hasTrap: trappedDescriptions.length > 0,
  };
}

function buildRestBufferCandidate(input: {
  baseCandidate: EditCandidate;
  dayIndex: number;
  anchorIndex: number;
  desiredAnchorStart: number;
  legs: readonly PreviewLegMetric[];
  lockedVisitIds: ReadonlySet<string>;
  relaxedPace: boolean;
}): { candidate: EditCandidate; overflowDayIndex: number | null } {
  const day = input.baseCandidate.days.find((d) => d.dayIndex === input.dayIndex);
  const anchor = day?.visits[input.anchorIndex];
  if (!day || !anchor || input.lockedVisitIds.has(anchor.visitId)) {
    return { candidate: input.baseCandidate, overflowDayIndex: null };
  }

  const clampedStart = Math.min(1439 - anchor.plannedDurationMinutes, Math.max(0, input.desiredAnchorStart));
  let updated = setVisitTime(input.baseCandidate, anchor.visitId, clampedStart);

  // If relaxedPace is set without a big initial shift, apply extra breathing room between stops
  const bufferMinutes = input.relaxedPace ? 30 : 15;
  const shifted = autoShiftDayVisits({
    candidate: updated,
    dayIndex: input.dayIndex,
    startFromIndex: input.anchorIndex,
    legMetrics: input.legs,
    defaultBufferMinutes: bufferMinutes,
    lockedVisitIds: input.lockedVisitIds,
  });
  return {
    candidate: shifted.candidate,
    overflowDayIndex: shifted.overflowDayIndex,
  };
}

function buildTrimmedRestRemedy(input: {
  restCandidate: EditCandidate;
  dayIndex: number;
  anchorIndex: number;
  desiredAnchorStart: number;
  legs: readonly PreviewLegMetric[];
  catalogById: ReadonlyMap<string, AdvisoryCatalogDestination>;
  lockedVisitIds: ReadonlySet<string>;
}): EditCandidate | null {
  const day = input.restCandidate.days.find((d) => d.dayIndex === input.dayIndex);
  if (!day) return null;

  let working = input.restCandidate;
  let trimmedCount = 0;

  const anchor = day.visits[input.anchorIndex];
  if (anchor && !input.lockedVisitIds.has(anchor.visitId)) {
    working = setVisitTime(working, anchor.visitId, input.desiredAnchorStart);
  }

  for (let i = input.anchorIndex; i < day.visits.length; i++) {
    const v = working.days.find((d) => d.dayIndex === input.dayIndex)!.visits[i]!;
    if (input.lockedVisitIds.has(v.visitId)) continue;
    const dest = input.catalogById.get(v.destinationId);
    const minDur = Math.max(30, dest?.minimumDurationMinutes ?? 30);
    if (v.plannedDurationMinutes > minDur) {
      const targetDur = Math.max(
        minDur,
        v.plannedDurationMinutes - Math.max(15, Math.floor((v.plannedDurationMinutes - minDur) * 0.75)),
      );
      if (targetDur < v.plannedDurationMinutes) {
        working = setVisitDuration(working, v.visitId, targetDur);
        trimmedCount += 1;
      }
    }
  }

  if (trimmedCount === 0) return null;

  // Tightly pack unlocked visits starting from anchorIndex using verified leg travel durations
  // so trimmed earlier visits pull downstream unlocked visits earlier too.
  const legByPair = new Map<string, PreviewLegMetric>();
  for (const leg of input.legs) {
    legByPair.set(`${leg.fromVisitId}->${leg.toVisitId}`, leg);
  }

  const nextDays = working.days.map((d) => {
    if (d.dayIndex !== input.dayIndex) return d;
    const visits = d.visits.map((v) => ({ ...v }));
    for (let i = input.anchorIndex + 1; i < visits.length; i++) {
      const prev = visits[i - 1]!;
      const curr = visits[i]!;
      if (input.lockedVisitIds.has(curr.visitId)) continue;
      const leg = legByPair.get(`${prev.visitId}->${curr.visitId}`);
      const legMinutes =
        leg?.status === "VERIFIED" && leg.durationSeconds !== null
          ? Math.ceil(leg.durationSeconds / 60)
          : 15;
      const requiredGap = Math.max(15, legMinutes);
      curr.startMinute = prev.startMinute + prev.plannedDurationMinutes + requiredGap;
      if (curr.startMinute + curr.plannedDurationMinutes > 1440) {
        return null;
      }
    }
    return { ...d, visits };
  });

  if (nextDays.some((d) => d === null)) return null;
  return { ...working, days: nextDays as EditCandidate["days"] };
}

export async function runRestAndCompoundScenario(input: {
  message: string;
  baseCandidate: EditCandidate;
  savedShape: SavedTripForEdit & { manuallyCompletedAt?: Date | null };
  placeNames: ReadonlyMap<string, string>;
  placeDetailsById: ReadonlyMap<string, { isOutdoor?: boolean; availability?: string; external?: boolean }>;
  catalogDestinations: readonly AdvisoryCatalogDestination[];
  lockedVisitIds: ReadonlySet<string>;
  baselinePreview: PreviewEditResult;
  runPreview: RunPreviewFn;
  database: Pick<Database, "destination">;
  llm: StructuredLlmClient;
  forecast?: ForecastOptions;
  focusDayIndex: number | null;
  topic: AdviceTopic;
  timeReference: Date;
}): Promise<RestScenarioResult> {
  const parsed = parseRestBufferRequest(input.message, input.focusDayIndex, input.topic);
  if (!parsed.isRestScenario) {
    return { kind: "NOT_APPLICABLE" };
  }

  const catalogById = new Map(input.catalogDestinations.map((d) => [d.id, d]));
  const baselineWeatherAndSun = await gatherWeatherAndSunDigest({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    catalogById,
    database: input.database,
    forecast: input.forecast,
    now: input.timeReference,
  });

  // Resolve target day with at least 1 unlocked visit
  const requestedDay =
    parsed.dayIndex && input.baseCandidate.days.some((d) => d.dayIndex === parsed.dayIndex)
      ? input.baseCandidate.days.find((d) => d.dayIndex === parsed.dayIndex)!
      : input.baseCandidate.days.find((d) =>
          d.visits.some((v) => !input.lockedVisitIds.has(v.visitId)),
        ) ?? input.baseCandidate.days[0];

  if (!requestedDay || requestedDay.visits.length === 0) {
    return { kind: "NOT_APPLICABLE" };
  }

  const dayIndex = requestedDay.dayIndex;
  const unlockedIndexes = requestedDay.visits
    .map((v, idx) => ({ v, idx }))
    .filter((item) => !input.lockedVisitIds.has(item.v.visitId));

  if (unlockedIndexes.length === 0) {
    const lockedAdvice = `Toàn bộ ${requestedDay.visits.length} lượt tham quan trong Ngày ${dayIndex} đã qua giờ khởi hành và được khóa cố định, nên không thể lùi hay thêm khoảng nghỉ trong Ngày ${dayIndex}. Bạn có thể tạo khoảng nghỉ ở các ngày tiếp theo trong lịch trình.`;
    return {
      kind: "ADVISED",
      advice: lockedAdvice,
      suggestions: [],
    };
  }

  // Pick anchor visit (mid-day break vs first unlocked stop)
  const anchorEntry = parsed.middayBreak
    ? (unlockedIndexes.find((item) => item.v.startMinute >= 690) ??
       unlockedIndexes[Math.min(1, unlockedIndexes.length - 1)]!)
    : unlockedIndexes[0]!;
  const anchorIndex = anchorEntry.idx;
  const anchorVisit = anchorEntry.v;
  const prevLocked =
    anchorIndex > 0 ? requestedDay.visits[anchorIndex - 1] : undefined;
  const minAfterPrevLocked = prevLocked
    ? prevLocked.startMinute + prevLocked.plannedDurationMinutes + 15
    : 0;

  let desiredAnchorStart = anchorVisit.startMinute;
  const hasExplicitRestOrDelay =
    parsed.targetStartMinute !== null ||
    parsed.delayMinutes !== null ||
    parsed.relaxedPace ||
    input.topic === "REST_BUFFER";

  if (parsed.targetStartMinute !== null) {
    desiredAnchorStart = Math.max(anchorVisit.startMinute, parsed.targetStartMinute, minAfterPrevLocked);
  } else if (parsed.delayMinutes !== null) {
    desiredAnchorStart = Math.max(anchorVisit.startMinute + parsed.delayMinutes, minAfterPrevLocked);
  } else if (parsed.relaxedPace || input.topic === "REST_BUFFER") {
    desiredAnchorStart = Math.max(anchorVisit.startMinute + 60, minAfterPrevLocked);
  }

  const baseOverall = deriveOverallStatus(
    input.baselinePreview.validation,
    input.baselinePreview.saveEligibility,
  );
  const baselineTraps = collectDayTraps({
    shiftedCandidate: input.baseCandidate,
    overflowDayIndex: null,
    shiftedPreview: input.baselinePreview,
    dayIndex,
    placeNames: input.placeNames,
    catalogById,
  });

  // Case 1: Pure compound "is it rushed/too tight, fix it for me" WITHOUT explicit rest/delay
  if (parsed.wantsDirectApply && !hasExplicitRestOrDelay) {
    if (baseOverall === "PASS" && !baselineTraps.hasTrap) {
      return { kind: "NOT_APPLICABLE" };
    }
    const autoFixed = autoFixItinerarySchedule({
      candidate: input.baseCandidate,
      legMetrics: input.baselinePreview.legs ?? [],
      journeySummary: input.baselinePreview.journeySummary,
      lockedVisitIds: input.lockedVisitIds,
    });
    const autoFixBlueprints: RemedyBlueprint[] = [];
    if (autoFixed.changedVisitIds.length > 0 && autoFixed.overflowDays.length === 0) {
      autoFixBlueprints.push({
        title: "Phương án 1: Tự động dời giờ khớp di chuyển",
        summary: `Dời lại ${autoFixed.changedVisitIds.length} mốc giờ chưa khóa để hết vướng di chuyển và giữ đủ mọi điểm.`,
        candidate: autoFixed.candidate,
      });
    }
    const trimmedExisting = buildTrimmedRestRemedy({
      restCandidate: input.baseCandidate,
      dayIndex,
      anchorIndex,
      desiredAnchorStart: anchorVisit.startMinute,
      legs: input.baselinePreview.legs ?? [],
      catalogById,
      lockedVisitIds: input.lockedVisitIds,
    });
    if (trimmedExisting) {
      autoFixBlueprints.push({
        title: "Rút ngắn nhẹ thời lượng trong ngưỡng tối thiểu",
        summary: `Giữ đủ điểm nhưng rút gọn thời lượng về mức tối thiểu để kịp đóng cửa và ánh sáng ban ngày.`,
        candidate: trimmedExisting,
      });
    }
    // Also add drop/move last unlocked visit if still stuck
    const lastUnlocked = [...requestedDay.visits].reverse().find((v) => !input.lockedVisitIds.has(v.visitId));
    if (lastUnlocked && requestedDay.visits.length >= 2) {
      const lighterOtherDay = input.baseCandidate.days
        .filter((d) => d.dayIndex !== dayIndex)
        .sort((a, b) => a.visits.length - b.visits.length)[0];
      if (lighterOtherDay) {
        const lastOther = lighterOtherDay.visits.at(-1);
        const startMin = lastOther ? Math.min(1260, lastOther.startMinute + lastOther.plannedDurationMinutes + 30) : 540;
        let moved = moveVisit(input.baseCandidate, lastUnlocked.visitId, lighterOtherDay.dayIndex);
        moved = setVisitTime(moved, lastUnlocked.visitId, startMin);
        autoFixBlueprints.push({
          title: `Chuyển ${input.placeNames.get(lastUnlocked.destinationId) ?? "điểm cuối"} sang Ngày ${lighterOtherDay.dayIndex}`,
          summary: `Giảm tải Ngày ${dayIndex} bằng cách chuyển điểm cuối sang Ngày ${lighterOtherDay.dayIndex}.`,
          candidate: moved,
        });
      } else {
        autoFixBlueprints.push({
          title: `Bỏ bớt ${input.placeNames.get(lastUnlocked.destinationId) ?? "điểm cuối"} khỏi Ngày ${dayIndex}`,
          summary: `Lược bỏ điểm cuối Ngày ${dayIndex} để các điểm còn lại đi thong thả và đúng giờ mở cửa.`,
          candidate: removeVisit(input.baseCandidate, lastUnlocked.visitId),
        });
      }
    }

    const compoundCards = await dryRunAdvisoryRemedies({
      blueprints: autoFixBlueprints,
      baseCandidate: input.baseCandidate,
      savedShape: input.savedShape,
      baselineValidation: input.baselinePreview.validation,
      baselineSaveEligibility: input.baselinePreview.saveEligibility,
      baseWeatherAndSun: baselineWeatherAndSun,
      placeNames: input.placeNames,
      catalogById,
      runPreview: input.runPreview,
      timeReference: input.timeReference,
    });

    const nonDestructiveClean = compoundCards.find(
      (c) =>
        c.diff.removed.length === 0 &&
        c.diff.updated.every((u) => u.before.dayIndex === u.after.dayIndex) &&
        deriveOverallStatus(c.validation, c.saveEligibility) === "PASS",
    );
    if (nonDestructiveClean) {
      const reasonDesc = baselineTraps.trappedDescriptions.slice(0, 2).join("; ");
      return {
        kind: "APPLY_DIRECT",
        analysisSummary: `Lịch Ngày ${dayIndex} trước đó bị vướng (${reasonDesc || "thiếu khoảng thời gian hợp lý"}). AI đã dời/giãn lại giờ trên bản nháp (${nonDestructiveClean.diffSummaryLines.slice(0, 2).join("; ")}) để đạt PASS mà vẫn giữ nguyên đủ mọi điểm. Bạn có thể bấm Hoàn tác bước AI này nếu muốn quay lại.`,
        suggestion: nonDestructiveClean,
      };
    }

    const trapReason =
      baselineTraps.trappedDescriptions.length > 0
        ? `Nguyên nhân vướng ở Ngày ${dayIndex}: ${baselineTraps.trappedDescriptions.slice(0, 2).join("; ")}.`
        : `Lịch Ngày ${dayIndex} hiện tại cần cân đối lại giữa các điểm.`;
    const compoundFallback = `${trapReason} Vì phương án xử lý cần đánh đổi (như chuyển ngày hoặc lược bớt điểm), mình chưa tự ý xóa điểm khỏi bản nháp — mời bạn chọn 1 trong các phương án đã kiểm chứng bên dưới.`;
    return {
      kind: "ADVISED",
      advice: compoundFallback,
      suggestions: compoundCards,
    };
  }

  // Case 2: Simulate Schedule rest buffer / late start / delay
  const primaryRest = buildRestBufferCandidate({
    baseCandidate: input.baseCandidate,
    dayIndex,
    anchorIndex,
    desiredAnchorStart,
    legs: input.baselinePreview.legs ?? [],
    lockedVisitIds: input.lockedVisitIds,
    relaxedPace: parsed.relaxedPace,
  });

  let shiftedPreview: PreviewEditResult | undefined;
  if (primaryRest.overflowDayIndex === null) {
    try {
      shiftedPreview = await input.runPreview(primaryRest.candidate);
    } catch {
      shiftedPreview = undefined;
    }
  }

  const shiftedTraps = collectDayTraps({
    shiftedCandidate: primaryRest.candidate,
    overflowDayIndex: primaryRest.overflowDayIndex,
    shiftedPreview,
    dayIndex,
    placeNames: input.placeNames,
    catalogById,
  });

  const restLabel = `nghỉ đến ${minuteClockLabel(desiredAnchorStart)}`;

  if (!shiftedTraps.hasTrap && shiftedPreview) {
    const restStatus = deriveOverallStatus(shiftedPreview.validation, shiftedPreview.saveEligibility);
    if (restStatus === "PASS" || restStatus === "NEEDS_UNCHECKED_ACK") {
      const cleanCards = await dryRunAdvisoryRemedies({
        blueprints: [
          {
            title: `Tạo khoảng nghỉ tới ${minuteClockLabel(desiredAnchorStart)} và tự động dời lịch Ngày ${dayIndex}`,
            summary: `Bắt đầu từ ${minuteClockLabel(desiredAnchorStart)} rồi dời dây chuyền các điểm phía sau (không chèn điểm giả).`,
            candidate: primaryRest.candidate,
          },
        ],
        baseCandidate: input.baseCandidate,
        savedShape: input.savedShape,
        baselineValidation: input.baselinePreview.validation,
        baselineSaveEligibility: input.baselinePreview.saveEligibility,
        baseWeatherAndSun: baselineWeatherAndSun,
        placeNames: input.placeNames,
        catalogById,
        runPreview: input.runPreview,
        timeReference: input.timeReference,
        maxSuggestions: 1,
      });

      const primaryCard = cleanCards[0];
      if (primaryCard && parsed.wantsDirectApply && restStatus === "PASS") {
        return {
          kind: "APPLY_DIRECT",
          analysisSummary: `Nếu ${restLabel}, các lượt tham quan Ngày ${dayIndex} vẫn khớp giờ mở cửa, trước hoàng hôn và trước 23:59. AI đã áp dụng phương án dời lịch sang bản nháp — bạn có thể bấm Hoàn tác bước AI này nếu cần.`,
          suggestion: primaryCard,
        };
      }

      const dayVisits = primaryRest.candidate.days.find((d) => d.dayIndex === dayIndex)?.visits ?? [];
      const dayEnd = dayVisits.at(-1);
      const endLabel = dayEnd
        ? minuteClockLabel(dayEnd.startMinute + dayEnd.plannedDurationMinutes)
        : "cuối ngày";

      const scenarioFacts = buildVerifiedAdvisoryFacts({
        candidate: input.baseCandidate,
        placeNames: input.placeNames,
        placeDetailsById: input.placeDetailsById,
        validation: input.baselinePreview.validation,
        legs: input.baselinePreview.legs ?? [],
        journeySummary: input.baselinePreview.journeySummary,
        saveEligibility: input.baselinePreview.saveEligibility,
        weatherAndSun: baselineWeatherAndSun,
        suggestions: cleanCards,
        focusDayIndex: dayIndex,
        topic: input.topic,
      });

      const fallbackText = `Nếu ${restLabel} mới tiếp tục tham quan Ngày ${dayIndex}, toàn bộ ${dayVisits.length} điểm trong ngày vẫn hoàn toàn khả thi (${restStatus === "PASS" ? "đạt PASS" : "đạt kiểm tra cơ bản"}), kết thúc lúc ${endLabel} (trước 23:59 và hợp giờ mở cửa). Mình đã mô phỏng sẵn thẻ phương án dời giờ ngay bên dưới để bạn bấm áp dụng 1 chạm vào bản nháp.`;
      const knownIds = new Set(input.catalogDestinations.map((d) => d.id));
      const composed = await composeGroundedAdviceWithFallback({
        message: `${input.message}\n[Mô phỏng Schedule rest buffer Ngày ${dayIndex}: ${fallbackText}]`,
        facts: scenarioFacts,
        fallbackText,
        knownDestinationIds: knownIds,
        llm: input.llm,
      });

      return {
        kind: "ADVISED",
        advice: composed,
        suggestions: cleanCards,
      };
    }
  }

  // Case 2B: Shifting with rest buffer traps downstream stops! Build up to 2 relief remedies.
  const reliefBlueprints: RemedyBlueprint[] = [];

  // Remedy 1: Rest buffer + shorten unlocked durations within minimumDurationMinutes
  const trimmedRest = buildTrimmedRestRemedy({
    restCandidate: primaryRest.candidate,
    dayIndex,
    anchorIndex,
    desiredAnchorStart,
    legs: input.baselinePreview.legs ?? [],
    catalogById,
    lockedVisitIds: input.lockedVisitIds,
  });
  if (trimmedRest) {
    reliefBlueprints.push({
      title: `Phương án 1: Nghỉ đến ${minuteClockLabel(desiredAnchorStart)} + rút ngắn nhẹ thời lượng`,
      summary: `Giữ nguyên các điểm trong Ngày ${dayIndex} bằng cách rút ngắn nhẹ thời lượng tham quan trong ngưỡng tối thiểu cho phép.`,
      candidate: trimmedRest,
    });
  }

  // Remedy 2: Rest buffer + move last unlocked visit to another lighter day OR drop last unlocked visit
  const restDayVisits = primaryRest.candidate.days.find((d) => d.dayIndex === dayIndex)?.visits ?? [];
  const targetDropId =
    shiftedTraps.trappedVisitIds.find((id) => !input.lockedVisitIds.has(id)) ??
    [...restDayVisits].reverse().find((v) => !input.lockedVisitIds.has(v.visitId))?.visitId;
  const targetDropVisit = restDayVisits.find((v) => v.visitId === targetDropId);

  if (targetDropVisit && restDayVisits.length >= 2) {
    const dropName = input.placeNames.get(targetDropVisit.destinationId) ?? "điểm cuối ngày";
    const lighterOtherDay = primaryRest.candidate.days
      .filter((d) => d.dayIndex !== dayIndex)
      .sort((a, b) => a.visits.length - b.visits.length)[0];

    if (lighterOtherDay) {
      const otherLast = lighterOtherDay.visits.at(-1);
      const targetStart = otherLast
        ? Math.min(1260, otherLast.startMinute + otherLast.plannedDurationMinutes + 30)
        : 540;
      let moved = moveVisit(primaryRest.candidate, targetDropVisit.visitId, lighterOtherDay.dayIndex);
      moved = setVisitTime(moved, targetDropVisit.visitId, targetStart);
      const repackedMoved = autoShiftDayVisits({
        candidate: moved,
        dayIndex,
        startFromIndex: anchorIndex,
        legMetrics: input.baselinePreview.legs ?? [],
        lockedVisitIds: input.lockedVisitIds,
      });
      reliefBlueprints.push({
        title: `Phương án 2: Nghỉ đến ${minuteClockLabel(desiredAnchorStart)} + chuyển ${dropName} sang Ngày ${lighterOtherDay.dayIndex}`,
        summary: `Chuyển ${dropName} sang Ngày ${lighterOtherDay.dayIndex} (${minuteClockLabel(targetStart)}) để Ngày ${dayIndex} không bị kẹt giờ.`,
        candidate: repackedMoved.candidate,
      });
    } else {
      const dropped = removeVisit(primaryRest.candidate, targetDropVisit.visitId);
      const repackedDropped = autoShiftDayVisits({
        candidate: dropped,
        dayIndex,
        startFromIndex: anchorIndex,
        legMetrics: input.baselinePreview.legs ?? [],
        lockedVisitIds: input.lockedVisitIds,
      });
      reliefBlueprints.push({
        title: `Phương án 2: Nghỉ đến ${minuteClockLabel(desiredAnchorStart)} + bỏ bớt ${dropName}`,
        summary: `Lược bỏ ${dropName} ở cuối Ngày ${dayIndex} để các điểm còn lại hoàn toàn hợp lệ trước giờ đóng cửa/hoàng hôn.`,
        candidate: repackedDropped.candidate,
      });
    }
  }

  const reliefSuggestions = await dryRunAdvisoryRemedies({
    blueprints: reliefBlueprints,
    baseCandidate: input.baseCandidate,
    savedShape: input.savedShape,
    baselineValidation: input.baselinePreview.validation,
    baselineSaveEligibility: input.baselinePreview.saveEligibility,
    baseWeatherAndSun: baselineWeatherAndSun,
    placeNames: input.placeNames,
    catalogById,
    runPreview: input.runPreview,
    timeReference: input.timeReference,
    maxSuggestions: 2,
  });

  // If user asked compound direct apply AND we have a clean non-destructive pass (trimmed durations without dropping/moving), apply it directly!
  const nonDestructiveTrim = reliefSuggestions.find(
    (c) =>
      c.diff.removed.length === 0 &&
      c.diff.updated.every((u) => u.before.dayIndex === u.after.dayIndex) &&
      deriveOverallStatus(c.validation, c.saveEligibility) === "PASS",
  );
  if (parsed.wantsDirectApply && nonDestructiveTrim) {
    return {
      kind: "APPLY_DIRECT",
      analysisSummary: `Nếu ${restLabel}, lịch cũ sẽ bị kẹt (${shiftedTraps.trappedDescriptions.slice(0, 2).join("; ")}). AI đã lùi giờ kết hợp rút ngắn nhẹ thời lượng trong ngưỡng tối thiểu để toàn Ngày ${dayIndex} đạt yêu cầu mà vẫn giữ đủ mọi điểm.`,
      suggestion: nonDestructiveTrim,
    };
  }

  const trapSummary =
    shiftedTraps.trappedDescriptions.length > 0
      ? shiftedTraps.trappedDescriptions.slice(0, 3).join("; ")
      : `một số điểm cuối Ngày ${dayIndex} không kịp khung giờ hợp lệ`;

  const scenarioFacts = buildVerifiedAdvisoryFacts({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    placeDetailsById: input.placeDetailsById,
    validation: input.baselinePreview.validation,
    legs: input.baselinePreview.legs ?? [],
    journeySummary: input.baselinePreview.journeySummary,
    saveEligibility: input.baselinePreview.saveEligibility,
    weatherAndSun: baselineWeatherAndSun,
    suggestions: reliefSuggestions,
    focusDayIndex: dayIndex,
    topic: input.topic,
  });

  const baseFallback = buildDeterministicAdvisoryFallback({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    validation: input.baselinePreview.validation,
    legs: input.baselinePreview.legs ?? [],
    journeySummary: input.baselinePreview.journeySummary,
    saveEligibility: input.baselinePreview.saveEligibility,
    uncheckedItems: input.baselinePreview.uncheckedItems,
    weatherAndSun: baselineWeatherAndSun,
    suggestions: reliefSuggestions,
    focusDayIndex: dayIndex,
    topic: input.topic,
  });

  const restSpecificFallback = [
    `Nếu ${restLabel} rồi dời dây chuyền các lượt Ngày ${dayIndex}, lịch sẽ gặp điểm nghẽn: ${trapSummary}.`,
    reliefSuggestions.length > 0
      ? `Mình đã mô phỏng ${reliefSuggestions.length} phương án tháo gỡ ngay bên dưới (${reliefSuggestions.map((s) => s.title).join(" hoặc ")}) để bạn bấm chọn 1 chạm vào bản nháp.`
      : baseFallback,
  ].join(" ");

  const knownIds = new Set(input.catalogDestinations.map((d) => d.id));
  const composed = await composeGroundedAdviceWithFallback({
    message: `${input.message}\n[Phân tích điểm nghẽn khi ${restLabel}: ${trapSummary}]`,
    facts: scenarioFacts,
    fallbackText: restSpecificFallback,
    knownDestinationIds: knownIds,
    llm: input.llm,
  });

  // Never let composed LLM text drop the concrete trapped-stop explanation if LLM omitted it
  const finalAdvice =
    shiftedTraps.trappedDescriptions.length > 0 &&
    !composed.includes("mở cửa") &&
    !composed.includes("hoàng hôn") &&
    !composed.includes("23:59") &&
    !composed.includes("trễ hạn") &&
    !composed.includes("kẹt")
      ? `${composed} (Chi tiết điểm bị ảnh hưởng: ${trapSummary}.)`
      : composed;

  return {
    kind: "ADVISED",
    advice: finalAdvice,
    suggestions: reliefSuggestions,
  };
}
