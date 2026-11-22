import type { Database } from "@KLTN/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureNeeds, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { scheduleSelection } from "../assistant-planning/planning-engine";
import { externalPlannerCandidate } from "../trip-planner/planner-candidates";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { saveTripResponse } from "./trip-save-http";
import type { TripSaveDependencies } from "./trip-save-service";
import { toSaveProposal, toUncheckedSavePlan } from "./trip-save-adapter";
import { assessUnchecked } from "./unchecked-checks";
import type { ExternalPlaceResolver } from "./external-place-resolver";

const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = { route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }), coordinateRoute: async () => verified };
const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, journey: COMPLETE_JOURNEY_FIXTURE } };
const EXT = "ChIJext_1";
const GOOGLE = { placeId: EXT, name: "Quán Google", latitude: 22.8, longitude: 104.98 };

async function schedule(ids: string[][], candidates = [planningCandidate("a"), planningCandidate("b"), externalPlannerCandidate({ ...GOOGLE })], route = routes): Promise<PlannerResult> {
  return scheduleSelection(needs, { days: ids }, candidates, route as never, planningNow);
}

type Row = ReturnType<typeof planningCandidate>;
function store(resolver?: ExternalPlaceResolver) {
  const rows: Row[] = [planningCandidate("a"), planningCandidate("b")];
  let records: { scope: string; key: string; requestHash: string; responseJson: string }[] = [];
  let trips: { userId: string; data: any }[] = [];
  let places: { where: unknown; create: any; update: any }[] = [];
  let actor: string | null = "owner";
  let loseResponse = false, failNextRead = false, created = 0;
  const database = {
    user: { findUnique: async () => ({ id: actor, role: "TRAVELER" }) },
    destination: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => structuredClone(rows.filter(r => where.id.in.includes(r.id) && r.visibility === "VISIBLE")) },
    idempotencyRecord: { findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => { if (failNextRead) { failNextRead = false; throw new Error("database unreachable"); } return records.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key) ?? null; } },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pendingRecords = structuredClone(records), pendingTrips = [...trips], pendingPlaces = [...places];
      const tx = { user: database.user, destination: database.destination,
        idempotencyRecord: { create: async ({ data }: { data: (typeof records)[number] }) => { pendingRecords.push(data); }, update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => { pendingRecords.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key)!.responseJson = data.responseJson; } },
        externalPlace: { upsert: async (args: { where: unknown; create: any; update: any }) => { pendingPlaces.push(args); return { id: `ext-row-${args.create.providerPlaceId}` }; } },
        trip: { create: async ({ data }: { data: any }) => { pendingTrips.push({ userId: data.userId, data }); return { id: `trip-${++created}` }; } } };
      const result = await callback(tx);
      records = pendingRecords; trips = pendingTrips; places = pendingPlaces;
      if (loseResponse) { loseResponse = false; failNextRead = true; throw new Error("connection lost after commit"); }
      return result;
    },
  };
  const calls: string[][] = [];
  const defaultResolver: ExternalPlaceResolver = async ids => { calls.push([...ids]); return { status: "OK", places: new Map(ids.map(id => [id, { ...GOOGLE, placeId: id }])) }; };
  const dependencies: TripSaveDependencies = {
    database: database as unknown as Database,
    resolveSession: async () => actor ? { user: { id: actor } } : null,
    getRoute: async () => ({ kind: "ok", provider: "STADIA_MAPS", durationSeconds: 3600, distanceMeters: 50_000 }),
    journeyRoutes: routes as never,
    resolveExternalPlaces: resolver ?? defaultResolver,
  };
  return { dependencies, rows, calls, get trips() { return trips; }, get places() { return places; }, get records() { return records; }, as: (id: string | null) => { actor = id; }, loseNextResponse: () => { loseResponse = true; } };
}
const post = (deps: TripSaveDependencies, body: unknown, headers: Record<string, string> = { "Idempotency-Key": "k1" }) =>
  saveTripResponse(new Request("https://app.test/api/trips", { method: "POST", body: JSON.stringify(body), headers: { origin: "https://app.test", "content-type": "application/json", ...headers } }), deps);

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(planningNow); });
afterEach(() => { vi.useRealTimers(); });

