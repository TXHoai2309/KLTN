import type { Database } from "@KLTN/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import * as validatorModule from "../trip-validation/trip-validation";
import type { TripValidation } from "../trip-validation/trip-validation";
import { createAiEditProposal, type AiEditServiceDependencies } from "./ai-edit-service";
import { AGENT_MAX_ROUNDS } from "./trip-assistant-agent";
import type { ResponsesRequest, ResponsesResult, TripAssistantResponsesClient } from "./trip-assistant-openai";

const revision = new Date("2026-10-15T12:00:00.000Z");
const timeReference = new Date("2026-10-16T10:00:00.000Z");

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

type Step = (request: ResponsesRequest) => ResponsesResult | Promise<ResponsesResult>;

function scriptedAgent(steps: Step[]) {
  const inputs: unknown[][] = [];
  const client: TripAssistantResponsesClient = {
    async create(request) {
      inputs.push(JSON.parse(JSON.stringify(request.input)) as unknown[]);
      const step = steps[Math.min(inputs.length - 1, steps.length - 1)];
      if (!step) throw new Error("no scripted step");
      return step(request);
    },
  };
  return { client, inputs };
}

const toolCall = (callId: string, name: string, args: unknown) => ({
  type: "function_call",
  id: `fc_${callId}`,
  call_id: callId,
  name,
  arguments: JSON.stringify(args),
});

const calls = (...items: ReturnType<typeof toolCall>[]): Step => () => ({
  status: "completed",
  output: [{ type: "reasoning", id: "rs_1", encrypted_content: "opaque", summary: [] }, ...items],
});

const finalAnswer = (value: { reply: string; proposeSimulationId: string | null; suggestionSimulationIds: string[] }): Step => () => ({
  status: "completed",
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
});

const changeTime = (startTime: string) => ({
  title: `Dời Điểm A sang ${startTime}`,
  operations: [{
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1"],
    destinationId: null,
    dayIndex: null,
    position: null,
    startTime,
    durationMinutes: null,
    shiftFollowing: false,
  }],
  originClocks: null,
});

function fixture(agent: TripAssistantResponsesClient) {
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
          { id: "visit-1", order: 1, startMinute: 480, plannedDurationMinutes: 60, destination: { id: "destination-1", name: "Điểm A", visibility: "VISIBLE" } },
          { id: "visit-2", order: 2, startMinute: 660, plannedDurationMinutes: 90, destination: { id: "destination-2", name: "Điểm B", visibility: "VISIBLE" } },
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
    agent,
  };
  return { dependencies, get classifierCalls() { return classifierCalls; } };
}

function ask(message: string, dependencies: AiEditServiceDependencies) {
  return createAiEditProposal("trip-1", "owner-1", { baseRevision: revision.toISOString(), message }, dependencies, timeReference);
}

function logEvents(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .map(([line]) => (typeof line === "string" ? (JSON.parse(line) as Record<string, unknown>) : null))
    .filter((event): event is Record<string, unknown> => event?.event === "trip_assistant");
}

afterEach(() => vi.restoreAllMocks());

