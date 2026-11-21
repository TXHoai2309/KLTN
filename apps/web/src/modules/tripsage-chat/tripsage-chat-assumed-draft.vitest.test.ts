import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Database } from "@KLTN/db";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { planningCandidate } from "../../test/planning-fixtures";
import { saveTripResponse } from "../trip-save/trip-save-http";
import type { TripSaveDependencies } from "../trip-save/trip-save-service";
import { TripsageSaveSection } from "../../components/tripsage-chat/tripsage-save-section";
import { TripsageTripSummary } from "../../components/tripsage-chat/tripsage-trip-summary";
import { journeyPartSchema, tripInfoPartSchema, type TripsageTripInfo } from "./tripsage-chat-context";
import { tripsageChatResponse } from "./tripsage-chat-http";
import { chatSavePlan } from "./tripsage-chat-save";
import { nearestReasonableSaturday, type TripsagePlanningDeps } from "./tripsage-chat-tools";

const FIXED_NOW = new Date("2026-11-21T03:00:00Z"); // Saturday 21/11/2026 10:00 VN
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = {
  route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }),
  coordinateRoute: async () => verified,
};

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `assumed-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `assumed-${++seq}` } }),
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

const CANDIDATES = [
  planningCandidate("d1"),
  planningCandidate("d2"),
  planningCandidate("d3"),
  planningCandidate("d4"),
  planningCandidate("d5"),
];

const planning = (now = FIXED_NOW): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => CANDIDATES,
  routes: routes as never,
  now: () => now,
});

const parts = (sse: string) =>
  sse
    .split("\n")
    .filter(line => line.startsWith("data: {"))
    .map(line => JSON.parse(line.slice(6)) as { type: string; data?: unknown });

async function chat(input: {
  text: string;
  steps: Step[];
  tripInfo?: TripsageTripInfo | null;
  journey?: unknown;
  now?: Date;
}) {
  const model = scripted(input.steps);
  const request = new Request("https://app.test/api/ai/chat", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: input.text }] }],
      ...(input.tripInfo !== undefined ? { tripInfo: input.tripInfo } : {}),
      ...(input.journey !== undefined ? { journey: input.journey } : {}),
    }),
  });
  const response = await tripsageChatResponse(request, {
    authorization: auth(),
    model: async () => model,
    env: { TRIPSAGE_CHAT_ENABLED: "true" },
    admit: createPlanningAdmission(),
    planning: planning(input.now ?? FIXED_NOW),
  });
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, all: parts(sse), model };
}

function saveStore() {
  const rows = CANDIDATES;
  let records: { scope: string; key: string; requestHash: string; responseJson: string }[] = [];
  let trips: { userId: string }[] = [];
  let created = 0;
  const database = {
    user: { findUnique: async () => ({ id: "owner", role: "TRAVELER" }) },
    destination: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => structuredClone(rows.filter(r => where.id.in.includes(r.id) && r.visibility === "VISIBLE")) },
    idempotencyRecord: { findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => records.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key) ?? null },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pendingRecords = structuredClone(records);
      const pendingTrips = structuredClone(trips);
      const tx = {
        user: database.user,
        destination: database.destination,
        idempotencyRecord: {
          create: async ({ data }: { data: (typeof records)[number] }) => { pendingRecords.push(data); },
          update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
            pendingRecords.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key)!.responseJson = data.responseJson;
          },
        },
        trip: { create: async ({ data }: { data: { userId: string } }) => { pendingTrips.push({ userId: data.userId }); return { id: `trip-${++created}` }; } },
      };
      const result = await callback(tx);
      records = pendingRecords;
      trips = pendingTrips;
      return result;
    },
  };
  const dependencies: TripSaveDependencies = {
    database: database as unknown as Database,
    resolveSession: async () => ({ user: { id: "owner" } }),
    getRoute: async () => ({ kind: "ok", durationSeconds: 3600, distanceMeters: 50_000 }),
    journeyRoutes: routes as never,
  };
  return { dependencies, get trips() { return trips; } };
}

const postSave = (deps: TripSaveDependencies, body: unknown, key = "k-assumed-1") =>
  saveTripResponse(
    new Request("https://app.test/api/trips", {
      method: "POST",
      headers: { origin: "https://app.test", "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
    deps,
  );

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(FIXED_NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("Ticket 04: Assumed draft first, then ask (ADR-44)", () => {
  it("computes the nearest reasonable future Saturday from Vietnam clock, never in the past", () => {
    expect(nearestReasonableSaturday(new Date("2026-11-21T03:00:00Z"))).toBe("2026-11-28"); // Saturday → next Saturday
    expect(nearestReasonableSaturday(new Date("2026-11-21T17:30:00Z"))).toBe("2026-11-28"); // Sunday 00:30 VN → upcoming Saturday
    expect(nearestReasonableSaturday(new Date("2026-11-27T03:00:00Z"))).toBe("2026-11-28"); // Friday → Saturday +1
  });

  it("proposes an Assumed draft immediately on a bare planning request with server-filled assumptions", async () => {
    const { all } = await chat({
      text: "Tôi muốn lập hành trình Hà Giang",
      steps: [
        { tool: "listDestinations", input: {} },
        { tool: "proposeItinerary", input: { selection: { days: [["d1"], ["d2"], ["d3"], ["d4"]] } } },
        { text: "Mình đang giả định: Hà Nội · 4N3Đ · xe máy · 28/11/2026. Bạn xuất phát từ đâu?" },
      ],
    });
    const info = tripInfoPartSchema.parse(all.find(p => p.type === "data-trip-info")!.data).tripInfo;
    expect(info).toMatchObject({
      transport: "MOTORCYCLE",
      durationDays: 4,
      startDate: "2026-11-28",
      assumedFields: ["transport", "durationDays", "startDate", "origin"],
    });
    const journey = journeyPartSchema.parse(all.find(p => p.type === "data-journey")!.data).journey;
    expect(journey.origin).toMatchObject({ label: "Hà Nội (bến xe Mỹ Đình)", source: "MANUAL", confirmed: true });

    const itinerary = plannerResultSchema.parse(all.find(p => p.type === "data-itinerary")!.data);
    expect(itinerary.days).toHaveLength(4);
    expect(itinerary.assumedFields).toEqual(["transport", "durationDays", "startDate", "origin"]);
    expect(itinerary.eligibleForFinalConfirmation).toBe(false);
    expect(chatSavePlan(itinerary)).toBeNull();
  });

  it("blocks Save on the server when origin or startDate is still assumed, and succeeds after confirming both", async () => {
    // Turn 1: assumed draft
    const draftTurn = await chat({
      text: "Lập lịch Hà Giang",
      steps: [
        { tool: "proposeItinerary", input: { selection: { days: [["d1"], ["d2"], ["d3"], ["d4"]] } } },
        { text: "Mình đang giả định: Hà Nội · 4N3Đ · xe máy · 28/11/2026." },
      ],
    });
    const draftInfo = tripInfoPartSchema.parse(draftTurn.all.find(p => p.type === "data-trip-info")!.data).tripInfo;
    const draftJourney = journeyPartSchema.parse(draftTurn.all.find(p => p.type === "data-journey")!.data).journey;
    const draftItinerary = plannerResultSchema.parse(draftTurn.all.find(p => p.type === "data-itinerary")!.data);

    // Server Save endpoint rejects direct POST with assumed origin + startDate
    const db = saveStore();
    const rawAssumedProposal = {
      journey: draftJourney,
      startDate: draftItinerary.requirement.startDate,
      durationDays: draftItinerary.requirement.durationDays,
      transport: draftItinerary.requirement.transport,
      assumedFields: draftItinerary.assumedFields,
      days: draftItinerary.days.map(day => ({
        dayIndex: day.day,
        visits: day.stops.map(stop => ({
          destinationId: stop.destination.id,
          startMinute: stop.arrivalMinute!,
          plannedDurationMinutes: stop.visitDurationMinutes,
          order: stop.order,
        })),
      })),
    };
    const blockedBoth = await postSave(db.dependencies, { confirm: true, proposal: rawAssumedProposal }, "k-both");
    expect(blockedBoth.status).toBe(422);
    const blockedBothJson = await blockedBoth.json() as { error: { code: string; message: string } };
    expect(blockedBothJson.error.code).toBe("ASSUMED_FIELDS_UNCONFIRMED");
    expect(blockedBothJson.error.message).toContain("nơi xuất phát");
    expect(blockedBothJson.error.message).toContain("ngày khởi hành");
    expect(db.trips).toHaveLength(0);

    // Turn 2: confirm assumed Hà Nội hub and departure date → assumed markers clear, Save succeeds
    const confirmTurn = await chat({
      text: "Đúng rồi, mình đi từ Hà Nội ngày 28/11/2026",
      tripInfo: draftInfo,
      journey: draftJourney,
      steps: [
        { tool: "confirmOrigin", input: { candidateId: "hub:HA_NOI" } },
        { tool: "recordTripInfo", input: { startDate: "2026-11-28" } },
        { tool: "proposeItinerary", input: { selection: { days: [["d1"], ["d2"], ["d3"], ["d4"]] } } },
        { text: "Mình đã xác nhận nơi xuất phát Hà Nội và ngày 28/11/2026." },
      ],
    });
    const finalInfo = [...confirmTurn.all].reverse().find(p => p.type === "data-trip-info");
    expect(tripInfoPartSchema.parse(finalInfo!.data).tripInfo.assumedFields).toEqual(["transport", "durationDays"]);
    const confirmedItinerary = plannerResultSchema.parse(confirmTurn.all.find(p => p.type === "data-itinerary")!.data);
    expect(confirmedItinerary.eligibleForFinalConfirmation).toBe(true);
    const savePlan = chatSavePlan(confirmedItinerary);
    expect(savePlan).not.toBeNull();

    const saved = await postSave(db.dependencies, { confirm: true, proposal: savePlan!.proposal }, "k-confirmed");
    expect(saved.status).toBe(200);
    expect(db.trips).toEqual([{ userId: "owner" }]);
  });

  it("renders assumed markers in TripsageTripSummary and blocks Save in TripsageSaveSection until confirmed", async () => {
    const draftTurn = await chat({
      text: "Lập lịch Hà Giang",
      steps: [
        { tool: "proposeItinerary", input: { selection: { days: [["d1"], ["d2"], ["d3"], ["d4"]] } } },
        { text: "Bản nháp giả định." },
      ],
    });
    const draftInfo = tripInfoPartSchema.parse(draftTurn.all.find(p => p.type === "data-trip-info")!.data).tripInfo;
    const draftJourney = journeyPartSchema.parse(draftTurn.all.find(p => p.type === "data-journey")!.data).journey;
    const draftItinerary = plannerResultSchema.parse(draftTurn.all.find(p => p.type === "data-itinerary")!.data);

    const summaryHtml = renderToStaticMarkup(createElement(TripsageTripSummary, { tripInfo: draftInfo, journey: draftJourney }));
    expect(summaryHtml).toContain('data-assumed="true"');
    expect(summaryHtml).toContain("Xe máy (giả định)");
    expect(summaryHtml).toContain("4 ngày (giả định)");
    expect(summaryHtml).toContain("Xuất phát: Hà Nội (bến xe Mỹ Đình) (giả định)");

    const blockedSaveHtml = renderToStaticMarkup(createElement(TripsageSaveSection, { result: draftItinerary, tripInfo: draftInfo }));
    expect(blockedSaveHtml).toContain("disabled");
    expect(blockedSaveHtml).toContain("nơi xuất phát và ngày khởi hành");

    const confirmedSummaryHtml = renderToStaticMarkup(createElement(TripsageTripSummary, {
      tripInfo: { ...draftInfo, assumedFields: undefined },
      journey: draftJourney,
    }));
    expect(confirmedSummaryHtml).not.toContain("(giả định)");

    const unblockedSaveHtml = renderToStaticMarkup(createElement(TripsageSaveSection, {
      result: draftItinerary,
      tripInfo: { ...draftInfo, assumedFields: undefined },
    }));
    expect(unblockedSaveHtml).not.toContain("disabled");
    expect(unblockedSaveHtml).toContain("Lưu hành trình");
  });
});
