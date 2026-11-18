import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http/app-error";
import { computeSunTimes } from "@/modules/trip-weather/sun-times";
import type { DestinationWeather } from "@/modules/trip-weather/destination-weather-service";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, qaCompletedTurnSchema, type QaCompletedTurn, type QaRequest } from "./qa-contract";
import { qaRequestHash, type QaConversationStore, type QaReservation } from "./qa-conversation-store";
import type { QaQuestionUnderstander } from "./qa-question-understander";
import type { QaQuestionUnderstanding } from "./qa-question-understanding";
import type { QaAnswer, QaEvidence, QaHistoryTurn, QaPrincipal } from "./qa-runtime-contract";
import { createQaService } from "./qa-service";
import {
  QA_WEATHER_DATE_CLARIFICATION,
  QA_WEATHER_NOT_FOUND_MESSAGE,
  QA_WEATHER_PROVIDER_UNAVAILABLE_LEAD_IN,
  createDefaultQaWeatherDependencies,
  fixedWeatherLeadIn,
  isSafeWeatherLeadIn,
  type QaWeatherDependencies,
  type WeatherDestinationCandidate,
} from "./qa-weather-answer";

vi.mock("server-only", () => ({}));

const FIXED_NOW = new Date("2026-11-18T03:00:00Z"); // 2026-11-18 in Asia/Ho_Chi_Minh

const VISIBLE_DESTINATIONS: WeatherDestinationCandidate[] = [
  { id: "tp_ha_giang", name: "Cột mốc Km0 Thành phố Hà Giang", area: "thành phố hà giang" },
  { id: "lung_cu", name: "Cột cờ Lũng Cú", area: "đồng văn" },
  { id: "ma_pi_leng", name: "Đèo Mã Pí Lèng", area: "mèo vạc" },
  { id: "dv_karst", name: "Cao nguyên đá Đồng Văn", area: "đồng văn" },
  { id: "dv_old_town", name: "Phố cổ Đồng Văn", area: "đồng văn" },
  { id: "dv_market", name: "Chợ phiên Đồng Văn", area: "đồng văn" },
  { id: "dv_extra", name: "Đài quan sát Đồng Văn", area: "đồng văn" },
];

function makeAvailableWeather(destinationId: string, date: string): DestinationWeather {
  return {
    destinationId,
    date,
    sunTimes: computeSunTimes(23.28, 105.36, date),
    forecast: {
      status: "AVAILABLE",
      provider: "OPEN_METEO",
      fetchedAt: "2026-11-18T03:00:00Z",
      hours: [
        {
          time: `${date}T09:00`,
          temperatureC: 12,
          precipitationProbability: 80,
          precipitationMm: 3.5,
          visibilityM: 600,
          windGustKmh: 42,
          weatherCode: 61,
        },
        {
          time: `${date}T14:00`,
          temperatureC: 17,
          precipitationProbability: 40,
          precipitationMm: 1.0,
          visibilityM: 12_000,
          windGustKmh: 24,
          weatherCode: 3,
        },
      ],
      days: [
        {
          date,
          minTemperatureC: 12,
          maxTemperatureC: 17,
          maxPrecipitationProbability: 80,
          totalPrecipitationMm: 4.5,
          minVisibilityM: 600,
          maxWindGustKmh: 42,
        },
      ],
    },
  };
}

