import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { fixtureRoutes, planningCandidate } from "../../test/planning-fixtures";
import {
  computeMinimumSelfDriveDays,
  extractStatedDateFromText,
  FAR_HOME_TRANSPORT_CHIPS,
  FIXED_HUB_CANDIDATES,
  isFarFromHubs,
  isFarHomeCityName,
  permitsOriginConfirmation,
  wantsDirectDriveFromHome,
} from "./tripsage-chat-origin";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import { tripsageChatResponse, type TripsageChatHttpDependencies } from "./tripsage-chat-http";
import type { OriginLookup, TripsagePlanningDeps } from "./tripsage-chat-tools";

const SECRET = "test-origin-hmac-secret-at-least-32-characters";
const FIXED_NOW = new Date("2026-11-23T03:00:00Z"); // 10:00 VN on 2026-11-23
let seq = 0;

const auth = () =>
  ({
    database: { user: { findUnique: async () => ({ id: `ft-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
    resolveSession: async () => ({ user: { id: `ft-${++seq}` } }),
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
      const chunks =
        "tool" in step
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
  candidates: async () => [planningCandidate("a", 90), planningCandidate("b", 90)],
  routes: {
    route: fixtureRoutes.route,
    coordinateRoute: async () => ({
      status: "VERIFIED",
      reason: null,
      durationSeconds: 3600,
      distanceMeters: 50_000,
      provider: "STADIA_MAPS",
    }),
  },
  now: () => FIXED_NOW,
});

const parts = (sse: string) =>
  sse
    .split("\n")
    .filter(line => line.startsWith("data: {"))
    .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

async function chat(
  messages: { id: string; role: "user" | "assistant"; text: string }[],
  steps: Step[],
  body: Record<string, unknown> = {},
  over: Partial<TripsageChatHttpDependencies> = {},
) {
  const model = scripted(steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(m => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.text }] })),
      ...body,
    }),
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning: planning(),
    originSecret: () => SECRET,
    now: () => FIXED_NOW,
    ...over,
  });
  expect(response.status).toBe(200);
  return { sse: await response.text(), model };
}

describe("Ticket 03: far home city & no redundant date confirmation", () => {
  it("identifies far home cities by name and by coordinates", () => {
    expect(isFarHomeCityName("Đà Nẵng")).toBe(true);
    expect(isFarHomeCityName("TP Hồ Chí Minh")).toBe(true);
    expect(isFarHomeCityName("Sài Gòn")).toBe(true);
    expect(isFarHomeCityName("Cần Thơ")).toBe(true);
    expect(isFarHomeCityName("Hà Nội")).toBe(false);
    expect(isFarHomeCityName("Hải Phòng")).toBe(false);
    expect(isFarHomeCityName("Cầu Giấy")).toBe(false);

    // Đà Nẵng (~600 km from Hà Nội) and TP HCM (~1140 km)
    expect(isFarFromHubs({ latitude: 16.0544, longitude: 108.2022 })).toBe(true);
    expect(isFarFromHubs({ latitude: 10.7769, longitude: 106.7009 })).toBe(true);
    // Hà Nội and Hải Phòng
    expect(isFarFromHubs({ latitude: 21.0285, longitude: 105.8542 })).toBe(false);
    expect(isFarFromHubs({ latitude: 20.8449, longitude: 106.6881 })).toBe(false);
  });

  it("extracts stated day/month dates (including approximate 'khoảng 12/12') while leaving vague windows null", () => {
    expect(extractStatedDateFromText("4 người ở Đà Nẵng, đi khoảng 12/12", FIXED_NOW)).toEqual({
      date: "2026-12-12",
      tentative: true,
    });
    expect(extractStatedDateFromText("Đi ngày 12/12/2026", FIXED_NOW)).toEqual({
      date: "2026-12-12",
      tentative: false,
    });
    expect(extractStatedDateFromText("Mình định đi ngày 15 tháng 1", FIXED_NOW)).toEqual({
      date: "2027-01-15",
      tentative: false,
    });
    expect(extractStatedDateFromText("Mình định đi giữa tháng sau", FIXED_NOW)).toBeNull();
    expect(extractStatedDateFromText("đi 4 ngày 3 đêm", FIXED_NOW)).toBeNull();
  });

  it("blocks local candidates in Đà Nẵng / TP HCM inside findOrigin and emits 3 hub-transport chips", async () => {
    const originSearch: OriginLookup = vi.fn(async () => ({
      status: "RESULTS" as const,
      cached: false,
      results: [
        { label: "Ngũ Hành Sơn, Đà Nẵng", latitude: 16.002, longitude: 108.263, source: "GOOGLE_PLACES" as const, confirmed: false as const },
        { label: "Bà Nà Hills, Đà Nẵng", latitude: 15.997, longitude: 107.996, source: "GOOGLE_PLACES" as const, confirmed: false as const },
        { label: "Cầu Rồng, Đà Nẵng", latitude: 16.061, longitude: 108.227, source: "GOOGLE_PLACES" as const, confirmed: false as const },
      ],
    }));

    const { sse, model } = await chat(
      [{ id: "u1", role: "user", text: "4 người ở Đà Nẵng, 4 ngày xe máy, khoảng 12/12" }],
      [
        { tool: "findOrigin", input: { query: "Đà Nẵng" } },
        { text: "Từ Đà Nẵng, bạn muốn ra Hà Nội bằng máy bay, tàu hỏa hay xe khách?" },
      ],
      {},
      { originSearch: () => originSearch },
    );

    const emitted = parts(sse);
    const toolResults = JSON.stringify(
      (model.doStreamCalls[1]!.prompt as { role: string }[]).filter(m => m.role === "tool"),
    );
    // Must never emit Ngũ Hành Sơn / Bà Nà / Cầu Rồng as origin candidates
    expect(emitted.some(p => p.type === "data-origin-candidates")).toBe(false);
    expect(toolResults).not.toContain("Ngũ Hành Sơn");
    expect(toolResults).not.toContain("Bà Nà");
    expect(toolResults).not.toContain("Cầu Rồng");
    expect(toolResults).toContain("farHomeCity");

    // Emits the 3 transport chips (máy bay · tàu · xe khách)
    const quickReplies = emitted.find(p => p.type === "data-quick-replies")?.data as { replies: string[] } | undefined;
    expect(quickReplies?.replies).toEqual([...FAR_HOME_TRANSPORT_CHIPS]);

    // Also blocks an unlisted far district via coordinate distance check
    const districtRes = await chat(
      [{ id: "u2", role: "user", text: "Mình ở Sơn Trà muốn đi Hà Giang" }],
      [
        { tool: "findOrigin", input: { query: "Sơn Trà" } },
        { text: "Từ Sơn Trà, bạn muốn ra điểm tập kết bằng máy bay, tàu hỏa hay xe khách?" },
      ],
      {},
      { originSearch: () => originSearch },
    );
    expect(parts(districtRes.sse).some(p => p.type === "data-origin-candidates")).toBe(false);
    expect(JSON.stringify(districtRes.model.doStreamCalls[1]!.prompt)).toContain("farHomeCity");
  });

  it("blocks redundant date-confirmation suggestReplies and runs proposeItinerary immediately with stated 'khoảng 12/12' (AC-5 <= 2 turns)", async () => {
    const { sse, model } = await chat(
      [
        { id: "u1", role: "user", text: "4 người ở Đà Nẵng, 4 ngày xe máy, khoảng 12/12" },
        { id: "a1", role: "assistant", text: "Từ Đà Nẵng, bạn muốn ra điểm tập kết (Hà Nội hoặc TP Hà Giang) bằng máy bay, tàu hỏa hay xe khách?" },
        { id: "u2", role: "user", text: "Bay ra Hà Nội rồi xe khách lên TP Hà Giang" },
      ],
      [
        { tool: "confirmOrigin", input: { candidateId: "hub:HA_GIANG_CITY" } },
        // Even if the model tries to emit a date-confirmation turn, the server blocks it
        { tool: "suggestReplies", input: { replies: ["Đúng, đi 12/12/2026", "Chọn ngày khác"] } },
        // Model then proceeds immediately to proposeItinerary in the SAME turn (turn 2)
        { tool: "proposeItinerary", input: { selection: { days: [["a"], ["b"]] } } },
        { text: "Mình đã lên lịch Hà Giang từ TP Hà Giang bắt đầu 12/12/2026." },
      ],
      {
        tripInfo: {
          homeCity: "Đà Nẵng",
          travelers: 4,
          durationDays: 2,
          transport: "MOTORCYCLE",
        },
      },
    );

    const emitted = parts(sse);
    // Server blocked the redundant date-confirmation suggestReplies
    expect(JSON.stringify(model.doStreamCalls[2]!.prompt)).toContain("DATE_ALREADY_STATED");
    // Itinerary produced in Turn 2 using stated date 2026-12-12 (NOT assumed Saturday)
    const itinerary = emitted.find(p => p.type === "data-itinerary")?.data as { requirement?: { startDate?: string } } | undefined;
    expect(itinerary?.requirement?.startDate).toBe("2026-12-12");
    // Includes "Đổi ngày" chip for tentative stated date
    const quickReplies = emitted
      .filter(p => p.type === "data-quick-replies")
      .map(p => (p.data as { replies: string[] }).replies);
    expect(quickReplies.some(list => list.includes("Đổi ngày"))).toBe(true);
  });

  it("updates persona instructions to match the server guards", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Đổi ngày");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/quận\/huyện|điểm cụ thể trong thành phố nhà/u);
  });

  it("Bug 1: permits immediate fixed-hub confirmation when user names hub + travel verb and still asks when vague", () => {
    const hn = FIXED_HUB_CANDIDATES.find(c => c.id === "hub:HA_NOI")!;
    const hg = FIXED_HUB_CANDIDATES.find(c => c.id === "hub:HA_GIANG_CITY")!;
    const fullScenario =
      "Nhóm mình 4 người ở Đà Nẵng, muốn đi Hà Giang 4 ngày bằng xe máy, khởi hành khoảng 12/12. Ngân sách tầm 5 triệu/người, thích săn mây và ăn đặc sản. Bọn mình bay ra Hà Nội rồi đi xe khách lên TP Hà Giang, thuê xe máy ở đó.";

    expect(permitsOriginConfirmation(fullScenario, hg, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(true);
    expect(permitsOriginConfirmation(fullScenario, hn, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);
    expect(permitsOriginConfirmation("đi xe khách lên TP Hà Giang", hg, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(true);
    expect(permitsOriginConfirmation("bay ra Hà Nội rồi tự chạy xe từ Hà Nội", hn, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(true);
    expect(permitsOriginConfirmation("bay ra Hà Nội rồi tự chạy xe từ Hà Nội", hg, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);

    // Vague / ambiguous messages must still require confirmation
    expect(permitsOriginConfirmation("chắc đi Hà Giang", hg, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);
    expect(permitsOriginConfirmation("chắc đi xe khách lên TP Hà Giang", hg, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);
    expect(permitsOriginConfirmation("đi từ Hà Nội hay TP Hà Giang", hg, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);
  });

  it("Bug 1: produces itinerary in Turn 1 for the Đà Nẵng + bus to TP Hà Giang scenario without asking to confirm hub", async () => {
    const fullScenario =
      "Nhóm mình 4 người ở Đà Nẵng, muốn đi Hà Giang 4 ngày bằng xe máy, khởi hành khoảng 12/12. Ngân sách tầm 5 triệu/người, thích săn mây và ăn đặc sản. Bọn mình bay ra Hà Nội rồi đi xe khách lên TP Hà Giang, thuê xe máy ở đó.";

    const { sse, model } = await chat(
      [{ id: "u1", role: "user", text: fullScenario }],
      [
        {
          tool: "recordTripInfo",
          input: {
            homeCity: "Đà Nẵng",
            travelers: 4,
            durationDays: 2,
            startDate: "2026-12-13",
            transport: "MOTORCYCLE",
            pace: "PACKED",
          },
        },
        { tool: "confirmOrigin", input: { candidateId: "hub:HA_GIANG_CITY" } },
        { tool: "proposeItinerary", input: { selection: { days: [["a"], ["b"]] } } },
        { text: "Mình đã xếp lịch chạy xe từ TP Hà Giang bắt đầu 13/12." },
      ],
    );

    const emitted = parts(sse);
    const toolPrompts = JSON.stringify(model.doStreamCalls.map(c => c.prompt));
    expect(toolPrompts).not.toContain("ORIGIN_CONFIRMATION_REQUIRED");
    const journey = emitted.find(p => p.type === "data-journey")?.data as { journey?: { origin?: { label?: string; confirmed?: boolean } } } | undefined;
    expect(journey?.journey?.origin?.label).toBe("TP Hà Giang (bến xe phía Nam)");
    expect(journey?.journey?.origin?.confirmed).toBe(true);
    expect(emitted.some(p => p.type === "data-itinerary")).toBe(true);
  });

  it("Bug 5: computes minimum self-drive days from distance/rest policy and explains infeasible direct drive with 3 chips", async () => {
    expect(wantsDirectDriveFromHome("Mình ở TP Hồ Chí Minh, muốn chạy xe máy thẳng ra Hà Giang chơi 2 ngày cuối tuần này rồi về, đi 1 mình.")).toBe(true);
    expect(wantsDirectDriveFromHome("Bay ra Hà Nội rồi thuê xe máy đi Hà Giang")).toBe(false);

    // 1,900 km / 42h motorbike one-way -> ceil(42/6)=7 days each way + 2 days sightseeing = 16 days
    const hcmMoto = computeMinimumSelfDriveDays({
      oneWayDistanceKm: 1900,
      oneWayDrivingSeconds: 42 * 3600,
      transport: "MOTORCYCLE",
      sightseeingDays: 2,
    });
    expect(hcmMoto.maxDailyDrivingHours).toBe(6);
    expect(hcmMoto.oneWayTravelDays).toBe(7);
    expect(hcmMoto.roundTripMinDays).toBe(16);
    expect(hcmMoto.oneWayTotalHoursWithRest).toBeGreaterThan(42);

    // Car allows 8h/day -> fewer travel days for same duration
    const hcmCar = computeMinimumSelfDriveDays({
      oneWayDistanceKm: 1900,
      oneWayDrivingSeconds: 36 * 3600,
      transport: "CAR",
      sightseeingDays: 2,
    });
    expect(hcmCar.maxDailyDrivingHours).toBe(8);
    expect(hcmCar.oneWayTravelDays).toBe(5);
    expect(hcmCar.roundTripMinDays).toBe(12);

    // Route test reproducing chat 068a84db with real routing metrics (1,900 km, 42h)
    const { sse, model } = await chat(
      [{ id: "u1", role: "user", text: "Mình ở TP Hồ Chí Minh, muốn chạy xe máy thẳng ra Hà Giang chơi 2 ngày cuối tuần này rồi về, đi 1 mình." }],
      [
        {
          tool: "recordTripInfo",
          input: { homeCity: "TP Hồ Chí Minh", durationDays: 2, transport: "MOTORCYCLE", travelers: 1 },
        },
        { tool: "findOrigin", input: { query: "TP Hồ Chí Minh" } },
        { text: "Chạy xe máy từ TP Hồ Chí Minh ra Hà Giang khoảng 1.900 km, chừng 42+ giờ chạy, không kịp trong 2 ngày." },
      ],
      {},
      {
        planning: () => ({
          candidates: async () => [planningCandidate("a", 90)],
          routes: {
            route: fixtureRoutes.route,
            coordinateRoute: async () => ({
              status: "VERIFIED",
              reason: null,
              distanceMeters: 1_900_000,
              durationSeconds: 42 * 3600,
              provider: "GOOGLE_MAPS",
            }),
          },
          now: () => FIXED_NOW,
        }),
      },
    );

    const emitted = parts(sse);
    const toolPrompts = JSON.stringify(model.doStreamCalls.map(c => c.prompt));
    expect(toolPrompts).toContain("infeasibleDirectDrive");
    expect(toolPrompts).toContain("1.900 km");
    expect(toolPrompts).toContain("42+ giờ");
    const quickReplies = emitted.find(p => p.type === "data-quick-replies")?.data as { replies: string[] } | undefined;
    expect(quickReplies?.replies).toEqual([
      "Bay ra Hà Nội rồi thuê xe",
      "Vẫn chạy xe — cần khoảng 16 ngày",
      "Đổi sang xe khách",
    ]);
  });
});