describe("Saved-trip assistant reasoning loop (ADR-39)", () => {
  it("answers a read-only question from tripContext without calling the legacy classifier", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const agent = scriptedAgent([finalAnswer({ reply: "Ngày 1 bạn bắt đầu tại Điểm A lúc 08:00.", proposeSimulationId: null, suggestionSimulationIds: [] })]);
    const test = fixture(agent.client);

    const result = await ask("tôi bắt đầu từ đâu lúc mấy giờ", test.dependencies);

    expect(result).toMatchObject({ status: "ADVISED", advice: "Ngày 1 bạn bắt đầu tại Điểm A lúc 08:00." });
    expect(test.classifierCalls).toBe(0);
    const firstUser = agent.inputs[0]!.at(-1) as { role: string; content: string };
    const payload = JSON.parse(firstUser.content) as { question: string; tripContext: { days: { stops: { visitId: string; startTime: string }[] }[] } };
    expect(payload.question).toBe("tôi bắt đầu từ đâu lúc mấy giờ");
    expect(payload.tripContext.days[0]!.stops[0]).toMatchObject({ visitId: "visit-1", startTime: "08:00" });
    const events = logEvents(info);
    expect(events).toContainEqual(expect.objectContaining({ stage: "AGENT", outcome: "MODEL", kind: "ADVISED" }));
    expect(JSON.stringify(events)).not.toContain("bắt đầu từ đâu");
  });

  it("applies a server simulation as PROPOSED when the traveler asks for an edit", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const agent = scriptedAgent([
      calls(toolCall("c1", "simulate_changes", changeTime("09:00"))),
      finalAnswer({ reply: "Mình đã dời Điểm A sang 09:00 trên bản nháp.", proposeSimulationId: "sim-1", suggestionSimulationIds: [] }),
    ]);
    const test = fixture(agent.client);

    const result = await ask("dời điểm A sang 9h", test.dependencies);

    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") throw new Error("expected proposal");
    expect(result.candidate.days[0]!.visits[0]).toMatchObject({ visitId: "visit-1", startMinute: 540 });
    expect(result.aiSummary).toBe("Mình đã dời Điểm A sang 09:00 trên bản nháp.");
    expect(result.validation.canConfirm).toBe(true);
    // The tool result went back to the model with the same call id, after the reasoning item.
    const secondInput = agent.inputs[1]!;
    expect(secondInput).toContainEqual(expect.objectContaining({ type: "reasoning", encrypted_content: "opaque" }));
    const toolOutput = secondInput.find((item) => (item as { type?: string }).type === "function_call_output") as { call_id: string; output: string };
    expect(toolOutput.call_id).toBe("c1");
    expect(JSON.parse(toolOutput.output)).toMatchObject({ ok: true, simulationId: "sim-1", overallStatus: "PASS" });
  });

  it("returns simulated options as suggestion cards and ignores ids the server never simulated", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const agent = scriptedAgent([
      calls(toolCall("c1", "simulate_changes", changeTime("09:00")), toolCall("c2", "simulate_changes", changeTime("09:30"))),
      finalAnswer({ reply: "Có hai cách để sáng nghỉ thêm, bạn chọn thẻ bên dưới nhé.", proposeSimulationId: null, suggestionSimulationIds: ["sim-1", "sim-2", "sim-9"] }),
    ]);
    const test = fixture(agent.client);

    const result = await ask("sáng muốn nghỉ thêm thì sửa sao", test.dependencies);

    expect(result.status).toBe("ADVISED");
    if (result.status !== "ADVISED") throw new Error("expected advice");
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions![0]!.candidate.days[0]!.visits[0]!.startMinute).toBe(540);
    expect(result.suggestions![1]!.candidate.days[0]!.visits[0]!.startMinute).toBe(570);
    expect(result.suggestions![0]!.diffSummaryLines.length).toBeGreaterThan(0);
  });

  it("reports invalid operations back to the model instead of applying them", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const bogus = { ...changeTime("09:00"), operations: [{ ...changeTime("09:00").operations[0], targetVisitIds: ["visit-forged"] }] };
    const agent = scriptedAgent([
      calls(toolCall("c1", "simulate_changes", bogus)),
      finalAnswer({ reply: "Mình chưa xác định được điểm bạn muốn đổi, bạn nói rõ tên điểm giúp mình nhé.", proposeSimulationId: "sim-1", suggestionSimulationIds: [] }),
    ]);
    const test = fixture(agent.client);

    const result = await ask("dời điểm đó sang 9h", test.dependencies);

    const toolOutput = agent.inputs[1]!.find((item) => (item as { type?: string }).type === "function_call_output") as { output: string };
    expect(JSON.parse(toolOutput.output)).toMatchObject({ ok: false });
    expect(result.status).toBe("ADVISED");
  });

  it.each([
    ["provider failure", [() => { throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true); }], "PROVIDER:PROVIDER_TIMEOUT"],
    ["leaked internal id", [finalAnswer({ reply: "Bạn có thể đổi visit-1 sang giờ khác nhé.", proposeSimulationId: null, suggestionSimulationIds: [] })], "FACT_GUARD:LEAKED_ID"],
    ["endless tool calls", [calls(toolCall("loop", "get_weather", {}))], "ROUND_LIMIT"],
  ] as const)("falls back to the ADR-38 pipeline on %s", async (_label, steps, reason) => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const agent = scriptedAgent([...steps] as Step[]);
    const test = fixture(agent.client);

    const result = await ask("dời điểm A sang 10h", test.dependencies);

    expect(test.classifierCalls).toBe(1);
    expect(result.status).toBe("PROPOSED");
    expect(agent.inputs.length).toBeLessThanOrEqual(AGENT_MAX_ROUNDS);
    expect(logEvents(info)).toContainEqual(expect.objectContaining({ stage: "AGENT", outcome: "FALLBACK", reason }));
  });

  it("keeps trip-frame requests on the fixed reply without calling the agent", async () => {
    vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(passValidation());
    const agent = scriptedAgent([finalAnswer({ reply: "không được gọi", proposeSimulationId: null, suggestionSimulationIds: [] })]);
    const test = fixture(agent.client);

    await ask("đổi ngày bắt đầu sang tuần sau", test.dependencies);

    expect(agent.inputs).toHaveLength(0);
  });
});