function createFakeStore(maxTurns = 10) {
  let seq = 0;
  const byKey = new Map<string, { hash: string; principalKey: string; data: QaCompletedTurn }>();
  const counts = new Map<string, number>();
  const persistedResponses: QaCompletedTurn[] = [];
  const conversations = new Map<string, { context: QaRequest["context"]; history: QaHistoryTurn[] }>();

  const store: QaConversationStore = {
    async reserve(principal: QaPrincipal, key: string, request: QaRequest) {
      const pKey = `${principal.kind}:${principal.id}`;
      const k = `${pKey}:${key}`;
      const hash = qaRequestHash(request);
      const hit = byKey.get(k);
      if (hit) {
        if (hit.hash !== hash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "IDEMPOTENCY_KEY_REUSED", 409);
        return { kind: "REPLAY", data: hit.data };
      }
      const used = counts.get(pKey) ?? 0;
      if (used >= maxTurns) throw new AppError("RATE_LIMITED", "RATE_LIMITED", 429);
      counts.set(pKey, used + 1);

      const conversationId = "conversationId" in request ? request.conversationId : `conv_${++seq}`;
      const existingConv = conversations.get(conversationId) ?? {
        context: request.context ?? { type: "GENERAL" as const },
        history: [],
      };
      conversations.set(conversationId, existingConv);
      const turnId = `turn_${++seq}`;
      (existingConv as { pendingKey?: string; pendingHash?: string; pendingQuestion?: string }).pendingKey = k;
      (existingConv as { pendingHash?: string }).pendingHash = hash;
      (existingConv as { pendingQuestion?: string }).pendingQuestion = request.question;
      return {
        kind: "RESERVED",
        conversationId,
        turnId,
        fence: 1,
        history: [...existingConv.history],
        context: existingConv.context ?? { type: "GENERAL" },
      };
    },
    async complete(_principal: QaPrincipal, reservation: QaReservation, data: QaCompletedTurn, _evidence: readonly QaEvidence[]) {
      const parsed = qaCompletedTurnSchema.parse(data);
      persistedResponses.push(parsed);
      const conv = conversations.get(reservation.conversationId) as {
        history: QaHistoryTurn[];
        pendingKey?: string;
        pendingHash?: string;
        pendingQuestion?: string;
      };
      if (conv?.pendingKey && conv.pendingHash) {
        byKey.set(conv.pendingKey, { hash: conv.pendingHash, principalKey: "", data: parsed });
        conv.history.push({ question: conv.pendingQuestion ?? "", response: parsed });
      }
      return parsed;
    },
    async fail() {},
    async history(_principal, id) {
      return conversations.get(id)?.history ?? [];
    },
    async delete() {},
    async revokeGuest() {},
    async cleanup() {
      return {
        processed: 0,
        hasMore: false,
        lockAcquired: true,
        lastSuccessfulSweep: null,
        eligibleBacklogCount: 0,
        oldestOverdueItem: null,
        failureCount: 0,
      };
    },
  };

  return { store, persistedResponses, getTurnCount: (p: QaPrincipal) => counts.get(`${p.kind}:${p.id}`) ?? 0 };
}

function setupHarness(options: {
  understanding?: Partial<QaQuestionUnderstanding>;
  weatherOverride?: Partial<QaWeatherDependencies>;
  maxTurns?: number;
  hiddenDestinationIds?: string[];
} = {}) {
  const fakeStore = createFakeStore(options.maxTurns ?? 10);
  const retrieve = vi.fn(async () => [] as QaEvidence[]);
  const generate = vi.fn(async (): Promise<QaAnswer> => ({
    status: "INSUFFICIENT_SOURCE",
    answerParts: [],
    citations: [],
    message: QA_INSUFFICIENT_SOURCE_MESSAGE,
    reason: "NO_EVIDENCE",
  }));

  const understand = vi.fn(async ({ question }): Promise<QaQuestionUnderstanding> => ({
    targetSubjects: ["Đèo Mã Pí Lèng"],
    intent: "WEATHER",
    weatherDate: "2026-11-19",
    attributes: ["mưa"],
    temporalConstraint: "mai",
    conditions: [],
    searchQuery: question,
    ambiguous: false,
    clarificationQuestion: null,
    ...options.understanding,
  }));
  const understander: QaQuestionUnderstander = { understand };

  const getDestinationWeatherMock = vi.fn(async (id: string, date: string) => {
    if (options.hiddenDestinationIds?.includes(id)) {
      throw new AppError("DESTINATION_UNAVAILABLE", "Điểm đến không còn khả dụng", 410);
    }
    return makeAvailableWeather(id, date);
  });

  const composeLeadInMock = vi.fn(
    async (facts: Parameters<NonNullable<QaWeatherDependencies["composeLeadIn"]>>[0]) =>
      facts.representative
        ? `Dự báo ngày ${facts.date} lấy theo điểm đại diện ${facts.destinationName} có nhiệt độ 12–17°C và khả năng mưa tối đa 80%.`
        : `Dự báo ngày ${facts.date} tại ${facts.destinationName} có nhiệt độ 12–17°C, khả năng mưa tối đa 80%.`,
  );

  const weatherDeps: QaWeatherDependencies = {
    listVisibleDestinations: async () => VISIBLE_DESTINATIONS,
    checkDestinationVisible: async id => {
      if (options.hiddenDestinationIds?.includes(id)) {
        throw new AppError("DESTINATION_UNAVAILABLE", "Điểm đến không còn khả dụng", 410);
      }
      const found = VISIBLE_DESTINATIONS.find(d => d.id === id);
      if (!found) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến", 404);
      return { id: found.id, name: found.name };
    },
    getDestinationWeather: getDestinationWeatherMock,
    composeLeadIn: composeLeadInMock,
    now: () => FIXED_NOW,
    ...options.weatherOverride,
  };

  const service = createQaService({
    store: fakeStore.store,
    retriever: { retrieve, recheck: async () => true },
    generator: { generate },
    understander,
    weather: weatherDeps,
    resolveContext: async ctx => {
      if (ctx.type === "GENERAL") return ctx;
      if (options.hiddenDestinationIds?.includes(ctx.destinationId)) {
        throw new AppError("CONTEXT_UNAVAILABLE", "CONTEXT_UNAVAILABLE", 404);
      }
      const found = VISIBLE_DESTINATIONS.find(d => d.id === ctx.destinationId);
      if (!found) throw new AppError("CONTEXT_UNAVAILABLE", "CONTEXT_UNAVAILABLE", 404);
      return { type: "DESTINATION", destinationId: found.id, name: found.name };
    },
  });

  return {
    service,
    fakeStore,
    retrieve,
    generate,
    understand,
    getDestinationWeatherMock,
    composeLeadInMock,
  };
}

