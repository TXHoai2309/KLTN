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
import { buildTripsageContext, reconcileQuickRepliesWithQuestion, resolveFallbackQuickReplies, TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import { resolveMissingPriceChips } from "./tripsage-access-leg";
import { createTripsageChatTools, type TripsagePlanningDeps } from "./tripsage-chat-tools";

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

  it("Point 4: synthesizes actionable fallback quick replies when a turn ends with a choice question without suggestReplies, and persists them", async () => {
    // 1. Unit checks for resolveFallbackQuickReplies across open-issue classes
    expect(
      resolveFallbackQuickReplies({
        text: "Thẻ lịch cảnh báo chặng đầu từ Cầu Giấy quá dài.\n\nNhà mình muốn xử lý chặng đường dài bằng cách nào?",
        hasEmittedQuickReplies: false,
        hasOriginCandidates: false,
        itinerary: null,
        cost: null,
        accessLeg: null,
        tripInfo: null,
      }),
    ).toEqual(["Thêm 1 ngày", "Xuất phát sớm hơn (05:30)", "Nghỉ đêm giữa đường ở TP Hà Giang", "Giữ nguyên"]);

    expect(
      resolveFallbackQuickReplies({
        text: "Chưa có giá đoạn Đà Nẵng ⇄ Hà Nội, tổng đang thiếu khoản này. Bạn muốn xử lý tiếp thế nào?",
        hasEmittedQuickReplies: false,
        hasOriginCandidates: false,
        itinerary: null,
        cost: {
          currency: "VND", travelers: 4, days: 4,
          lines: [{ category: "food", label: "Ăn uống", amount: 2_000_000 }],
          total: 2_000_000, perPersonPerDay: 125_000, budgetCap: 20_000_000, withinCap: null, overBy: null,
          assumptions: [], priceReferenceDate: "2026-11-21", isIncomplete: true, missingItems: ["Chặng tiếp cận Đà Nẵng ⇄ Hà Nội"],
        },
        accessLeg: null,
        tripInfo: null,
      }),
    ).toEqual(["Tra lại vé máy bay", "Đổi sang xe khách", "Bỏ qua, lưu trước"]);

    // No chips synthesized when text does NOT end with a question or when suggestReplies already ran
    expect(
      resolveFallbackQuickReplies({
        text: "Mình đã lập xong lịch trình cho bạn.",
        hasEmittedQuickReplies: false,
        hasOriginCandidates: false,
        itinerary: null,
        cost: null,
        accessLeg: null,
        tripInfo: null,
      }),
    ).toBeNull();

    // 2. End-to-end stream check (a2764b16 scenario: model ends with long-drive question without calling suggestReplies)
    const { all } = await runTurn(
      "Mình ở Hà Nội (Cầu Giấy), gia đình 5 người tự lái ô tô 3 ngày từ 26/12.",
      [
        { tool: "listDestinations", input: {} },
        { tool: "proposeItinerary", input: { selection: { days: [["D1", "D2"]] } } },
        { text: "Thẻ lịch cảnh báo chặng đầu từ Cầu Giấy quá dài.\n\nNhà mình muốn xử lý chặng đường dài bằng cách nào?" },
      ],
    );
    const qrPart = all.find(p => p.type === "data-quick-replies")?.data as { replies?: string[] } | undefined;
    expect(qrPart?.replies).toEqual(["Thêm 1 ngày", "Xuất phát sớm hơn (05:30)", "Nghỉ đêm giữa đường ở TP Hà Giang", "Giữ nguyên"]);
  });

  it("B1: resolves missing-fare chips contextually for bus-only vs flight legs and excludes Ha Noi route when not in price table", () => {
    const busOnlyLeg = {
      id: "leg-bus-1",
      hubName: "TP Hà Giang",
      homeCity: "Hải Phòng",
      travelers: 2,
      outbound: [
        { mode: "SLEEPER_BUS" as const, from: "Hải Phòng", to: "TP Hà Giang", durationMinutes: 420, priceVndPerPerson: 0, priceSource: "MISSING" as const },
      ],
      return: [
        { mode: "SLEEPER_BUS" as const, from: "TP Hà Giang", to: "Hải Phòng", durationMinutes: 420, priceVndPerPerson: 0, priceSource: "MISSING" as const },
      ],
      outboundMinutes: 420,
      returnMinutes: 420,
      totalVnd: 0,
      priceReferenceDate: "2026-11-21",
      missingPriceSegments: ["Hải Phòng ⇄ TP Hà Giang"],
    };

    expect(
      resolveFallbackQuickReplies({
        text: "Chưa có giá xe khách chặng Hải Phòng ⇄ TP Hà Giang. Bạn muốn xử lý thế nào?",
        hasEmittedQuickReplies: false,
        hasOriginCandidates: false,
        itinerary: null,
        cost: {
          currency: "VND", travelers: 2, days: 2,
          lines: [{ category: "food", label: "Ăn uống", amount: 800_000 }],
          total: 800_000, perPersonPerDay: 200_000, budgetCap: null, withinCap: null, overBy: null,
          assumptions: [], priceReferenceDate: "2026-11-21", isIncomplete: true, missingItems: ["Chặng tiếp cận Hải Phòng ⇄ TP Hà Giang"],
        },
        accessLeg: busOnlyLeg,
        tripInfo: { transport: "CAR" },
      }),
    ).toEqual(["Giữ xe khách, chốt giá sau", "Đổi tuyến qua Hà Nội", "Bỏ qua, lưu trước"]);

    // When the approved price table has NO Hà Nội bus corridor, omit "Đổi tuyến qua Hà Nội"
    expect(
      resolveMissingPriceChips({
        accessLeg: busOnlyLeg,
        lang: "vi",
        approvedRoutes: [],
      }).chips,
    ).toEqual(["Giữ xe khách, chốt giá sau", "Bỏ qua, lưu trước"]);

    // Flight + bus leg where FLIGHT is missing keeps flight lookup chip
    const flightAndBusLeg = {
      ...busOnlyLeg,
      homeCity: "Đà Nẵng",
      outbound: [
        { mode: "FLIGHT" as const, from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 0, priceSource: "MISSING" as const },
        { mode: "SLEEPER_BUS" as const, from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 360, priceVndPerPerson: 325_000, priceSource: "ESTIMATE" as const },
      ],
      return: [
        { mode: "SLEEPER_BUS" as const, from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 360, priceVndPerPerson: 325_000, priceSource: "ESTIMATE" as const },
        { mode: "FLIGHT" as const, from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 0, priceSource: "MISSING" as const },
      ],
      missingPriceSegments: ["Đà Nẵng ⇄ Hà Nội"],
    };

    expect(
      resolveFallbackQuickReplies({
        text: "Chưa có giá đoạn Đà Nẵng ⇄ Hà Nội. Bạn muốn xử lý tiếp thế nào?",
        hasEmittedQuickReplies: false,
        hasOriginCandidates: false,
        itinerary: null,
        cost: {
          currency: "VND", travelers: 2, days: 3,
          lines: [{ category: "food", label: "Ăn uống", amount: 1_200_000 }],
          total: 2_500_000, perPersonPerDay: 416_667, budgetCap: null, withinCap: null, overBy: null,
          assumptions: [], priceReferenceDate: "2026-11-21", isIncomplete: true, missingItems: ["Chặng tiếp cận Đà Nẵng ⇄ Hà Nội"],
        },
        accessLeg: flightAndBusLeg,
        tripInfo: { transport: "CAR" },
      }),
    ).toEqual(["Tra lại vé máy bay", "Đổi sang xe khách", "Bỏ qua, lưu trước"]);

    // Reconcile stale flight/bus chips if emitted prematurely on a bus-only leg
    expect(
      reconcileQuickRepliesWithQuestion({
        text: "Chưa có giá xe khách chặng Hải Phòng ⇄ TP Hà Giang. Bạn muốn xử lý thế nào?",
        emittedReplies: ["Tra lại vé máy bay", "Đổi sang xe khách", "Bỏ qua, lưu trước"],
        hasOriginCandidates: false,
        itinerary: null,
        cost: null,
        accessLeg: busOnlyLeg,
        tripInfo: { transport: "CAR" },
      }),
    ).toEqual(["Giữ xe khách, chốt giá sau", "Đổi tuyến qua Hà Nội", "Bỏ qua, lưu trước"]);
  });

  it("C2: enforces catalog -> approved RAG -> searchPlaces lookup chain and refuses inventing facts for unverified named places ('thác Bạc Sủng Thài', 'hồ Mây Xanh Đồng Văn')", async () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("TUYỆT ĐỐI KHÔNG tự mô tả");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("thông tin từ Google Maps, chưa kiểm tra");

    const catalogPlace = { ...planningCandidate("cong-troi-qb"), name: "Cổng Trời Quản Bạ" };
    const tools = createTripsageChatTools({
      planning: { candidates: async () => [catalogPlace], routes: fixtureRoutes, now: () => planningNow },
      emitItinerary: () => {},
      latestUserText: "giới thiệu cho mình về thác Bạc Sủng Thài ở Mèo Vạc với, có nên đi không?",
      places: async (query) => {
        if (query.toLowerCase().includes("nho quế") || query.toLowerCase().includes("hoang su phi homestead")) {
          return { status: "RESULTS", places: [{ placeId: "ChIJ_ext_1", name: "Điểm ngắm cảnh ngoài danh mục", latitude: 23.15, longitude: 105.4 }] };
        }
        return { status: "NO_RESULTS" };
      },
      knowledge: async () => [],
    });

    // 1. Named non-existent places ("thác Bạc Sủng Thài" & "hồ Mây Xanh Đồng Văn"): absent in catalog, RAG, Places
    const destMissing1 = await tools.getDestinationInfo.execute!(
      { destinationId: "thác Bạc Sủng Thài" },
      { toolCallId: "d1", messages: [], context: {} } as never,
    );
    expect(destMissing1).toMatchObject({ ok: false, code: "DESTINATION_NOT_FOUND" });
    expect((destMissing1 as { message: string }).message).toContain("từ chối mô tả");

    const placesMissing1 = await tools.searchPlaces.execute!(
      { query: "thác Bạc Sủng Thài" },
      { toolCallId: "p1", messages: [], context: {} } as never,
    );
    expect(placesMissing1).toMatchObject({ ok: true, count: 0 });
    expect((placesMissing1 as { note: string }).note).toContain("chưa có thông tin xác thực");

    const destMissing2 = await tools.getDestinationInfo.execute!(
      { destinationId: "hồ Mây Xanh Đồng Văn" },
      { toolCallId: "d2", messages: [], context: {} } as never,
    );
    expect(destMissing2).toMatchObject({ ok: false, code: "DESTINATION_NOT_FOUND" });
    const placesMissing2 = await tools.searchPlaces.execute!(
      { query: "hồ Mây Xanh Đồng Văn" },
      { toolCallId: "p2", messages: [], context: {} } as never,
    );
    expect(placesMissing2).toMatchObject({ ok: true, count: 0 });

    // 2. When Google Places returns results, output marks facts explicitly as unchecked Google Maps data
    const placesFound = await tools.searchPlaces.execute!(
      { query: "Hoang Su Phi Homestead" },
      { toolCallId: "p3", messages: [], context: {} } as never,
    );
    expect(placesFound).toMatchObject({ ok: true, count: 1 });
    expect((placesFound as { note: string }).note).toContain("thông tin từ Google Maps, chưa kiểm tra");

    // 3. Real catalog place returns catalog truth cleanly
    const realDest = await tools.getDestinationInfo.execute!(
      { destinationId: "Cổng Trời Quản Bạ" },
      { toolCallId: "d3", messages: [], context: {} } as never,
    );
    expect(realDest).toMatchObject({
      ok: true,
      name: "Cổng Trời Quản Bạ",
      source: "dữ liệu điểm đến trong danh mục KLTN",
    });
  });

  it("C6 + Điểm nhỏ: searches up to 3 medical clinics after 115 guidance, computes catalog A->B routes via planning.routes, and enforces doc-grounded ethnic/border facts", async () => {
    const emergencyQuestion = "bạn mình bị ngã xe ở dốc Thẩm Mã, chảy máu nhiều, giờ phải làm sao, bệnh viện gần nhất ở đâu?";
    const emergencyCtx = buildTripsageContext({ latestUserText: emergencyQuestion });
    expect(emergencyCtx).toContain("115");
    expect(emergencyCtx).toContain("searchPlaces");
    expect(emergencyCtx).toContain("tối đa 3 cơ sở y tế");

    const routeCalls: { fromId: string; toId: string; transport: string }[] = [];
    const dongVan = { ...planningCandidate("dest-dv"), id: "dest-dv", name: "Phố cổ Đồng Văn", latitude: 23.2783, longitude: 105.3614, address: "Đồng Văn" };
    const lungCu = { ...planningCandidate("dest-lc"), id: "dest-lc", name: "Cột cờ Lũng Cú", latitude: 23.3636, longitude: 105.317, address: "Lũng Cú" };
    const yenMinh = { ...planningCandidate("dest-ym"), id: "dest-ym", name: "Yên Minh", latitude: 23.118, longitude: 105.146, address: "Yên Minh" };

    const tools = createTripsageChatTools({
      planning: {
        candidates: async () => [dongVan, lungCu, yenMinh],
        routes: {
          route: async ({ from, to, transport }) => {
            routeCalls.push({ fromId: from.id, toId: to.id, transport });
            return {
              fromDestinationId: from.id,
              toDestinationId: to.id,
              status: "VERIFIED",
              reason: null,
              distanceMeters: 25_600,
              durationSeconds: 3_300,
              provider: "STADIA_MAPS",
            };
          },
        },
        now: () => planningNow,
      },
      latestUserText: emergencyQuestion,
      emitItinerary: () => {},
      places: async () => ({
        status: "RESULTS",
        places: [
          { placeId: "med-1", name: "Bệnh viện Đa khoa khu vực Yên Minh", latitude: 23.12, longitude: 105.15 },
          { placeId: "med-2", name: "Trung tâm Y tế huyện Đồng Văn", latitude: 23.27, longitude: 105.36 },
          { placeId: "med-3", name: "Trạm Y tế xã Phố Cáo", latitude: 23.21, longitude: 105.24 },
          { placeId: "med-4", name: "Cơ sở thứ 4 cần lược", latitude: 23.28, longitude: 105.37 },
        ],
      }),
      knowledge: async () => [
        {
          title: "Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch",
          text: "Nhiều cộng đồng dân tộc cùng sinh sống như Mông, Tày, Dao, Nùng, Lô Lô, La Chí và Giáy; số liệu từng nguồn có khác biệt nên không chốt một tỷ lệ tuyệt đối.",
          score: 0.72,
        },
      ],
    });

    // 1. Emergency medical searchPlaces keeps at most 3 facilities, resolves near Yên Minh or falls back for Dốc Thẩm Mã, and attaches 115 dispatch note
    const medRes = await tools.searchPlaces.execute!(
      { query: "bệnh viện trạm y tế gần Dốc Thẩm Mã", nearDestinationId: "Dốc Thẩm Mã" },
      { toolCallId: "m1", messages: [], context: {} } as never,
    );
    expect(medRes).toMatchObject({ ok: true, count: 3 });
    expect((medRes as { note: string }).note).toContain("115");
    expect((medRes as { note: string }).note).toContain("từ Google Maps, nên gọi 115 để được điều phối");

    const medAnchored = await tools.searchPlaces.execute!(
      { query: "bệnh viện", nearDestinationId: "Yên Minh" },
      { toolCallId: "m2", messages: [], context: {} } as never,
    );
    expect((medAnchored as { places: { distanceKm?: number }[] }).places).toHaveLength(3);
    expect(typeof (medAnchored as { places: { distanceKm?: number }[] }).places[0]!.distanceKm).toBe("number");

    // 2. Catalog A -> B distance & time uses planning.routes cleanly and marks estimate
    const routeRes = await tools.estimateRoute.execute!(
      { fromDestinationId: "Phố cổ Đồng Văn", toDestinationId: "Cột cờ Lũng Cú", transport: "MOTORCYCLE" },
      { toolCallId: "r1", messages: [], context: {} } as never,
    );
    expect(routeCalls).toEqual([{ fromId: "dest-dv", toId: "dest-lc", transport: "MOTORCYCLE" }]);
    expect(routeRes).toMatchObject({
      ok: true,
      status: "VERIFIED",
      from: "Phố cổ Đồng Văn",
      to: "Cột cờ Lũng Cú",
      transport: "MOTORCYCLE",
      distanceKm: 25.6,
      distanceLabel: "25,6 km",
      durationMinutes: 55,
      isEstimate: true,
      source: "hệ thống định tuyến đường bộ của ứng dụng",
    });

    const enTools = createTripsageChatTools({
      planning: {
        candidates: async () => [dongVan, lungCu],
        routes: {
          route: async ({ from, to }) => ({
            fromDestinationId: from.id,
            toDestinationId: to.id,
            status: "VERIFIED",
            reason: null,
            distanceMeters: 2250,
            durationSeconds: 360,
            provider: "STADIA_MAPS",
          }),
        },
        now: () => planningNow,
      },
      latestUserText: "How far is it from Dong Van to Lung Cu?",
      emitItinerary: () => {},
      places: async () => ({
        status: "RESULTS",
        places: [
          { placeId: "en-1", name: "Coffee M", latitude: dongVan.latitude + 0.000962, longitude: dongVan.longitude },
          { placeId: "en-2", name: "Cafe Km", latitude: dongVan.latitude + 0.020235, longitude: dongVan.longitude },
        ],
      }),
    });
    const enRouteRes = await enTools.estimateRoute.execute!(
      { fromDestinationId: "Phố cổ Đồng Văn", toDestinationId: "Cột cờ Lũng Cú", transport: "CAR" },
      { toolCallId: "r2", messages: [], context: {} } as never,
    );
    expect(enRouteRes).toMatchObject({
      ok: true,
      distanceKm: 2.3,
      distanceLabel: "2.3 km",
    });
    const enPlacesRes = await enTools.searchPlaces.execute!(
      { query: "cafe", nearDestinationId: dongVan.id },
      { toolCallId: "p-en", messages: [], context: {} } as never,
    ) as { ok: boolean; places: { name: string; distanceLabel?: string }[] };
    expect(enPlacesRes.places.map(p => p.distanceLabel)).toEqual(["107 m", "2.3 km"]);

    // 3. Điểm nhỏ: persona + lookupLocalKnowledge enforce doc-grounded ethnic total count and foreigner border permit rules
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Hà Giang có những dân tộc nào");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("giấy phép vào khu vực biên giới");
    const ethTools = createTripsageChatTools({
      planning: { candidates: async () => [], routes: { route: async () => { throw new Error("unused"); } }, now: () => planningNow },
      latestUserText: "Hà Giang có những dân tộc nào?",
      emitItinerary: () => {},
      knowledge: async () => [
        {
          title: "Cao nguyên đá Đồng Văn – Tài liệu tri thức du lịch",
          text: "Nhiều cộng đồng dân tộc cùng sinh sống như Mông, Tày, Dao, Nùng, Lô Lô, La Chí và Giáy; số liệu từng nguồn có khác biệt nên không chốt một tỷ lệ tuyệt đối.",
          score: 0.72,
        },
      ],
    });
    const ethRes = await ethTools.lookupLocalKnowledge.execute!(
      { question: "Hà Giang có những dân tộc nào?" },
      { toolCallId: "k1", messages: [], context: {} } as never,
    );
    expect(ethRes).toMatchObject({ ok: true });
    expect((ethRes as { excerpts: unknown[] }).excerpts).toHaveLength(1);
    expect((ethRes as { note: string }).note).toContain("số lượng dân tộc");
    expect((ethRes as { note: string }).note).toContain("giấy phép biên giới");

    const borderMissingTools = createTripsageChatTools({
      planning: { candidates: async () => [], routes: { route: async () => { throw new Error("unused"); } }, now: () => planningNow },
      latestUserText: "Người nước ngoài đi Hà Giang cần giấy tờ gì?",
      emitItinerary: () => {},
      knowledge: async () => [],
    });
    const borderRes = await borderMissingTools.lookupLocalKnowledge.execute!(
      { question: "giấy phép biên giới cho người nước ngoài Hà Giang" },
      { toolCallId: "k2", messages: [], context: {} } as never,
    );
    expect((borderRes as { note: string }).note).toContain("cơ quan địa phương");
  });
});
