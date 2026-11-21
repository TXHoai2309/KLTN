import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { journeyPartSchema } from "./tripsage-chat-context";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import { accessLegPartSchema } from "./tripsage-access-leg";

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `hub-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `hub-${++seq}` } }),
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

const OLD_ORIGIN_JOURNEY = {
  origin: {
    label: "Quận Hoàng Mai, Hà Nội",
    latitude: 20.9742,
    longitude: 105.8473,
    source: "GOOGLE_PLACES" as const,
    confirmed: true,
  },
  departureMinute: 420,
  returnDeadlineMinute: 1080,
  returnDepartureMinute: null,
};

const parts = (sse: string) =>
  sse
    .split("\n")
    .filter(line => line.startsWith("data: {"))
    .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

async function runChat(text: string, steps: Step[], journey = OLD_ORIGIN_JOURNEY) {
  const model = scripted(steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
      tripInfo: TRIP_INFO_FIXTURE,
      journey,
    }),
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning: planning(),
  });
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, all: parts(sse), model };
}

describe("Ticket 05: Fixed hub confirmation succeeds on first agreement and replaces old origin", () => {
  it('confirms hub:HA_NOI on first turn when user taps/types "Tập kết ở Hà Nội" and plans from the hub + access leg', async () => {
    const { all } = await runChat("Tập kết ở Hà Nội", [
      { tool: "recordTripInfo", input: { homeCity: "TP.HCM" } },
      { tool: "confirmOrigin", input: { candidateId: "hub:HA_NOI" } },
      { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
      {
        tool: "planAccessLeg",
        input: {
          hubId: "HA_NOI",
          outbound: [{ mode: "FLIGHT", from: "TP.HCM", to: "Hà Nội", durationMinutes: 125, priceVndPerPerson: 1_500_000 }],
          return: [{ mode: "FLIGHT", from: "Hà Nội", to: "TP.HCM", durationMinutes: 125, priceVndPerPerson: 1_500_000 }],
        },
      },
      { text: "Đã chốt điểm tập kết Hà Nội và lên lịch từ đó." },
    ]);
    const journey = journeyPartSchema.parse(all.find(p => p.type === "data-journey")!.data).journey;
    expect(journey.origin?.label).toBe("Hà Nội (bến xe Mỹ Đình)");
    expect(journey.origin?.confirmed).toBe(true);

    const itinerary = plannerResultSchema.parse(all.find(p => p.type === "data-itinerary")!.data);
    expect(itinerary.requirement.journey?.origin?.label).toBe("Hà Nội (bến xe Mỹ Đình)");

    const accessLeg = accessLegPartSchema.parse(all.find(p => p.type === "data-access-leg")!.data);
    expect(accessLeg.hubName).toBe("Hà Nội (bến xe Mỹ Đình)");
    expect(accessLeg.homeCity).toBe("TP.HCM");
  });

  it('confirms hub:HA_NOI when user says "Đổi sang tập kết Hà Nội" or "Đúng, tập kết ở Hà Nội"', async () => {
    for (const phrase of ["Đổi sang tập kết Hà Nội", "Đúng, tập kết ở Hà Nội", "Xuất phát từ Hà Nội", "Đồng ý tập kết ở Hà Nội để đi Hà Giang"]) {
      const { all } = await runChat(phrase, [
        { tool: "confirmOrigin", input: { candidateId: "hub:HA_NOI" } },
        { text: "Đã xác nhận điểm tập kết Hà Nội." },
      ]);
      const journeyPart = all.find(p => p.type === "data-journey");
      expect(journeyPart, phrase).toBeTruthy();
      expect(journeyPartSchema.parse(journeyPart!.data).journey.origin?.label).toBe("Hà Nội (bến xe Mỹ Đình)");
    }
  });

  it('confirms hub:HA_GIANG_CITY on first turn when user taps/types "Tập kết ở TP Hà Giang" or "Đổi sang TP Hà Giang"', async () => {
    for (const phrase of ["Tập kết ở TP Hà Giang", "Đổi sang TP Hà Giang", "Xuất phát từ TP Hà Giang"]) {
      const { all } = await runChat(phrase, [
        { tool: "confirmOrigin", input: { candidateId: "hub:HA_GIANG_CITY" } },
        { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
        { text: "Đã xác nhận điểm tập kết TP Hà Giang." },
      ]);
      const journeyPart = all.find(p => p.type === "data-journey");
      expect(journeyPart, phrase).toBeTruthy();
      expect(journeyPartSchema.parse(journeyPart!.data).journey.origin?.label).toBe("TP Hà Giang (bến xe phía Nam)");
      const itinerary = plannerResultSchema.parse(all.find(p => p.type === "data-itinerary")!.data);
      expect(itinerary.requirement.journey?.origin?.label).toBe("TP Hà Giang (bến xe phía Nam)");
    }
  });
});
