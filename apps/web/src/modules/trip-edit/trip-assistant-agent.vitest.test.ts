import type { Database } from "@KLTN/db";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import * as validatorModule from "../trip-validation/trip-validation";
import type { TripValidation } from "../trip-validation/trip-validation";
import { createAiEditProposal, type AiEditServiceDependencies } from "./ai-edit-service";
import { AGENT_MAX_ROUNDS, TRIP_ASSISTANT_AGENT_INSTRUCTIONS } from "./trip-assistant-agent";

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

  it.each([
    [
      "provider failure",
      [{ error: new PreferenceExtractionError("PROVIDER_TIMEOUT", true) }] as ScriptedStep[],
      "PROVIDER:PROVIDER_TIMEOUT",
    ],
    [
      "leaked internal id",
      [{ text: "Bạn có thể đổi visit-1 sang giờ khác nhé." }] as ScriptedStep[],
      "FACT_GUARD:LEAKED_ID",
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
  });
});