describe("Ticket 03: Server Q&A weather answer branch", () => {
  const traveler: QaPrincipal = { kind: "USER", id: "user_traveler_1" };
  const guest: QaPrincipal = { kind: "GUEST", id: "guest_cookie_1" };

  it("answers a named destination weather question without retrieval and stores no forecast values", async () => {
    const h = setupHarness();
    const result = await h.service.ask(traveler, "key_named_1", {
      question: "Mai Mã Pí Lèng có mưa không?",
      context: { type: "GENERAL" },
    });

    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.getDestinationWeatherMock).toHaveBeenCalledWith("ma_pi_leng", "2026-11-19", expect.any(AbortSignal));

    expect(result.data).toEqual({
      conversationId: "conv_1",
      turnId: "turn_2",
      turnState: "COMPLETED",
      context: { type: "GENERAL" },
      knowledgeMode: "SOURCE_ONLY",
      status: "WEATHER",
      answerParts: [],
      citations: [],
      destinationId: "ma_pi_leng",
      date: "2026-11-19",
      representative: false,
      leadIn: "Dự báo ngày 2026-11-19 tại Đèo Mã Pí Lèng có nhiệt độ 12–17°C, khả năng mưa tối đa 80%.",
    });

    // Persisted record stores only destinationId, date, representative, leadIn — no forecast snapshot object
    const storedKeys = Object.keys(h.fakeStore.persistedResponses[0]!);
    expect(storedKeys).not.toContain("forecast");
    expect(storedKeys).not.toContain("hours");
    expect(storedKeys).not.toContain("sunTimes");
  });

  it("uses the currently open destination page without requiring the user to name it", async () => {
    const h = setupHarness({
      understanding: { targetSubjects: ["Cột cờ Lũng Cú"], weatherDate: "2026-11-19" },
    });
    const result = await h.service.ask(guest, "key_dest_ctx", {
      question: "Mai trời sao?",
      context: { type: "DESTINATION", destinationId: "lung_cu" },
    });

    expect(result.data).toMatchObject({
      status: "WEATHER",
      destinationId: "lung_cu",
      date: "2026-11-19",
      representative: false,
    });
  });

  it("returns up to 3 destination choices when multiple visible destinations match", async () => {
    const h = setupHarness({
      understanding: { targetSubjects: ["Đồng Văn"], weatherDate: "2026-11-19" },
    });
    const result = await h.service.ask(traveler, "key_ambiguous_dest", {
      question: "Mai Đồng Văn có mưa không?",
      context: { type: "GENERAL" },
    });

    expect(h.getDestinationWeatherMock).not.toHaveBeenCalled();
    expect(result.data.status).toBe("CLARIFICATION_REQUIRED");
    if (result.data.status === "CLARIFICATION_REQUIRED") {
      expect(result.data.choices).toHaveLength(3);
      expect(result.data.choices?.map(c => c.id)).toEqual(["dv_karst", "dv_old_town", "dv_market"]);
    }
  });

  it("returns plain 'mình chưa tìm thấy điểm đó' when no destination matches", async () => {
    const h = setupHarness({
      understanding: { targetSubjects: ["Đỉnh Fansipan"], weatherDate: "2026-11-19" },
    });
    const result = await h.service.ask(traveler, "key_unknown_dest", {
      question: "Mai Fansipan có mưa không?",
      context: { type: "GENERAL" },
    });

    expect(h.getDestinationWeatherMock).not.toHaveBeenCalled();
    expect(result.data.status).toBe("CLARIFICATION_REQUIRED");
    if (result.data.status === "CLARIFICATION_REQUIRED") {
      expect(result.data.clarificationQuestion.toLocaleLowerCase("vi")).toContain("mình chưa tìm thấy điểm đó");
      expect(result.data).toEqual(expect.objectContaining({ clarificationQuestion: QA_WEATHER_NOT_FOUND_MESSAGE }));
    }
  });

  it("uses the representative Hà Giang city destination and sets representative=true when no destination is named", async () => {
    const h = setupHarness({
      understanding: { targetSubjects: [], weatherDate: "2026-11-19" },
    });
    const result = await h.service.ask(guest, "key_rep_dest", {
      question: "Hà Giang mai có mưa không?",
      context: { type: "GENERAL" },
    });

    expect(result.data).toMatchObject({
      status: "WEATHER",
      destinationId: "tp_ha_giang",
      date: "2026-11-19",
      representative: true,
    });
    if (result.data.status === "WEATHER") {
      expect(result.data.leadIn).toContain("điểm đại diện");
    }
  });

  it("handles missing date (today), beyond-horizon date ('Chưa có dự báo, sẽ có từ ngày X'), and invalid date (clarification)", async () => {
    // 1. Missing date -> today (2026-11-18)
    const todayH = setupHarness({
      understanding: { targetSubjects: ["Cột cờ Lũng Cú"], weatherDate: null },
    });
    const todayRes = await todayH.service.ask(guest, "key_date_null", {
      question: "Lũng Cú có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(todayRes.data).toMatchObject({
      status: "WEATHER",
      destinationId: "lung_cu",
      date: "2026-11-18",
    });

    // 2. Beyond 16-day horizon -> exact "Chưa có dự báo, sẽ có từ ngày X"
    const farH = setupHarness({
      understanding: { targetSubjects: ["Cột cờ Lũng Cú"], weatherDate: "2026-12-20" },
    });
    const farRes = await farH.service.ask(guest, "key_date_far", {
      question: "Ngày 20/12 Lũng Cú có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(farH.getDestinationWeatherMock).not.toHaveBeenCalled();
    expect(farH.composeLeadInMock).not.toHaveBeenCalled();
    expect(farRes.data).toMatchObject({
      status: "WEATHER",
      destinationId: "lung_cu",
      date: "2026-12-20",
      leadIn: "Chưa có dự báo, sẽ có từ ngày 2026-12-05.",
    });

    // 3. Ambiguous / past date -> short clarification
    const badH = setupHarness({
      understanding: { targetSubjects: ["Cột cờ Lũng Cú"], weatherDate: "AMBIGUOUS" },
    });
    const badRes = await badH.service.ask(guest, "key_date_bad", {
      question: "Tháng sau Lũng Cú có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(badRes.data).toMatchObject({
      status: "CLARIFICATION_REQUIRED",
      clarificationQuestion: QA_WEATHER_DATE_CLARIFICATION,
    });
  });

  it("never exposes forecasts for hidden or unavailable destinations", async () => {
    const h = setupHarness({
      understanding: { targetSubjects: ["Cột cờ Lũng Cú"], weatherDate: "2026-11-19" },
      hiddenDestinationIds: ["lung_cu"],
    });

    // Hidden destination page context -> 404 CONTEXT_UNAVAILABLE
    await expect(
      h.service.ask(guest, "key_hidden_ctx", {
        question: "Mai trời sao?",
        context: { type: "DESTINATION", destinationId: "lung_cu" },
      }),
    ).rejects.toMatchObject({ code: "CONTEXT_UNAVAILABLE", status: 404 });

    // Hidden destination turned unavailable before weather read in GENERAL chat -> plain not-found
    const generalRes = await h.service.ask(guest, "key_hidden_general", {
      question: "Mai Lũng Cú có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(generalRes.data).toMatchObject({
      status: "CLARIFICATION_REQUIRED",
      clarificationQuestion: QA_WEATHER_NOT_FOUND_MESSAGE,
    });

    // Also verify default DB-backed dependencies pass visibleDestinationWhere
    const findMany = vi.fn(async () => []);
    const defaultDeps = createDefaultQaWeatherDependencies({ destination: { findMany } } as never);
    await defaultDeps.listVisibleDestinations();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { visibility: "VISIBLE", deletedAt: null } }),
    );
  });

  it("keeps seasonal / mixed knowledge questions on RAG retrieval when intent is not WEATHER", async () => {
    const h = setupHarness({
      understanding: {
        targetSubjects: ["Đèo Mã Pí Lèng"],
        intent: "SCHEDULE",
        weatherDate: null,
      },
    });
    const result = await h.service.ask(traveler, "key_seasonal", {
      question: "Mã Pí Lèng đẹp nhất mùa nào?",
      context: { type: "GENERAL" },
    });

    expect(h.retrieve).toHaveBeenCalledOnce();
    expect(h.getDestinationWeatherMock).not.toHaveBeenCalled();
    expect(result.data.status).toBe("INSUFFICIENT_SOURCE");
  });

  it("returns an explicit unavailable lead-in without failing the turn when the weather provider fails", async () => {
    const h = setupHarness({
      weatherOverride: {
        getDestinationWeather: async (destinationId, date) => ({
          destinationId,
          date,
          sunTimes: computeSunTimes(23.28, 105.36, date),
          forecast: { status: "UNAVAILABLE", reason: "TIMEOUT" },
        }),
      },
    });

    const result = await h.service.ask(guest, "key_provider_down", {
      question: "Mai Mã Pí Lèng có mưa không?",
      context: { type: "GENERAL" },
    });

    expect(h.composeLeadInMock).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      status: "WEATHER",
      destinationId: "ma_pi_leng",
      date: "2026-11-19",
      leadIn: QA_WEATHER_PROVIDER_UNAVAILABLE_LEAD_IN,
    });
  });

  it.each([
    ["verdict: không nên đi", "Ngày 2026-11-19 khả năng mưa 80%, bạn không nên đi xe máy."],
    ["verdict: nên đi", "Ngày 2026-11-19 nhiệt độ 12–17°C rất đẹp, bạn nên đi ngay!"],
    ["verdict: nên hoãn", "Mưa tới 80% nên hoãn chuyến tham quan."],
    ["unknown temperature", "Ngày 2026-11-19 tại Đèo Mã Pí Lèng nhiệt độ khoảng 28°C."],
    ["unknown clock time", "Ngày 2026-11-19 bình minh lúc 05:10 tại Đèo Mã Pí Lèng."],
    ["wrong date", "Ngày 25/11 tại Đèo Mã Pí Lèng nhiệt độ 12–17°C."],
  ])("rejects violating model lead-in (%s) and replaces it with the fixed sentence", async (_caseLabel, unsafeLeadIn) => {
    const h = setupHarness({
      weatherOverride: {
        composeLeadIn: async () => unsafeLeadIn,
      },
    });

    const result = await h.service.ask(traveler, `key_gate_${_caseLabel}`, {
      question: "Mai Mã Pí Lèng có mưa không?",
      context: { type: "GENERAL" },
    });

    const expectedFallback = fixedWeatherLeadIn({
      destinationName: "Đèo Mã Pí Lèng",
      date: "2026-11-19",
      representative: false,
    });
    expect(result.data).toMatchObject({
      status: "WEATHER",
      leadIn: expectedFallback,
    });
    const sampleWeather = makeAvailableWeather("ma_pi_leng", "2026-11-19");
    expect(
      isSafeWeatherLeadIn(unsafeLeadIn, {
        destinationName: "Đèo Mã Pí Lèng",
        date: "2026-11-19",
        representative: false,
        sunTimes: sampleWeather.sunTimes,
        daySummary: sampleWeather.forecast.status === "AVAILABLE" ? sampleWeather.forecast.days[0]! : null,
      }),
    ).toBe(false);
  });

  it("shares the exact path, idempotency replay, and abuse limits across Guest and Traveler", async () => {
    const h = setupHarness({ maxTurns: 2 });

    // Turn 1 (Guest) + idempotent replay (does not consume a second turn or re-fetch weather)
    const first = await h.service.ask(guest, "guest_idem_1", {
      question: "Mai Mã Pí Lèng có mưa không?",
      context: { type: "GENERAL" },
    });
    const replay = await h.service.ask(guest, "guest_idem_1", {
      question: "Mai Mã Pí Lèng có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.data).toEqual(first.data);
    expect(h.fakeStore.getTurnCount(guest)).toBe(1);
    expect(h.getDestinationWeatherMock).toHaveBeenCalledTimes(1);

    // Turn 2 (Guest) reaches quota 2/2
    await h.service.ask(guest, "guest_idem_2", {
      question: "Lũng Cú có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(h.fakeStore.getTurnCount(guest)).toBe(2);

    // Turn 3 (Guest) is blocked by existing Q&A rate limit
    await expect(
      h.service.ask(guest, "guest_idem_3", {
        question: "Hà Giang mai có mưa không?",
        context: { type: "GENERAL" },
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });

    // Traveler has independent principal quota and receives the same WEATHER contract
    const travelerTurn = await h.service.ask(traveler, "traveler_idem_1", {
      question: "Mai Mã Pí Lèng có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(travelerTurn.data.status).toBe("WEATHER");
  });

  it("offers choices for a short district alias when multiple visible destinations match and resolves the clicked choice", async () => {
    const dvDestinations = [
      { id: "dv_karst", name: "Cao nguyên đá Đồng Văn", area: "Đồng Văn" },
      { id: "dv_old_town", name: "Phố cổ Đồng Văn", area: "Đồng Văn" },
    ];
    // matchKnownDestinations("Đồng Văn") canonicalizes targetSubjects to ["Cao nguyên đá Đồng Văn"]
    const ambiguousHarness = setupHarness({
      weatherOverride: { listVisibleDestinations: async () => dvDestinations },
      understanding: { targetSubjects: ["Cao nguyên đá Đồng Văn"], weatherDate: "2026-11-19" },
    });

    const first = await ambiguousHarness.service.ask(guest, "dv_ambig_1", {
      question: "Ngày mai ở Đồng Văn có mưa không?",
      context: { type: "GENERAL" },
    });
    expect(first.data).toMatchObject({
      status: "CLARIFICATION_REQUIRED",
      choices: [
        { id: "dv_karst", name: "Cao nguyên đá Đồng Văn" },
        { id: "dv_old_town", name: "Phố cổ Đồng Văn" },
      ],
    });

    // Clicking "Phố cổ Đồng Văn" resolves uniquely to dv_old_town even if targetSubjects still says Cao nguyên đá Đồng Văn
    const followUpHarness = setupHarness({
      weatherOverride: { listVisibleDestinations: async () => dvDestinations },
      understanding: { targetSubjects: ["Cao nguyên đá Đồng Văn"], weatherDate: "2026-11-19" },
    });
    const second = await followUpHarness.service.ask(guest, "dv_choice_2", {
      question: "Ngày mai ở Đồng Văn có mưa không — tại Phố cổ Đồng Văn?",
      context: { type: "GENERAL" },
    });
    expect(second.data).toMatchObject({
      status: "WEATHER",
      destinationId: "dv_old_town",
      date: "2026-11-19",
      representative: false,
    });
  });
});
