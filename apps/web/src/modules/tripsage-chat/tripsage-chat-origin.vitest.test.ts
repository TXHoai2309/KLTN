import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { journeyPartSchema, originCandidatesPartSchema } from "./tripsage-chat-context";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse, type TripsageChatHttpDependencies } from "./tripsage-chat-http";
import {
  assistantOfferedHub,
  FIXED_HUB_CANDIDATES,
  ORIGIN_CANDIDATE_TTL_MS,
  matchFixedHub,
  permitsOriginConfirmation,
  signOriginCandidates,
  statesSoleOrigin,
  verifyOriginCandidatesToken,
  type SignedOriginCandidate,
} from "./tripsage-chat-origin";
import type { OriginLookup, TripsagePlanningDeps } from "./tripsage-chat-tools";

const SECRET = "test-origin-hmac-secret-at-least-32-characters";
const USER_ID = "origin-owner";
const auth = (userId = USER_ID) => ({
  database: { user: { findUnique: async () => ({ id: userId, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: userId } }),
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
  candidates: async () => [planningCandidate("a", 120), planningCandidate("b", 120)],
  routes: { route: fixtureRoutes.route, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }) },
  now: () => planningNow,
});

const CAU_GIAY: SignedOriginCandidate = {
  id: "oc-1-1",
  label: "Quận Cầu Giấy, Hà Nội",
  latitude: 21.0362,
  longitude: 105.7906,
  source: "GOOGLE_PLACES",
};

const parts = (sse: string) => sse.split("\n").filter(l => l.startsWith("data: {")).map(l => JSON.parse(l.slice(6)) as { type: string; data?: unknown });

async function chat(
  text: string,
  steps: Step[],
  body: Record<string, unknown> = {},
  over: Partial<TripsageChatHttpDependencies> = {},
) {
  const model = scripted(steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
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
    originSecret: () => SECRET,
    now: () => planningNow,
    ...over,
  });
  return { response, model, sse: response.status === 200 ? await response.text() : await response.text() };
}

