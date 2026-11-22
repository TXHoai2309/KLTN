import "server-only";
import { z } from "zod";
import type { Database } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { resolvePlanningDestinationName } from "@/modules/assistant-planning/planning-ai";
import { visibleDestinationWhere } from "@/modules/destination/destination-eligibility";
import { getPublicDestination } from "@/modules/destination/public-destination-service";
import {
  getDestinationWeather,
  type DestinationWeather,
} from "@/modules/trip-weather/destination-weather-service";
import { summarizeDays, type DaySummary } from "@/modules/trip-weather/forecast";
import { formatMinute, type SunTimes } from "@/modules/trip-weather/sun-times";
import type { QaDestinationChoice } from "./qa-contract";
import type { QaResolvedContext } from "./qa-destination-context";
import { createQaJsonProvider, type QaProviderOptions } from "./qa-json-provider";
import { foldVi, KNOWN_DESTINATIONS, matchKnownDestinations, needsHistory, QA_FOLLOWUP_CLARIFICATIONS, type QaQuestionUnderstanding } from "./qa-question-understanding";
import type { QaAnswer } from "./qa-runtime-contract";
import { validateWeatherDate } from "./qa-weather-date";

export type WeatherDestinationCandidate = {
  id: string;
  name: string;
  area: string;
};

export type WeatherLeadInFacts = {
  destinationName: string;
  date: string;
  representative: boolean;
  sunTimes: SunTimes;
  daySummary: DaySummary | null;
};

export type QaWeatherLeadInComposer = (
  facts: WeatherLeadInFacts,
  question: string,
  signal?: AbortSignal,
) => Promise<string>;

export type QaWeatherDependencies = {
  listVisibleDestinations: () => Promise<readonly WeatherDestinationCandidate[]>;
  checkDestinationVisible?: (id: string) => Promise<{ id: string; name: string }>;
  getDestinationWeather: (id: string, date: string, signal?: AbortSignal) => Promise<DestinationWeather>;
  composeLeadIn?: QaWeatherLeadInComposer;
  representativeDestinationId?: string;
  now?: () => Date;
};

export const QA_WEATHER_DATE_CLARIFICATION =
  "Bạn muốn xem dự báo thời tiết cho ngày cụ thể nào (từ hôm nay trong vòng 16 ngày tới)?";

export const QA_WEATHER_NOT_FOUND_MESSAGE =
  "Mình chưa tìm thấy điểm đó ở Hà Giang. Bạn kiểm tra lại tên điểm đến muốn xem thời tiết nhé?";

export const QA_WEATHER_REPRESENTATIVE_UNAVAILABLE_MESSAGE =
  "Hiện chưa có điểm đại diện công khai cho thành phố Hà Giang; bạn nêu tên một điểm đến cụ thể ở Hà Giang để mình xem dự báo nhé?";

export const QA_WEATHER_PROVIDER_UNAVAILABLE_LEAD_IN =
  "Hiện không lấy được dự báo thời tiết lúc này (đây không phải là trời đẹp); bạn xem giờ mặt trời bên dưới hoặc thử lại sau nhé.";

const HA_GIANG_CITY_PATTERNS = [
  /\bthanh pho ha giang\b/u,
  /\btp\s*ha giang\b/u,
  /\bcot moc so 0\b/u,
  /\bkm\s*0\b/u,
  /\bquang truong 26\s*3\b/u,
  /\bha thanh\b/u,
  /\bphuong do\b/u,
];

