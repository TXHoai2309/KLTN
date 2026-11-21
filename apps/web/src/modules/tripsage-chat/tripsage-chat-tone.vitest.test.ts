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
});
