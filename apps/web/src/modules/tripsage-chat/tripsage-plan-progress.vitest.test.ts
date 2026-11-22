import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import { fixtureRoutes, planningCandidate } from "../../test/planning-fixtures";
import { sanitizeStoredParts, type StoredAssistantPart } from "./assistant-conversation-contract";
import {
  applyPlanProgress,
  hasPlanProgressErrors,
  planProgressPartSchema,
  type PlanProgressPart,
} from "./tripsage-chat-parts";
import { streamTripsageChat } from "./tripsage-chat-service";
import { createTripsageChatTools, type TripsagePlanningDeps } from "./tripsage-chat-tools";

const FIXED_NOW = new Date("2026-11-23T03:00:00Z");

const CANDIDATES = [
  { ...planningCandidate("dest-1", 60), name: "Cổng Trời Quản Bạ", area: "Quản Bạ", latitude: 23.147, longitude: 105.219 },
  { ...planningCandidate("dest-2", 90), name: "Phố cổ Đồng Văn", area: "Đồng Văn", latitude: 23.289, longitude: 105.381 },
];

const PLANNING: TripsagePlanningDeps = {
  candidates: async () => CANDIDATES,
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
};

const CONFIRMED_JOURNEY = {
  origin: {
    label: "TP Hà Giang",
    latitude: 22.8233,
    longitude: 104.9836,
    source: "MANUAL" as const,
    confirmed: true as const,
  },
  departureMinute: 420,
  returnDeadlineMinute: 1080,
  returnDepartureMinute: null,
};

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};

