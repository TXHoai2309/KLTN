import type { Database } from "@KLTN/db";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import * as validatorModule from "../trip-validation/trip-validation";
import type { TripValidation } from "../trip-validation/trip-validation";
import { createAiEditProposal, type AiEditServiceDependencies } from "./ai-edit-service";
import { buildPreSunriseDepartureWarnings } from "./saved-trip-advisory";
import { redactAssistantText } from "./trip-assistant-stream-redaction";
import { AGENT_MAX_ROUNDS, buildTripAssistantMessages, TRIP_ASSISTANT_AGENT_INSTRUCTIONS } from "./trip-assistant-agent";

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

type ScriptedStep =
  | { calls: { name: string; input: unknown }[] }
  | { text: string }
  | { error: Error };

function scriptedModel(steps: ScriptedStep[]) {
  let callIndex = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(callIndex, steps.length - 1)]!;
      callIndex += 1;
      if ("error" in step) throw step.error;
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
              { type: "text-delta", id: `t-${callIndex}`, delta: step.text },
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

function fixture(model: MockLanguageModelV4) {
  let classifierCalls = 0;
  const trip = {
    id: "trip-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
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
            destination: { id: "destination-1", name: "Điểm A", visibility: "VISIBLE" },
          },
          {
            id: "visit-2",
            order: 2,
            startMinute: 660,
            plannedDurationMinutes: 90,
            destination: { id: "destination-2", name: "Điểm B", visibility: "VISIBLE" },
          },
        ],
      },
      { dayIndex: 2, visits: [] },
    ],
  };
  const destinations = [
    { id: "destination-1", name: "Điểm A", suggestedDurationMinutes: 60 },
    { id: "destination-2", name: "Điểm B", suggestedDurationMinutes: 90 },
    { id: "destination-3", name: "Chợ phiên Đồng Văn", suggestedDurationMinutes: 45 },
  ].map((d) => ({
    ...d,
    area: "Đồng Văn",
    latitude: 23,
    longitude: 105,
    minimumDurationMinutes: 30,
    openingDays: [{ dayOfWeek: "TUESDAY", status: "OPEN", intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] }],
  }));
  const database = {
    trip: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        where.id === trip.id && where.userId === trip.userId ? structuredClone(trip) : null,
    },
    destination: {
      findMany: async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const ids = where?.id?.in;
        return structuredClone(ids ? destinations.filter((d) => ids.includes(d.id)) : destinations);
      },
    },
  };
  const legacyOutput = {
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1"],
    destinationId: null,
    params: { dayIndex: null, position: null, startTime: "10:00", durationMinutes: null },
    affected: { visitIds: ["visit-1"], dayIndexes: [1] },
    needsClarification: false,
    clarificationReason: null,
  };
  const dependencies: AiEditServiceDependencies = {
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
  };
  return {
    dependencies,
    get classifierCalls() {
      return classifierCalls;
    },
  };
}

function ask(message: string, dependencies: AiEditServiceDependencies) {
  return createAiEditProposal(
    "trip-1",
    "owner-1",
    { baseRevision: revision.toISOString(), message },
    dependencies,
    timeReference,
  );
}

function logEvents(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .map(([line]) => (typeof line === "string" ? (JSON.parse(line) as Record<string, unknown>) : null))
    .filter((event): event is Record<string, unknown> => event?.event === "trip_assistant");
}

