import type { Database } from "@KLTN/db";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { planningCandidate, planningNow } from "../../test/planning-fixtures";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { plannerResultSchema, type PlannerResult } from "../trip-planner/planner-contract";
import { getMyTrip } from "../trip-read/trip-read-service";
import type { ExternalPlaceResolver } from "../trip-save/external-place-resolver";
import { saveTripResponse } from "../trip-save/trip-save-http";
import type { TripSaveDependencies } from "../trip-save/trip-save-service";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse } from "./tripsage-chat-http";
import { createChatSaveController } from "./tripsage-chat-save";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = {
  route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }),
  coordinateRoute: async () => verified,
};

async function chatTwoDayItinerary(): Promise<PlannerResult> {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const chunks = call++ === 0
        ? [
            { type: "tool-call", toolCallId: "c1", toolName: "proposeItinerary", input: JSON.stringify({ selection: { days: [["a"], ["b"]] } }) },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
          ]
        : [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Xong." },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
    },
  });
  const authorization = {
    database: { user: { findUnique: async () => ({ id: "owner", role: "TRAVELER", status: "ACTIVE" }) } },
    resolveSession: async () => ({ user: { id: "owner" } }),
  } as unknown as AuthorizationDependencies;
  const response = await tripsageChatResponse(
    new Request("https://app.test/api/ai/chat", {
      method: "POST",
      headers: { origin: "https://app.test", "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "m", role: "user", parts: [{ type: "text", text: "Đi 2 ngày" }] }],
        journey: COMPLETE_JOURNEY_FIXTURE,
        tripInfo: { ...TRIP_INFO_FIXTURE, durationDays: 2 },
      }),
    }),
    {
      authorization,
      model: async () => model,
      env: { TRIPSAGE_CHAT_ENABLED: "true" },
      admit: createPlanningAdmission(),
      planning: (): TripsagePlanningDeps => ({
        candidates: async () => [planningCandidate("a"), planningCandidate("b")],
        routes: routes as never,
        now: () => planningNow,
      }),
    },
  );
  const sse = await response.text();
  const part = sse
    .split("\n")
    .filter(l => l.startsWith("data: {"))
    .map(l => JSON.parse(l.slice(6)) as { type: string; data?: unknown })
    .find(p => p.type === "data-itinerary");
  return plannerResultSchema.parse(part!.data);
}

type StoredExternal = { id: string; provider: "GOOGLE_PLACES"; providerPlaceId: string; name: string; latitude: number; longitude: number; fetchedAt: Date };
type StoredTrip = {
  id: string;
  userId: string;
  startDate: Date;
  durationDays: number;
  transport: "CAR" | "MOTORCYCLE";
  manuallyCompletedAt: null;
  journeySnapshot: unknown;
  uncheckedChecks: unknown;
  uncheckedConfirmedAt: Date | null;
  updatedAt: Date;
  user: { name: string };
  favorites: { id: string }[];
  companionPublication: null;
  chosenLodgings: { id: string; nightIndex: number; externalPlaceId: string }[];
  days: { id: string; dayIndex: number; localDate: Date; visits: { id: string; order: number; startMinute: number; plannedDurationMinutes: number; destinationId: string }[] }[];
};

