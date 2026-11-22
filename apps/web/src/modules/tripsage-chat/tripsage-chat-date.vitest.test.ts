import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { fixtureRoutes, planningCandidate } from "../../test/planning-fixtures";
import { tripsageChatResponse, type TripsageChatHttpDependencies } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `date-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `date-${++seq}` } }),
}) as unknown as AuthorizationDependencies;

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};

type Step = { tool: string; input: unknown } | { text: string };
function scripted(steps: Step[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(call++, steps.length - 1)]!;
      const chunks = "tool" in step
        ? [
            { type: "tool-call", toolCallId: `c${call}`, toolName: step.tool, input: JSON.stringify(step.input) },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
          ]
        : [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: step.text },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
    },
  });
}

const planningAt = (fixedNow: Date): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [planningCandidate("a"), planningCandidate("b")],
  routes: {
    route: fixtureRoutes.route,
    coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }),
  },
  now: () => fixedNow,
});

const parts = (sse: string) =>
  sse
    .split("\n")
    .filter(line => line.startsWith("data: {"))
    .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

const systemTextOf = (model: MockLanguageModelV4, stepIndex = 0) =>
  (model.doStreamCalls[stepIndex]!.prompt as { role: string; content: unknown }[])
    .filter(message => message.role === "system")
    .map(message => String(message.content))
    .join("\n");

async function sendChat(input: {
  text: string;
  steps: Step[];
  now: Date;
  tripInfo?: Record<string, unknown> | null;
  extraBody?: Record<string, unknown>;
  deps?: Partial<TripsageChatHttpDependencies>;
}) {
  const model = scripted(input.steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: input.text }] }],
      ...(input.tripInfo !== undefined ? { tripInfo: input.tripInfo } : {}),
      ...input.extraBody,
    }),
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning: planningAt(input.now),
    ...input.deps,
  });
  expect(response.status).toBe(200);
  return { sse: await response.text(), model };
}

describe("Ticket 01: Vietnam today context & relative departure dates", () => {
  it("injects today's date in Vietnam time from the server clock and ignores client clock fields", async () => {
    const fixed = new Date("2026-11-21T03:00:00Z"); // 10:00 VN on Saturday 21/11/2026
    const { model } = await sendChat({
      text: "Mình muốn đi Hà Giang ngày 1 tháng sau",
      steps: [{ text: "Ghi nhận ngày 01/12/2026 nhé." }],
      now: fixed,
      extraBody: { today: "2020-01-01", clientDate: "2020-01-01" },
    });
    const system = systemTextOf(model);
    expect(system).toContain("Hôm nay: Thứ Bảy, 21/11/2026 (giờ Việt Nam)");
    expect(system).not.toContain("2020-01-01");
  });

  it("uses Vietnam date around UTC/VN midnight and rejects past dates in Vietnam time", async () => {
    // 2026-11-21T17:30:00Z is already 2026-11-22 00:30 in Asia/Ho_Chi_Minh (Sunday)
    const vnMidnight = new Date("2026-11-21T17:30:00Z");
    const { sse, model } = await sendChat({
      text: "Đi ngày 21/11/2026 nhé",
      steps: [
        { tool: "recordTripInfo", input: { startDate: "2026-11-21" } },
        { text: "Ngày 21/11/2026 đã qua rồi, bạn chọn ngày từ 22/11/2026 nhé." },
      ],
      now: vnMidnight,
    });
    expect(systemTextOf(model)).toContain("Hôm nay: Chủ Nhật, 22/11/2026 (giờ Việt Nam)");
    expect(parts(sse).some(p => p.type === "data-trip-info")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("PAST_DATE");
  });

  it("records exact resolved date 2026-12-01 when today is 21/11/2026", async () => {
    const fixed = new Date("2026-11-21T03:00:00Z");
    const { sse } = await sendChat({
      text: "Đi ngày 1 tháng sau",
      steps: [
        { tool: "recordTripInfo", input: { startDate: "2026-12-01" } },
        { text: "Mình đã ghi ngày khởi hành là 01/12/2026." },
      ],
      now: fixed,
    });
    expect(parts(sse).find(p => p.type === "data-trip-info")?.data).toEqual({
      tripInfo: { startDate: "2026-12-01" },
    });
  });

  it("proposes a concrete date via quick replies without recording startDate for an indicative departure window", async () => {
    const fixed = new Date("2026-11-21T03:00:00Z");
    const { sse } = await sendChat({
      text: "Mình định đi giữa tháng sau",
      steps: [
        { tool: "suggestReplies", input: { replies: ["Đúng, đi 15/12/2026", "Chọn ngày khác"] } },
        { text: "Mình chọn thử ngày 15/12/2026 trong khoảng giữa tháng 12, bạn thấy ổn không?" },
      ],
      now: fixed,
    });
    expect(parts(sse).some(p => p.type === "data-trip-info")).toBe(false);
    expect(parts(sse).find(p => p.type === "data-quick-replies")?.data).toEqual({
      replies: ["Đúng, đi 15/12/2026", "Chọn ngày khác"],
    });
  });

  it("drops the replaced startDate from subsequent turn context once a new date is recorded", async () => {
    const fixed = new Date("2026-11-21T03:00:00Z");
    const turn1 = await sendChat({
      text: "Đổi sang ngày 10/12/2026 nhé",
      steps: [
        { tool: "recordTripInfo", input: { startDate: "2026-12-10" } },
        { text: "Mình đã đổi ngày khởi hành sang 10/12/2026." },
      ],
      now: fixed,
      tripInfo: { transport: "MOTORCYCLE", durationDays: 3, startDate: "2026-12-01" },
    });
    const updatedTripInfo = (parts(turn1.sse).find(p => p.type === "data-trip-info")?.data as { tripInfo: Record<string, unknown> }).tripInfo;
    expect(updatedTripInfo.startDate).toBe("2026-12-10");

    const turn2 = await sendChat({
      text: "Ok tiếp tục nhé",
      steps: [{ text: "Tiếp tục với lịch từ 10/12/2026." }],
      now: fixed,
      tripInfo: updatedTripInfo,
    });
    const system2 = systemTextOf(turn2.model);
    expect(system2).toContain("2026-12-10");
    expect(system2).not.toContain("2026-12-01");
  });
});