describe("permitsOriginConfirmation (pure gate)", () => {
  const single = [{ id: "oc-1-1", label: "Quận Cầu Giấy, Hà Nội" }];
  const multi = [
    { id: "oc-1-1", label: "Phố Cổ, Hoàn Kiếm, Hà Nội" },
    { id: "oc-1-2", label: "Phố Cổ, Đồng Văn, Hà Giang" },
  ];

  it("allows explicit Vietnamese/English agreements for a sole candidate from the previous turn", () => {
    for (const yes of ["đúng", "Đúng rồi", "ok", "oke", "chính xác", "chuẩn rồi", "đồng ý", "chốt", "ừ", "vâng", "dạ đúng", "yes", "Đúng rồi, đi 4 ngày bằng xe máy"]) {
      expect(permitsOriginConfirmation(yes, single[0]!, single, { fromPreviousTurn: true }), yes).toBe(true);
    }
  });

  it("rejects negations, corrections, questions, and distinguishes 'đừng' from 'đúng'", () => {
    for (const no of ["không", "không phải", "đừng chọn chỗ đó", "đừng", "sai rồi", "nhầm rồi", "đổi sang Hải Phòng", "chọn lại", "no", "wrong", "Hà Giang có gì chơi?", "Mình đi từ Cầu Giấy"]) {
      expect(permitsOriginConfirmation(no, single[0]!, single, { fromPreviousTurn: true }), no).toBe(false);
    }
  });

  it("requires label or index selection when multiple candidates were offered", () => {
    expect(permitsOriginConfirmation("đúng", multi[0]!, multi, { fromPreviousTurn: true })).toBe(false);
    expect(permitsOriginConfirmation("ok", multi[1]!, multi, { fromPreviousTurn: true })).toBe(false);
    expect(permitsOriginConfirmation("Phố Cổ, Đồng Văn, Hà Giang", multi[1]!, multi, { fromPreviousTurn: true })).toBe(true);
    expect(permitsOriginConfirmation("chọn 2", multi[1]!, multi, { fromPreviousTurn: true })).toBe(true);
    expect(permitsOriginConfirmation("chọn 2", multi[0]!, multi, { fromPreviousTurn: true })).toBe(false);
    expect(permitsOriginConfirmation("Hoàn Kiếm", multi[0]!, multi, { fromPreviousTurn: true })).toBe(true);
  });

  it("requires explicit confirmation or button tap for fixed hubs when not preceded by findOrigin", () => {
    const hn = FIXED_HUB_CANDIDATES[0]!;
    expect(permitsOriginConfirmation("đi từ Hà Nội", hn, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);
    expect(permitsOriginConfirmation("đi Hà Giang 4 ngày từ Hà Nội", hn, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);
    expect(permitsOriginConfirmation("Hà Nội (bến xe Mỹ Đình)", hn, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(true);
    expect(permitsOriginConfirmation("Bắt đầu từ Hà Nội", hn, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(true);
    expect(permitsOriginConfirmation("không phải Hà Nội", hn, FIXED_HUB_CANDIDATES, { fromPreviousTurn: false })).toBe(false);
  });

  it("recognizes fixed hub aliases without calling external search", () => {
    expect(matchFixedHub("Hà Nội")?.id).toBe("hub:HA_NOI");
    expect(matchFixedHub("TP Hà Giang")?.id).toBe("hub:HA_GIANG_CITY");
    expect(matchFixedHub("Quận Cầu Giấy, Hà Nội")).toBeNull();
  });
});

describe("HMAC-signed origin candidates token", () => {
  const nowMs = planningNow.getTime();

  it("verifies a valid token and marks expired tokens without throwing", () => {
    const token = signOriginCandidates({ userId: USER_ID, candidates: [CAU_GIAY], secret: SECRET, nowMs })!;
    expect(verifyOriginCandidatesToken(token, USER_ID, SECRET, nowMs + 1000)).toEqual({ status: "VALID", candidates: [CAU_GIAY] });
    expect(verifyOriginCandidatesToken(token, USER_ID, SECRET, nowMs + ORIGIN_CANDIDATE_TTL_MS + 1)).toEqual({ status: "EXPIRED", candidates: [] });
  });

  it("rejects tampered payloads, wrong signatures, wrong user and out-of-Vietnam coordinates", () => {
    const token = signOriginCandidates({ userId: USER_ID, candidates: [CAU_GIAY], secret: SECRET, nowMs })!;
    const [version, encoded, sig] = token.split(".");
    const alteredPayload = Buffer.from(JSON.stringify({ v: 1, userId: USER_ID, exp: nowMs + 60_000, candidates: [{ ...CAU_GIAY, latitude: 21.5 }] })).toString("base64url");
    expect(() => verifyOriginCandidatesToken(`${version}.${alteredPayload}.${sig}`, USER_ID, SECRET, nowMs)).toThrow();
    expect(() => verifyOriginCandidatesToken(`${version}.${encoded}.${sig!.slice(0, -2)}AA`, USER_ID, SECRET, nowMs)).toThrow();
    expect(() => verifyOriginCandidatesToken(token, "other-user", SECRET, nowMs)).toThrow();
    const outside = signOriginCandidates({ userId: USER_ID, candidates: [{ ...CAU_GIAY, latitude: 48.85, longitude: 2.35 }], secret: SECRET, nowMs })!;
    expect(() => verifyOriginCandidatesToken(outside, USER_ID, SECRET, nowMs)).toThrow();
  });
});

describe("chat-only origin confirmation and default clocks route (ticket 01)", () => {
  it("completes two-turn findOrigin -> confirmOrigin -> proposeItinerary without exposing coordinates to the model", async () => {
    const originSearch: OriginLookup = vi.fn(async () => ({
      status: "RESULTS" as const,
      cached: false,
      results: [{ label: CAU_GIAY.label, latitude: CAU_GIAY.latitude, longitude: CAU_GIAY.longitude, source: "GOOGLE_PLACES" as const, confirmed: false as const }],
    }));

    // Turn 1: user names a place; model calls findOrigin. Trying confirmOrigin in the same turn is rejected.
    const turn1 = await chat(
      "Mình hay đi chơi quanh Cầu Giấy",
      [
        { tool: "findOrigin", input: { query: "Cầu Giấy" } },
        { tool: "confirmOrigin", input: { candidateId: "oc-1-1" } },
        { text: "Mình hiểu bạn đi từ Quận Cầu Giấy, Hà Nội, đúng không?" },
      ],
      {},
      { originSearch: () => originSearch },
    );
    expect(turn1.response.status).toBe(200);
    const turn1Parts = parts(turn1.sse);
    const candidatesPart = originCandidatesPartSchema.parse(turn1Parts.find(p => p.type === "data-origin-candidates")!.data);
    expect(candidatesPart.candidates).toEqual([{ candidateId: "oc-1-1", label: "Quận Cầu Giấy, Hà Nội" }]);
    expect(turn1Parts.some(p => p.type === "data-journey")).toBe(false);
    // Coordinates never reach the model.
    const fedToModel1 = JSON.stringify(turn1.model.doStreamCalls[1]!.prompt);
    expect(fedToModel1).not.toContain("21.0362");
    expect(fedToModel1).not.toContain("105.7906");
    expect(JSON.stringify(turn1.model.doStreamCalls[2]!.prompt)).toContain("ORIGIN_CANDIDATE_NOT_FOUND");

    // Turn 2: browser carries the signed token; user replies "đúng"; model confirms and plans immediately.
    const turn2 = await chat(
      "đúng",
      [
        { tool: "confirmOrigin", input: { candidateId: "oc-1-1" } },
        { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
        { text: "Mình đã lên lịch từ Cầu Giấy cho bạn." },
      ],
      { originCandidatesToken: candidatesPart.token },
    );
    expect(turn2.response.status).toBe(200);
    const turn2Parts = parts(turn2.sse);
    const journey = journeyPartSchema.parse(turn2Parts.find(p => p.type === "data-journey")!.data).journey;
    expect(journey).toEqual({
      origin: { label: "Quận Cầu Giấy, Hà Nội", latitude: 21.0362, longitude: 105.7906, source: "GOOGLE_PLACES", confirmed: true },
      departureMinute: 420,
      returnDeadlineMinute: 1080,
      returnDepartureMinute: 420,
    });
    const itinerary = plannerResultSchema.parse(turn2Parts.find(p => p.type === "data-itinerary")!.data);
    expect(itinerary.requirement.journey?.origin?.confirmed).toBe(true);
    expect(itinerary.requirement.journey?.departureMinute).toBe(420);
    // Coordinates never leaked into model prompt across turns.
    expect(JSON.stringify(turn2.model.doStreamCalls.map(c => c.prompt))).not.toContain("21.0362");
  });

  it("rejects a browser-tampered originCandidatesToken with 400 before running the model", async () => {
    const token = signOriginCandidates({ userId: USER_ID, candidates: [CAU_GIAY], secret: SECRET, nowMs: planningNow.getTime() })!;
    const tampered = `${token.slice(0, -4)}AAAA`;
    const result = await chat("đúng", [{ text: "x" }], { originCandidatesToken: tampered });
    expect(result.response.status).toBe(400);
    expect(result.model.doStreamCalls).toHaveLength(0);
  });

  it("rejects confirmOrigin when the user has not agreed, when candidateId is unknown, or when token is expired", async () => {
    const validToken = signOriginCandidates({ userId: USER_ID, candidates: [CAU_GIAY], secret: SECRET, nowMs: planningNow.getTime() })!;
    const notAgreed = await chat(
      "không phải chỗ đó",
      [{ tool: "confirmOrigin", input: { candidateId: "oc-1-1" } }, { text: "Bạn cho mình tên khác nhé." }],
      { originCandidatesToken: validToken },
    );
    expect(parts(notAgreed.sse).some(p => p.type === "data-journey")).toBe(false);
    expect(JSON.stringify(notAgreed.model.doStreamCalls[1]!.prompt)).toContain("ORIGIN_CONFIRMATION_REQUIRED");

    const unknownId = await chat(
      "đúng",
      [{ tool: "confirmOrigin", input: { candidateId: "oc-9-9" } }, { text: "Mình tìm lại nhé." }],
      { originCandidatesToken: validToken },
    );
    expect(parts(unknownId.sse).some(p => p.type === "data-journey")).toBe(false);
    expect(JSON.stringify(unknownId.model.doStreamCalls[1]!.prompt)).toContain("ORIGIN_CANDIDATE_NOT_FOUND");

    const expiredToken = signOriginCandidates({ userId: USER_ID, candidates: [CAU_GIAY], secret: SECRET, nowMs: planningNow.getTime() - ORIGIN_CANDIDATE_TTL_MS - 1000 })!;
    const expired = await chat(
      "đúng",
      [{ tool: "confirmOrigin", input: { candidateId: "oc-1-1" } }, { text: "Hết hạn rồi." }],
      { originCandidatesToken: expiredToken },
    );
    expect(parts(expired.sse).some(p => p.type === "data-journey")).toBe(false);
    expect(JSON.stringify(expired.model.doStreamCalls[1]!.prompt)).toContain("ORIGIN_CANDIDATES_EXPIRED");
  });

  it("resolves fixed trip hubs without external search and confirms in the same turn when the traveler names it", async () => {
    const searchSpy = vi.fn<OriginLookup>();
    const turn1 = await chat(
      "Mình đi từ Hà Nội",
      [{ tool: "findOrigin", input: { query: "Hà Nội" } }, { text: "Đã chốt Hà Nội." }],
      {},
      { originSearch: () => searchSpy },
    );
    expect(searchSpy).not.toHaveBeenCalled();
    const journey = journeyPartSchema.parse(parts(turn1.sse).find(p => p.type === "data-journey")!.data).journey;
    expect(journey.origin?.label).toBe("Hà Nội (bến xe Mỹ Đình)");
    expect(journey.origin?.confirmed).toBe(true);
    expect(parts(turn1.sse).some(p => p.type === "data-origin-candidates")).toBe(false);

    const again = await chat(
      "điểm tập kết là hà nội",
      [{ tool: "findOrigin", input: { query: "Hà Nội" } }, { text: "Ok." }],
      { journey },
      { originSearch: () => searchSpy },
    );
    expect(JSON.stringify(again.model.doStreamCalls[1]!.prompt)).toContain("alreadyConfirmed");
  });

  it("marks default clocks 07:00/18:00 in context and replans when the user asks to depart at 6:00", async () => {
    const res = await chat(
      "Đi lúc 6h sáng nhé",
      [
        { tool: "recordTripInfo", input: { departureMinute: 360 } },
        { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
        { text: "Đã đổi giờ khởi hành sang 06:00." },
      ],
      { journey: { ...COMPLETE_JOURNEY_FIXTURE, departureMinute: null, returnDeadlineMinute: null } },
    );
    expect(res.response.status).toBe(200);
    expect(JSON.stringify(res.model.doStreamCalls[0]!.prompt)).toContain("[mặc định, chưa hỏi]");
    const all = parts(res.sse);
    const journey = journeyPartSchema.parse(all.find(p => p.type === "data-journey")!.data).journey;
    expect(journey.departureMinute).toBe(360);
    expect(journey.returnDeadlineMinute).toBe(1080);
    const itinerary = plannerResultSchema.parse(all.find(p => p.type === "data-itinerary")!.data);
    expect(itinerary.requirement.journey?.departureMinute).toBe(360);
  });
});

describe("hub chosen by a bare reply (hubOffered)", () => {
  const hub = FIXED_HUB_CANDIDATES.find(item => item.id === "hub:HA_NOI")!;
  const hubs = FIXED_HUB_CANDIDATES;

  it("accepts 'Hà Nội nhé' only when the assistant just offered the hubs", () => {
    const reply = "Hà Nội nhé, bạn tìm giúp mình giá vé máy bay";
    expect(permitsOriginConfirmation(reply, hub, hubs, { fromPreviousTurn: false })).toBe(false);
    expect(permitsOriginConfirmation(reply, hub, hubs, { fromPreviousTurn: false, hubOffered: true })).toBe(true);
  });

  it("still refuses negation, the other hub and ambiguous replies when hubs were offered", () => {
    expect(permitsOriginConfirmation("không phải Hà Nội", hub, hubs, { fromPreviousTurn: false, hubOffered: true })).toBe(false);
    expect(permitsOriginConfirmation("Hà Nội hay TP Hà Giang nhỉ", hub, hubs, { fromPreviousTurn: false, hubOffered: true })).toBe(false);
    expect(permitsOriginConfirmation("TP Hà Giang nhé", hub, hubs, { fromPreviousTurn: false, hubOffered: true })).toBe(false);
  });

  it("assistantOfferedHub needs a question that names a hub", () => {
    expect(assistantOfferedHub("Bạn chọn TP Hà Giang hay Hà Nội làm điểm tập kết?")).toBe(true);
    expect(assistantOfferedHub("Mình gợi ý tập kết ở Hà Nội rồi thuê xe.")).toBe(false);
    expect(assistantOfferedHub("Bạn muốn đi vào ngày nào?")).toBe(false);
  });
});

describe("statesSoleOrigin (ADR-46)", () => {
  const danang = { label: "Thành phố Đà Nẵng, Việt Nam" };
  it("accepts a clear statement or the bare place name", () => {
    for (const text of ["tôi xuất phát từ đà nẵng", "Đà Nẵng", "Mình ở Đà Nẵng nhé", "đi từ Đà Nẵng"]) expect(statesSoleOrigin(text, danang), text).toBe(true);
  });
  it("keeps contrasts, negations and unrelated mentions on the two-turn path", () => {
    for (const text of ["tôi ở Đà Nẵng nhưng muốn xuất phát từ Huế", "không phải Đà Nẵng", "Đà Nẵng có gì chơi", "xuất phát từ Huế", "đà nẵng hay huế"]) expect(statesSoleOrigin(text, danang), text).toBe(false);
  });
});

describe("one-turn origin confirmation (ADR-46)", () => {
  it("confirms the only match in the same turn when the traveler named it, without asking again", async () => {
    const originSearch: OriginLookup = vi.fn(async () => ({
      status: "RESULTS" as const,
      cached: false,
      results: [{ label: CAU_GIAY.label, latitude: CAU_GIAY.latitude, longitude: CAU_GIAY.longitude, source: "GOOGLE_PLACES" as const, confirmed: false as const }],
    }));
    const turn = await chat("Mình đi từ Cầu Giấy", [
      { tool: "findOrigin", input: { query: "Cầu Giấy" } },
      { text: "Đã ghi nhận điểm xuất phát." },
    ], {}, { originSearch: () => originSearch });
    const turnParts = parts(turn.sse);
    expect(turnParts.some(p => p.type === "data-origin-candidates")).toBe(false);
    const journey = journeyPartSchema.parse(turnParts.find(p => p.type === "data-journey")!.data);
    expect(journey.journey.origin).toMatchObject({ label: CAU_GIAY.label, confirmed: true });
  });
});
