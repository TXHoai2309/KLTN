import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { sourcesPartSchema } from "./tripsage-chat-context";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse, type TripsageChatHttpDependencies } from "./tripsage-chat-http";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `tone-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `tone-${++seq}` } }),
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

const planning = (): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [planningCandidate("a"), planningCandidate("b")],
  routes: {
    route: fixtureRoutes.route,
    coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }),
  },
  now: () => planningNow,
});

const parts = (sse: string) =>
  sse
    .split("\n")
    .filter(line => line.startsWith("data: {"))
    .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

async function runTurn(text: string, steps: Step[], over: Partial<TripsageChatHttpDependencies> = {}) {
  const model = scripted(steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
      journey: COMPLETE_JOURNEY_FIXTURE,
      tripInfo: TRIP_INFO_FIXTURE,
    }),
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning: planning(),
    knowledge: () => async () => [{ title: "Cẩm nang Hà Giang", text: "Hà Giang nổi tiếng với đèo Mã Pí Lèng." }],
    ...over,
  });
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, all: parts(sse), model };
}

describe("Ticket 03: tone rules & document source scoping", () => {
  it("emits no data-sources on a pure planning turn even when knowledge retriever is configured", async () => {
    const { all } = await runTurn("Lập lịch cho mình nhé", [
      { tool: "listDestinations", input: {} },
      { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
      { tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn uống", amount: 300_000, basis: "2 người" }] } },
      { tool: "suggestReplies", input: { replies: ["Đi 4 người", "Nhịp thong thả"] } },
      { text: "Mình đã lên lịch mẫu bên dưới, lịch chưa được lưu." },
    ]);
    expect(all.some(p => p.type === "data-itinerary")).toBe(true);
    expect(all.some(p => p.type === "data-cost")).toBe(true);
    expect(all.some(p => p.type === "data-quick-replies")).toBe(true);
    expect(all.some(p => p.type === "data-sources")).toBe(false);
  });

  it("emits document data-sources when lookupLocalKnowledge is used and returns matching excerpts", async () => {
    const { all } = await runTurn("Đèo Mã Pí Lèng có gì đẹp?", [
      { tool: "lookupLocalKnowledge", input: { question: "Đèo Mã Pí Lèng" } },
      { text: "Đèo Mã Pí Lèng nổi tiếng với tầm nhìn sông Nho Quế." },
    ]);
    const sourcesPart = all.find(p => p.type === "data-sources");
    expect(sourcesPart).toBeTruthy();
    expect(sourcesPartSchema.parse(sourcesPart!.data).sources).toEqual([
      { kind: "DOCUMENT", title: "Cẩm nang Hà Giang" },
    ]);
  });

  it("emits no data-sources when lookupLocalKnowledge finds no matching documents", async () => {
    const { all } = await runTurn("Có lưu ý gì đặc biệt không?", [
      { tool: "lookupLocalKnowledge", input: { question: "Chủ đề chưa có tài liệu" } },
      { text: "Phần này là kiến thức mở rộng." },
    ], { knowledge: () => async () => [] });
    expect(all.some(p => p.type === "data-sources")).toBe(false);
  });

  it("Point 3: resolves short D1/D2 destination codes on first try (0 INVALID_AI_PLAN) and forbids internal-mechanics jargon in persona & fallback notes", async () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("TUYỆT ĐỐI KHÔNG nhắc cơ chế hay thuật ngữ nội bộ");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Mình bỏ bớt Cột cờ Lũng Cú và Sủng Là để kịp giờ");

    // 1. Short codes D1, D2 returned by listDestinations succeed on 1st proposeItinerary call with 0 INVALID_AI_PLAN
    const shortCodeRun = await runTurn("Lập lịch 1 ngày, điểm đầu chơi 45 phút thôi", [
      { tool: "listDestinations", input: {} },
      { tool: "proposeItinerary", input: { selection: { days: [["D1", "D2"]] }, visitMinutes: { D1: 45 } } },
      { text: "Mình đã lên lịch 1 ngày cho bạn." },
    ]);
    const listOutput = JSON.stringify(shortCodeRun.model.doStreamCalls[1]!.prompt);
    expect(listOutput).toContain('"code":"D1"');
    expect(listOutput).toContain('"code":"D2"');
    const proposeToolMsgs = JSON.stringify(shortCodeRun.model.doStreamCalls[2]!.prompt.filter(m => m.role === "tool"));
    expect(proposeToolMsgs).not.toContain("INVALID_AI_PLAN");
    expect(proposeToolMsgs).toContain('"status":"PROPOSAL_READY"');
    const itin = shortCodeRun.all.find(p => p.type === "data-itinerary")?.data as {
      days: { stops: { destination: { id: string }; visitDurationMinutes: number }[] }[];
    } | undefined;
    expect(itin?.days[0]?.stops.map(s => s.destination.id)).toEqual(["a", "b"]);
    expect(itin?.days[0]?.stops[0]?.visitDurationMinutes).toBe(45);

    // 2. If fallback autoSelected triggers after 2 bad selections, its note tells model NOT to leak internal terms
    const fallbackRun = await runTurn("Lập lịch giúp mình", [
      { tool: "proposeItinerary", input: { selection: { days: [["bad-1"]] } } },
      { tool: "proposeItinerary", input: { selection: { days: [["bad-2"]] } } },
      { text: "Mình đã gợi ý trước lịch trình 1 ngày, bạn muốn đổi điểm nào không?" },
    ]);
    const fallbackPrompt = JSON.stringify(fallbackRun.model.doStreamCalls[2]!.prompt);
    expect(fallbackPrompt).toContain("autoSelected");
    expect(fallbackPrompt).toContain("TUYỆT ĐỐI KHÔNG nhắc từ ngữ nội bộ");
    expect(fallbackPrompt).not.toContain("Nói ngắn với người dùng rằng đây là bản nháp tự chọn");
  });
});