const VERDICT_PATTERNS = [
  /\b(?:khong\s+|chua\s+|chang\s+)?nen\s+(?:di|khoi\s+hanh|len\s+duong|ghe|tham\s+quan|hoan|huy|doi\s+ngay|chon\s+ngay|xuat\s+phat)\b/u,
  /\b(?:dung|cho)\s+(?:di|khoi\s+hanh|len\s+duong|ghe|tham\s+quan)\b/u,
  /\b(?:hoan|huy)\s+(?:chuyen|lich|ke\s+hoach)\b/u,
  /\b(?:khuyen\s+ban|tot\s+nhat\s+la|an\s+toan\s+de\s+di|ly\s+tuong\s+de\s+di|rat\s+thich\s+hop\s+de\s+di|khong\s+thich\s+hop\s+de\s+di|nguy\s+hiem\s+khong\s+nen)\b/u,
];

function cleanSearchToken(value: string): string {
  return foldVi(value.toLocaleLowerCase("vi")).replace(/[^a-z0-9 ]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function containsWholePhrase(haystackClean: string, needleClean: string): boolean {
  if (!haystackClean || !needleClean) return false;
  return (` ${haystackClean} `).includes(` ${needleClean} `);
}

function isProvinceGenericSubject(subject: string): boolean {
  const token = cleanSearchToken(subject);
  return token === "ha giang" || token === "tinh ha giang" || token === "cao nguyen ha giang";
}

function matchCandidatesByName(
  subject: string,
  visible: readonly WeatherDestinationCandidate[],
): WeatherDestinationCandidate[] {
  const asPlannerShape = visible.map(item => ({
    ...item,
    visibility: "VISIBLE" as const,
  })) as unknown as Parameters<typeof resolvePlanningDestinationName>[1];

  const direct = resolvePlanningDestinationName(subject, asPlannerShape);
  if (direct.length > 0) {
    const ids = new Set(direct.map(d => d.id));
    return visible.filter(v => ids.has(v.id));
  }

  // Also strip optional "[TEST]" prefix when checking exact match
  const query = cleanSearchToken(subject);
  if (!query) return [];
  const strippedExact = visible.filter(v => {
    const cleaned = cleanSearchToken(v.name.replace(/^\[test\]\s*/iu, ""));
    return cleaned === query;
  });
  if (strippedExact.length > 0) return strippedExact;

  const known = matchKnownDestinations(subject);
  if (known.length === 1) {
    const canonical = known[0]!;
    const canonicalDirect = resolvePlanningDestinationName(canonical, asPlannerShape);
    const ids = new Set(canonicalDirect.map(d => d.id));
    return visible.filter(v => ids.has(v.id) || matchKnownDestinations(v.name).includes(canonical));
  }
  return [];
}

function pickRepresentativeDestination(
  visible: readonly WeatherDestinationCandidate[],
  representativeDestinationId?: string,
): WeatherDestinationCandidate | null {
  if (representativeDestinationId) {
    const explicit = visible.find(v => v.id === representativeDestinationId);
    if (explicit) return explicit;
  }
  for (const pattern of HA_GIANG_CITY_PATTERNS) {
    const byName = visible.find(v => pattern.test(cleanSearchToken(v.name)));
    if (byName) return byName;
  }
  for (const pattern of HA_GIANG_CITY_PATTERNS) {
    const byArea = visible.find(v => pattern.test(cleanSearchToken(v.area)));
    if (byArea) return byArea;
  }
  return null;
}

export type WeatherDestinationResolution =
  | { kind: "RESOLVED"; destination: { id: string; name: string }; representative: boolean }
  | { kind: "AMBIGUOUS"; choices: QaDestinationChoice[] }
  | { kind: "NOT_FOUND" }
  | { kind: "REPRESENTATIVE_UNAVAILABLE" };

export function resolveWeatherDestination(input: {
  context: QaResolvedContext;
  understanding: QaQuestionUnderstanding;
  visibleDestinations: readonly WeatherDestinationCandidate[];
  representativeDestinationId?: string;
  question?: string;
}): WeatherDestinationResolution {
  const { context, understanding, visibleDestinations, representativeDestinationId, question } = input;

  if (context.type === "DESTINATION") {
    return {
      kind: "RESOLVED",
      destination: { id: context.destinationId, name: context.name },
      representative: false,
    };
  }

  const choiceTailMatch = question?.match(/(?:—|--)\s*tại\s+([^?]+)\?\s*$/iu);
  if (choiceTailMatch?.[1]) {
    const rawTail = choiceTailMatch[1].trim();
    const tailClean = cleanSearchToken(rawTail.replace(/^\[test\]\s*/iu, ""));
    const exactTail = visibleDestinations.filter(
      v =>
        cleanSearchToken(v.name) === cleanSearchToken(rawTail) ||
        cleanSearchToken(v.name.replace(/^\[test\]\s*/iu, "")) === tailClean,
    );
    if (exactTail.length === 1) {
      return {
        kind: "RESOLVED",
        destination: { id: exactTail[0]!.id, name: exactTail[0]!.name },
        representative: false,
      };
    }
  }

  const questionClean = question ? cleanSearchToken(question) : "";
  if (questionClean) {
    const explicitFullMatches = visibleDestinations.filter(v => {
      const nameClean = cleanSearchToken(v.name.replace(/^\[test\]\s*/iu, ""));
      return nameClean.length >= 4 && !isProvinceGenericSubject(nameClean) && containsWholePhrase(questionClean, nameClean);
    });
    if (explicitFullMatches.length > 0) {
      const nonDominated = explicitFullMatches.filter(candidate => {
        const candidateClean = cleanSearchToken(candidate.name.replace(/^\[test\]\s*/iu, ""));
        return !explicitFullMatches.some(other => {
          if (other.id === candidate.id) return false;
          const otherClean = cleanSearchToken(other.name.replace(/^\[test\]\s*/iu, ""));
          return otherClean.length > candidateClean.length && containsWholePhrase(otherClean, candidateClean);
        });
      });
      if (nonDominated.length === 1) {
        return {
          kind: "RESOLVED",
          destination: { id: nonDominated[0]!.id, name: nonDominated[0]!.name },
          representative: false,
        };
      }
      if (nonDominated.length > 1) {
        return {
          kind: "AMBIGUOUS",
          choices: nonDominated.slice(0, 3).map(m => ({ id: m.id, name: m.name })),
        };
      }
    }
  }

  const specificSubjects = understanding.targetSubjects
    .map(s => s.trim())
    .filter(s => s.length > 0 && !isProvinceGenericSubject(s));

  if (specificSubjects.length === 0) {
    const rep = pickRepresentativeDestination(visibleDestinations, representativeDestinationId);
    if (!rep) return { kind: "REPRESENTATIVE_UNAVAILABLE" };
    return { kind: "RESOLVED", destination: { id: rep.id, name: rep.name }, representative: true };
  }

  const matchedMap = new Map<string, WeatherDestinationCandidate>();
  for (const subject of specificSubjects) {
    for (const item of matchCandidatesByName(subject, visibleDestinations)) {
      matchedMap.set(item.id, item);
    }
    if (questionClean && !containsWholePhrase(questionClean, cleanSearchToken(subject))) {
      const knownEntry = KNOWN_DESTINATIONS.find(entry => cleanSearchToken(entry.canonical) === cleanSearchToken(subject));
      if (knownEntry) {
        for (const alias of knownEntry.aliases) {
          if (containsWholePhrase(questionClean, cleanSearchToken(alias))) {
            for (const item of matchCandidatesByName(alias, visibleDestinations)) {
              matchedMap.set(item.id, item);
            }
          }
        }
      }
    }
  }
  const matches = [...matchedMap.values()];

  if (matches.length === 0) {
    return { kind: "NOT_FOUND" };
  }
  if (matches.length === 1) {
    const chosen = matches[0]!;
    return {
      kind: "RESOLVED",
      destination: { id: chosen.id, name: chosen.name },
      representative: false,
    };
  }
  return {
    kind: "AMBIGUOUS",
    choices: matches.slice(0, 3).map(m => ({ id: m.id, name: m.name })),
  };
}

export function fixedWeatherLeadIn(facts: Pick<WeatherLeadInFacts, "destinationName" | "date" | "representative">): string {
  if (facts.representative) {
    return `Dưới đây là dự báo thời tiết và giờ mặt trời ngày ${facts.date}, lấy theo điểm đại diện ${facts.destinationName} cho Hà Giang (chỉ để tham khảo):`;
  }
  return `Dưới đây là dự báo thời tiết và giờ mặt trời tại ${facts.destinationName} ngày ${facts.date} (chỉ để tham khảo):`;
}

export function notYetAvailableLeadIn(availableFrom: string): string {
  return `Chưa có dự báo, sẽ có từ ngày ${availableFrom}.`;
}

function addAllowedNumberVariants(set: Set<string>, value: number | null | undefined, decimals?: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) return;
  set.add(String(value));
  set.add(String(Math.round(value)));
  if (decimals !== undefined) {
    const fixed = value.toFixed(decimals);
    set.add(fixed);
    set.add(String(Number(fixed)));
  }
}

function collectAllowedWeatherTokens(facts: WeatherLeadInFacts): {
  allowedClocks: Set<string>;
  allowedDates: Set<string>;
  allowedNumbers: Set<string>;
} {
  const allowedClocks = new Set<string>();
  for (const minute of [
    facts.sunTimes.sunriseMinute,
    facts.sunTimes.sunsetMinute,
    facts.sunTimes.morningGoldenEndMinute,
    facts.sunTimes.eveningGoldenStartMinute,
  ]) {
    if (minute === null) continue;
    const hhmm = formatMinute(minute);
    allowedClocks.add(hhmm);
    if (hhmm.startsWith("0")) allowedClocks.add(hhmm.slice(1));
  }

  const [yyyy, mm, dd] = facts.date.split("-");
  const allowedDates = new Set<string>([
    facts.date,
    `${dd}/${mm}/${yyyy}`,
    `${Number(dd)}/${Number(mm)}/${yyyy}`,
    `${dd}/${mm}`,
    `${Number(dd)}/${Number(mm)}`,
    `${dd}-${mm}-${yyyy}`,
    `${dd}-${mm}`,
  ]);

  const allowedNumbers = new Set<string>();
  const s = facts.daySummary;
  if (s) {
    addAllowedNumberVariants(allowedNumbers, s.minTemperatureC, 1);
    addAllowedNumberVariants(allowedNumbers, s.maxTemperatureC, 1);
    addAllowedNumberVariants(allowedNumbers, s.maxPrecipitationProbability, 0);
    addAllowedNumberVariants(allowedNumbers, s.totalPrecipitationMm, 1);
    addAllowedNumberVariants(allowedNumbers, s.maxWindGustKmh, 0);
    if (s.minVisibilityM !== null) {
      if (s.minVisibilityM >= 10_000) allowedNumbers.add("10");
      addAllowedNumberVariants(allowedNumbers, s.minVisibilityM / 1000, 1);
    }
  }
  return { allowedClocks, allowedDates, allowedNumbers };
}

/**
 * Rejects any model-composed lead-in that contains a verdict ("nên đi / không nên đi")
 * or any clock/date/number not present in the already-fetched forecast & sun times.
 */
export function isSafeWeatherLeadIn(rawLeadIn: string, facts: WeatherLeadInFacts): boolean {
  const leadIn = rawLeadIn.normalize("NFC").trim();
  if (!leadIn || leadIn.length > 320) return false;
  if (/https?:|<[^>]+>|[\r\n]/iu.test(leadIn)) return false;

  const folded = cleanSearchToken(leadIn);
  if (VERDICT_PATTERNS.some(pattern => pattern.test(folded))) return false;
  if (facts.representative && !/\bdai dien\b/u.test(folded)) return false;

  const { allowedClocks, allowedDates, allowedNumbers } = collectAllowedWeatherTokens(facts);

  // 1. Validate and strip clock tokens (HH:MM or HHhMM)
  let stripped = leadIn.replace(/\b(\d{1,2})[:h](\d{2})\b/giu, (_full, h: string, m: string) => {
    const normalizedClock = `${h.padStart(2, "0")}:${m}`;
    const unpaddedClock = `${Number(h)}:${m}`;
    return allowedClocks.has(normalizedClock) || allowedClocks.has(unpaddedClock) ? " " : " __INVALID_CLOCK__ ";
  });
  if (stripped.includes("__INVALID_CLOCK__")) return false;

  // 2. Validate and strip YYYY-MM-DD and DD/MM(/YYYY) date tokens
  stripped = stripped.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?\b/gu, token =>
    allowedDates.has(token) ? " " : " __INVALID_DATE__ ",
  );
  if (stripped.includes("__INVALID_DATE__")) return false;

  // Strip literal "UTC+7" timezone label if mentioned
  stripped = stripped.replace(/\bUTC\+7\b/giu, " ");

  // 3. Every remaining numeric token must appear in allowedNumbers
  const numbers = stripped.match(/\d+(?:[.,]\d+)?/gu) ?? [];
  for (const rawNum of numbers) {
    const normalized = rawNum.replace(",", ".");
    if (!allowedNumbers.has(normalized) && !allowedNumbers.has(String(Number(normalized)))) {
      return false;
    }
  }

  return true;
}

