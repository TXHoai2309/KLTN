import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { parseSourcesPart, TripsageSourcesView } from "../../components/tripsage-chat/tripsage-sources-view";
import { sourcesPartSchema, tripInfoPartSchema } from "./tripsage-chat-context";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse, type TripsageChatHttpDependencies } from "./tripsage-chat-http";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `intent-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `intent-${++seq}` } }),
}) as unknown as AuthorizationDependencies;

const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
type Step = { tool: string; input: unknown } | { text: string };
function scripted(steps: Step[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(call++, steps.length - 1)]!;
      const chunks = "tool" in step
        ? [{ type: "tool-call", toolCallId: `c${call}`, toolName: step.tool, input: JSON.stringify(step.input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }]
        : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: step.text }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
    },
  });
}

const planning = (): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [
    planningCandidate("lung-cu", 120),
    planningCandidate("dong-van", 120),
    planningCandidate("meo-vac", 120),
    { ...planningCandidate("hidden-stop", 120), visibility: "HIDDEN" },
  ],
  routes: { route: fixtureRoutes.route, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }) },
  now: () => planningNow,
});

const parts = (sse: string) => sse.split("\n").filter(l => l.startsWith("data: {")).map(l => JSON.parse(l.slice(6)) as { type: string; data?: unknown });

async function run(
  steps: Step[],
  body: Record<string, unknown> = {},
  over: Partial<TripsageChatHttpDependencies> = {},
) {
  const model = scripted(steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Lên lịch đi kèm Cột cờ Lũng Cú" }] }],
      journey: COMPLETE_JOURNEY_FIXTURE,
      tripInfo: TRIP_INFO_FIXTURE,
      ...body,
    }),
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning: planning(),
    ...over,
  });
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, model, all: parts(sse), fed: (call: number) => JSON.stringify(model.doStreamCalls[call]!.prompt) };
}

describe("required stops (mustIncludeDestinationIds) and intent prompt (ticket 02)", () => {
  it("records valid required stops and rejects selections missing them in proposeItinerary", async () => {
    const { all, fed } = await run([
      { tool: "recordTripInfo", input: { mustIncludeDestinationIds: ["lung-cu", "lung-cu"] } },
      { tool: "proposeItinerary", input: { selection: { days: [["dong-van", "meo-vac"]] } } },
      { tool: "proposeItinerary", input: { selection: { days: [["lung-cu", "dong-van"]] } } },
      { text: "Mình đã đưa Cột cờ Lũng Cú vào lịch." },
    ]);
    const info = tripInfoPartSchema.parse(all.find(p => p.type === "data-trip-info")!.data).tripInfo;
    expect(info.mustIncludeDestinationIds).toEqual(["lung-cu"]);
    expect(fed(2)).toContain("MANDATORY_DESTINATION_MISSING");
    const itineraries = all.filter(p => p.type === "data-itinerary");
    expect(itineraries).toHaveLength(1);
    const result = plannerResultSchema.parse(itineraries[0]!.data);
    expect(result.days[0]!.stops.map(stop => stop.destination.id)).toContain("lung-cu");
  });

  it("rejects unknown, hidden or oversized mustIncludeDestinationIds on the server", async () => {
    const unknown = await run([{ tool: "recordTripInfo", input: { mustIncludeDestinationIds: ["does-not-exist"] } }, { text: "Mình kiểm tra lại." }]);
    expect(unknown.all.some(p => p.type === "data-trip-info")).toBe(false);
    expect(unknown.fed(1)).toContain("UNKNOWN_REQUIRED_DESTINATION");

    const hidden = await run([{ tool: "recordTripInfo", input: { mustIncludeDestinationIds: ["hidden-stop"] } }, { text: "Điểm đó chưa có." }]);
    expect(hidden.all.some(p => p.type === "data-trip-info")).toBe(false);
    expect(hidden.fed(1)).toContain("UNKNOWN_REQUIRED_DESTINATION");

    const tooMany = await run([{ tool: "recordTripInfo", input: { mustIncludeDestinationIds: ["a", "b", "c", "d", "e"] } }, { text: "Tối đa 4 điểm." }]);
    expect(tooMany.all.some(p => p.type === "data-trip-info")).toBe(false);
  });

  it("re-verifies browser-supplied mustIncludeDestinationIds in proposeItinerary and exposes them in context", async () => {
    const ok = await run(
      [{ tool: "proposeItinerary", input: { selection: { days: [["dong-van"]] } } }, { text: "Thiếu điểm bắt buộc." }],
      { tripInfo: { ...TRIP_INFO_FIXTURE, mustIncludeDestinationIds: ["lung-cu"] } },
    );
    expect(ok.fed(0)).toContain("điểm bắt buộc");
    expect(ok.fed(0)).toContain("lung-cu");
    expect(ok.all.some(p => p.type === "data-itinerary")).toBe(false);
    expect(ok.fed(1)).toContain("MANDATORY_DESTINATION_MISSING");

    const forged = await run(
      [{ tool: "proposeItinerary", input: { selection: { days: [["dong-van"]] } } }, { text: "Điểm không hợp lệ." }],
      { tripInfo: { ...TRIP_INFO_FIXTURE, mustIncludeDestinationIds: ["hidden-stop"] } },
    );
    expect(forged.all.some(p => p.type === "data-itinerary")).toBe(false);
    expect(forged.fed(1)).toContain("UNKNOWN_REQUIRED_DESTINATION");
  });

  it("documents the three planning-intent cases and general knowledge disclosure in instructions", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Phân biệt 3 trường hợp ý định");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("mustIncludeDestinationIds");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Kiến thức mở rộng");
  });
});

describe("lookupLocalKnowledge source chips (ticket 02)", () => {
  it("emits document titles in data-sources and strips internal URLs before streaming", async () => {
    const knowledge = () => async () => [
      { title: "Cẩm nang Cột cờ Lũng Cú https://internal.local/api/rag/doc-1", text: "Cột cờ Lũng Cú nằm trên đỉnh núi Rồng." },
      { title: "Ẩm thực Đồng Văn /api/admin/rag/123", text: "Thắng cố, bánh tam giác mạch." },
      { title: "https://blob.vercel-storage.com/private/secret.pdf", text: "Chỉ là URL nội bộ." },
    ];
    const { all, sse } = await run(
      [{ tool: "lookupLocalKnowledge", input: { question: "Lũng Cú có gì hay" } }, { text: "Cột cờ Lũng Cú rất đáng đi." }],
      {},
      { knowledge },
    );
    const sources = sourcesPartSchema.parse(all.find(p => p.type === "data-sources")!.data).sources;
    expect(sources).toEqual([
      { kind: "DOCUMENT", title: "Cẩm nang Cột cờ Lũng Cú" },
      { kind: "DOCUMENT", title: "Ẩm thực Đồng Văn" },
    ]);
    expect(sse).not.toContain("/api/admin/rag/123");
    expect(sse).not.toContain("blob.vercel-storage.com");
  });

  it("drops internal URLs in parseSourcesPart and renders plain document chips with no links", () => {
    expect(parseSourcesPart({ sources: [{ kind: "DOCUMENT", title: "Tài liệu /api/internal/secret" }] })).toEqual([]);
    expect(parseSourcesPart({ sources: [{ kind: "DOCUMENT", title: "https://evil.test/doc" }] })).toEqual([]);
    const parsed = parseSourcesPart({
      sources: [
        { kind: "DOCUMENT", title: "Cẩm nang Hà Giang" },
        { domain: "du-lich.example.vn" },
      ],
    });
    expect(parsed).toHaveLength(2);
    const html = renderToStaticMarkup(createElement(TripsageSourcesView, { sources: parsed }));
    expect(html).toContain("Cẩm nang Hà Giang");
    expect(html).toContain("du-lich.example.vn");
    expect(html).not.toMatch(/<a |href=/);
  });
});
