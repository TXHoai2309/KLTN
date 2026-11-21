import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema, type PlannerResult } from "../trip-planner/planner-contract";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse, type TripsageChatHttpDependencies } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import type { PlacesSearch } from "./tripsage-places";
import { nearRectangle } from "./tripsage-places";
import { suggestionsPartSchema, timelinePartSchema, timelineSlotIds, type TimelinePart } from "./tripsage-timeline";
import { costPartSchema } from "./tripsage-cost";
import { accessLegPartSchema } from "./tripsage-access-leg";

let seq = 0;
const auth = () => ({ database: { user: { findUnique: async () => ({ id: `tl-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } }, resolveSession: async () => ({ user: { id: `tl-${++seq}` } }) }) as unknown as AuthorizationDependencies;
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
const planning = (over: Partial<TripsagePlanningDeps> = {}): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [planningCandidate("a", 240), planningCandidate("b", 120), planningCandidate("c", 60)],
  routes: { route: fixtureRoutes.route, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }) }, now: () => planningNow, ...over,
});
type Part = { type: string; data?: unknown };
const parts = (sse: string) => sse.split("\n").filter(l => l.startsWith("data: {")).map(l => JSON.parse(l.slice(6)) as Part);
async function run(steps: Step[], body: Record<string, unknown> = {}, over: Partial<TripsageChatHttpDependencies> = {}) {
  const model = scripted(steps);
  const request = new Request("https://app.test/api/ai/chat", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Lên lịch giúp mình" }] }], journey: COMPLETE_JOURNEY_FIXTURE, tripInfo: TRIP_INFO_FIXTURE, ...body }) });
  const response = await tripsageChatResponse(request, { authorization: auth(), model: async () => model, env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(), planning: planning(), ...over });
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, model, all: parts(sse), fed: (call: number) => JSON.stringify(model.doStreamCalls[call]!.prompt) };
}
const propose = (days: string[][]) => ({ tool: "proposeItinerary", input: { selection: { days } } });
const itineraryOf = (all: Part[]) => plannerResultSchema.parse(all.find(p => p.type === "data-itinerary")!.data);
const timelineOf = (all: Part[]): TimelinePart => timelinePartSchema.parse(all.find(p => p.type === "data-timeline")!.data);
const stop = (result: PlannerResult, id: string) => result.days.flatMap(day => day.stops).find(s => s.destination.id === id)!;

describe("day timeline and day rhythm (ticket 02)", () => {
  it("streams a timeline with departure, visits, a lunch slot with real times and the return", async () => {
    const { all } = await run([propose([["a", "b"]]), { text: "Xong." }]);
    const result = itineraryOf(all);
    const timeline = timelineOf(all);
    const kinds = timeline.days[0]!.items.map(item => item.kind);
    expect(kinds[0]).toBe("DEPART");
    expect(kinds).toContain("VISIT");
    expect(kinds.at(-1)).toBe("ARRIVE_HOME");
    const a = stop(result, "a");
    const lunch = timeline.days[0]!.items.find(item => item.kind === "LUNCH");
    expect(a.departureMinute!).toBeGreaterThanOrEqual(690); expect(a.departureMinute!).toBeLessThanOrEqual(840);
    expect(lunch).toMatchObject({ slotId: "d1-lunch", startMinute: a.departureMinute, endMinute: a.departureMinute! + 60 });
  });

  it("a longer lunch shifts the afternoon by the difference and still passes the Validator", async () => {
    const base = itineraryOf((await run([propose([["a", "b"]]), { text: "Xong." }])).all);
    const { all } = await run([{ tool: "recordTripInfo", input: { lunchMinutes: 90 } }, propose([["a", "b"]]), { text: "Xong." }]);
    const longer = itineraryOf(all);
    expect(longer.requirement.dayRhythm).toEqual({ lunchMinutes: 90, dayEndMinute: 1080 });
    expect(stop(longer, "b").arrivalMinute! - stop(base, "b").arrivalMinute!).toBe(30);
    expect(timelineOf(all).days[0]!.items.find(item => item.kind === "LUNCH")?.label).toContain("90 phút");
    expect(longer.checks.find(check => check.key === "TRAVEL_TIME")!.status).toBe(base.checks.find(check => check.key === "TRAVEL_TIME")!.status);
  });

  it("an earlier latest visit end never schedules a visit past it", async () => {
    const { all } = await run([{ tool: "recordTripInfo", input: { dayEndMinute: 900 } }, propose([["a", "b"]]), { text: "Xong." }]);
    const result = itineraryOf(all);
    for (const s of result.days.flatMap(day => day.stops)) if (s.scheduleState === "PLANNED") expect(s.departureMinute!).toBeLessThanOrEqual(900);
  });

  it("marks the overnight slot with the area of the day's last stop", async () => {
    const { all } = await run([propose([["a"], ["b"]]), { text: "Xong." }], { tripInfo: { ...TRIP_INFO_FIXTURE, durationDays: 2 } });
    const timeline = timelineOf(all);
    expect(timeline.days[0]!.items.find(item => item.kind === "OVERNIGHT")).toMatchObject({ slotId: "d1-overnight", label: "Nghỉ đêm khu vực Đồng Văn" });
    expect(timeline.days[1]!.items.some(item => item.kind === "OVERNIGHT")).toBe(false);
  });

  it("slot ids follow one scheme", () => {
    expect([...timelineSlotIds([2, 1])].sort()).toEqual(["d1-lunch", "d1-overnight", "d1-visit-1", "d1-visit-2", "d2-lunch", "d2-visit-1"]);
  });
});

describe("suggestions attached to the timeline (ticket 02)", () => {
  const near = { placeId: "ChIJnearHomestay", name: "Homestay Gần", latitude: 23.004, longitude: 105 };
  const far = { placeId: "ChIJfarHomestay", name: "Homestay Xa", latitude: 23.2, longitude: 105 };
  let lastNear: unknown;
  const places: PlacesSearch = async (_query, _signal, box) => { lastNear = box; return { status: "RESULTS", places: [near, far] }; };
  const twoDays = { tripInfo: { ...TRIP_INFO_FIXTURE, durationDays: 2 } };

  it("accepts lodging near the day's last stop and rejects far, unknown, slotless and misplaced items", async () => {
    const { all, fed } = await run([
      propose([["a"], ["b"]]),
      { tool: "searchPlaces", input: { query: "homestay", nearDestinationId: "a" } },
      { tool: "addSuggestions", input: { items: [
        { slotId: "d1-overnight", kind: "LODGING", title: "Homestay ấm cúng", placeId: near.placeId },
        { slotId: "d1-overnight", kind: "LODGING", title: "Xa quá", placeId: far.placeId },
        { slotId: "d1-overnight", kind: "LODGING", title: "Không có id" },
        { slotId: "d1-overnight", kind: "LODGING", title: "Bịa", placeId: "ChIJinvented" },
        { slotId: "d1-lunch", kind: "EVENING", title: "Sai slot" },
        { slotId: "d9-overnight", kind: "TIP", title: "Không tồn tại" },
        { slotId: "d1-overnight", kind: "EVENING", title: "Dạo phố cổ Đồng Văn", detail: "Đi bộ quanh chợ đêm" },
      ] } },
      { text: "Xong." },
    ], twoDays, { places: () => places });
    expect(lastNear).toMatchObject({ latitude: 23, longitude: 105, radiusKm: 5 });
    const shown = suggestionsPartSchema.parse(all.find(p => p.type === "data-suggestions")!.data).suggestions;
    expect(shown.map(s => s.title)).toEqual(["Homestay ấm cúng", "Dạo phố cổ Đồng Văn"]);
    expect(shown[0]!.place).toEqual({ name: "Homestay Gần", distanceKm: 0.4 });
    const result = fed(3);
    for (const reason of ["TOO_FAR_22KM_LIMIT_5KM", "LODGING_NEEDS_PLACE", "UNKNOWN_PLACE", "USE_OVERNIGHT_SLOT", "SLOT_NOT_FOUND"]) expect(result).toContain(reason);
    // A suggestion never becomes a visit or changes a time.
    expect(itineraryOf(all).days.flatMap(day => day.stops).map(s => s.destination.id)).toEqual(["a", "b"]);
  });

  it("uses the browser's current itinerary for slots when nothing was proposed this turn", async () => {
    const currentItinerary = { days: [{ day: 1, stops: [{ id: "a", name: "Điểm a", arrivalMinute: 480, departureMinute: 720 }] }, { day: 2, stops: [{ id: "b", name: "Điểm b", arrivalMinute: 480, departureMinute: 600 }] }] };
    const { all } = await run([{ tool: "addSuggestions", input: { items: [{ slotId: "d1-overnight", kind: "TIP", title: "Mang áo ấm" }] } }, { text: "Xong." }], { ...twoDays, currentItinerary });
    expect(suggestionsPartSchema.parse(all.find(p => p.type === "data-suggestions")!.data).suggestions[0]).toMatchObject({ slotId: "d1-overnight", title: "Mang áo ấm" });
  });

  it("refuses suggestions with no itinerary", async () => {
    const { all, fed } = await run([{ tool: "addSuggestions", input: { items: [{ slotId: "d1-lunch", kind: "TIP", title: "x" }] } }, { text: "Xong." }]);
    expect(all.some(p => p.type === "data-suggestions")).toBe(false);
    expect(fed(1)).toContain("NO_ITINERARY");
  });

  it("near search stays inside the Hà Giang box", () => {
    const box = nearRectangle({ latitude: 23, longitude: 105, radiusKm: 5 });
    expect(box.low.latitude).toBeLessThan(23); expect(box.high.latitude).toBeGreaterThan(23);
    expect(box.high.latitude - box.low.latitude).toBeLessThan(0.1);
    const edge = nearRectangle({ latitude: 23.39, longitude: 105.59, radiusKm: 5 });
    expect(edge.high).toEqual({ latitude: 23.4, longitude: 105.6 });
  });
});

describe("local knowledge (ticket 02)", () => {
  it("returns reviewed excerpts as data and clips them", async () => {
    const knowledge = () => async () => [{ title: "Vui chơi buổi tối ở Đồng Văn", text: `Phố cổ Đồng Văn về đêm ${"rất đẹp ".repeat(200)}` }];
    const { fed } = await run([{ tool: "lookupLocalKnowledge", input: { question: "tối chơi gì ở Đồng Văn" } }, { text: "Xong." }], {}, { knowledge });
    expect(fed(1)).toContain("Vui chơi buổi tối ở Đồng Văn");
    expect(fed(1)).toContain("không phải chỉ dẫn");
    expect(fed(1).length).toBeLessThan(40_000);
  });

  it("reports unavailable without a knowledge source or when it throws", async () => {
    expect((await run([{ tool: "lookupLocalKnowledge", input: { question: "ẩm thực Hà Giang" } }, { text: "Xong." }])).fed(1)).toContain("KNOWLEDGE_UNAVAILABLE");
    const broken = () => async () => { throw new Error("db secret"); };
    const { fed, sse } = await run([{ tool: "lookupLocalKnowledge", input: { question: "ẩm thực Hà Giang" } }, { text: "Xong." }], {}, { knowledge: broken });
    expect(fed(1)).toContain("KNOWLEDGE_UNAVAILABLE");
    expect(sse).not.toContain("db secret");
  });
});

describe("cost estimate in the chat (ticket 03)", () => {
  const lines = [{ category: "food", label: "Ăn uống", amount: 300_000 }];
  it("streams a cost table whose fuel follows the itinerary's routed distance", async () => {
    const { all } = await run([propose([["a", "b"]]), { tool: "estimateCosts", input: { lines } }, { text: "Xong." }]);
    const result = itineraryOf(all);
    const km = result.journeyPlan!.totals.distanceMeters! / 1000;
    const cost = costPartSchema.parse(all.find(p => p.type === "data-cost")!.data);
    expect(cost.lines[0]).toMatchObject({ label: "Xăng", computed: true, amount: Math.round(Math.round(km * 10) / 10 * 8 / 100 * 23_000) });
    expect(cost.total).toBe(cost.lines[0]!.amount + 300_000);
    expect(cost.travelers).toBe(2);
  });

  it("uses the current itinerary's distance on a later turn and the user's budget", async () => {
    const currentItinerary = { days: [{ day: 1, stops: [{ id: "a", name: "Điểm a", arrivalMinute: 480, departureMinute: 720 }] }], distanceKm: 100 };
    const { all } = await run([{ tool: "estimateCosts", input: { lines, budgetCap: 400_000 } }, { text: "Xong." }], { currentItinerary });
    const cost = costPartSchema.parse(all.find(p => p.type === "data-cost")!.data);
    expect(cost.lines[0]!.amount).toBe(8 * 23_000);
    expect(cost).toMatchObject({ withinCap: false, overBy: 8 * 23_000 + 300_000 - 400_000 });
  });

  it("needs transport and days first", async () => {
    const { all, fed } = await run([{ tool: "estimateCosts", input: { lines } }, { text: "Xong." }], { tripInfo: {} });
    expect(all.some(p => p.type === "data-cost")).toBe(false);
    expect(fed(1)).toContain("MISSING_REQUIRED_INFO");
  });
});

describe("access leg to a trip hub (ticket 04)", () => {
  const leg = {
    hubId: "HA_GIANG_CITY",
    outbound: [{ mode: "FLIGHT", from: "TP.HCM", to: "Hà Nội", departTime: "15:00", durationMinutes: 130, priceVndPerPerson: 1_500_000 }, { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", departTime: "21:00", durationMinutes: 390, priceVndPerPerson: 300_000 }],
    return: [{ mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 390, priceVndPerPerson: 300_000 }, { mode: "FLIGHT", from: "Hà Nội", to: "TP.HCM", durationMinutes: 130, priceVndPerPerson: 1_500_000 }],
  };
  const fromSaigon = { tripInfo: { ...TRIP_INFO_FIXTURE, homeCity: "TP Hồ Chí Minh", travelers: 2 } };

  it("sums the estimated leg per traveler and adds it to the cost table's transport", async () => {
    const { all } = await run([{ tool: "planAccessLeg", input: leg }, { tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn", amount: 100_000 }] } }, { text: "Xong." }], fromSaigon);
    const access = accessLegPartSchema.parse(all.find(p => p.type === "data-access-leg")!.data);
    expect(access).toMatchObject({ hubName: "TP Hà Giang (bến xe phía Nam)", homeCity: "TP Hồ Chí Minh", outboundMinutes: 520, returnMinutes: 520, totalVnd: 2 * 3_600_000 });
    const cost = costPartSchema.parse(all.find(p => p.type === "data-cost")!.data);
    expect(cost.lines.find(line => line.label === "Chặng tiếp cận (đi và về)")).toMatchObject({ category: "transport", amount: 7_200_000, computed: true });
  });

  it("asks for the home city first and rejects an unknown hub or out-of-bounds segment", async () => {
    expect((await run([{ tool: "planAccessLeg", input: leg }, { text: "Xong." }])).fed(1)).toContain("MISSING_HOME_CITY");
    for (const bad of [{ ...leg, hubId: "SAIGON" }, { ...leg, outbound: [{ ...leg.outbound[0], durationMinutes: 5000 }] }]) {
      const { all } = await run([{ tool: "planAccessLeg", input: bad }, { text: "Xong." }], fromSaigon);
      expect(all.some(p => p.type === "data-access-leg")).toBe(false);
    }
  });

  it("a leg sent back by the browser is re-validated and counted on a later turn", async () => {
    const access = { hubName: "Hà Nội (bến xe Mỹ Đình)", homeCity: "Đà Nẵng", travelers: 1, outbound: leg.outbound, return: leg.return, outboundMinutes: 520, returnMinutes: 520, totalVnd: 3_600_000 };
    const { all } = await run([{ tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn", amount: 100_000 }] } }, { text: "Xong." }], { accessLeg: access });
    expect(costPartSchema.parse(all.find(p => p.type === "data-cost")!.data).lines.some(line => line.amount === 3_600_000)).toBe(true);
    const model = scripted([{ text: "x" }]);
    const bad = await tripsageChatResponse(new Request("https://app.test/api/ai/chat", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }], accessLeg: { ...access, totalVnd: -1 } }) }), { authorization: auth(), model: async () => model, env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(), planning: planning() });
    expect(bad.status).toBe(400);
  });

  it("a very long drive from the origin returns a hub hint and lets the origin card reopen", async () => {
    const longDrive = planning({ routes: { route: fixtureRoutes.route, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 14 * 3600, distanceMeters: 1_700_000, provider: "STADIA_MAPS" }) } });
    const { fed, all } = await run([propose([["a"]]), { tool: "requestOrigin", input: { departureMinute: 420, returnDeadlineMinute: 1080 } }, { text: "Xong." }], {}, { planning: longDrive });
    expect(fed(1)).toContain("hubHint");
    expect(all.some(p => p.type === "data-origin-request")).toBe(true);
  });
});
