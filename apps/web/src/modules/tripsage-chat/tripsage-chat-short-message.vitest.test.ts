import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { buildAccessLeg } from "./tripsage-access-leg";
import { buildTripsageChatBody } from "./tripsage-chat-context";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `short-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `short-${++seq}` } }),
}) as unknown as AuthorizationDependencies;

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};

function mockReply(text: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ],
      }),
    }),
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

const CURRENT_ITINERARY = {
  distanceKm: 446.2,
  days: [
    { day: 1, stops: [{ id: "a", name: "Điểm a", arrivalMinute: 540, departureMinute: 660 }] },
  ],
};

const ACCESS_LEG = buildAccessLeg(
  {
    hubId: "HA_NOI",
    outbound: [{ mode: "FLIGHT", from: "TP.HCM", to: "Hà Nội", durationMinutes: 120, priceVndPerPerson: 1_500_000 }],
    return: [{ mode: "FLIGHT", from: "Hà Nội", to: "TP.HCM", durationMinutes: 120, priceVndPerPerson: 1_500_000 }],
  },
  "TP.HCM",
  2,
);

async function postChat(body: unknown, replyText = "Chào bạn! Bạn muốn điều chỉnh gì cho chuyến Hà Giang đang lập?") {
  const model = mockReply(replyText);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning: planning(),
  });
  return { response, model };
}

describe("Ticket 02: short messages in an active itinerary conversation never 400", () => {
  it('accepts "hi" after a long (>2000 char) assistant itinerary response', async () => {
    const longAssistantProse = "Lịch trình Hà Giang 4 ngày 3 đêm của bạn đã sẵn sàng. ".repeat(60); // > 3000 chars
    const body = buildTripsageChatBody({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Lên lịch đi Hà Giang 4 ngày bằng xe máy" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: longAssistantProse }] },
        { id: "u2", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      journey: COMPLETE_JOURNEY_FIXTURE,
      tripInfo: TRIP_INFO_FIXTURE,
      itinerary: CURRENT_ITINERARY,
      accessLeg: ACCESS_LEG as never,
      conversationId: "conv_12345678",
    });
    const { response } = await postChat(body);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Chào bạn");
  });

  it('accepts "hello" when a prior assistant message accumulated >50 AI SDK tool/data parts', async () => {
    const manyParts = [
      ...Array.from({ length: 52 }, (_, i) => ({ type: i % 2 === 0 ? "step-start" : "tool-searchPlaces", toolCallId: `c${i}` })),
      { type: "text", text: "Đây là lịch trình chi tiết và gợi ý chỗ nghỉ cho bạn." },
    ];
    const body = buildTripsageChatBody({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Lên lịch Hà Giang" }] },
        { id: "a1", role: "assistant", parts: manyParts },
        { id: "u2", role: "user", parts: [{ type: "text", text: "hello" }] },
      ],
      journey: COMPLETE_JOURNEY_FIXTURE,
      tripInfo: TRIP_INFO_FIXTURE,
      itinerary: CURRENT_ITINERARY,
      accessLeg: ACCESS_LEG as never,
      conversationId: "conv_12345678",
    });
    const { response } = await postChat(body);
    expect(response.status).toBe(200);

    // Also verify the server route itself accepts >50 raw AI SDK parts on an assistant message.
    const rawDirect = await postChat({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Lên lịch Hà Giang" }] },
        { id: "a1", role: "assistant", parts: manyParts },
        { id: "u2", role: "user", parts: [{ type: "text", text: "hello" }] },
      ],
      journey: COMPLETE_JOURNEY_FIXTURE,
      tripInfo: TRIP_INFO_FIXTURE,
      currentItinerary: CURRENT_ITINERARY,
      accessLeg: ACCESS_LEG,
      conversationId: "conv_12345678",
    });
    expect(rawDirect.response.status).toBe(200);
  });

  it('accepts "tôi muốn thay đổi" when prior assistant replies exceed 20,000 total chars or carry bulky data-itinerary parts', async () => {
    const hugePolyline = Array.from({ length: 4000 }, (_, i) => [105.0 + i * 0.0001, 22.8 + i * 0.0001]);
    const bigAssistantTurns = Array.from({ length: 6 }, (_, i) => [
      { id: `u${i}`, role: "user", parts: [{ type: "text", text: `Góp ý lượt ${i}` }] },
      {
        id: `a${i}`,
        role: "assistant",
        parts: [
          { type: "data-itinerary", id: "itinerary", data: { geometry: hugePolyline } },
          { type: "text", text: `Chi tiết đề xuất lượt ${i}: `.padEnd(3_600, "x") },
        ],
      },
    ]).flat();
    const body = buildTripsageChatBody({
      messages: [
        ...bigAssistantTurns,
        { id: "u-last", role: "user", parts: [{ type: "text", text: "tôi muốn thay đổi" }] },
      ],
      journey: COMPLETE_JOURNEY_FIXTURE,
      tripInfo: TRIP_INFO_FIXTURE,
      itinerary: CURRENT_ITINERARY,
      accessLeg: ACCESS_LEG as never,
      conversationId: "conv_12345678",
    });
    const { response } = await postChat(body, "Bạn muốn đổi phần nào trong lịch?");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Bạn muốn đổi phần nào");
  });

  it("still rejects oversized user messages (>2000 chars) and oversized raw JSON bodies (>128KB)", async () => {
    const tooLongUser = await postChat({
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "a".repeat(2001) }] }],
    });
    expect(tooLongUser.response.status).toBe(400);

    const hugeRawBody = {
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] }],
      padding: "x".repeat(130 * 1024),
    };
    const tooLarge = await postChat(hugeRawBody);
    expect(tooLarge.response.status).toBe(400);
  });
});
