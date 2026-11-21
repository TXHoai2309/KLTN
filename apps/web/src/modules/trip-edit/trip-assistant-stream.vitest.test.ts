import type { Database } from "@KLTN/db";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import * as validatorModule from "../trip-validation/trip-validation";
import type { TripValidation } from "../trip-validation/trip-validation";
import { aiEditResponse, type AiEditHttpDependencies } from "./ai-edit-http";

const revision = new Date("2026-10-15T12:00:00.000Z");
const timeReference = new Date("2026-10-16T10:00:00.000Z");
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function passValidation(): TripValidation {
  return {
    timeReference: timeReference.toISOString(),
    groups: {
      openingHours: { status: "SATISFIED", findings: [] },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: { status: "SATISFIED", findings: [] },
      scheduleConflict: { status: "SATISFIED", findings: [] },
    },
    canConfirm: true,
  };
}

function violationValidation(): TripValidation {
  return {
    timeReference: timeReference.toISOString(),
    groups: {
      openingHours: {
        status: "VIOLATION",
        findings: [
          {
            group: "openingHours",
            status: "VIOLATION",
            reasonCode: "OUTSIDE_OPENING_HOURS",
            message: "Điểm A đóng cửa lúc 08:00.",
            affectedVisitId: "visit-1",
          },
        ],
      },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: { status: "SATISFIED", findings: [] },
      scheduleConflict: { status: "SATISFIED", findings: [] },
    },
    canConfirm: false,
  };
}

type ScriptedStep =
  | { calls: { name: string; input: unknown }[] }
  | { deltas: string[] }
  | { error: Error }
  | { streamErrorAfter: string; error: Error };

function scriptedModel(steps: ScriptedStep[]) {
  let callIndex = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(callIndex, steps.length - 1)]!;
      callIndex += 1;
      if ("error" in step && !("streamErrorAfter" in step)) throw step.error;
      if ("streamErrorAfter" in step) {
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] } as never);
              controller.enqueue({ type: "text-start", id: "t-err" } as never);
              controller.enqueue({ type: "text-delta", id: "t-err", delta: step.streamErrorAfter } as never);
              controller.error(step.error);
            },
          }),
        };
      }
      const chunks =
        "calls" in step
          ? [
              ...step.calls.map((c, idx) => ({
                type: "tool-call",
                toolCallId: `c-${callIndex}-${idx + 1}`,
                toolName: c.name,
                input: JSON.stringify(c.input),
              })),
              { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
            ]
          : [
              { type: "text-start", id: `t-${callIndex}` },
              ...step.deltas.map((delta) => ({ type: "text-delta", id: `t-${callIndex}`, delta })),
              { type: "text-end", id: `t-${callIndex}` },
              { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
            ];
      return {
        stream: simulateReadableStream({
          chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[],
        }),
      };
    },
  });
}

const changeTime = (startTime: string) => ({
  title: `Dời Điểm A sang ${startTime}`,
  operations: [
    {
      intentType: "CHANGE_TIME",
      targetVisitIds: ["visit-1"],
      destinationId: null,
      dayIndex: null,
      position: null,
      startTime,
      durationMinutes: null,
      shiftFollowing: false,
    },
  ],
  originClocks: null,
});

