import type { Database } from "@KLTN/db";
import { createQaGenerator } from "../ai/qa-generation";
import { createQaRetriever } from "../ai/qa-retrieval";
import type { QaAnswer } from "../ai/qa-runtime-contract";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import {
  forecastStartDateFor,
  type ForecastOptions,
} from "../trip-weather/forecast";
import { computeSunTimes, formatMinute } from "../trip-weather/sun-times";
import {
  getTripWeather,
  type TripWeather,
  type TripWeatherRequest,
  type WeatherAdvisory,
} from "../trip-weather/trip-weather-service";
import type {
  AdviceTopic,
  AdvisoryCitation,
  AdvisoryKnowledgePart,
  AiChatHistoryTurn,
} from "./ai-workspace-plan";
import {
  replaceVisit,
  setVisitTime,
  type EditCandidate,
  type SavedTripForEdit,
} from "./edit-candidate";
import { minuteClockLabel } from "./edit-journey-helper";
import { autoShiftDayVisits } from "./edit-workspace-checks";
import {
  buildVerifiedAdvisoryFacts,
  composeGroundedAdviceWithFallback,
  dryRunAdvisoryRemedies,
  gatherWeatherAndSunDigest,
  type AdviceSuggestionCard,
  type AdvisoryCatalogDestination,
  type RemedyBlueprint,
  type RunPreviewFn,
} from "./saved-trip-advisory";
import { rankPublicDestinationOptions } from "./saved-trip-recommend";
import type { EditPlaceDetail, PreviewEditResult } from "./trip-edit-service";

export type SavedTripQaLookupFn = (input: {
  question: string;
  destinationId: string | null;
  destinationName: string | null;
  area: string | null;
  history: readonly AiChatHistoryTurn[];
}) => Promise<QaAnswer>;

export type ParsedInterleavedQa =
  | { kind: "NOT_APPLICABLE" }
  | { kind: "PROGRESS_QA"; dayIndex: number | null }
  | { kind: "WEATHER_QA"; dayIndex: number | null; targetDestinationId: string | null }
  | { kind: "KNOWLEDGE_QA"; dayIndex: number | null; targetDestinationId: string | null };