describe("assessUnchecked (pure rule)", () => {
  it("KLTN-only all PASS is PASS and an external place yields only unchecked items", async () => {
    expect(assessUnchecked(await schedule([["a", "b"]]))).toEqual({ kind: "PASS" });
    const result = await schedule([["a", `ext:google:${EXT}`]]);
    const assessment = assessUnchecked(result);
    expect(assessment.kind).toBe("UNCHECKED");
    if (assessment.kind !== "UNCHECKED") return;
    expect(assessment.items.map(i => i.check).sort()).toEqual(["MINIMUM_DURATION", "OPENING_HOURS", "SCHEDULE_CONFLICTS"]);
    expect(assessment.items.every(i => i.placeId === `ext:google:${EXT}`)).toBe(true);
  });

  it("a FAILED check or missing data about a KLTN place is BLOCKED, never UNCHECKED", async () => {
    const result = await schedule([["a", `ext:google:${EXT}`]]);
    const failed = structuredClone(result);
    failed.checks.find(c => c.key === "TRAVEL_TIME")!.status = "VIOLATION";
    expect(assessUnchecked(failed).kind).toBe("BLOCKED");
    const kltnUnknown = await schedule([["b", `ext:google:${EXT}`]], [planningCandidate("a"), { ...planningCandidate("b"), openingDays: [] }, externalPlannerCandidate({ ...GOOGLE })]);
    expect(assessUnchecked(kltnUnknown).kind).toBe("BLOCKED");
  });

  it("toSaveProposal still refuses an unchecked schedule; toUncheckedSavePlan offers it with the items", async () => {
    const result = await schedule([["a", `ext:google:${EXT}`]]);
    expect(toSaveProposal(result)).toBeNull();
    const plan = toUncheckedSavePlan(result);
    expect(plan?.proposal.days[0]!.visits.map(v => v.destinationId)).toEqual(["a", `ext:google:${EXT}`]);
    expect(plan?.unchecked.length).toBeGreaterThan(0);
    expect(toUncheckedSavePlan(await schedule([["a", "b"]]))).toBeNull();
  });
});

