import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import { TripsageTimelineView } from "../../components/tripsage-chat/tripsage-timeline-view";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { planningCandidate } from "../../test/planning-fixtures";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { tripInfoPartSchema, type TripsageItinerarySummary, type TripsageTripInfo } from "./tripsage-chat-context";
import { tripsageChatResponse } from "./tripsage-chat-http";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import type { PlacesSearch } from "./tripsage-places";
import { suggestionsPartSchema, type TimelinePart } from "./tripsage-timeline";

const FIXED_NOW = new Date("2026-11-21T03:00:00Z");
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = {
  route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }),
  coordinateRoute: async () => verified,
};

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `meal-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `meal-${++seq}` } }),
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

const STOP_A = { ...planningCandidate("a"), name: "Cổng Trời Quản Bạ", latitude: 23.0468, longitude: 104.9885 };
const STOP_B = { ...planningCandidate("b"), name: "Phố cổ Đồng Văn", latitude: 23.277, longitude: 105.363 };

const CURRENT_ITINERARY: TripsageItinerarySummary = {
  distanceKm: 130,
  days: [
    {
      day: 1,
      stops: [
        { id: "a", name: "Cổng Trời Quản Bạ", arrivalMinute: 480, departureMinute: 720 },
        { id: "b", name: "Phố cổ Đồng Văn", arrivalMinute: 840, departureMinute: 960 },
      ],
    },
  ],
};

const systemTextOf = (model: MockLanguageModelV4, stepIndex = 0) =>
  (model.doStreamCalls[stepIndex]!.prompt as { role: string; content: unknown }[])
    .filter(message => message.role === "system")
    .map(message => String(message.content))
    .join("\n");

const partsOf = (sse: string) =>
  sse
    .split("\n")
    .filter(line => line.startsWith("data: {"))
    .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

async function chat(input: {
  text: string;
  steps: Step[];
  tripInfo?: TripsageTripInfo;
  places?: PlacesSearch;
}) {
  const model = scripted(input.steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: input.text }] }],
      tripInfo: input.tripInfo ?? { transport: "MOTORCYCLE", durationDays: 1, startDate: "2026-12-01" },
      journey: COMPLETE_JOURNEY_FIXTURE,
      currentItinerary: CURRENT_ITINERARY,
    }),
  });
  const planning = (): TripsagePlanningDeps => ({
    candidates: async () => [STOP_A, STOP_B],
    routes: routes as never,
    now: () => FIXED_NOW,
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning,
    ...(input.places ? { places: () => input.places! } : {}),
  });
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, all: partsOf(sse), model };
}

describe("Ticket 12: post-itinerary meal suggestions offer", () => {
  it("runs searchPlaces + addSuggestions MEAL on agreement and returns MEAL suggestions with placeId and Place preview button", async () => {
    const places: PlacesSearch = async () => ({
      status: "RESULTS",
      places: [
        { placeId: "ChIJ_meal_lunch_1", name: "Quán Phở Tráng Kìm", latitude: 23.0475, longitude: 104.989 },
        { placeId: "ChIJ_meal_dinner_1", name: "Nhà Hàng Phố Cổ", latitude: 23.2775, longitude: 105.3635 },
      ],
    });

    const { all } = await chat({
      text: "Có, tìm quán ăn giúp mình",
      places,
      steps: [
        { tool: "searchPlaces", input: { query: "quán ăn", nearDestinationId: "a" } },
        { tool: "searchPlaces", input: { query: "quán ăn", nearDestinationId: "b" } },
        {
          tool: "addSuggestions",
          input: {
            items: [
              { slotId: "d1-lunch", kind: "MEAL", title: "Quán Phở Tráng Kìm", detail: "Ăn trưa gần Quản Bạ", placeId: "ChIJ_meal_lunch_1" },
              { slotId: "d1-visit-2", kind: "MEAL", title: "Nhà Hàng Phố Cổ", detail: "Ăn tối quanh điểm cuối ngày", placeId: "ChIJ_meal_dinner_1" },
            ],
          },
        },
        { text: "Mình đã gắn thêm gợi ý quán ăn gần các điểm dừng (chưa kiểm tra)." },
      ],
    });

    const suggestionsPart = all.find(part => part.type === "data-suggestions");
    expect(suggestionsPart).toBeDefined();
    const parsed = suggestionsPartSchema.parse(suggestionsPart!.data);
    expect(parsed.suggestions).toHaveLength(2);
    expect(parsed.suggestions[0]).toMatchObject({
      slotId: "d1-lunch",
      kind: "MEAL",
      place: { placeId: "ChIJ_meal_lunch_1", name: "Quán Phở Tráng Kìm" },
    });
    expect(parsed.suggestions[1]).toMatchObject({
      slotId: "d1-visit-2",
      kind: "MEAL",
      place: { placeId: "ChIJ_meal_dinner_1", name: "Nhà Hàng Phố Cổ" },
    });

    const timeline: TimelinePart = {
      days: [
        {
          day: 1,
          date: "2026-12-01",
          items: [
            { slotId: "d1-visit-1", kind: "VISIT", startMinute: 480, endMinute: 720, label: "Cổng Trời Quản Bạ", latitude: 23.0468, longitude: 104.9885 },
            { slotId: "d1-lunch", kind: "LUNCH", startMinute: 720, endMinute: 780, label: "Nghỉ trưa 60 phút" },
            { slotId: "d1-visit-2", kind: "VISIT", startMinute: 840, endMinute: 960, label: "Phố cổ Đồng Văn", latitude: 23.277, longitude: 105.363 },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline, suggestions: parsed.suggestions }));
    expect(html).toContain('aria-label="Xem nhanh Quán Phở Tráng Kìm"');
    expect(html).toContain('aria-label="Xem nhanh Nhà Hàng Phố Cổ"');
  });

  it("records mealSuggestionsDeclined in tripInfo on decline and carries it in next turn's context so it won't ask again", async () => {
    const firstTurn = await chat({
      text: "Không cần đâu",
      steps: [
        { tool: "recordTripInfo", input: { mealSuggestionsDeclined: true } },
        { text: "Được rồi, mình giữ nguyên lịch trình hiện tại nhé." },
      ],
    });
    const tripInfoChunk = firstTurn.all.find(part => part.type === "data-trip-info");
    expect(tripInfoChunk).toBeDefined();
    const recorded = tripInfoPartSchema.parse(tripInfoChunk!.data).tripInfo;
    expect(recorded.mealSuggestionsDeclined).toBe(true);

    const nextTurn = await chat({
      text: "Cảm ơn bạn",
      tripInfo: recorded,
      steps: [{ text: "Chúc bạn có chuyến đi vui vẻ!" }],
    });
    expect(systemTextOf(nextTurn.model)).toContain("gợi ý quán ăn: người dùng đã từ chối");
  });

  it("instructs the assistant to ask the single meal-offer question after non-assumed itineraries and defer it on Assumed drafts", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Lưu chuyến này nhé?");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("mealSuggestionsDeclined");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Chỉ hỏi tìm thêm quán ăn khi người dùng đã nhắc chuyện ăn uống/quán ăn");
  });

  it("Bug 6: blocks unprompted meal replies after a valid edited schedule (invites save) and on incomplete cost, while allowing meal replies when user asked about food", async () => {
    // 1. Clean edited itinerary within budget, user did NOT mention food -> blocks meal reply with SAVE_OR_COST_PRIORITY
    const cleanEdit = await chat({
      text: "Ngày 1 bỏ Cột cờ Lũng Cú, thêm Phố cổ Đồng Văn buổi chiều.",
      steps: [
        { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
        {
          tool: "estimateCosts",
          input: {
            budgetCap: 20_000_000,
            lines: [
              { category: "lodging", label: "Lưu trú", amount: 2_000_000 },
              { category: "food", label: "Ăn uống", amount: 1_500_000 },
            ],
          },
        },
        { tool: "suggestReplies", input: { replies: ["Có, tìm quán ăn giúp mình", "Không cần đâu"] } },
        { text: "Lịch mới đã đạt kiểm tra. Lưu chuyến này nhé?" },
      ],
    });
    const cleanToolPrompts = JSON.stringify(cleanEdit.model.doStreamCalls.map(c => c.prompt));
    expect(cleanToolPrompts).toContain("Lưu chuyến này nhé?");
    expect(cleanToolPrompts).toContain("SAVE_OR_COST_PRIORITY");

    // 2. When user explicitly asked about eating/food -> meal suggestReplies IS allowed
    const foodAsk = await chat({
      text: "Lập lại lịch và gợi ý giúp mình thêm quán ăn ngon dọc đường nhé",
      steps: [
        { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
        { tool: "suggestReplies", input: { replies: ["Có, tìm quán ăn giúp mình", "Không cần đâu"] } },
        { text: "Bạn có muốn mình tìm thêm quán ăn gần các điểm dừng không?" },
      ],
    });
    const foodToolPrompts = JSON.stringify(foodAsk.model.doStreamCalls.map(c => c.prompt));
    expect(foodToolPrompts).not.toContain("SAVE_OR_COST_PRIORITY");
    expect(foodAsk.all.some(p => p.type === "data-quick-replies")).toBe(true);
  });
});