function firstUserText(model: MockLanguageModelV4): string {
  const prompt = model.doStreamCalls[0]!.prompt;
  const userMessage = prompt.find((m) => m.role === "user");
  if (!userMessage || !Array.isArray(userMessage.content)) return "";
  return userMessage.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function toolResultPayload(model: MockLanguageModelV4, stepIndex: number, toolName: string): Record<string, unknown> {
  const prompt = model.doStreamCalls[stepIndex]!.prompt;
  for (const msg of prompt) {
    if (msg.role !== "tool") continue;
    for (const part of msg.content) {
      if (part.type === "tool-result" && part.toolName === toolName) {
        const output = part.output as { type?: string; value?: unknown };
        return (output.value ?? output) as Record<string, unknown>;
      }
    }
  }
  throw new Error(`No tool-result for ${toolName} at step ${stepIndex}`);
}

afterEach(() => vi.restoreAllMocks());

describe("Saved-trip assistant AI SDK reasoning loop (ADR-40 Ticket 01)", () => {
  it("answers a read-only question from tripContext without calling the legacy classifier", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = scriptedModel([{ text: "Ngày 1 bạn bắt đầu tại Điểm A lúc 08:00." }]);
    const test = fixture(model);

    const result = await ask("tôi bắt đầu từ đâu lúc mấy giờ", test.dependencies);

    expect(result).toMatchObject({ status: "ADVISED", advice: "Ngày 1 bạn bắt đầu tại Điểm A lúc 08:00." });
    expect(test.classifierCalls).toBe(0);
    const payload = JSON.parse(firstUserText(model)) as {
      question: string;
      tripContext: {
        days: { stops: { visitId: string; startTime: string }[] }[];
        journey: unknown;
        lockedVisitIds: string[];
        journeyEditable: boolean;
        now: string;
      };
    };
    expect(payload.question).toBe("tôi bắt đầu từ đâu lúc mấy giờ");
    expect(payload.tripContext.days[0]!.stops[0]).toMatchObject({ visitId: "visit-1", startTime: "08:00" });
    expect(payload.tripContext).toHaveProperty("journey");
    expect(payload.tripContext.lockedVisitIds).toEqual([]);
    expect(typeof payload.tripContext.journeyEditable).toBe("boolean");
    expect(payload.tripContext.now.length).toBeGreaterThan(0);

    const events = logEvents(info);
    expect(events).toContainEqual(expect.objectContaining({ stage: "AGENT", outcome: "MODEL", kind: "ADVISED" }));
    expect(JSON.stringify(events)).not.toContain("bắt đầu từ đâu");
  });

  it("applies a server simulation as PROPOSED when the model calls apply_to_draft", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = scriptedModel([
      { calls: [{ name: "simulate_changes", input: changeTime("09:00") }] },
      { calls: [{ name: "apply_to_draft", input: { simulationId: "sim-1" } }] },
      { text: "Mình đã dời Điểm A sang 09:00 trên bản nháp." },
    ]);
    const test = fixture(model);

    const result = await ask("dời điểm A sang 9h", test.dependencies);

    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") throw new Error("expected proposal");
    expect(result.candidate.days[0]!.visits[0]).toMatchObject({ visitId: "visit-1", startMinute: 540 });
    expect(result.aiSummary).toBe("Mình đã dời Điểm A sang 09:00 trên bản nháp.");
    expect(result.validation.canConfirm).toBe(true);
    expect(toolResultPayload(model, 1, "simulate_changes")).toMatchObject({
      ok: true,
      simulationId: "sim-1",
      overallStatus: "PASS",
    });
    expect(toolResultPayload(model, 2, "apply_to_draft")).toMatchObject({
      ok: true,
      appliedSimulationId: "sim-1",
    });
  });

  it("returns simulated options via show_options and ignores ids the server never simulated", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = scriptedModel([
      {
        calls: [
          { name: "simulate_changes", input: changeTime("09:00") },
          { name: "simulate_changes", input: changeTime("09:30") },
        ],
      },
      { calls: [{ name: "show_options", input: { simulationIds: ["sim-1", "sim-2", "sim-9"] } }] },
      { text: "Có hai cách để sáng nghỉ thêm, bạn chọn phương án phù hợp bên dưới nhé." },
    ]);
    const test = fixture(model);

    const result = await ask("sáng muốn nghỉ thêm thì sửa sao", test.dependencies);

    expect(result.status).toBe("ADVISED");
    if (result.status !== "ADVISED") throw new Error("expected advice");
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions![0]!.candidate.days[0]!.visits[0]!.startMinute).toBe(540);
    expect(result.suggestions![1]!.candidate.days[0]!.visits[0]!.startMinute).toBe(570);
    expect(result.suggestions![0]!.diffSummaryLines.length).toBeGreaterThan(0);
  });

  it("rejects apply_to_draft with an unknown simulationId and finishes ADVISED", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = scriptedModel([
      { calls: [{ name: "apply_to_draft", input: { simulationId: "sim-9" } }] },
      { text: "Mình chưa có phương án hợp lệ để áp vào bản nháp." },
    ]);
    const test = fixture(model);

    const result = await ask("áp phương án đó đi", test.dependencies);

    expect(toolResultPayload(model, 1, "apply_to_draft")).toMatchObject({ ok: false });
    expect(result.status).toBe("ADVISED");
  });

  it("reports forged visitId back to the model as ok:false instead of applying it", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const bogus = {
      ...changeTime("09:00"),
      operations: [{ ...changeTime("09:00").operations[0]!, targetVisitIds: ["visit-forged"] }],
    };
    const model = scriptedModel([
      { calls: [{ name: "simulate_changes", input: bogus }] },
      { text: "Mình chưa xác định được điểm bạn muốn đổi, bạn nói rõ tên điểm giúp mình nhé." },
    ]);
    const test = fixture(model);

    const result = await ask("dời điểm đó sang 9h", test.dependencies);

    expect(toolResultPayload(model, 1, "simulate_changes")).toMatchObject({ ok: false });
    expect(result.status).toBe("ADVISED");
  });

  it("redacts leaked internal IDs and URLs in prose without falling back", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = scriptedModel([
      { text: "Bạn có thể đổi visit-1 sang giờ khác và xem https://example.com/a nhé." },
    ]);
    const test = fixture(model);

    const result = await ask("nên đổi điểm A không", test.dependencies);

    expect(test.classifierCalls).toBe(0);
    expect(result.status).toBe("ADVISED");
    if (result.status !== "ADVISED") throw new Error("expected advice");
    expect(result.advice).not.toContain("visit-1");
    expect(result.advice).not.toContain("https://example.com");
    expect(result.advice).toContain("Bạn có thể đổi");
  });

  it.each([
    [
      "provider failure",
      [{ error: new PreferenceExtractionError("PROVIDER_TIMEOUT", true) }] as ScriptedStep[],
      "PROVIDER:PROVIDER_TIMEOUT",
    ],
    [
      "too-short reply (LENGTH)",
      [{ text: "ok" }] as ScriptedStep[],
      "FACT_GUARD:LENGTH",
    ],
    [
      "endless tool calls",
      [{ calls: [{ name: "get_weather", input: {} }] }] as ScriptedStep[],
      "ROUND_LIMIT",
    ],
  ] as const)("falls back to the ADR-38 pipeline on %s", async (_label, steps, reason) => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const model = scriptedModel(steps);
    const test = fixture(model);

    const result = await ask("dời điểm A sang 10h", test.dependencies);

    expect(test.classifierCalls).toBe(1);
    expect(result.status).toBe("PROPOSED");
    expect(model.doStreamCalls.length).toBeLessThanOrEqual(AGENT_MAX_ROUNDS);
    expect(logEvents(info)).toContainEqual(expect.objectContaining({ stage: "AGENT", outcome: "FALLBACK", reason }));
  });

  it("keeps trip-frame requests on the fixed reply without calling the agent", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    const model = scriptedModel([{ text: "không được gọi" }]);
    const test = fixture(model);

    await ask("đổi ngày bắt đầu sang tuần sau", test.dependencies);

    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("carries companion voice, stated assumption, and expanded knowledge policy in prompt instructions", () => {
    expect(TRIP_ASSISTANT_AGENT_INSTRUCTIONS).toContain("mình");
    expect(TRIP_ASSISTANT_AGENT_INSTRUCTIONS).toContain("Kiến thức mở rộng");
    expect(TRIP_ASSISTANT_AGENT_INSTRUCTIONS).toContain("giả định");
    expect(TRIP_ASSISTANT_AGENT_INSTRUCTIONS).toContain("apply_to_draft");
    expect(TRIP_ASSISTANT_AGENT_INSTRUCTIONS).toContain("show_options");
    expect(TRIP_ASSISTANT_AGENT_INSTRUCTIONS).toContain("Nguồn tài liệu:");
  });

  it("S8: supplies verified outbound & return distance (km) and driving duration to the AI edit agent context", () => {
    const model = scriptedModel([{ text: "Chặng về 421,5 km khá dài." }]);
    const messages = buildTripAssistantMessages({
      model,
      message: "Ngày 5 chạy hơn 400 km có mệt không?",
      history: [],
      tripStatus: "UPCOMING",
      baseCandidate: {
        startDate: "2026-12-20",
        durationDays: 5,
        transport: "MOTORCYCLE",
        days: [{ dayIndex: 1, visits: [{ visitId: "v1", destinationId: "d1", order: 1, startMinute: 480, plannedDurationMinutes: 60 }] }],
        journey: {
          origin: { label: "Hà Nội (bến xe Mỹ Đình)", latitude: 21.0285, longitude: 105.7785, source: "MANUAL", confirmed: true },
          departureMinute: 420,
          returnDeadlineMinute: 1200,
          returnDepartureMinute: 420,
        },
      },
      savedShape: {
        id: "t1",
        transport: "MOTORCYCLE",
        startDate: "2026-12-20",
        durationDays: 5,
        days: [],
      } as never,
      placeNames: new Map([["d1", "Điểm A"]]),
      placeDetailsById: new Map(),
      catalog: [],
      lockedVisitIds: new Set(),
      baselinePreview: {
        candidate: { startDate: "2026-12-20", durationDays: 5, transport: "MOTORCYCLE", days: [] },
        validation: passValidation(),
        legs: [],
        saveEligibility: "SAVEABLE",
        uncheckedItems: [],
        journeySummary: {
          outboundDurationSeconds: 22_080,
          outboundDistanceMeters: 298_400,
          outboundRestMinutes: 45,
          estimatedArrivalAtFirstMinute: 833,
          firstVisitStartMinute: 840,
          returnDurationSeconds: 37_980,
          returnDistanceMeters: 421_500,
          returnRestMinutes: 90,
          estimatedReturnArrivalMinute: 1158,
          returnDeadlineMinute: 1200,
        },
      },
      runPreview: async () => { throw new Error("not called"); },
      journeyEditable: true,
      createVisitId: () => "v-new",
      weather: async () => [],
      knowledge: async () => null,
      addedPlaceDetails: () => undefined,
      timeReference: new Date("2026-12-01T00:00:00Z"),
    });

    const userMsg = messages.at(-1)!;
    const parsed = JSON.parse(String(userMsg.content)) as {
      tripContext: {
        journey: {
          outboundDistanceKm: number | null;
          outboundDriveMinutes: number | null;
          outboundRestMinutes: number | null;
          returnDistanceKm: number | null;
          returnDriveMinutes: number | null;
          returnRestMinutes: number | null;
        };
      };
    };
    expect(parsed.tripContext.journey.outboundDistanceKm).toBe(298.4);
    expect(parsed.tripContext.journey.outboundDriveMinutes).toBe(368);
    expect(parsed.tripContext.journey.outboundRestMinutes).toBe(45);
    expect(parsed.tripContext.journey.returnDistanceKm).toBe(421.5);
    expect(parsed.tripContext.journey.returnDriveMinutes).toBe(633);
    expect(parsed.tripContext.journey.returnRestMinutes).toBe(90);
  });

  it("S9: strips internal technical jargon ('máy chủ', 'PASS') from advice prose and forbids them in instructions", () => {
    expect(TRIP_ASSISTANT_AGENT_INSTRUCTIONS).toContain("KHÔNG dùng từ kỹ thuật nội bộ");
    const cleaned = redactAssistantText("Máy chủ vẫn báo PASS cho phương án này, và máy chủ đã kiểm tra xong.");
    expect(cleaned).not.toMatch(/m[aá]y\s+ch[uủ]/iu);
    expect(cleaned).not.toMatch(/\bPASS\b/u);
    expect(cleaned).toContain("đạt yêu cầu");
  });

  it("S11: warns about dark mountain roads & fog when a December departure (05:30) is before sunrise, especially on motorbike", () => {
    const warnings = buildPreSunriseDepartureWarnings({
      candidate: {
        startDate: "2026-12-20",
        durationDays: 5,
        transport: "MOTORCYCLE",
        days: [
          { dayIndex: 1, visits: [{ visitId: "v1", destinationId: "d1", order: 1, startMinute: 480, plannedDurationMinutes: 60 }] },
          { dayIndex: 5, visits: [] },
        ],
        journey: {
          origin: { label: "Hà Nội (bến xe Mỹ Đình)", latitude: 21.0285, longitude: 105.7785, source: "MANUAL", confirmed: true },
          departureMinute: 420,
          returnDeadlineMinute: 1200,
          returnDepartureMinute: 330, // 05:30 in December (sunrise ~06:36)
        },
      },
      catalogById: new Map([
        ["d1", { id: "d1", name: "Mèo Vạc", latitude: 23.1647, longitude: 105.3886, suggestedDurationMinutes: 60 }],
      ]),
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.dayIndex).toBe(5);
    expect(warnings[0]!.kind).toBe("RETURN");
    expect(warnings[0]!.departureTime).toBe("05:30");
    expect(warnings[0]!.message).toContain("trước bình minh");
    expect(warnings[0]!.message).toContain("sương mù");
    expect(warnings[0]!.message).toContain("xe máy");

    // Departing after sunrise (07:00) produces no pre-sunrise warning
    const safeWarnings = buildPreSunriseDepartureWarnings({
      candidate: {
        startDate: "2026-12-20",
        durationDays: 5,
        transport: "MOTORCYCLE",
        days: [{ dayIndex: 1, visits: [] }, { dayIndex: 5, visits: [] }],
        journey: {
          origin: { label: "Hà Nội", latitude: 21.0285, longitude: 105.7785, source: "MANUAL", confirmed: true },
          departureMinute: 420,
          returnDeadlineMinute: 1200,
          returnDepartureMinute: 420,
        },
      },
    });
    expect(safeWarnings).toHaveLength(0);
  });
});