function memoryStore(resolver?: ExternalPlaceResolver) {
  const rows = [planningCandidate("a"), planningCandidate("b")];
  let records: { scope: string; key: string; requestHash: string; responseJson: string }[] = [];
  let externals: StoredExternal[] = [];
  let trips: StoredTrip[] = [];
  let actor: string | null = "owner";
  let tripSeq = 0;
  let extSeq = 0;

  const database = {
    user: { findUnique: async () => (actor ? { id: actor, role: "TRAVELER", status: "ACTIVE" } : null) },
    destination: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => structuredClone(rows.filter(r => where.id.in.includes(r.id) && r.visibility === "VISIBLE")) },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) =>
        records.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key) ?? null,
    },
    trip: {
      findFirst: async ({ where }: { where: { id: string; OR: { userId?: string }[] } }) => {
        const userId = where.OR.find(item => item.userId)?.userId;
        const found = trips.find(t => t.id === where.id && t.userId === userId);
        if (!found) return null;
        return {
          ...found,
          chosenLodgings: found.chosenLodgings.map(cl => ({
            id: cl.id,
            nightIndex: cl.nightIndex,
            externalPlace: externals.find(e => e.id === cl.externalPlaceId)!,
          })),
          days: found.days.map(d => ({
            ...d,
            _count: { visits: d.visits.length },
            visits: d.visits.map(v => ({
              ...v,
              externalPlace: null,
              destination: { ...rows.find(r => r.id === v.destinationId)!, media: [], deletedAt: null },
            })),
          })),
        };
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pendingRecords = structuredClone(records);
      const pendingExternals = structuredClone(externals);
      const pendingTrips = structuredClone(trips);
      const tx = {
        user: database.user,
        destination: database.destination,
        idempotencyRecord: {
          create: async ({ data }: { data: typeof records[number] }) => { pendingRecords.push(data); },
          update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
            pendingRecords.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key)!.responseJson = data.responseJson;
          },
        },
        externalPlace: {
          upsert: async ({ where, create, update }: { where: { provider_providerPlaceId: { provider: "GOOGLE_PLACES"; providerPlaceId: string } }; create: Omit<StoredExternal, "id">; update: Partial<StoredExternal> }) => {
            const existing = pendingExternals.find(e => e.provider === where.provider_providerPlaceId.provider && e.providerPlaceId === where.provider_providerPlaceId.providerPlaceId);
            if (existing) {
              Object.assign(existing, update);
              return { id: existing.id };
            }
            const next: StoredExternal = { id: `ext-${++extSeq}`, ...create };
            pendingExternals.push(next);
            return { id: next.id };
          },
        },
        trip: {
          create: async ({ data }: { data: { userId: string; startDate: Date; durationDays: number; transport: "CAR" | "MOTORCYCLE"; journeySnapshot: unknown; chosenLodgings?: { create: { nightIndex: number; externalPlaceId: string }[] }; days: { create: { dayIndex: number; localDate: Date; visits: { create: { destinationId: string; startMinute: number; plannedDurationMinutes: number; order: number }[] } }[] } } }) => {
            const id = `trip-${++tripSeq}`;
            pendingTrips.push({
              id,
              userId: data.userId,
              startDate: data.startDate,
              durationDays: data.durationDays,
              transport: data.transport,
              manuallyCompletedAt: null,
              journeySnapshot: data.journeySnapshot,
              uncheckedChecks: null,
              uncheckedConfirmedAt: null,
              updatedAt: planningNow,
              user: { name: "Owner" },
              favorites: [],
              companionPublication: null,
              chosenLodgings: (data.chosenLodgings?.create ?? []).map((cl, idx) => ({ id: `cl-${idx + 1}`, ...cl })),
              days: data.days.create.map((d, dIdx) => ({
                id: `day-${dIdx + 1}`,
                dayIndex: d.dayIndex,
                localDate: d.localDate,
                visits: d.visits.create.map((v, vIdx) => ({ id: `v-${dIdx}-${vIdx}`, ...v })),
              })),
            });
            return { id };
          },
        },
      };
      const result = await callback(tx);
      records = pendingRecords;
      externals = pendingExternals;
      trips = pendingTrips;
      return result;
    },
  };

  const defaultResolver: ExternalPlaceResolver = async placeIds => ({
    status: "OK",
    places: new Map(
      placeIds.map(placeId => [placeId, { placeId, name: "HomeStay Minh Đức", latitude: 23.0468, longitude: 104.9885 }]),
    ),
  });

  const dependencies: TripSaveDependencies = {
    database: database as unknown as Database,
    resolveSession: async () => (actor ? { user: { id: actor } } : null),
    getRoute: async () => ({ kind: "ok", durationSeconds: 3600, distanceMeters: 50_000 }),
    journeyRoutes: routes as never,
    resolveExternalPlaces: resolver ?? defaultResolver,
  };

  return {
    dependencies,
    get trips() { return trips; },
    get externals() { return externals; },
    as: (id: string | null) => { actor = id; },
  };
}

