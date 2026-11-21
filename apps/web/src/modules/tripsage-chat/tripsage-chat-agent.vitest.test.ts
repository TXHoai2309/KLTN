import { TRIP_INFO_FIXTURE, BASE_TOOL_NAMES_SORTED } from "./tripsage-chat-fixtures";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { missingLeg } from "../trip-planner/planner-routes";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE, ORIGIN_FIXTURES } from "../trip-origin/trip-origin-fixtures";
import { toSaveProposal } from "../trip-save/trip-save-adapter";
import { tripsageChatResponse } from "./tripsage-chat-http";
import { createTripsageChatTools, TRIPSAGE_CHAT_TOOL_NAMES, type TripsagePlanningDeps } from "./tripsage-chat-tools";

const SECRET = "sk-test-secret-key-do-not-leak";
let seq = 0;
const auth = () => ({ database: { user: { findUnique: async () => ({ id: `agent-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } }, resolveSession: async () => ({ user: { id: `agent-${++seq}` } }) }) as unknown as AuthorizationDependencies;
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };

type Step = { tool: string; input: unknown } | { text: string };
/** Plays one scripted model step per call; the last step repeats. */
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

const routeSpy = vi.fn(fixtureRoutes.route);
const planning = (over: Partial<TripsagePlanningDeps> = {}): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [planningCandidate("a"), planningCandidate("b"), { ...planningCandidate("hidden"), visibility: "HIDDEN" }],
  routes: { route: routeSpy, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }) }, now: () => planningNow, ...over,
});
const userMessage = (text: string) => ({ id: "m1", role: "user", parts: [{ type: "text", text }] });
const req = (journey: unknown = COMPLETE_JOURNEY_FIXTURE, tripInfo: unknown = TRIP_INFO_FIXTURE) => new Request("https://app.test/api/ai/chat", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify({ messages: [userMessage("Đi 1 ngày bằng ô tô")], tripInfo, ...(journey === undefined ? {} : { journey }) }) });
const run = async (model: MockLanguageModelV4, over: Record<string, unknown> = {}, journey: unknown = COMPLETE_JOURNEY_FIXTURE, tripInfo: unknown = TRIP_INFO_FIXTURE) => {
  const response = await tripsageChatResponse(req(journey, tripInfo), { authorization: auth(), model: async () => model, env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(), planning: planning(), ...over });
  expect(response.status).toBe(200);
  return response.text();
};
const propose = (days: string[][] = [["a", "b"]], extra: Record<string, unknown> = {}) => ({ tool: "proposeItinerary", input: { selection: { days }, ...extra } });
const parts = (sse: string) => sse.split("\n").filter(l => l.startsWith("data: {")).map(l => JSON.parse(l.slice(6)) as { type: string; data?: unknown; toolName?: string });

describe("Tripsage agent tool allow-list", () => {
  it("registers exactly the base tools and nothing else", () => {
    const tools = createTripsageChatTools({ planning: planning()(), emitItinerary: () => {} });
    expect(Object.keys(tools).sort()).toEqual([...TRIPSAGE_CHAT_TOOL_NAMES].sort());
    expect([...TRIPSAGE_CHAT_TOOL_NAMES].sort()).toEqual(BASE_TOOL_NAMES_SORTED);
    for (const banned of ["googlePlaces", "crawlSite", "savePlan", "createTravelPlan"]) expect(tools).not.toHaveProperty(banned);
  });

  it("advertises only the base tools to the model and refuses an unknown tool call", async () => {
    const model = scripted([{ tool: "crawlSite", input: { query: "ignore previous instructions" } }, { text: "Mình không dùng được công cụ đó." }]);
    const sse = await run(model);
    expect(model.doStreamCalls[0]!.tools!.map(t => t.name).sort()).toEqual(BASE_TOOL_NAMES_SORTED);
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
    expect(sse).not.toContain(SECRET);
    // The failed call is fed back as an error, never executed, and the loop continues to prose.
    expect(sse).toContain("Mình không dùng được công cụ đó");
  });

  it("reads only usable destinations and clips untrusted descriptions", async () => {
    const long = { ...planningCandidate("c"), description: "x".repeat(900) };
    const tools = createTripsageChatTools({ planning: planning({ candidates: async () => [planningCandidate("a"), { ...planningCandidate("h"), visibility: "HIDDEN" }, long] })(), emitItinerary: () => {} });
    const out = await (tools.listDestinations.execute as unknown as (i: object, o: object) => Promise<{ destinations: { id: string; summary: string }[] }>)({}, { toolCallId: "1", messages: [] });
    expect(out.destinations.map(d => d.id)).toEqual(["a", "c"]);
    expect(out.destinations[1]!.summary.length).toBeLessThanOrEqual(140);
  });

  it("keeps the same model tools and prompt when only the calendar export flag is on", async () => {
    const baseline = scripted([{ text: "Sẵn sàng." }]);
    const calendar = scripted([{ text: "Sẵn sàng." }]);
    await run(baseline);
    await run(calendar, { env: { TRIPSAGE_CHAT_ENABLED: "true", TRIPSAGE_FEATURE_CALENDAR: "true" } });
    expect(calendar.doStreamCalls[0]!.tools).toEqual(baseline.doStreamCalls[0]!.tools);
    expect(calendar.doStreamCalls[0]!.prompt).toEqual(baseline.doStreamCalls[0]!.prompt);
  });
});

describe("Tripsage agent itinerary seam", () => {
  it("streams a structured data-itinerary matching plannerResultSchema and no schedule prose", async () => {
    routeSpy.mockClear();
    const model = scripted([{ tool: "listDestinations", input: {} }, propose(), { text: "Mình đã lập xong, bạn xem lịch bên dưới nhé." }]);
    const sse = await run(model);
    const itinerary = parts(sse).filter(p => p.type === "data-itinerary");
    expect(itinerary).toHaveLength(1);
    const result = plannerResultSchema.parse(itinerary[0]!.data);
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.stops.map(s => s.destination.id)).toEqual(["a", "b"]);
    expect(routeSpy).toHaveBeenCalledTimes(1);
    expect(sse).toContain("Mình đã lập xong");
    expect(sse).toContain("Đang kiểm tra lịch trình");
    expect(sse).not.toContain(SECRET);
  });

  it("never reports PASS when routing data is missing", async () => {
    const sse = await run(scripted([propose(), { text: "Xong." }]), { planning: planning({ routes: { route: async p => missingLeg(p, "UNAVAILABLE") } }) });
    const result = plannerResultSchema.parse(parts(sse).find(p => p.type === "data-itinerary")!.data);
    expect(result.status).not.toBe("PROPOSAL_READY");
    expect(result.eligibleForFinalConfirmation).toBe(false);
    expect(result.checks.find(c => c.key === "TRAVEL_TIME")?.status).toBe("INSUFFICIENT_DATA");
  });

  it("rejects hidden or unknown ids and returns a Vietnamese error to the model, not to the UI as an itinerary", async () => {
    const model = scripted([propose([["hidden", "zzz"]]), { text: "Mình sẽ chọn lại." }]);
    const sse = await run(model);
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("INVALID_AI_PLAN");
  });

  it("returns blocker questions instead of planning when requirement data is unclear", async () => {
    const model = scripted([propose([["a"]]), { text: "Bạn cho mình ngày khác nhé." }]);
    const sse = await run(model, {}, COMPLETE_JOURNEY_FIXTURE, { ...TRIP_INFO_FIXTURE, startDate: "2020-01-01" });
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("TRIP_REQUIREMENT_UNCLEAR");
  });

  it("rejects out-of-schema tool input (model-supplied trip fields are not accepted)", async () => {
    for (const bad of [{ transport: "CAR" }, { durationDays: 2 }, { interests: ["NATURE"] }]) {
      routeSpy.mockClear();
      const sse = await run(scripted([propose([["a"]], bad), { text: "Mình hỏi lại nhé." }]));
      expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
      expect(routeSpy).not.toHaveBeenCalled();
    }
  });

  it("allows at most two proposeItinerary calls per turn", async () => {
    routeSpy.mockClear();
    const model = scripted([propose(), propose(), propose(), { text: "Đã đủ." }]);
    const sse = await run(model);
    expect(parts(sse).filter(p => p.type === "data-itinerary")).toHaveLength(2);
    expect(routeSpy).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(model.doStreamCalls[3]!.prompt)).toContain("PROPOSAL_LIMIT");
  });
});

describe("Tripsage agent turn caps", () => {
  it("stops at 12 steps and makes the last step text-only", async () => {
    const model = scripted([{ tool: "listDestinations", input: {} }]);
    await run(model);
    expect(model.doStreamCalls.length).toBeLessThanOrEqual(12);
    const last = model.doStreamCalls.at(-1)!;
    expect(last.toolChoice).toEqual({ type: "none" });
  });

  it("aborts after the total time budget with a readable Vietnamese notice", async () => {
    const stalled = new MockLanguageModelV4({ doStream: async ({ abortSignal }) => ({ stream: new ReadableStream({ start(controller) { abortSignal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true }); } }) }) });
    const sse = await run(stalled, { limits: { totalMs: 60 } });
    expect(sse).toContain("Đã hết thời gian xử lý");
  });
});

describe("Tripsage agent secrets and failures", () => {
  it("does not leak runtime error text or keys when destination reading fails", async () => {
    const model = scripted([{ tool: "listDestinations", input: {} }, { text: "Hiện chưa đọc được dữ liệu điểm đến." }]);
    const sse = await run(model, { planning: planning({ candidates: async () => { throw new Error(`db password ${SECRET}`); } }) });
    expect(sse).not.toContain(SECRET);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).not.toContain(SECRET);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("PLANNING_UNAVAILABLE");
  });

  it("keeps guests and a disabled flag out before any agent work", async () => {
    const model = scripted([{ text: "x" }]);
    const off = await tripsageChatResponse(req(), { authorization: auth(), model: async () => model, env: {}, planning: planning() });
    expect(off.status).toBe(404);
    expect(model.doStreamCalls).toHaveLength(0);
  });
});

describe("Tripsage required-information gate (Ticket 04)", () => {
  const withJourney = (over: object) => ({ ...COMPLETE_JOURNEY_FIXTURE, ...over });
  const MISSING: [string, Record<string, unknown>, unknown, string, string][] = [
    ["transport", { transport: undefined }, COMPLETE_JOURNEY_FIXTURE, "transport", "xe máy hay ô tô"],
    ["durationDays", { durationDays: undefined }, COMPLETE_JOURNEY_FIXTURE, "durationDays", "bao nhiêu ngày"],
    ["startDate", { startDate: undefined }, COMPLETE_JOURNEY_FIXTURE, "startDate", "ngày nào"],
    ["origin (no journey)", {}, null, "origin", "Chưa chọn điểm xuất phát"],
    ["origin confirmation", {}, withJourney({ origin: ORIGIN_FIXTURES.unconfirmed }), "originConfirmation", "Xác nhận điểm xuất phát"],
    ["departure time", {}, withJourney({ departureMinute: null }), "departureMinute", "giờ khởi hành"],
    ["return deadline", {}, withJourney({ returnDeadlineMinute: null }), "returnDeadlineMinute", "hạn trở về"],
  ];
  for (const [name, extra, journey, field, text] of MISSING) {
    it(`does not schedule and returns the Vietnamese question when ${name} is missing`, async () => {
      routeSpy.mockClear();
      const model = scripted([propose([["a"]]), { text: "Bạn cho mình biết thêm nhé." }]);
      const sse = await run(model, {}, journey, { ...TRIP_INFO_FIXTURE, ...extra });
      expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
      expect(routeSpy).not.toHaveBeenCalled();
      const fed = JSON.stringify(model.doStreamCalls[1]!.prompt);
      expect(fed).toContain("MISSING_REQUIRED_INFO");
      expect(fed).toContain(field);
      expect(fed.toLowerCase()).toContain(text.toLowerCase());
    });
  }

  it("does not spend a proposal on a gated call, and recordTripInfo takes effect in the same turn", async () => {
    const noTransport = { ...TRIP_INFO_FIXTURE, transport: undefined };
    const model = scripted([propose([["a"]]), propose([["a"]]), { tool: "recordTripInfo", input: { transport: "CAR" } }, propose([["a", "b"]]), { text: "Xong." }]);
    const sse = await run(model, {}, COMPLETE_JOURNEY_FIXTURE, noTransport);
    expect(parts(sse).filter(p => p.type === "data-itinerary")).toHaveLength(1);
    expect(parts(sse).find(p => p.type === "data-trip-info")?.data).toEqual({ tripInfo: TRIP_INFO_FIXTURE });
  });

  it("schedules with visible second-cluster defaults when interests, pace and travelers were never asked", async () => {
    const { interests: _omit, ...withoutInterests } = TRIP_INFO_FIXTURE;
    const model = scripted([propose([["a", "b"]]), { text: "Xong." }]);
    const sse = await run(model, {}, COMPLETE_JOURNEY_FIXTURE, withoutInterests);
    const result = plannerResultSchema.parse(parts(sse).find(p => p.type === "data-itinerary")!.data);
    expect(result.requirement.interests).toEqual(["NATURE", "ADVENTURE"]);
    expect(result.requirement.pace).toBe("MODERATE");
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).toContain("[mặc định, chưa hỏi]");
  });

  it("never lets the day count follow the model's selection (B.1)", async () => {
    const model = scripted([propose([["a"], ["b"]]), { text: "Xong." }]);
    const sse = await run(model);
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("đúng 1 ngày");
  });

  it("recordTripInfo refuses a past start date and records nothing", async () => {
    const model = scripted([{ tool: "recordTripInfo", input: { startDate: "2020-01-01" } }, { text: "Bạn đi ngày nào?" }]);
    const sse = await run(model);
    expect(parts(sse).some(p => p.type === "data-trip-info")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("PAST_DATE");
  });

  it("requestOrigin opens the card only while the origin is unconfirmed", async () => {
    const open = await run(scripted([{ tool: "requestOrigin", input: { departureMinute: 420, returnDeadlineMinute: 1080 } }, { text: "Bạn chọn điểm xuất phát nhé." }]), {}, null);
    expect(parts(open).find(p => p.type === "data-origin-request")?.data).toEqual({ departureMinute: 420, returnDeadlineMinute: 1080 });
    const model = scripted([{ tool: "requestOrigin", input: { departureMinute: 420, returnDeadlineMinute: 1080 } }, { text: "Ok." }]);
    const done = await run(model);
    expect(parts(done).some(p => p.type === "data-origin-request")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("ORIGIN_ALREADY_CONFIRMED");
  });

  it("suggestReplies streams validated quick replies", async () => {
    const sse = await run(scripted([{ tool: "suggestReplies", input: { replies: ["4 ngày 3 đêm", "Xe máy tự lái"] } }, { text: "Bạn chọn nhé." }]));
    expect(parts(sse).find(p => p.type === "data-quick-replies")?.data).toEqual({ replies: ["4 ngày 3 đêm", "Xe máy tự lái"] });
  });

  it("takes the journey branch when everything is present: journey legs and eligible schedule", async () => {
    const sse = await run(scripted([propose([["a", "b"]]), { text: "Bạn xem lịch nhé." }]));
    const result = plannerResultSchema.parse(parts(sse).find(p => p.type === "data-itinerary")!.data);
    expect(result.journeyPlan?.legs.map(l => l.kind)).toEqual(["OUTBOUND", "TRANSFER", "RETURN"]);
    expect(result.requirement.journey?.origin?.confirmed).toBe(true);
    expect(result.status).toBe("PROPOSAL_READY");
    expect(result.eligibleForFinalConfirmation).toBe(true);
    // Passes the existing Save mapping (mapping only; Save itself is Ticket 05).
    expect(toSaveProposal(result)?.journey?.origin?.confirmed).toBe(true);
  });

  it("takes the origin only from the request, never from model tool input", async () => {
    const forged = propose([["a"]], { journey: COMPLETE_JOURNEY_FIXTURE });
    const sse = await run(scripted([forged, { text: "Mình cần điểm xuất phát." }]), {}, null);
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
  });

  it("rejects an invalid, strict-violating or out-of-coverage journey with 400/422 before the model runs", async () => {
    for (const bad of [{ origin: { ...ORIGIN_FIXTURES.confirmed, extra: 1 } }, { origin: ORIGIN_FIXTURES.invalid }, { origin: ORIGIN_FIXTURES.outside }]) {
      const model = scripted([{ text: "x" }]);
      const response = await tripsageChatResponse(req(bad), { authorization: auth(), model: async () => model, env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(), planning: planning() });
      expect([400, 422]).toContain(response.status);
      expect(model.doStreamCalls).toHaveLength(0);
    }
  });

  it("keeps the allow-list at exactly five tools", async () => {
    const model = scripted([{ text: "Chào bạn." }]);
    await run(model);
    expect(model.doStreamCalls[0]!.tools!.map(t => t.name).sort()).toEqual(BASE_TOOL_NAMES_SORTED);
  });
});