const leadInSchema = z.object({ leadIn: z.string().trim().min(1).max(320) }).strict();
const leadInJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["leadIn"],
  properties: {
    leadIn: {
      type: "string",
      description: "Một câu dẫn tiếng Việt ngắn gọn (tối đa 220 ký tự) giới thiệu thẻ dự báo bên dưới, không kết luận nên đi hay không nên đi, không tự thêm số liệu ngoài dữ liệu đầu vào.",
    },
  },
};

export function createQaWeatherLeadInComposer(options: QaProviderOptions = {}): QaWeatherLeadInComposer {
  const provider = createQaJsonProvider({
    ...options,
    providerPhase: "GENERATION",
    maxOutputTokens: 250,
    timeoutMs: options.timeoutMs ?? 8_000,
  });

  return async (facts, question, signal) => {
    const summaryPayload = {
      question,
      destinationName: facts.destinationName,
      date: facts.date,
      representative: facts.representative,
      sunrise: formatMinute(facts.sunTimes.sunriseMinute),
      sunset: formatMinute(facts.sunTimes.sunsetMinute),
      ...(facts.daySummary
        ? {
            minTemperatureC: facts.daySummary.minTemperatureC === null ? null : Math.round(facts.daySummary.minTemperatureC),
            maxTemperatureC: facts.daySummary.maxTemperatureC === null ? null : Math.round(facts.daySummary.maxTemperatureC),
            maxRainProbabilityPercent: facts.daySummary.maxPrecipitationProbability,
            totalPrecipitationMm: facts.daySummary.totalPrecipitationMm,
            minVisibilityKm:
              facts.daySummary.minVisibilityM === null
                ? null
                : facts.daySummary.minVisibilityM >= 10_000
                  ? ">=10"
                  : Number((facts.daySummary.minVisibilityM / 1000).toFixed(1)),
            maxWindGustKmh: facts.daySummary.maxWindGustKmh === null ? null : Math.round(facts.daySummary.maxWindGustKmh),
          }
        : {}),
    };

    const systemPrompt = `Bạn viết MỘT câu dẫn ngắn bằng tiếng Việt giới thiệu thẻ thời tiết và giờ mặt trời bên dưới cho người dùng.
QUY TẮC BẮT BUỘC:
1. TUYỆT ĐỐI KHÔNG kết luận hoặc khuyên 'nên đi', 'không nên đi', 'nên hoãn', 'đừng đi', 'lý tưởng để đi'.
2. TUYỆT ĐỐI KHÔNG đưa bất kỳ con số, giờ giấc hay ngày tháng nào không có sẵn trong dữ liệu đầu vào. Có thể không nêu số để thẻ bên dưới hiển thị.
3. Nếu representative=true, bắt buộc nói rõ đây là số liệu tại điểm đại diện (${facts.destinationName}) cho Hà Giang.
4. Một câu duy nhất, tự nhiên, lịch sự, không xuống dòng, không đường dẫn.`;

    const out = await provider.request(
      {
        name: "qa_weather_lead_in",
        schema: leadInJsonSchema,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(summaryPayload) },
        ],
        signal,
      },
      raw => leadInSchema.parse(raw),
    );
    return out.leadIn;
  };
}