const post = (deps: TripSaveDependencies, body: unknown, key = "k-lodging-1") =>
  saveTripResponse(
    new Request("https://app.test/api/trips", {
      method: "POST",
      headers: { origin: "https://app.test", "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
    deps,
  );

const fetchTo = (deps: TripSaveDependencies): typeof fetch => async (_url, init) =>
  post(deps, JSON.parse(init!.body as string), (init!.headers as Record<string, string>)["Idempotency-Key"]);

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(planningNow); });
afterEach(() => { vi.useRealTimers(); });

describe("Ticket 11: save chosen lodgings per night through POST /api/trips and read back", () => {
  it("resolves chosen lodging via Google Place Details, upserts ExternalPlace, saves TripChosenLodging, and reads it back", async () => {
    const store = memoryStore();
    const result = await chatTwoDayItinerary();
    const controller = createChatSaveController({ fetcher: fetchTo(store.dependencies), newKey: () => "lodging-save-1" });
    const view = await controller.save(result, undefined, {
      chosenLodgings: [{ nightIndex: 1, placeId: "ChIJ_lodging_1", name: "HomeStay Minh Đức" }],
    });
    expect(view).toMatchObject({ state: "success", tripId: "trip-1" });
    expect(store.trips).toHaveLength(1);
    expect(store.trips[0]!.chosenLodgings).toEqual([{ id: "cl-1", nightIndex: 1, externalPlaceId: "ext-1" }]);
    // Chosen lodging is NOT saved as an ItineraryVisit
    expect(store.trips[0]!.days.flatMap(d => d.visits)).toHaveLength(2);

    const detail = await getMyTrip(new Headers(), "trip-1", store.dependencies as never, "2026-10-20", planningNow);
    expect(detail.chosenLodgings).toEqual([
      { id: "cl-1", nightIndex: 1, placeId: "ChIJ_lodging_1", name: "HomeStay Minh Đức", latitude: 23.0468, longitude: 104.9885 },
    ]);

    // Non-owner cannot read the saved trip
    store.as("stranger");
    await expect(getMyTrip(new Headers(), "trip-1", store.dependencies as never, "2026-10-20", planningNow)).rejects.toMatchObject({
      code: "TRIP_NOT_FOUND",
      status: 404,
    });
  });

  it("replays the exact same result on idempotent retry without creating duplicate trips or chosen lodgings", async () => {
    const store = memoryStore();
    const result = await chatTwoDayItinerary();
    const body = {
      confirm: true,
      proposal: {
        startDate: result.requirement.startDate,
        durationDays: result.requirement.durationDays,
        transport: result.requirement.transport,
        journey: result.requirement.journey,
        days: result.days.map(day => ({
          dayIndex: day.day,
          visits: day.stops.map(stop => ({
            destinationId: stop.destination.id,
            startMinute: stop.arrivalMinute!,
            plannedDurationMinutes: stop.visitDurationMinutes,
            order: stop.order,
          })),
        })),
      },
      chosenLodgings: [{ nightIndex: 1, placeId: "ChIJ_lodging_1", name: "HomeStay Minh Đức" }],
    };

    const first = await post(store.dependencies, body, "idem-lodging-1");
    const second = await post(store.dependencies, body, "idem-lodging-1");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(secondJson.data.tripId).toBe(firstJson.data.tripId);
    expect(store.trips).toHaveLength(1);
    expect(store.trips[0]!.chosenLodgings).toHaveLength(1);
  });

  it("fails clearly naming the unresolvable chosen lodging instead of silently dropping it", async () => {
    const store = memoryStore(async () => ({ status: "UNAVAILABLE" }));
    const result = await chatTwoDayItinerary();
    const controller = createChatSaveController({ fetcher: fetchTo(store.dependencies), newKey: () => "lodging-fail-1" });
    const view = await controller.save(result, undefined, {
      chosenLodgings: [{ nightIndex: 1, placeId: "ChIJ_broken_lodging", name: "Homestay Hết Tồn Tại" }],
    });
    expect(view.state).toBe("failed");
    expect(view.message).toContain("Đêm 1: Homestay Hết Tồn Tại");
    expect(store.trips).toHaveLength(0);
  });

  it("rejects unauthenticated callers at the server boundary", async () => {
    const store = memoryStore();
    store.as(null);
    const res = await post(store.dependencies, { confirm: true, proposal: {}, chosenLodgings: [{ nightIndex: 1, placeId: "ChIJ_1" }] }, "unauth-1");
    expect(res.status).toBe(401);
    expect(store.trips).toHaveLength(0);
  });
});