describe("POST /api/trips with unchecked external places", () => {
  const plan = async (ids = [["a", `ext:google:${EXT}`]]) => toUncheckedSavePlan(await schedule(ids))!;

  it("refuses an unchecked-only schedule without confirmation and lists the server's items; nothing is written", async () => {
    const db = store();
    const { proposal, unchecked } = await plan();
    const response = await post(db.dependencies, { confirm: true, proposal });
    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: { unchecked: unknown[] } } };
    expect(body.error.code).toBe("UNCHECKED_CONFIRMATION_REQUIRED");
    expect(body.error.details.unchecked).toEqual(unchecked);
    expect(db.trips).toHaveLength(0);
    expect(db.places).toHaveLength(0);
  });

  it("with the exact confirmation: SUCCESS, ExternalPlace upsert from server data, external visit, unchecked list stored, never PASS", async () => {
    const db = store();
    const { proposal, unchecked } = await plan();
    const response = await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked } });
    expect(response.status).toBe(200);
    const body = await response.json() as { operationStatus: string; data: { tripId: string; unchecked: unknown[]; validation: { canConfirm: boolean; groups: Record<string, { status: string }> } } };
    expect(body.operationStatus).toBe("SUCCESS");
    expect(body.data.unchecked).toEqual(unchecked);
    expect(body.data.validation.canConfirm).toBe(false);
    expect(Object.values(body.data.validation.groups).some(g => g.status === "INSUFFICIENT_DATA")).toBe(true);
    expect(db.places).toHaveLength(1);
    expect(db.places[0]!.create).toMatchObject({ provider: "GOOGLE_PLACES", providerPlaceId: EXT, name: GOOGLE.name, latitude: GOOGLE.latitude, longitude: GOOGLE.longitude });
    expect(db.places[0]!.create.fetchedAt).toEqual(planningNow);
    const visits = db.trips[0]!.data.days.create[0].visits.create;
    expect(visits[0]).toMatchObject({ destinationId: "a" });
    expect(visits[1]).toMatchObject({ externalPlaceId: `ext-row-${EXT}` });
    expect(visits[1]).not.toHaveProperty("destinationId");
    expect(db.trips[0]!.data.uncheckedChecks).toEqual({ revision: "unchecked-save-v1", items: unchecked });
    expect(db.trips[0]!.data.uncheckedConfirmedAt).toEqual(planningNow);
  });

  it("rejects a false, empty, altered or unneeded confirmation and stores nothing", async () => {
    const db = store();
    const { proposal, unchecked } = await plan();
    const bad = [
      { confirmed: false, items: unchecked },
      { confirmed: true, items: [] },
      { confirmed: true, items: unchecked.slice(1) },
      { confirmed: true, items: unchecked.map(i => ({ ...i, reasonCode: "OTHER" })) },
    ];
    for (const [index, ack] of bad.entries()) {
      const response = await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: ack }, { "Idempotency-Key": `bad-${index}` });
      expect([400, 422]).toContain(response.status);
    }
    const mismatch = await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked.slice(1) } }, { "Idempotency-Key": "m" });
    expect((await mismatch.json() as { error: { code: string } }).error.code).toBe("UNCHECKED_CONFIRMATION_MISMATCH");
    const kltn = toSaveProposal(await schedule([["a", "b"]]))!;
    const needless = await post(db.dependencies, { confirm: true, proposal: kltn, acknowledgedUnchecked: { confirmed: true, items: unchecked } }, { "Idempotency-Key": "n" });
    expect(needless.status).toBe(422);
    expect(db.trips).toHaveLength(0);
  });

  it("a FAILED check still blocks even with a confirmation", async () => {
    const db = store();
    const { proposal, unchecked } = await plan();
    const forged = structuredClone(proposal);
    forged.days[0]!.visits[1]!.startMinute = forged.days[0]!.visits[0]!.startMinute + 5;
    const response = await post(db.dependencies, { confirm: true, proposal: forged, acknowledgedUnchecked: { confirmed: true, items: unchecked } });
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("TRIP_VALIDATION_FAILED");
    expect(db.trips).toHaveLength(0);
  });

  it("missing data about a KLTN place is not confirmable", async () => {
    const db = store();
    db.rows[1]!.openingDays = [];
    const result = await schedule([["b", `ext:google:${EXT}`]], [planningCandidate("a"), { ...planningCandidate("b"), openingDays: [] }, externalPlannerCandidate({ ...GOOGLE })]);
    const unchecked = assessUnchecked(result);
    expect(unchecked.kind).toBe("BLOCKED");
    const proposal = { startDate: "2026-11-02", durationDays: 1, transport: "CAR", journey: COMPLETE_JOURNEY_FIXTURE, days: [{ dayIndex: 1, visits: result.days[0]!.stops.map(s => ({ destinationId: s.destination.id, startMinute: s.arrivalMinute!, plannedDurationMinutes: s.visitDurationMinutes, order: s.order })) }] };
    const response = await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: `ext:google:${EXT}` }] } });
    expect(response.status).toBe(422);
    expect(db.trips).toHaveLength(0);
  });

  it("the client cannot force a name or coordinates: extra fields are rejected and the resolver data wins", async () => {
    const db = store(async ids => ({ status: "OK", places: new Map(ids.map(id => [id, { placeId: id, name: "Tên từ Google", latitude: 22.8, longitude: 104.98 }])) }));
    const { proposal, unchecked } = await plan();
    const forged = structuredClone(proposal) as any;
    forged.days[0].visits[1].name = "Hacker";
    forged.days[0].visits[1].latitude = 1;
    expect((await post(db.dependencies, { confirm: true, proposal: forged, acknowledgedUnchecked: { confirmed: true, items: unchecked } })).status).toBe(400);
    expect((await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked } }, { "Idempotency-Key": "ok" })).status).toBe(200);
    expect(db.places[0]!.create).toMatchObject({ name: "Tên từ Google", latitude: 22.8, longitude: 104.98 });
  });

  it("an unresolvable place is FAILED without writing; a forged place id format is rejected before any Google call", async () => {
    const down = store(async () => ({ status: "UNAVAILABLE" }));
    const { proposal, unchecked } = await plan();
    const response = await post(down.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked } });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json() as { error: { code: string }; operationStatus: string })).toMatchObject({ operationStatus: "FAILED", error: { code: "EXTERNAL_PLACE_UNAVAILABLE" } });
    expect(down.trips).toHaveLength(0);
    const db = store();
    const forged = structuredClone(proposal);
    forged.days[0]!.visits[1]!.destinationId = "ext:google:../../etc?x=1";
    expect((await post(db.dependencies, { confirm: true, proposal: forged, acknowledgedUnchecked: { confirmed: true, items: unchecked } })).status).toBe(422);
    expect(db.calls).toHaveLength(0);
  });

  it("UNKNOWN then retry with the identical payload and key creates one Trip and calls Google only once", async () => {
    const db = store();
    const { proposal, unchecked } = await plan();
    const body = { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked } };
    db.loseNextResponse();
    const first = await post(db.dependencies, body, { "Idempotency-Key": "u1" });
    expect((await first.json() as { operationStatus: string }).operationStatus).toBe("UNKNOWN");
    const retry = await post(db.dependencies, body, { "Idempotency-Key": "u1" });
    expect((await retry.json() as { operationStatus: string; data: { tripId: string } })).toMatchObject({ operationStatus: "SUCCESS", data: { tripId: "trip-1" } });
    expect(db.trips).toHaveLength(1);
    expect(db.calls).toHaveLength(1);
    const changed = await post(db.dependencies, { confirm: true, proposal }, { "Idempotency-Key": "u1" });
    expect(changed.status).not.toBe(200);
  });

  it("the Trip belongs to the signed-in user only", async () => {
    const db = store();
    const { proposal, unchecked } = await plan();
    db.as("intruder");
    expect((await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked }, userId: "owner" })).status).toBe(400);
    await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked } });
    expect(db.trips.map(t => t.userId)).toEqual(["intruder"]);
    db.as(null);
    expect((await post(db.dependencies, { confirm: true, proposal, acknowledgedUnchecked: { confirmed: true, items: unchecked } }, { "Idempotency-Key": "z" })).status).toBe(401);
  });
});