function fixture(
  model: MockLanguageModelV4,
  options: {
    startDate?: Date;
    now?: Date;
    authenticated?: boolean;
    tripExists?: boolean;
    legacyOutput?: unknown;
  } = {},
) {
  let classifierCalls = 0;
  const startDate = options.startDate ?? new Date("2026-10-20T00:00:00.000Z");
  const now = options.now ?? timeReference;
  const authenticated = options.authenticated ?? true;
  const tripExists = options.tripExists ?? true;

  const trip = {
    id: "trip-1",
    userId: "owner-1",
    startDate,
    durationDays: 2,
    transport: "CAR" as const,
    updatedAt: revision,
    days: [
      {
        dayIndex: 1,
        visits: [
          {
            id: "visit-1",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destination: { id: "destination-alpha-12345", name: "Điểm A", visibility: "VISIBLE" },
          },
          {
            id: "visit-2",
            order: 2,
            startMinute: 660,
            plannedDurationMinutes: 90,
            destination: { id: "destination-beta-67890", name: "Điểm B", visibility: "VISIBLE" },
          },
        ],
      },
      { dayIndex: 2, visits: [] },
    ],
  };
  const destinations = [
    { id: "destination-alpha-12345", name: "Điểm A", suggestedDurationMinutes: 60 },
    { id: "destination-beta-67890", name: "Điểm B", suggestedDurationMinutes: 90 },
    { id: "destination-gamma-99999", name: "Chợ phiên Đồng Văn", suggestedDurationMinutes: 45 },
  ].map((d) => ({
    ...d,
    area: "Đồng Văn",
    latitude: 23,
    longitude: 105,
    minimumDurationMinutes: 30,
    openingDays: [{ dayOfWeek: "TUESDAY", status: "OPEN", intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] }],
  }));
  const database = {
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        tripExists && where.id === trip.id && where.userId === trip.userId ? structuredClone(trip) : null,
    },
    destination: {
      findMany: async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const ids = where?.id?.in;
        return structuredClone(ids ? destinations.filter((d) => ids.includes(d.id)) : destinations);
      },
    },
  };
  const legacyOutput = options.legacyOutput ?? {
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1"],
    destinationId: null,
    params: { dayIndex: null, position: null, startTime: "10:00", durationMinutes: null },
    affected: { visitIds: ["visit-1"], dayIndexes: [1] },
    needsClarification: false,
    clarificationReason: null,
  };
  const dependencies: AiEditHttpDependencies = {
    authorization: {
      database: database as unknown as Pick<Database, "user">,
      resolveSession: async () => (authenticated ? { user: { id: "owner-1", role: "TRAVELER" } } : null),
    } as AuthorizationDependencies,
    service: {
      database: database as unknown as Database,
      llm: {
        complete: async () => {
          classifierCalls += 1;
          return { rawText: JSON.stringify(legacyOutput), model: "fake-model" };
        },
      },
      getRoute: async () => ({ kind: "ok", durationSeconds: 0 }),
      createVisitId: () => "visit-new",
      agent: model,
    },
    now: () => new Date(now),
  };
  return {
    dependencies,
    get classifierCalls() {
      return classifierCalls;
    },
  };
}

function makeRequest(
  payload: Record<string, unknown>,
  options: { stream?: boolean; signal?: AbortSignal } = {},
): Request {
  const headers: Record<string, string> = {
    origin: "https://example.test",
    "content-type": "application/json",
  };
  if (options.stream) headers.accept = "text/event-stream";
  return new Request("https://example.test/api/trips/trip-1/edits/ai", {
    method: "POST",
    headers,
    body: JSON.stringify({ baseRevision: revision.toISOString(), ...payload }),
    signal: options.signal,
  });
}

type SseChunk = {
  type: string;
  id?: string;
  delta?: string;
  data?: unknown;
  transient?: boolean;
};

function parseSseChunks(sseText: string): SseChunk[] {
  return sseText
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)) as SseChunk);
}

function logEvents(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .map(([line]) => (typeof line === "string" ? (JSON.parse(line) as Record<string, unknown>) : null))
    .filter((event): event is Record<string, unknown> => event?.event === "trip_assistant");
}

afterEach(() => vi.restoreAllMocks());

