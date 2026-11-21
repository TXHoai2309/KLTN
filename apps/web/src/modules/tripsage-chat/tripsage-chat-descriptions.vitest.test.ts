import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import { TripsageTimelineView } from "../../components/tripsage-chat/tripsage-timeline-view";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { planningCandidate } from "../../test/planning-fixtures";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { tripsageChatResponse } from "./tripsage-chat-http";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import { timelinePartSchema, type TimelinePart } from "./tripsage-timeline";

const FIXED_NOW = new Date("2026-11-21T03:00:00Z");
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = {
  route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }),
  coordinateRoute: async () => verified,
};

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `desc-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `desc-${++seq}` } }),
}) as unknown as AuthorizationDependencies;

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

describe("Ticket 08: catalog visit descriptions and 'Vài lưu ý' rules", () => {
  it("streams catalog description on VISIT items that have one and omits it when empty", async () => {
    const withDesc = {
      ...planningCandidate("d1"),
      name: "Cổng Trời Quản Bạ",
      description: "Check-in ngắm Núi Đôi và thung lũng Quản Bạ từ trên cao.",
    };
    const withoutDesc = {
      ...planningCandidate("d2"),
      name: "Đèo Bắc Sum",
      description: "   ",
    };

    const model = scripted([
      { tool: "listDestinations", input: {} },
      { tool: "proposeItinerary", input: { selection: { days: [["d1", "d2"]] } } },
      { text: "Lịch 1 ngày đã sẵn sàng." },
    ]);

    const request = new Request("https://app.test/api/ai/chat", {
      method: "POST",
      headers: { origin: "https://app.test", "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Lập lịch 1 ngày đi Quản Bạ" }] }],
        tripInfo: { transport: "MOTORCYCLE", durationDays: 1, startDate: "2026-12-01" },
        journey: {
          origin: { label: "TP Hà Giang", latitude: 22.8233, longitude: 104.9836, source: "MANUAL", confirmed: true },
          departureMinute: 420,
          returnDeadlineMinute: 1080,
          returnDepartureMinute: null,
        },
      }),
    });

    const planning = (): TripsagePlanningDeps => ({
      candidates: async () => [withDesc, withoutDesc],
      routes: routes as never,
      now: () => FIXED_NOW,
    });

    const response = await tripsageChatResponse(request, {
      authorization: auth(),
      model: async () => model,
      env: { TRIPSAGE_CHAT_ENABLED: "true" },
      admit: createPlanningAdmission(),
      planning,
    });
    expect(response.status).toBe(200);
    const sse = await response.text();
    const parts = sse
      .split("\n")
      .filter(line => line.startsWith("data: {"))
      .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

    const timelineChunk = parts.find(part => part.type === "data-timeline");
    expect(timelineChunk).toBeDefined();
    const timeline = timelinePartSchema.parse(timelineChunk!.data);
    const visits = timeline.days[0]!.items.filter(item => item.kind === "VISIT");
    expect(visits).toHaveLength(2);
    expect(visits[0]!.label).toBe("Cổng Trời Quản Bạ");
    expect(visits[0]!.description).toBe("Check-in ngắm Núi Đôi và thung lũng Quản Bạ từ trên cao.");
    expect(visits[1]!.label).toBe("Đèo Bắc Sum");
    expect(visits[1]!.description).toBeUndefined();
  });

  it("renders a muted description line only for VISIT items that have one", () => {
    const timeline: TimelinePart = {
      days: [
        {
          day: 1,
          date: "2026-12-01",
          items: [
            {
              slotId: "d1-visit-1",
              kind: "VISIT",
              startMinute: 480,
              endMinute: 540,
              label: "Cổng Trời Quản Bạ",
              description: "Check-in ngắm Núi Đôi và thung lũng Quản Bạ.",
            },
            {
              slotId: "d1-visit-2",
              kind: "VISIT",
              startMinute: 600,
              endMinute: 660,
              label: "Đèo Bắc Sum",
            },
          ],
        },
      ],
    };

    const html = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline, suggestions: [] }));
    expect(html).toContain('class="tripsage-timeline-desc">Check-in ngắm Núi Đôi và thung lũng Quản Bạ.</p>');
    const descMatches = html.match(/tripsage-timeline-desc/g) ?? [];
    expect(descMatches).toHaveLength(1);
  });

  it("instructs the assistant on 'Vài lưu ý' limits and grounding boundaries", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Vài lưu ý");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("TỐI ĐA 3");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("KHÔNG nêu tên khách sạn");
  });
});
