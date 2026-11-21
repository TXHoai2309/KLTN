import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema, type PlannerResult } from "../trip-planner/planner-contract";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { toSaveProposal } from "../trip-save/trip-save-adapter";
import { chatSaveProposal } from "./tripsage-chat-save";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import { createGooglePlacesSearch } from "./tripsage-places";

// Ticket 08b: external (Google) places scheduled through the chat route, never verified, never saved.
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
let seq = 0;
const auth = () => ({ database: { user: { findUnique: async () => ({ id: `ext-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } }, resolveSession: async () => ({ user: { id: `ext-${++seq}` } }) }) as unknown as AuthorizationDependencies;
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
const HG = { id: "ChIJhagiang1", displayName: { text: "Quán Cà Phê Mèo" }, location: { latitude: 22.8123, longitude: 104.9876 } };
const EXT = `ext:google:${HG.id}`;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const places = () => createGooglePlacesSearch({ apiKey: () => "k", fetcher: (async () => json({ places: [HG] })) as unknown as typeof fetch });
const routeSpy = vi.fn(fixtureRoutes.route);
const planning = (): TripsagePlanningDeps => ({
  candidates: async () => [planningCandidate("a"), planningCandidate("b")],
  routes: { route: routeSpy, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }) }, now: () => planningNow,
});
const req = () => new Request("https://app.test/api/ai/chat", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Đi 1 ngày" }] }], journey: COMPLETE_JOURNEY_FIXTURE, tripInfo: TRIP_INFO_FIXTURE }) });
const run = async (model: MockLanguageModelV4) => {
  const response = await tripsageChatResponse(req(), { authorization: auth(), model: async () => model, env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(), planning: () => planning(), places: places });
  expect(response.status).toBe(200);
  return response.text();
};
const parts = (sse: string) => sse.split("\n").filter(l => l.startsWith("data: {")).map(l => JSON.parse(l.slice(6)) as { type: string; data?: unknown });
const search = { tool: "searchPlaces", input: { query: "cà phê" } };
const propose = (days: string[][]) => ({ tool: "proposeItinerary", input: { selection: { days } } });
const itinerary = (sse: string): PlannerResult => plannerResultSchema.parse(parts(sse).find(p => p.type === "data-itinerary")!.data);

describe("Ticket 08b: external place scheduling at the chat route", () => {
  it("schedules a place returned by searchPlaces in the same turn, unchecked, with a 60 minute estimated stay", async () => {
    routeSpy.mockClear();
    const model = scripted([search, propose([["a", EXT]]), { text: "Bạn xem lịch nhé." }]);
    const result = itinerary(await run(model));
    const stops = result.days[0]!.stops;
    expect(stops.map(s => s.destination.id)).toEqual(["a", EXT]);
    const external = stops[1]!;
    expect(external.destination).toMatchObject({ external: true, name: "Quán Cà Phê Mèo", latitude: 22.8123, longitude: 104.9876 });
    expect(stops[0]!.destination).not.toHaveProperty("external");
    expect(external.visitDurationMinutes).toBe(60);
    expect(external.scheduleState).toBe("PLANNED");
    expect(external.departureMinute! - external.arrivalMinute!).toBe(60);
    expect(external.validationStatus).toBe("INSUFFICIENT_DATA");
    // Routing is by coordinates through the existing provider.
    expect(routeSpy.mock.calls.some(([pair]) => pair.to.id === EXT && pair.to.latitude === 22.8123 && pair.to.longitude === 104.9876)).toBe(true);
    expect(external.inbound).toMatchObject({ status: "VERIFIED", fromDestinationId: "a", toDestinationId: EXT });
  });

  it("never reports PASS for the unverified parts, keeps real checks, and blocks Save", async () => {
    const result = itinerary(await run(scripted([search, propose([["a", EXT]]), { text: "Xong." }])));
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.eligibleForFinalConfirmation).toBe(false);
    const check = (key: string) => result.checks.find(c => c.key === key)!;
    const issues = (key: string) => check(key).issues.filter(i => i.destinationId === EXT).map(i => i.code);
    expect(check("SCHEDULE_CONFLICTS").status).toBe("INSUFFICIENT_DATA");
    expect(issues("SCHEDULE_CONFLICTS")).toContain("EXTERNAL_PLACE_UNVERIFIED");
    expect(check("OPENING_HOURS").status).toBe("INSUFFICIENT_DATA");
    expect(issues("OPENING_HOURS")).toContain("OPENING_UNKNOWN");
    expect(check("MINIMUM_DURATION").status).toBe("INSUFFICIENT_DATA");
    expect(issues("MINIMUM_DURATION")).toContain("MINIMUM_UNKNOWN");
    // Travel time is still computed from real routing evidence.
    expect(check("TRAVEL_TIME").status).toBe("PASS");
    expect(result.reasonCodes).toContain("EXTERNAL_PLACE_UNVERIFIED");
    expect(toSaveProposal(result)).toBeNull();
    expect(chatSaveProposal(result)).toBeNull();
  });

  it("rejects an external id that searchPlaces never returned (forged)", async () => {
    const model = scripted([search, propose([["a", "ext:google:ChIJforged"]]), { text: "Mình chọn lại." }]);
    const sse = await run(model);
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[2]!.prompt)).toContain("INVALID_AI_PLAN");
  });

  it("rejects an external id when searchPlaces was not called in this turn (id from another turn)", async () => {
    const first = await run(scripted([search, { text: "Gợi ý xong." }]));
    expect(first).toContain(HG.id);
    const model = scripted([propose([["a", EXT]]), { text: "Mình chọn lại." }]);
    const sse = await run(model);
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("INVALID_AI_PLAN");
  });

  it("does not accept a bare place id without the ext:google: prefix", async () => {
    const sse = await run(scripted([search, propose([["a", HG.id]]), { text: "Mình chọn lại." }]));
    expect(parts(sse).some(p => p.type === "data-itinerary")).toBe(false);
  });

  it("a KLTN-only schedule is unchanged: no external flag, all checks PASS, ready", async () => {
    const result = itinerary(await run(scripted([propose([["a", "b"]]), { text: "Xong." }])));
    expect(result.status).toBe("PROPOSAL_READY");
    expect(JSON.stringify(result)).not.toContain("external");
    expect(result.checks.every(c => c.status === "PASS")).toBe(true);
  });

  it("keeps coordinates out of everything the model sees, while the browser part carries them", async () => {
    const model = scripted([search, propose([["a", EXT]]), { text: "Xong." }]);
    const sse = await run(model);
    const fed = JSON.stringify(model.doStreamCalls.at(-1)!.prompt);
    expect(fed).toContain(EXT);
    expect(fed).not.toContain("22.8123");
    expect(fed).not.toContain("104.9876");
    expect(sse).toContain("22.8123");
  });
});