export function createDefaultQaWeatherDependencies(
  database: Pick<Database, "destination">,
  options: { provider?: QaProviderOptions; representativeDestinationId?: string; now?: () => Date } = {},
): QaWeatherDependencies {
  return {
    listVisibleDestinations: () =>
      database.destination.findMany({
        where: visibleDestinationWhere,
        select: { id: true, name: true, area: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    checkDestinationVisible: async (id: string) => {
      const publicDest = await getPublicDestination(id, database);
      return { id: publicDest.id, name: publicDest.name };
    },
    getDestinationWeather: (id: string, date: string, signal?: AbortSignal) =>
      getDestinationWeather(id, date, database, { signal, now: options.now }),
    composeLeadIn: createQaWeatherLeadInComposer(options.provider),
    representativeDestinationId: options.representativeDestinationId,
    now: options.now,
  };
}

function isHiddenOrMissingDestinationError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === "DESTINATION_NOT_FOUND" ||
      error.code === "DESTINATION_UNAVAILABLE" ||
      error.code === "CONTEXT_UNAVAILABLE")
  );
}

export async function answerQaWeatherQuestion(
  input: {
    question: string;
    understanding: QaQuestionUnderstanding;
    context: QaResolvedContext;
    signal?: AbortSignal;
  },
  deps: QaWeatherDependencies,
): Promise<QaAnswer> {
  if (
    input.context.type === "GENERAL" &&
    input.understanding.ambiguous &&
    input.understanding.targetSubjects.length === 0 &&
    needsHistory(input.question)
  ) {
    return {
      status: "CLARIFICATION_REQUIRED",
      answerParts: [],
      citations: [],
      clarificationQuestion:
        input.understanding.clarificationQuestion ?? QA_FOLLOWUP_CLARIFICATIONS.missingSubject,
    };
  }

  const dateCheck = validateWeatherDate(input.understanding.weatherDate, deps.now?.() ?? new Date());
  if (dateCheck.status === "INVALID") {
    return {
      status: "CLARIFICATION_REQUIRED",
      answerParts: [],
      citations: [],
      clarificationQuestion: QA_WEATHER_DATE_CLARIFICATION,
    };
  }

  const visibleDestinations = input.context.type === "DESTINATION" ? [] : await deps.listVisibleDestinations();
  const resolved = resolveWeatherDestination({
    context: input.context,
    understanding: input.understanding,
    visibleDestinations,
    representativeDestinationId: deps.representativeDestinationId,
    question: input.question,
  });

  if (resolved.kind === "NOT_FOUND") {
    return {
      status: "CLARIFICATION_REQUIRED",
      answerParts: [],
      citations: [],
      clarificationQuestion: QA_WEATHER_NOT_FOUND_MESSAGE,
    };
  }
  if (resolved.kind === "REPRESENTATIVE_UNAVAILABLE") {
    return {
      status: "CLARIFICATION_REQUIRED",
      answerParts: [],
      citations: [],
      clarificationQuestion: QA_WEATHER_REPRESENTATIVE_UNAVAILABLE_MESSAGE,
    };
  }
  if (resolved.kind === "AMBIGUOUS") {
    return {
      status: "CLARIFICATION_REQUIRED",
      answerParts: [],
      citations: [],
      clarificationQuestion: `Mình thấy có vài điểm đến phù hợp, bạn muốn xem dự báo thời tiết ở điểm nào: ${resolved.choices.map(c => c.name).join(", ")}?`,
      choices: resolved.choices,
    };
  }

  const { destination, representative } = resolved;

  if (dateCheck.status === "BEYOND_HORIZON") {
    if (deps.checkDestinationVisible) {
      try {
        await deps.checkDestinationVisible(destination.id);
      } catch (error) {
        if (isHiddenOrMissingDestinationError(error)) {
          if (input.context.type === "DESTINATION") {
            throw new AppError("CONTEXT_UNAVAILABLE", "CONTEXT_UNAVAILABLE", 404);
          }
          return {
            status: "CLARIFICATION_REQUIRED",
            answerParts: [],
            citations: [],
            clarificationQuestion: QA_WEATHER_NOT_FOUND_MESSAGE,
          };
        }
        throw error;
      }
    }
    return {
      status: "WEATHER",
      answerParts: [],
      citations: [],
      destinationId: destination.id,
      date: dateCheck.date,
      representative,
      leadIn: notYetAvailableLeadIn(dateCheck.availableFrom),
    };
  }

  let weather: DestinationWeather;
  try {
    weather = await deps.getDestinationWeather(destination.id, dateCheck.date, input.signal);
  } catch (error) {
    if (isHiddenOrMissingDestinationError(error)) {
      if (input.context.type === "DESTINATION") {
        throw new AppError("CONTEXT_UNAVAILABLE", "CONTEXT_UNAVAILABLE", 404);
      }
      return {
        status: "CLARIFICATION_REQUIRED",
        answerParts: [],
        citations: [],
        clarificationQuestion: QA_WEATHER_NOT_FOUND_MESSAGE,
      };
    }
    // Provider / network failure degrades gracefully to the unavailable weather card notice without failing the turn
    return {
      status: "WEATHER",
      answerParts: [],
      citations: [],
      destinationId: destination.id,
      date: dateCheck.date,
      representative,
      leadIn: QA_WEATHER_PROVIDER_UNAVAILABLE_LEAD_IN,
    };
  }

  if (weather.forecast.status === "NOT_YET_AVAILABLE") {
    return {
      status: "WEATHER",
      answerParts: [],
      citations: [],
      destinationId: weather.destinationId,
      date: weather.date,
      representative,
      leadIn: notYetAvailableLeadIn(weather.forecast.availableFrom),
    };
  }

  if (weather.forecast.status === "UNAVAILABLE") {
    return {
      status: "WEATHER",
      answerParts: [],
      citations: [],
      destinationId: weather.destinationId,
      date: weather.date,
      representative,
      leadIn: QA_WEATHER_PROVIDER_UNAVAILABLE_LEAD_IN,
    };
  }

  const daySummary =
    weather.forecast.days.find(d => d.date === weather.date) ??
    summarizeDays(weather.forecast.hours)[0] ??
    null;

  const facts: WeatherLeadInFacts = {
    destinationName: destination.name,
    date: weather.date,
    representative,
    sunTimes: weather.sunTimes,
    daySummary,
  };

  let leadIn = fixedWeatherLeadIn(facts);
  if (deps.composeLeadIn) {
    try {
      const candidate = await deps.composeLeadIn(facts, input.question, input.signal);
      if (isSafeWeatherLeadIn(candidate, facts)) {
        leadIn = candidate.normalize("NFC").trim();
      }
    } catch {
      // Fallback to deterministic lead-in; never fail the weather turn on prose composition failure
    }
  }

  return {
    status: "WEATHER",
    answerParts: [],
    citations: [],
    destinationId: weather.destinationId,
    date: weather.date,
    representative,
    leadIn,
  };
}