export type InterleavedQaResult =
  | { kind: "NOT_APPLICABLE" }
  | {
      kind: "ADVISED";
      advice: string;
      suggestions: AdviceSuggestionCard[];
      knowledgeParts?: AdvisoryKnowledgePart[];
      citations?: AdvisoryCitation[];
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

function ddMmYyyy(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

function addDaysIso(isoDate: string, offsetDays: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function vietnamClockMinute(now: Date): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(now);
  const match = /^(\d{2}):(\d{2})/u.exec(formatted);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function findMentionedDestinationId(
  foldedQuestion: string,
  catalogDestinations: readonly AdvisoryCatalogDestination[],
  placeNames: ReadonlyMap<string, string>,
  baseCandidate: EditCandidate,
): string | null {
  const inDraftFirst = baseCandidate.days
    .flatMap((d) => d.visits)
    .map((v) => v.destinationId);

  for (const destId of inDraftFirst) {
    const name = placeNames.get(destId);
    if (name && name !== "Điểm đến không còn khả dụng") {
      const f = foldVi(name);
      if (f.length >= 3 && foldedQuestion.includes(f)) return destId;
    }
  }
  for (const dest of catalogDestinations) {
    const f = foldVi(dest.name);
    if (f.length >= 3 && foldedQuestion.includes(f)) return dest.id;
  }
  return null;
}

export function parseInterleavedQaRequest(input: {
  message: string;
  mode: string;
  focusDayIndex: number | null;
  topic: AdviceTopic;
  baseCandidate: EditCandidate;
  catalogDestinations: readonly AdvisoryCatalogDestination[];
  placeNames: ReadonlyMap<string, string>;
}): ParsedInterleavedQa {
  if (input.mode === "APPLY_BATCH" || input.mode === "CHANGE_ORIGIN_CLOCKS") {
    return { kind: "NOT_APPLICABLE" };
  }

  const folded = foldVi(input.message);
  const dayMatch = /\bngay\s*(\d{1,2})\b/u.exec(folded);
  const explicitDay = dayMatch ? Number(dayMatch[1]) : null;
  const dayIndex =
    explicitDay && Number.isInteger(explicitDay) && explicitDay >= 1
      ? explicitDay
      : input.focusDayIndex;

  const targetDestinationId = findMentionedDestinationId(
    folded,
    input.catalogDestinations,
    input.placeNames,
    input.baseCandidate,
  );

  const normalizedNfc = input.message.normalize("NFC").toLowerCase();
  if (
    input.topic === "WEATHER_QA" ||
    /(?:\bthời\s*tiết\b|\bdự\s*báo\b|\bmưa\b|\bsương\s*mù\b|\bgió\s*mạnh\b|\bmặt\s*trời\b|\bhoàng\s*hôn\b|\bbình\s*minh\b|\bnắng\s*mưa\b)/iu.test(
      normalizedNfc,
    ) ||
    /\b(?:thoi tiet|du bao|co mua khong|troi mua|suong mu|gio manh|mat troi moc|mat troi lan|hoang hon|binh minh)\b/u.test(
      folded,
    )
  ) {
    return { kind: "WEATHER_QA", dayIndex, targetDestinationId };
  }

  if (
    input.topic === "PROGRESS_QA" ||
    /\b(?:tiep theo minh di dau|diem tiep theo|sap toi di dau|luot tiep theo|may gio xuat phat|hom nay con may diem|con bao nhieu diem|con may diem)\b/u.test(
      folded,
    )
  ) {
    return { kind: "PROGRESS_QA", dayIndex };
  }

  const looksLikeRestEditPlan =
    /(?:nghi\s+den|day\s+muon|xuat\s+phat\s+tre|chinh\s+sua|sua\s+giup|doi\s+lich)/u.test(
      folded,
    );

  if (
    input.topic === "KNOWLEDGE_QA" ||
    (!looksLikeRestEditPlan &&
      /\b(?:cau chuyen|lich su|van hoa|dac san|mon ngon|an sang o|khu nao tien|cho nao an|kinh nghiem|gioi thieu|tim hieu|co gi hay|co gi dac biet|phong tuc)\b/u.test(
        folded,
      ))
  ) {
    return { kind: "KNOWLEDGE_QA", dayIndex, targetDestinationId };
  }

  return { kind: "NOT_APPLICABLE" };
}

function answerProgressQuestion(input: {
  baseCandidate: EditCandidate;
  lockedVisitIds: ReadonlySet<string>;
  placeNames: ReadonlyMap<string, string>;
  placeDetailsById: ReadonlyMap<string, { isOutdoor?: boolean; availability?: string; external?: boolean }>;
  timeReference: Date;
  dayIndex: number | null;
}): InterleavedQaResult {
  const todayVn = vietnamDateOf(input.timeReference);
  const nowMin = vietnamClockMinute(input.timeReference);

  const matchingTodayDay = input.baseCandidate.startDate
    ? input.baseCandidate.days.find(
        (d) => tripDayDate(input.baseCandidate.startDate, d.dayIndex) === todayVn,
      )
    : undefined;

  const focusDay =
    (input.dayIndex ? input.baseCandidate.days.find((d) => d.dayIndex === input.dayIndex) : undefined) ??
    matchingTodayDay ??
    input.baseCandidate.days.find((d) => d.visits.some((v) => !input.lockedVisitIds.has(v.visitId))) ??
    input.baseCandidate.days[0];

  if (!focusDay) {
    return {
      kind: "ADVISED",
      advice: "Bản nháp hiện tại chưa có lượt tham quan nào được lên lịch.",
      suggestions: [],
    };
  }

  const allUncompleted = input.baseCandidate.days.flatMap((d) =>
    d.visits
      .filter((v) => !input.lockedVisitIds.has(v.visitId))
      .map((v) => ({ dayIndex: d.dayIndex, visit: v })),
  );

  if (allUncompleted.length === 0) {
    return {
      kind: "ADVISED",
      advice: "Các lượt tham quan trong bản nháp hiện tại đều đã qua giờ hoặc đã hoàn thành hết.",
      suggestions: [],
    };
  }

  const uncompletedInFocusDay = focusDay.visits.filter(
    (v) => !input.lockedVisitIds.has(v.visitId),
  );
  const nextEntry =
    uncompletedInFocusDay.length > 0
      ? { dayIndex: focusDay.dayIndex, visit: uncompletedInFocusDay[0]! }
      : allUncompleted[0]!;

  const nextName = input.placeNames.get(nextEntry.visit.destinationId) ?? "Điểm đến";
  const nextDate = tripDayDate(input.baseCandidate.startDate, nextEntry.dayIndex);
  const nextDateText = nextDate ? ` (${ddMmYyyy(nextDate)})` : "";
  const nextMeta = input.placeDetailsById.get(nextEntry.visit.destinationId);

  const parts: string[] = [
    `Tiếp theo bạn sẽ đi: **${nextName}** (Ngày ${nextEntry.dayIndex}${nextDateText}), dự kiến bắt đầu lúc **${minuteClockLabel(nextEntry.visit.startMinute)}** (thời lượng ${nextEntry.visit.plannedDurationMinutes} phút${nextMeta?.external ? ", điểm ngoài danh mục" : ""}).`,
  ];

  if (
    nextEntry.dayIndex === 1 &&
    input.baseCandidate.journey?.departureMinute != null &&
    !input.lockedVisitIds.has(nextEntry.visit.visitId) &&
    (matchingTodayDay?.dayIndex !== 1 || nowMin < input.baseCandidate.journey.departureMinute)
  ) {
    const dep = minuteClockLabel(input.baseCandidate.journey.departureMinute);
    parts.push(
      `Giờ xuất phát từ ${input.baseCandidate.journey.origin?.label ?? "nơi xuất phát"}: **${dep}**.`,
    );
  }

  const sameDayRemaining = input.baseCandidate.days
    .find((d) => d.dayIndex === nextEntry.dayIndex)
    ?.visits.filter((v) => !input.lockedVisitIds.has(v.visitId)) ?? [];
  if (sameDayRemaining.length > 1) {
    const restNames = sameDayRemaining
      .slice(1, 5)
      .map(
        (v) =>
          `${input.placeNames.get(v.destinationId) ?? "Điểm đến"} (${minuteClockLabel(v.startMinute)})`,
      )
      .join(", ");
    parts.push(
      `Trong Ngày ${nextEntry.dayIndex} còn tổng cộng ${sameDayRemaining.length} điểm chưa hoàn thành; các điểm tiếp theo gồm: ${restNames}.`,
    );
  } else {
    parts.push(`Đây cũng là điểm cuối cùng chưa hoàn thành trong Ngày ${nextEntry.dayIndex}.`);
  }

  return {
    kind: "ADVISED",
    advice: parts.join(" "),
    suggestions: [],
  };
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

async function answerWeatherQuestion(input: {
  message: string;
  dayIndex: number | null;
  targetDestinationId: string | null;
  baseCandidate: EditCandidate;
  savedShape: SavedTripForEdit & { manuallyCompletedAt?: Date | null };
  placeNames: ReadonlyMap<string, string>;
  placeDetailsById: ReadonlyMap<string, { isOutdoor?: boolean; availability?: string; external?: boolean }>;
  catalogById: ReadonlyMap<string, AdvisoryCatalogDestination>;
  eligibleDestinations: readonly AdvisoryCatalogDestination[];
  lockedVisitIds: ReadonlySet<string>;
  baselinePreview: PreviewEditResult;
  runPreview: RunPreviewFn;
  database: Pick<Database, "destination">;
  forecast?: ForecastOptions;
  timeReference: Date;
}): Promise<InterleavedQaResult> {
  const folded = foldVi(input.message);
  const todayVn = vietnamDateOf(input.timeReference);
  const tomorrowVn = addDaysIso(todayVn, 1);

  let resolvedDayIndex = input.dayIndex;
  if (!resolvedDayIndex && input.targetDestinationId) {
    const dayWithStop = input.baseCandidate.days.find((d) =>
      d.visits.some((v) => v.destinationId === input.targetDestinationId),
    );
    if (dayWithStop) resolvedDayIndex = dayWithStop.dayIndex;
  }
  if (!resolvedDayIndex && /\bngay\s+mai\b/u.test(folded) && input.baseCandidate.startDate) {
    const matchTomorrow = input.baseCandidate.days.find(
      (d) => tripDayDate(input.baseCandidate.startDate, d.dayIndex) === tomorrowVn,
    );
    if (matchTomorrow) resolvedDayIndex = matchTomorrow.dayIndex;
  }
  if (!resolvedDayIndex && /\bhom\s+nay\b/u.test(folded) && input.baseCandidate.startDate) {
    const matchToday = input.baseCandidate.days.find(
      (d) => tripDayDate(input.baseCandidate.startDate, d.dayIndex) === todayVn,
    );
    if (matchToday) resolvedDayIndex = matchToday.dayIndex;
  }
  resolvedDayIndex ??= input.baseCandidate.days[0]?.dayIndex ?? 1;

  const targetDay =
    input.baseCandidate.days.find((d) => d.dayIndex === resolvedDayIndex) ??
    input.baseCandidate.days[0];
  if (!targetDay) {
    return { kind: "NOT_APPLICABLE" };
  }

  const localDate = tripDayDate(input.baseCandidate.startDate, targetDay.dayIndex);
  const targetStopCoord =
    (input.targetDestinationId ? input.catalogById.get(input.targetDestinationId) : undefined) ??
    targetDay.visits
      .map((v) => input.catalogById.get(v.destinationId))
      .find((d) => typeof d?.latitude === "number" && typeof d?.longitude === "number") ??
    [...input.catalogById.values()].find(
      (d) => typeof d.latitude === "number" && typeof d.longitude === "number",
    );

  const sunTimes =
    localDate &&
    targetStopCoord &&
    typeof targetStopCoord.latitude === "number" &&
    typeof targetStopCoord.longitude === "number"
      ? computeSunTimes(targetStopCoord.latitude, targetStopCoord.longitude, localDate)
      : null;

  const sunText = sunTimes
    ? `Giờ mặt trời Ngày ${targetDay.dayIndex}${localDate ? ` (${ddMmYyyy(localDate)})` : ""}: mọc lúc ${sunTimes.sunriseMinute !== null ? formatMinute(sunTimes.sunriseMinute) : "--:--"}, lặn (hoàng hôn) lúc **${sunTimes.sunsetMinute !== null ? formatMinute(sunTimes.sunsetMinute) : "--:--"}**.`
    : "";

  if (!localDate) {
    return {
      kind: "ADVISED",
      advice: "Chuyến đi chưa có ngày bắt đầu nên chưa thể tra dự báo thời tiết hay giờ mặt trời theo ngày cụ thể.",
      suggestions: [],
    };
  }

  const availableFrom = forecastStartDateFor(localDate);
  if (availableFrom > todayVn) {
    const parts = [
      `Ngày ${targetDay.dayIndex} (${ddMmYyyy(localDate)}) hiện nằm ngoài tầm dự báo 16 ngày của Open-Meteo: **Chưa có dự báo, sẽ có từ ngày ${ddMmYyyy(availableFrom)}**.`,
    ];
    if (sunText) parts.push(sunText);
    parts.push("Lưu ý (ADR-36): dữ liệu thời tiết chỉ mang tính tham khảo, không phải lỗi kiểm tra tính hợp lệ.");
    return {
      kind: "ADVISED",
      advice: parts.join(" "),
      suggestions: [],
    };
  }

  let liveWeather: TripWeather | null = null;
  const shouldFetch = Boolean(input.forecast) || process.env.VITEST !== "true";
  const reqStops = targetDay.visits
    .filter((v) => input.catalogById.has(v.destinationId))
    .slice(0, 6)
    .map((v) => ({
      destinationId: v.destinationId,
      arrivalMinute: v.startMinute,
      departureMinute: Math.min(1440, v.startMinute + v.plannedDurationMinutes),
    }));
  if (reqStops.length === 0 && targetStopCoord) {
    reqStops.push({
      destinationId: targetStopCoord.id,
      arrivalMinute: 480,
      departureMinute: 1080,
    });
  }

  if (shouldFetch && reqStops.length > 0 && targetDay.dayIndex <= 14) {
    const weatherReq: TripWeatherRequest = {
      days: [{ day: targetDay.dayIndex, date: localDate, stops: reqStops }],
      legs: [],
    };
    try {
      liveWeather = await getTripWeather(weatherReq, {
        database: input.database,
        forecast: {
          now: () => input.timeReference,
          timeoutMs: 3000,
          ...input.forecast,
        },
      });
    } catch {
      liveWeather = null;
    }
  }

  const dayWeather = liveWeather?.days.find((d) => d.day === targetDay.dayIndex);
  const advisories: WeatherAdvisory[] = liveWeather?.advisories.filter((a) => a.day === targetDay.dayIndex) ?? [];

  const focusVisit =
    (input.targetDestinationId
      ? targetDay.visits.find((v) => v.destinationId === input.targetDestinationId)
      : undefined) ?? targetDay.visits[0];
  const focusVisitWeather = focusVisit
    ? dayWeather?.visits.find((v) => v.destinationId === focusVisit.destinationId)
    : undefined;

  const lines: string[] = [];
  if (focusVisitWeather?.weather.status === "AVAILABLE") {
    const s = focusVisitWeather.weather.summary;
    const stopName = input.placeNames.get(focusVisit!.destinationId) ?? "điểm dừng";
    const temp =
      s.minTemperatureC !== null && s.maxTemperatureC !== null
        ? `${Math.round(s.minTemperatureC)}–${Math.round(s.maxTemperatureC)}°C`
        : "chưa rõ nhiệt độ";
    const rain = s.maxPrecipitationProbability !== null ? `xác suất mưa tối đa ${Math.round(s.maxPrecipitationProbability)}%` : "";
    const mm = s.maxPrecipitationMm !== null && s.maxPrecipitationMm > 0 ? ` (~${s.maxPrecipitationMm.toFixed(1)} mm/h)` : "";
    const vis = s.minVisibilityM !== null ? `tầm nhìn ~${(s.minVisibilityM / 1000).toFixed(1)} km` : "";
    const wind = s.maxWindGustKmh !== null ? `gió giật ~${Math.round(s.maxWindGustKmh)} km/h` : "";
    lines.push(
      `Thời tiết lúc có mặt tại **${stopName}** (Ngày ${targetDay.dayIndex} · ${ddMmYyyy(localDate)}, ${minuteClockLabel(focusVisit!.startMinute)}–${minuteClockLabel(focusVisit!.startMinute + focusVisit!.plannedDurationMinutes)}): ${[temp, `${rain}${mm}`, vis, wind].filter(Boolean).join(", ")}.`,
    );
  } else if (dayWeather?.visits[0]?.weather.status === "NOT_YET_AVAILABLE") {
    lines.push(
      `Chưa có dự báo, sẽ có từ ngày ${ddMmYyyy(dayWeather.visits[0].weather.availableFrom)}.`,
    );
  } else {
    lines.push(
      `Dự báo cho Ngày ${targetDay.dayIndex} (${ddMmYyyy(localDate)}) hiện chưa lấy được dữ liệu chi tiết theo giờ từ Open-Meteo.`,
    );
  }

  if (sunText) lines.push(sunText);

  const weatherDigest = await gatherWeatherAndSunDigest({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    catalogById: input.catalogById,
    database: input.database,
    forecast: input.forecast,
    now: input.timeReference,
  });

  // Build helpful weather / after-sunset adjustment cards when risk advisories exist
  const blueprints: RemedyBlueprint[] = [];
  const affectedOutdoorVisit =
    targetDay.visits.find(
      (v) =>
        !input.lockedVisitIds.has(v.visitId) &&
        advisories.some(
          (a) =>
            a.location.type === "VISIT" &&
            a.location.destinationId === v.destinationId &&
            (a.kind === "AFTER_SUNSET" || a.kind === "RAIN" || a.kind === "FOG" || a.kind === "WIND"),
        ),
    ) ??
    targetDay.visits.find((v) => {
      if (input.lockedVisitIds.has(v.visitId)) return false;
      const dest = input.catalogById.get(v.destinationId);
      if (!dest?.isOutdoor || sunTimes?.sunsetMinute == null) return false;
      return v.startMinute + v.plannedDurationMinutes > sunTimes.sunsetMinute;
    });

  if (affectedOutdoorVisit && sunTimes?.sunsetMinute != null) {
    const affectedName = input.placeNames.get(affectedOutdoorVisit.destinationId) ?? "điểm ngoài trời";
    const endMinute = affectedOutdoorVisit.startMinute + affectedOutdoorVisit.plannedDurationMinutes;
    if (endMinute > sunTimes.sunsetMinute) {
      const targetStart = Math.max(450, sunTimes.sunsetMinute - affectedOutdoorVisit.plannedDurationMinutes - 15);
      if (targetStart < affectedOutdoorVisit.startMinute) {
        const idx = targetDay.visits.findIndex((v) => v.visitId === affectedOutdoorVisit.visitId);
        let earlier = setVisitTime(input.baseCandidate, affectedOutdoorVisit.visitId, targetStart);
        const shifted = autoShiftDayVisits({
          candidate: earlier,
          dayIndex: targetDay.dayIndex,
          startFromIndex: Math.max(0, idx),
          legMetrics: input.baselinePreview.legs ?? [],
          lockedVisitIds: input.lockedVisitIds,
        });
        earlier = shifted.candidate;
        blueprints.push({
          title: `Đẩy sớm ${affectedName} lên ${minuteClockLabel(targetStart)} để xong trước hoàng hôn (${formatMinute(sunTimes.sunsetMinute)})`,
          summary: "Tránh tham quan điểm ngoài trời sau khi trời tối.",
          candidate: earlier,
        });
      }
    }

    const indoorSwaps = rankPublicDestinationOptions({
      eligibleDestinations: input.eligibleDestinations.filter((d) => d.isOutdoor === false),
      baseCandidate: input.baseCandidate,
      preferredAreas: [input.catalogById.get(affectedOutdoorVisit.destinationId)?.area ?? ""].filter(Boolean),
      targetDayIndex: targetDay.dayIndex,
      slotStartMinute: affectedOutdoorVisit.startMinute,
      weatherDigest: weatherDigest.find((d) => d.dayIndex === targetDay.dayIndex),
      message: input.message,
    });
    const bestIndoor = indoorSwaps[0]?.destination;
    if (bestIndoor) {
      const dur = Math.max(30, bestIndoor.suggestedDurationMinutes ?? bestIndoor.minimumDurationMinutes ?? 60);
      const swapped = replaceVisit(input.baseCandidate, affectedOutdoorVisit.visitId, {
        destinationId: bestIndoor.id,
        startMinute: affectedOutdoorVisit.startMinute,
        plannedDurationMinutes: dur,
      });
      blueprints.push({
        title: `Đổi ${affectedName} sang điểm trong nhà ${bestIndoor.name}`,
        summary: `Phù hợp khi thời tiết Ngày ${targetDay.dayIndex} bất lợi hoặc vào khung giờ muộn.`,
        candidate: swapped,
        addedPlaceDetails: { [bestIndoor.id]: toAddedPlaceDetail(bestIndoor) },
      });
    }
  }

  const hasAfterSunset =
    advisories.some((a) => a.kind === "AFTER_SUNSET") ||
    (weatherDigest.find((d) => d.dayIndex === targetDay.dayIndex)?.afterSunsetOutdoorVisits.length ?? 0) > 0;
  const hasWeatherAlert = advisories.some((a) => a.kind !== "AFTER_SUNSET");

  if (hasAfterSunset) {
    lines.push(
      `Cảnh báo sau hoàng hôn: có điểm ngoài trời dự kiến kết thúc sau ${formatMinute(sunTimes!.sunsetMinute!)}, bạn cân nhắc đẩy sớm giờ hoặc đổi sang điểm trong nhà.`,
    );
  }
  if (hasWeatherAlert) {
    const alertLabels = advisories
      .filter((a) => a.kind !== "AFTER_SUNSET")
      .slice(0, 2)
      .map((a) =>
        a.kind === "RAIN"
          ? `mưa (${Math.round(a.observed)}${a.threshold < 10 ? " mm/h" : "%"})`
          : a.kind === "FOG"
            ? `sương mù (tầm nhìn ${(a.observed / 1000).toFixed(1)} km)`
            : `gió giật (${Math.round(a.observed)} km/h)`,
      )
      .join(", ");
    lines.push(`Cảnh báo thời tiết: ${alertLabels}.`);
  }

  lines.push(
    "Lưu ý (ADR-36): thông tin thời tiết chỉ mang tính tham khảo, không phải lỗi kiểm tra tính hợp lệ, không chặn lưu và không đưa ra cam kết đảm bảo an toàn tuyệt đối.",
  );

  const suggestions = blueprints.length > 0
    ? await dryRunAdvisoryRemedies({
        blueprints,
        baseCandidate: input.baseCandidate,
        savedShape: input.savedShape,
        baselineValidation: input.baselinePreview.validation,
        baselineSaveEligibility: input.baselinePreview.saveEligibility,
        baseWeatherAndSun: weatherDigest,
        placeNames: input.placeNames,
        catalogById: input.catalogById,
        runPreview: input.runPreview,
        timeReference: input.timeReference,
        maxSuggestions: 2,
      })
    : [];

  return {
    kind: "ADVISED",
    advice: lines.join(" "),
    suggestions,
  };
}

function scrubUnverifiedPricesOrHoursFromExpanded(text: string): string {
  // Never invent ticket prices or unverified opening hours inside EXPANDED prose
  let safe = text.normalize("NFC").trim();
  if (/\b\d[\d.,]*\s*(?:k|000\s*đ|vnđ|vnd|đồng)\b/iu.test(safe)) {
    safe = `${safe.replace(/\b\d[\d.,]*\s*(?:k|000\s*đ|vnđ|vnd|đồng)\b/giu, "(mức giá cần kiểm tra thực tế)")}`;
  }
  return safe;
}

export async function answerLocalKnowledgeQuestion(input: {
  message: string;
  targetDestinationId: string | null;
  history: readonly AiChatHistoryTurn[];
  baseCandidate: EditCandidate;
  placeNames: ReadonlyMap<string, string>;
  placeDetailsById: ReadonlyMap<string, { isOutdoor?: boolean; availability?: string; external?: boolean }>;
  catalogDestinations: readonly AdvisoryCatalogDestination[];
  baselinePreview: PreviewEditResult;
  database: Database;
  llm: StructuredLlmClient;
  qaLookup?: SavedTripQaLookupFn;
  timeReference: Date;
}): Promise<InterleavedQaResult> {
  const targetDest = input.targetDestinationId
    ? input.catalogDestinations.find((d) => d.id === input.targetDestinationId)
    : undefined;

  let qaAnswer: QaAnswer | null = null;
  if (input.qaLookup) {
    try {
      qaAnswer = await input.qaLookup({
        question: input.message,
        destinationId: targetDest?.id ?? null,
        destinationName: targetDest?.name ?? null,
        area: targetDest?.area ?? null,
        history: input.history,
      });
    } catch {
      qaAnswer = null;
    }
  } else if (process.env.VITEST !== "true" && process.env.OPENAI_API_KEY) {
    try {
      const retriever = createQaRetriever(input.database, {
        topK: 4,
        maxEvidenceTokens: 3000,
        hybrid: true,
      });
      const context = targetDest
        ? {
            type: "DESTINATION" as const,
            destinationId: targetDest.id,
            name: targetDest.name,
            area: targetDest.area ?? "",
          }
        : { type: "GENERAL" as const };
      const evidence = await retriever.retrieve(input.message, [], undefined, context);
      if (evidence.length > 0) {
        const generator = createQaGenerator();
        qaAnswer = await generator.generate({
          question: input.message,
          history: [],
          evidence,
          context,
          knowledgeMode: "EXPANDED",
        });
      }
    } catch {
      qaAnswer = null;
    }
  }

  if (qaAnswer && (qaAnswer.status === "ANSWERED" || qaAnswer.status === "PARTIAL")) {
    const validCitationIds = new Set(qaAnswer.citations.map((c) => c.id));
    const parts: AdvisoryKnowledgePart[] = qaAnswer.answerParts.map((part) => {
      const isExpanded = part.mode === "EXPANDED";
      return {
        text: isExpanded ? scrubUnverifiedPricesOrHoursFromExpanded(part.text) : part.text.normalize("NFC").trim(),
        mode: isExpanded ? "EXPANDED" : "SOURCE",
        // Enforce strict separation: EXPANDED carries zero citations, SOURCE only carries real citations
        citationIds: isExpanded ? [] : part.citationIds.filter((id) => validCitationIds.has(id)),
      };
    });
    const usedCitationIds = new Set(parts.flatMap((p) => p.citationIds));
    const citations: AdvisoryCitation[] = qaAnswer.citations
      .filter((c) => usedCitationIds.has(c.id))
      .map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        title: c.title,
        sourceUrl: c.sourceUrl,
        locators: c.locators.map((loc) => ({
          ...(loc.pageNumber !== undefined ? { pageNumber: loc.pageNumber } : {}),
          ...(loc.section !== undefined ? { section: loc.section } : {}),
        })),
      }));

    const combinedAdvice = parts
      .map((p) => (p.mode === "EXPANDED" ? `[Kiến thức mở rộng] ${p.text}` : p.text))
      .join(" ");

    return {
      kind: "ADVISED",
      advice: combinedAdvice,
      suggestions: [],
      knowledgeParts: parts,
      citations,
    };
  }

  // Model fallback clearly labeled as Kiến thức mở rộng (zero fabricated citations/prices/opening hours)
  const catalogById = new Map(input.catalogDestinations.map((d) => [d.id, d]));
  const weatherDigest = await gatherWeatherAndSunDigest({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    catalogById,
    database: input.database,
    now: input.timeReference,
  });
  const facts = buildVerifiedAdvisoryFacts({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    placeDetailsById: input.placeDetailsById,
    validation: input.baselinePreview.validation,
    legs: input.baselinePreview.legs ?? [],
    journeySummary: input.baselinePreview.journeySummary,
    saveEligibility: input.baselinePreview.saveEligibility,
    weatherAndSun: weatherDigest,
    suggestions: [],
    focusDayIndex: null,
    topic: "KNOWLEDGE_QA",
  });

  const subjectName =
    targetDest?.name ??
    (input.baseCandidate.days[0]?.visits[0]
      ? input.placeNames.get(input.baseCandidate.days[0].visits[0].destinationId)
      : null) ??
    "Hà Giang";

  const deterministicExpanded =
    `Kinh nghiệm tham khảo cho câu hỏi về ${subjectName}: chưa tìm thấy đoạn trích tài liệu đã duyệt trực tiếp cho chi tiết này. Khi di chuyển tại địa phương, bạn nên ưu tiên các quán ăn hoặc điểm dừng gần trung tâm khu vực trong lịch trình; giá dịch vụ, giá vé và giờ mở cửa cụ thể cần kiểm tra lại thực tế trước khi ghé.`;

  const expandedText = await composeGroundedAdviceWithFallback({
    message: `${input.message}\n[Chế độ Kiến thức mở rộng — giải đáp văn hóa/địa phương ngắn gọn về ${subjectName}, KHÔNG bịa giá vé, giờ mở cửa hay trích dẫn nguồn]`,
    facts,
    fallbackText: deterministicExpanded,
    knownDestinationIds: new Set(input.catalogDestinations.map((d) => d.id)),
    llm: input.llm,
  });

  const cleanedText = scrubUnverifiedPricesOrHoursFromExpanded(expandedText);
  return {
    kind: "ADVISED",
    advice: `[Kiến thức mở rộng] ${cleanedText}`,
    suggestions: [],
    knowledgeParts: [{ text: cleanedText, mode: "EXPANDED", citationIds: [] }],
    citations: [],
  };
}

export async function runInterleavedQaScenario(input: {
  message: string;
  mode: string;
  tripStatus?: "UPCOMING" | "ONGOING" | "COMPLETED";
  history: readonly AiChatHistoryTurn[];
  baseCandidate: EditCandidate;
  savedShape: SavedTripForEdit & { manuallyCompletedAt?: Date | null };
  placeNames: ReadonlyMap<string, string>;
  placeDetailsById: ReadonlyMap<string, { isOutdoor?: boolean; availability?: string; external?: boolean }>;
  eligibleDestinations: readonly AdvisoryCatalogDestination[];
  allCatalogDestinations: readonly AdvisoryCatalogDestination[];
  lockedVisitIds: ReadonlySet<string>;
  baselinePreview: PreviewEditResult;
  runPreview: RunPreviewFn;
  database: Database;
  llm: StructuredLlmClient;
  forecast?: ForecastOptions;
  qaLookup?: SavedTripQaLookupFn;
  focusDayIndex: number | null;
  topic: AdviceTopic;
  timeReference: Date;
}): Promise<InterleavedQaResult> {
  const parsed = parseInterleavedQaRequest({
    message: input.message,
    mode: input.mode,
    focusDayIndex: input.focusDayIndex,
    topic: input.topic,
    baseCandidate: input.baseCandidate,
    catalogDestinations: input.allCatalogDestinations,
    placeNames: input.placeNames,
  });

  if (parsed.kind === "NOT_APPLICABLE") {
    return { kind: "NOT_APPLICABLE" };
  }

  if (parsed.kind === "PROGRESS_QA") {
    // For UPCOMING trips that haven't started yet, hand off to grounded two-step advisory
    // so the assistant answers naturally about the planned departure/itinerary without
    // saying "tiếp theo bạn sẽ đi" or "chưa hoàn thành".
    if (input.tripStatus === "UPCOMING" && input.lockedVisitIds.size === 0) {
      return { kind: "NOT_APPLICABLE" };
    }
    return answerProgressQuestion({
      baseCandidate: input.baseCandidate,
      lockedVisitIds: input.lockedVisitIds,
      placeNames: input.placeNames,
      placeDetailsById: input.placeDetailsById,
      timeReference: input.timeReference,
      dayIndex: parsed.dayIndex,
    });
  }

  const catalogById = new Map(input.allCatalogDestinations.map((d) => [d.id, d]));

  if (parsed.kind === "WEATHER_QA") {
    return answerWeatherQuestion({
      message: input.message,
      dayIndex: parsed.dayIndex,
      targetDestinationId: parsed.targetDestinationId,
      baseCandidate: input.baseCandidate,
      savedShape: input.savedShape,
      placeNames: input.placeNames,
      placeDetailsById: input.placeDetailsById,
      catalogById,
      eligibleDestinations: input.eligibleDestinations,
      lockedVisitIds: input.lockedVisitIds,
      baselinePreview: input.baselinePreview,
      runPreview: input.runPreview,
      database: input.database,
      forecast: input.forecast,
      timeReference: input.timeReference,
    });
  }

  return answerLocalKnowledgeQuestion({
    message: input.message,
    targetDestinationId: parsed.targetDestinationId,
    history: input.history,
    baseCandidate: input.baseCandidate,
    placeNames: input.placeNames,
    placeDetailsById: input.placeDetailsById,
    catalogDestinations: input.allCatalogDestinations,
    baselinePreview: input.baselinePreview,
    database: input.database,
    llm: input.llm,
    qaLookup: input.qaLookup,
    timeReference: input.timeReference,
  });
}