describe("Ticket 15: data-plan-progress contract & storage filter (slim D19, BR-4)", () => {
  it("validates strict schema and tracks real transitions without inventing steps", () => {
    expect(planProgressPartSchema.safeParse({ step: "SELECT", state: "running" }).success).toBe(true);
    expect(planProgressPartSchema.safeParse({ step: "VALIDATE", state: "running", detail: "đợt 2/5" }).success).toBe(true);
    expect(planProgressPartSchema.safeParse({ step: "LODGING", state: "error", detail: "Chưa tìm được chỗ nghỉ" }).success).toBe(true);
    expect(planProgressPartSchema.safeParse({ step: "VALIDATE", state: "running", percent: 50 }).success).toBe(false);
    expect(planProgressPartSchema.safeParse({ step: "FAKE", state: "running" }).success).toBe(false);

    let snap = applyPlanProgress(null, { step: "SELECT", state: "running" });
    expect(snap.transitionCount).toBe(1);
    expect(snap.steps.VALIDATE.state).toBe("pending");
    snap = applyPlanProgress(snap, { step: "SELECT", state: "running" });
    expect(snap.transitionCount).toBe(1);
    snap = applyPlanProgress(snap, { step: "SELECT", state: "done" });
    snap = applyPlanProgress(snap, { step: "VALIDATE", state: "running", detail: "đợt 1/5" });
    expect(snap.transitionCount).toBe(3);
    expect(hasPlanProgressErrors(snap)).toBe(false);

    snap = applyPlanProgress(snap, { step: "LODGING", state: "error", detail: "Chưa tìm được chỗ nghỉ" });
    expect(hasPlanProgressErrors(snap)).toBe(true);
  });

  it("strips data-plan-progress in sanitizeStoredParts so transient progress is never persisted", () => {
    const out = sanitizeStoredParts([
      { type: "text", text: "Mình đã lập lịch trình 2 ngày cho bạn." },
      { type: "data-plan-progress", data: { step: "SELECT", state: "running" } },
      { type: "data-plan-progress", data: { step: "VALIDATE", state: "done", detail: "đợt 1/5" } },
      { type: "data-plan-progress", data: { step: "LODGING", state: "error", detail: "Chưa tìm được chỗ nghỉ" } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ type: "text", text: "Mình đã lập lịch trình 2 ngày cho bạn." });
  });
});

describe("Ticket 15: real progress transitions & parallel post-validation execution (slim D19–D20, AC-6)", () => {
  it("emits >= 3 progress transitions before itinerary, runs nearby activities & knowledge in parallel, and isolates lodging failure", async () => {
    const events: string[] = [];
    const progressEvents: PlanProgressPart[] = [];
    let placesStarted = false;
    let knowledgeStartedBeforePlacesDone = false;
    let resolvePlaces!: () => void;
    const placesGate = new Promise<void>(resolve => { resolvePlaces = resolve; });

    const tools = createTripsageChatTools({
      planning: PLANNING,
      journey: CONFIRMED_JOURNEY,
      tripInfo: {
        transport: "MOTORCYCLE",
        durationDays: 2,
        startDate: "2026-12-12",
        travelers: 4,
        pace: "MODERATE",
      },
      latestUserText: "Mình thích săn mây sáng sớm và ăn đặc sản Hà Giang",
      features: new Set(["hotels"]),
      hotels: () => async () => ({ status: "UNAVAILABLE" as const }),
      places: vi.fn(async () => {
        placesStarted = true;
        await placesGate;
        return { status: "NO_RESULTS" as const };
      }),
      knowledge: vi.fn(async () => {
        if (placesStarted) knowledgeStartedBeforePlacesDone = true;
        resolvePlaces();
        return [
          {
            title: "Cẩm nang săn mây Hà Giang",
            text: "Cổng Trời Quản Bạ là điểm săn mây sáng sớm đẹp nhất từ 05:30 - 06:30.",
          },
        ];
      }),
      emitPlanProgress: part => {
        progressEvents.push(part);
        events.push(`progress:${part.step}:${part.state}`);
      },
      emitItinerary: () => {
        events.push("itinerary");
      },
      emitSuggestions: () => {
        events.push("suggestions");
      },
      emitCost: () => {
        events.push("cost");
      },
    });

    const opts = { toolCallId: "t-1", messages: [], context: {} } as Parameters<NonNullable<typeof tools.listDestinations.execute>>[1];
    await tools.listDestinations.execute!({}, opts);
    const propRes = await tools.proposeItinerary.execute!({ selection: { days: [["dest-1"], ["dest-2"]] } }, opts) as { ok: boolean };
    expect(propRes.ok).toBe(true);

    // AC-6: at least 3 progress transitions happen before data-itinerary is emitted
    const itineraryIdx = events.indexOf("itinerary");
    expect(itineraryIdx).toBeGreaterThanOrEqual(3);
    const beforeItinerary = events.slice(0, itineraryIdx).filter(e => e.startsWith("progress:"));
    expect(beforeItinerary.length).toBeGreaterThanOrEqual(3);
    expect(beforeItinerary).toContain("progress:SELECT:running");
    expect(beforeItinerary).toContain("progress:SELECT:done");
    expect(beforeItinerary).toContain("progress:VALIDATE:running");
    expect(beforeItinerary).toContain("progress:VALIDATE:done");

    // D20: nearby activities and grounded knowledge lookup overlapped concurrently
    expect(knowledgeStartedBeforePlacesDone).toBe(true);

    // Error isolation: searchHotels failure emits LODGING error without crashing or blocking estimateCosts
    const hotelRes = await tools.searchHotels!.execute!(
      { destinationId: "dest-1", checkInDate: "2026-12-12", checkOutDate: "2026-12-13", adults: 4, currency: "VND", kind: "HOMESTAY" },
      opts,
    ) as { ok: boolean };
    expect(hotelRes.ok).toBe(false);
    expect(progressEvents.some(p => p.step === "LODGING" && p.state === "error" && p.detail?.includes("Chưa tìm được"))).toBe(true);

    const costRes = await tools.estimateCosts.execute!(
      { lines: [{ category: "food", label: "Ăn uống", amount: 1_200_000, basis: "4 người × 2 ngày" }] },
      opts,
    ) as { ok: boolean };
    expect(costRes.ok).toBe(true);
    expect(progressEvents.some(p => p.step === "COSTS" && p.state === "running")).toBe(true);
    expect(progressEvents.some(p => p.step === "COSTS" && p.state === "done")).toBe(true);
  });

  it("streams transient data-plan-progress over SSE and never persists it via onPersistAssistant", async () => {
    const steps = [
      { tool: "listDestinations", input: {} },
      { tool: "proposeItinerary", input: { selection: { days: [["dest-1"], ["dest-2"]] } } },
      { tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn uống", amount: 1_200_000 }] } },
      { text: "Lịch trình 2 ngày đã sẵn sàng." },
    ];
    let call = 0;
    const model = new MockLanguageModelV4({
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

    let persistedParts: StoredAssistantPart[] = [];
    const response = streamTripsageChat({
      model,
      messages: [{ role: "user", content: "Lập lịch 2 ngày Hà Giang giúp mình" }],
      journey: CONFIRMED_JOURNEY,
      tripInfo: {
        transport: "MOTORCYCLE",
        durationDays: 2,
        startDate: "2026-12-12",
        travelers: 4,
        pace: "MODERATE",
      },
      planning: PLANNING,
      onPersistAssistant: async parts => {
        persistedParts = parts;
        return { status: "SUCCESS", data: { title: "Hà Giang · 4 người · 12/12" } };
      },
    });

    const sse = await response.text();
    const sseEvents = sse
      .split("\n")
      .filter(line => line.startsWith("data: {"))
      .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

    const progressIdx = sseEvents
      .map((e, i) => (e.type === "data-plan-progress" ? i : -1))
      .filter(i => i >= 0);
    const itineraryIdx = sseEvents.findIndex(e => e.type === "data-itinerary");

    expect(itineraryIdx).toBeGreaterThan(-1);
    expect(progressIdx.filter(i => i < itineraryIdx).length).toBeGreaterThanOrEqual(3);
    expect(persistedParts.some(p => (p as { type: string }).type === "data-plan-progress")).toBe(false);
    expect(persistedParts.some(p => p.type === "data-itinerary")).toBe(true);
  });
});