describe("Saved-trip assistant streaming route (ADR-40 Ticket 02)", () => {
  it("streams Vietnamese tool progress, steps, redacted text, and a final result equal to JSON for PROPOSED", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const steps: ScriptedStep[] = [
      { calls: [{ name: "simulate_changes", input: changeTime("09:00") }] },
      { calls: [{ name: "apply_to_draft", input: { simulationId: "sim-1" } }] },
      { deltas: ["Mình đã dời ", "Điểm A sang 09:00 ", "trên bản nháp nhé."] },
    ];

    const streamFix = fixture(scriptedModel(steps));
    const streamRes = await aiEditResponse(
      makeRequest({ message: "dời điểm A sang 9h" }, { stream: true }),
      "trip-1",
      streamFix.dependencies,
    );
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get("content-type")).toContain("text/event-stream");
    expect(streamRes.headers.get("cache-control")).toBe("private, no-store");
    expect(streamRes.headers.get("x-accel-buffering")).toBe("no");

    const rawSse = await streamRes.text();
    const chunks = parseSseChunks(rawSse);

    const statuses = chunks
      .filter((c) => c.type === "data-status")
      .map((c) => (c.data as { label: string }).label);
    expect(statuses).toEqual([
      "Đang xem lịch của bạn…",
      "Đang chạy thử: Dời Điểm A sang 09:00…",
      "Đang chuẩn bị phương án…",
      "Đang soạn câu trả lời…",
    ]);

    const stepUpdates = chunks.filter((c) => c.type === "data-steps");
    expect((stepUpdates.at(-1)!.data as { steps: string[] }).steps).toEqual([
      "Xem lịch",
      "Chạy thử 1 phương án",
      "Chuẩn bị phương án",
    ]);

    // Tool inputs/outputs never leak into the browser SSE stream.
    expect(chunks.some((c) => c.type.startsWith("tool-"))).toBe(false);
    expect(rawSse).not.toContain("sim-1");

    const streamedText = chunks
      .filter((c) => c.type === "text-delta")
      .map((c) => c.delta ?? "")
      .join("");
    expect(streamedText).toBe("Mình đã dời Điểm A sang 09:00 trên bản nháp nhé.");

    const results = chunks.filter((c) => c.type === "data-trip-assistant-result");
    expect(results).toHaveLength(1);

    // Compare against JSON path for the exact same scenario.
    const jsonFix = fixture(scriptedModel(steps));
    const jsonRes = await aiEditResponse(
      makeRequest({ message: "dời điểm A sang 9h" }, { stream: false }),
      "trip-1",
      jsonFix.dependencies,
    );
    expect(jsonRes.status).toBe(200);
    const jsonPayload = (await jsonRes.json()) as { data: unknown };
    expect(results[0]!.data).toEqual(jsonPayload.data);
  });

  it("streams matching ADVISED payload and Vietnamese labels for search, weather, and knowledge tools", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const steps: ScriptedStep[] = [
      {
        calls: [
          { name: "search_destinations", input: { query: "chợ" } },
          { name: "get_weather", input: {} },
        ],
      },
      { deltas: ["Chợ phiên Đồng Văn rất hợp cho buổi sáng, thời tiết dự báo ổn định."] },
    ];

    const streamFix = fixture(scriptedModel(steps));
    const streamRes = await aiEditResponse(
      makeRequest({ message: "nên đi đâu buổi sáng và thời tiết sao" }, { stream: true }),
      "trip-1",
      streamFix.dependencies,
    );
    const chunks = parseSseChunks(await streamRes.text());
    const statuses = chunks
      .filter((c) => c.type === "data-status")
      .map((c) => (c.data as { label: string }).label);
    expect(statuses).toContain("Đang tìm điểm phù hợp…");
    expect(statuses).toContain("Đang xem dự báo thời tiết…");

    const results = chunks.filter((c) => c.type === "data-trip-assistant-result");
    expect(results).toHaveLength(1);

    const jsonFix = fixture(scriptedModel(steps));
    const jsonRes = await aiEditResponse(
      makeRequest({ message: "nên đi đâu buổi sáng và thời tiết sao" }, { stream: false }),
      "trip-1",
      jsonFix.dependencies,
    );
    const jsonPayload = (await jsonRes.json()) as { data: unknown };
    expect(results[0]!.data).toEqual(jsonPayload.data);
  });

  it("still returns JSON error responses for 401, 404, and 409 even when Accept: text/event-stream is sent", async () => {
    const model = scriptedModel([{ deltas: ["không được gọi"] }]);

    const unauth = fixture(model, { authenticated: false });
    const res401 = await aiEditResponse(
      makeRequest({ message: "xem lịch" }, { stream: true }),
      "trip-1",
      unauth.dependencies,
    );
    expect(res401.status).toBe(401);
    expect(res401.headers.get("content-type")).toContain("application/json");
    expect((await res401.json()).error.code).toBe("UNAUTHENTICATED");

    const missing = fixture(model, { tripExists: false });
    const res404 = await aiEditResponse(
      makeRequest({ message: "xem lịch" }, { stream: true }),
      "trip-1",
      missing.dependencies,
    );
    expect(res404.status).toBe(404);
    expect(res404.headers.get("content-type")).toContain("application/json");
    expect((await res404.json()).error.code).toBe("TRIP_NOT_FOUND");

    const stale = fixture(model);
    const res409 = await aiEditResponse(
      makeRequest({ baseRevision: "2026-10-14T12:00:00.000Z", message: "xem lịch" }, { stream: true }),
      "trip-1",
      stale.dependencies,
    );
    expect(res409.status).toBe(409);
    expect(res409.headers.get("content-type")).toContain("application/json");
    expect((await res409.json()).error.code).toBe("TRIP_REVISION_CONFLICT");
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("redacts visit IDs, cuids, known catalog IDs, and URLs even when split across chunks", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const cuid = "c123456789012345678901234";
    const model = scriptedModel([
      {
        deltas: [
          "Bạn nên dời vis",
          "it-1 sang 9h, tránh mã c1234567890",
          "12345678901234 và destination-alpha-",
          "12345 cũng như link ht",
          "tps://x.y/secret để dễ xem hơn.",
        ],
      },
    ]);
    const test = fixture(model);

    const res = await aiEditResponse(
      makeRequest({ message: "tư vấn lịch ngày 1" }, { stream: true }),
      "trip-1",
      test.dependencies,
    );
    const rawSse = await res.text();
    const chunks = parseSseChunks(rawSse);

    // Check text-delta chunks and result advice never contain any leaked token.
    const textDeltas = chunks
      .filter((c) => c.type === "text-delta")
      .map((c) => c.delta ?? "");
    const joinedText = textDeltas.join("");
    for (const forbidden of ["visit-1", cuid, "destination-alpha-12345", "https://x.y/secret", "https://x.y"]) {
      expect(joinedText).not.toContain(forbidden);
      for (const delta of textDeltas) {
        expect(delta).not.toContain(forbidden);
      }
    }
    // Never emitted even partial split prefixes like "vis" or "ht" before redaction.
    expect(textDeltas.join("")).not.toContain("vis");
    expect(textDeltas.join("")).not.toContain("tps://");
    expect(joinedText).toContain("Bạn nên dời");
    expect(joinedText).toContain("sang 9h");
    expect(joinedText).toContain("để dễ xem hơn.");

    const result = chunks.find((c) => c.type === "data-trip-assistant-result")!.data as {
      status: string;
      advice: string;
    };
    expect(result.status).toBe("ADVISED");
    expect(result.advice).toBe(joinedText.trim());
    expect(test.classifierCalls).toBe(0);
  });

  it("attaches a Correction note instead of falling back when prose claims PASS despite VIOLATION", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(violationValidation());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const steps: ScriptedStep[] = [
      { deltas: ["Lịch hiện tại đã đạt PASS và hoàn toàn hợp lệ rồi nhé."] },
    ];
    const streamFix = fixture(scriptedModel(steps));
    const streamRes = await aiEditResponse(
      makeRequest({ message: "lịch hiện tại có ổn không" }, { stream: true }),
      "trip-1",
      streamFix.dependencies,
    );
    const chunks = parseSseChunks(await streamRes.text());

    expect(streamFix.classifierCalls).toBe(0);
    const correctionChunk = chunks.find((c) => c.type === "data-correction-note");
    expect(correctionChunk).toBeDefined();
    const note = (correctionChunk!.data as { note: string }).note;
    expect(note).toContain("Lưu ý");
    expect(note).toContain("1");

    const result = chunks.find((c) => c.type === "data-trip-assistant-result")!.data as {
      status: string;
      advice: string;
      correctionNote?: string;
    };
    expect(result.status).toBe("ADVISED");
    expect(result.advice).toContain("đạt PASS");
    expect(result.correctionNote).toBe(note);
    expect(logEvents(info)).toContainEqual(
      expect.objectContaining({ stage: "AGENT", outcome: "MODEL", correction: true }),
    );

    // JSON path also returns correctionNote without falling back.
    const jsonFix = fixture(scriptedModel(steps));
    const jsonRes = await aiEditResponse(
      makeRequest({ message: "lịch hiện tại có ổn không" }, { stream: false }),
      "trip-1",
      jsonFix.dependencies,
    );
    expect(jsonFix.classifierCalls).toBe(0);
    expect((await jsonRes.json()).data).toMatchObject({
      status: "ADVISED",
      correctionNote: note,
    });
  });

  it("falls back to ADR-38 and still finishes with a valid result when the provider fails mid-stream", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const model = scriptedModel([
      { streamErrorAfter: "Đang trả lời dở ", error: new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true) },
    ]);
    const test = fixture(model);

    const res = await aiEditResponse(
      makeRequest({ message: "dời điểm A sang 10h" }, { stream: true }),
      "trip-1",
      test.dependencies,
    );
    const chunks = parseSseChunks(await res.text());

    expect(test.classifierCalls).toBe(1);
    const results = chunks.filter((c) => c.type === "data-trip-assistant-result");
    expect(results).toHaveLength(1);
    const fallbackData = results[0]!.data as {
      status: string;
      candidate: { days: { visits: { visitId: string; startMinute: number }[] }[] };
    };
    expect(fallbackData.status).toBe("PROPOSED");
    expect(fallbackData.candidate.days[0]!.visits[0]).toMatchObject({ visitId: "visit-1", startMinute: 600 });
  });

  it("streams only status + steps + result for deterministic branches (trip frame, ONGOING GPS, resolution)", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    // 1. Trip frame request
    const frameModel = scriptedModel([{ deltas: ["không được gọi"] }]);
    const frameFix = fixture(frameModel);
    const frameRes = await aiEditResponse(
      makeRequest({ message: "đổi ngày bắt đầu sang tuần sau" }, { stream: true }),
      "trip-1",
      frameFix.dependencies,
    );
    const frameChunks = parseSseChunks(await frameRes.text());
    expect(frameModel.doStreamCalls).toHaveLength(0);
    expect(frameChunks.filter((c) => c.type === "text-delta")).toHaveLength(0);
    expect(frameChunks.filter((c) => c.type === "data-status").map((c) => (c.data as { label: string }).label)).toEqual([
      "Đang xem lịch của bạn…",
    ]);
    expect(frameChunks.filter((c) => c.type === "data-trip-assistant-result")).toHaveLength(1);

    // 2. ONGOING GPS-dependent request
    const gpsModel = scriptedModel([{ deltas: ["không được gọi"] }]);
    const gpsFix = fixture(gpsModel, {
      startDate: new Date("2026-10-20T00:00:00.000Z"),
      now: new Date("2026-10-20T03:00:00.000Z"), // 10:00 VN on Day 1 (ONGOING)
      legacyOutput: {
        mode: "ADVISED",
        operations: [],
        originClocks: { departureTime: null, returnDeadlineTime: null, returnDepartureTime: null, rescheduleDayOne: false },
        adviceFocus: { dayIndex: 1, topic: "LOCATION_GUIDANCE" },
        candidateVisitIds: [],
        candidateDestinationIds: [],
        affected: { visitIds: [], dayIndexes: [1] },
        clarificationReason: null,
      },
    });
    const gpsRes = await aiEditResponse(
      makeRequest({ message: "từ vị trí hiện tại của tôi đi điểm nào gần nhất" }, { stream: true }),
      "trip-1",
      gpsFix.dependencies,
    );
    const gpsChunks = parseSseChunks(await gpsRes.text());
    expect(gpsModel.doStreamCalls).toHaveLength(0);
    expect(gpsChunks.filter((c) => c.type === "text-delta")).toHaveLength(0);
    expect(gpsChunks.find((c) => c.type === "data-trip-assistant-result")!.data).toMatchObject({
      status: "NEEDS_LOCATION",
    });

    // 3. Resolution request
    const resModel = scriptedModel([{ deltas: ["không được gọi"] }]);
    const resFix = fixture(resModel, {
      legacyOutput: {
        intentType: "CHANGE_TIME",
        targetVisitIds: ["visit-1"],
        destinationId: null,
        params: { dayIndex: null, position: null, startTime: "10:00", durationMinutes: null },
        affected: { visitIds: ["visit-1"], dayIndexes: [1] },
        needsClarification: true,
        clarificationReason: "AMBIGUOUS_TARGET",
      },
    });
    const resStream = await aiEditResponse(
      makeRequest({ message: "dời điểm A sang 10h", resolution: { selectedVisitId: "visit-1" } }, { stream: true }),
      "trip-1",
      resFix.dependencies,
    );
    const resChunks = parseSseChunks(await resStream.text());
    expect(resModel.doStreamCalls).toHaveLength(0);
    expect(resChunks.filter((c) => c.type === "text-delta")).toHaveLength(0);
    expect(resChunks.find((c) => c.type === "data-trip-assistant-result")!.data).toMatchObject({
      status: "PROPOSED",
    });
  });

  it("emits no final result and applies no simulation when aborted mid-stream", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const abortController = new AbortController();
    const stalledModel = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] } as never);
            controller.enqueue({ type: "text-start", id: "t-abort" } as never);
            controller.enqueue({ type: "text-delta", id: "t-abort", delta: "Mình đang kiểm tra " } as never);
            abortSignal?.addEventListener(
              "abort",
              () => {
                controller.error(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
            setTimeout(() => abortController.abort(), 15);
          },
        }),
      }),
    });
    const test = fixture(stalledModel);

    const res = await aiEditResponse(
      makeRequest({ message: "dời điểm A sang 9h" }, { stream: true, signal: abortController.signal }),
      "trip-1",
      test.dependencies,
    );
    const chunks = parseSseChunks(await res.text());

    expect(test.classifierCalls).toBe(0);
    expect(chunks.some((c) => c.type === "data-trip-assistant-result")).toBe(false);
  });
});
