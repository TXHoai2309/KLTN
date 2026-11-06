import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@KLTN/db";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { saveTrip, type TripSaveDependencies } from "../trip-save/trip-save-service";
import { getMyTrip, listMyTrips } from "../trip-read/trip-read-service";
import { getPublicCompanion } from "../trip-companions/companion-service";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { tripSaveRequestSchema } from "../trip-save/trip-save-contract";
import { weekdays } from "../destination/destination-contract";
import { applyJourneyEdit, previewJourneyEdit } from "./journey-edit-service";
import { createStadiaRoutesProvider } from "../trip-planner/planner-routes";
import { assertJourneyBeforeDeparture } from "./journey-cutoff";
import { getTripForEdit, previewEdit } from "../trip-edit/trip-edit-service";
import { applyEdit } from "../trip-edit/apply-edit";

const raw = process.env.ORIGIN_SAVE_TEST_DATABASE_URL;
describe.skipIf(!raw)("journey Save/read/privacy on actual disposable PostgreSQL", () => {
  let db: PrismaClient;
  const prefix = `origin06-${randomUUID()}`, owner = `${prefix}-owner`, member = `${prefix}-member`, admin = `${prefix}-admin`, dest = `${prefix}-destination`;
  const now = new Date("2030-11-14T00:00:00Z"), headers = new Headers();
  const deps = (id: string | null = owner): TripSaveDependencies => ({ database: db, resolveSession: async () => id ? { user: { id } } : null, getRoute: async () => ({ kind: "ok", durationSeconds: 7200, distanceMeters: 100_000 }) });
  const input = () => tripSaveRequestSchema.parse({ confirm: true, proposal: { startDate: "2030-11-15", durationDays: 1, transport: "CAR", journey: { ...COMPLETE_JOURNEY_FIXTURE, origin: { ...COMPLETE_JOURNEY_FIXTURE.origin!, label: "PRIVATE_ORIGIN_CANARY" } }, days: [{ dayIndex: 1, visits: [{ destinationId: dest, startMinute: 600, plannedDurationMinutes: 60, order: 1 }] }] } });
  beforeAll(async () => {
    const target = new URL(raw!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/origin06_test" || target.username !== "origin06_test" || target.searchParams.get("sslmode") !== "disable" || process.env.ORIGIN_SAVE_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-owned journey database");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (identity[0]?.name !== "origin06_test") throw new Error("Disposable database identity rejected");
    for (const id of [owner, member, admin]) await db.user.create({ data: { id, email: `${id}@example.invalid`, name: "Synthetic traveler", role: id === admin ? "ADMIN" : "TRAVELER" } });
    await db.destination.create({ data: { id: dest, name: "Public synthetic attraction", description: "Synthetic fixture", area: "Hà Giang", category: "TEST", latitude: 22.8233, longitude: 104.9836, visibility: "VISIBLE", minimumDurationMinutes: 30, suggestedDurationMinutes: 60,
      openingDays: { create: weekdays.map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: { create: { opensAtMinute: 480, closesAtMinute: 1080 } } })) } } });
  });
  afterAll(async () => { await db?.$disconnect(); }); // runner owns/removes entire container
  it("records the additive migration, nullable legacy rows and no pending/failed ledger", async () => {
    const ledger = await db.$queryRaw<{ name: string; finished: Date | null }[]>`SELECT migration_name AS name, finished_at AS finished FROM _prisma_migrations WHERE rolled_back_at IS NULL`;
    expect(ledger).toHaveLength(Number(process.env.ORIGIN_SAVE_MIGRATION_COUNT));
    expect(ledger.every(row => row.finished !== null)).toBe(true);
    expect(ledger.some(row => row.name === "20261104130000_trip_journey_snapshot")).toBe(true);
    const legacy = await db.trip.create({ data: { userId: owner, startDate: new Date("2030-11-15"), durationDays: 1, transport: "CAR", days: { create: { dayIndex: 1, localDate: new Date("2030-11-15") } } } });
    expect(legacy.journeySnapshot).toBeNull();
    expect((await getMyTrip(headers, legacy.id, deps(), "2030-11-14")).journey).toBeNull();
  });
  it("commits one Trip/receipt across concurrent same-key Save and replays original intent", async () => {
    const key = `concurrent-${randomUUID()}`, payload = input();
    const results = await Promise.all([saveTrip(headers, payload, key, deps(), now), saveTrip(headers, payload, key, deps(), now)]);
    expect(results.every(result => result.status === "SUCCESS")).toBe(true);
    if (results[0]!.status !== "SUCCESS" || results[1]!.status !== "SUCCESS") throw new Error("Concurrent save failed");
    expect(results[0]!.data.tripId).toBe(results[1]!.data.tripId);
    const receipt = await db.idempotencyRecord.findMany({ where: { scope: JSON.stringify([owner, "trip:create"]), key } });
    expect(receipt).toHaveLength(1);
    const read = await getMyTrip(headers, results[0]!.data.tripId, deps(), "2030-11-14");
    expect(read.journey).toMatchObject({ revision: "journey-save-v1", journey: payload.proposal.journey, plan: { policy: "roadside-rest-v1", legs: [{ kind: "OUTBOUND" }, { kind: "RETURN" }] } });
    const changed = input(); changed.proposal.journey!.departureMinute = 420;
    expect(await saveTrip(headers, changed, key, deps(), now)).toMatchObject({ status: "FAILED", error: { code: "IDEMPOTENCY_KEY_REUSED" } });
    // Lost response reconciliation reads committed receipt even if provider is now unavailable.
    expect(await saveTrip(headers, payload, key, { ...deps(), getRoute: async () => ({ kind: "unavailable" }) }, now)).toMatchObject({ status: "SUCCESS", replayed: true });
  });
  it("returns origin only to owner; active member/public/outsider Admin receive no origin/leg/total canary", async () => {
    const result = await saveTrip(headers, input(), `privacy-${randomUUID()}`, deps(), now);
    if (result.status !== "SUCCESS") throw new Error("Private journey save failed");
    const publication = await db.tripCompanionPublication.create({ data: { tripId: result.data.tripId, title: "Synthetic public invitation", introduction: "Synthetic public introduction", additionalCapacity: 2 } });
    await db.tripCompanionMembership.create({ data: { publicationId: publication.id, userId: member, state: "ACTIVE" } });
    const own = await getMyTrip(headers, result.data.tripId, deps(), "2030-11-14");
    expect(JSON.stringify(own)).toContain("PRIVATE_ORIGIN_CANARY");
    const shared = await getMyTrip(headers, result.data.tripId, deps(member), "2030-11-14");
    expect(shared).not.toHaveProperty("journey");
    expect(shared.days[0]?.visits).toHaveLength(1);
    const publicData = await getPublicCompanion(publication.id, db);
    const lists = await listMyTrips(headers, deps(member), "2030-11-14");
    for (const projection of [shared, publicData, lists]) {
      const json = JSON.stringify(projection);
      for (const marker of ["PRIVATE_ORIGIN_CANARY", "journeySnapshot", "roadside-rest-v1", '"OUTBOUND"', '"RETURN"', '"restMinutes"', String(COMPLETE_JOURNEY_FIXTURE.origin!.longitude)]) expect(json).not.toContain(marker);
    }
    await expect(getMyTrip(headers, result.data.tripId, deps(admin), "2030-11-14")).rejects.toMatchObject({ code: "TRIP_NOT_FOUND" });
    await expect(getMyTrip(headers, result.data.tripId, deps(null), "2030-11-14")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("rechecks canonical minimum after routing and rolls back both Trip and receipt", async () => {
    let calls = 0;
    const key = `stale-${randomUUID()}`;
    const stale = { ...deps(), getRoute: async () => { if (++calls === 2) await db.destination.update({ where: { id: dest }, data: { minimumDurationMinutes: 100 } }); return { kind: "ok" as const, durationSeconds: 7200, distanceMeters: 100_000 }; } };
    try {
      expect(await saveTrip(headers, input(), key, stale, now)).toMatchObject({ status: "FAILED", error: { code: "TRIP_VALIDATION_FAILED" } });
      expect(await db.idempotencyRecord.count({ where: { scope: JSON.stringify([owner, "trip:create"]), key } })).toBe(0);
    } finally { await db.destination.update({ where: { id: dest }, data: { minimumDurationMinutes: 30 } }); }
  });
  it("previews without mutation, applies once under revision/cutoff and projects owner-only readback", async () => {
    const result = await saveTrip(headers, input(), `edit-seed-${randomUUID()}`, deps(), now);
    if (result.status !== "SUCCESS") throw new Error("Seed Save failed");
    const id = result.data.tripId, initial = await db.trip.findUniqueOrThrow({ where: { id } });
    const journeyRoutes = createStadiaRoutesProvider({ apiKey: () => "synthetic-only", fetcher: async () => Response.json({ trip: { summary: { time: 7200, length: 100 } } }) });
    const editDeps = { ...deps(), journeyRoutes, now: () => now };
    const journey = { ...input().proposal.journey!, departureMinute: 480 };
    const preview = await previewJourneyEdit(headers, id, { baseRevision: initial.updatedAt.toISOString(), journey }, editDeps);
    expect(preview.eligibleForConfirmation).toBe(true);
    expect((await db.trip.findUniqueOrThrow({ where: { id } })).journeySnapshot).toEqual(initial.journeySnapshot);
    if (!preview.candidate) throw new Error("Expected applicable candidate");
    const key = `apply-${randomUUID()}`, request = { baseRevision: initial.updatedAt.toISOString(), candidate: preview.candidate, confirmed: true as const };
    const outcomes = await Promise.all([applyJourneyEdit(headers, id, request, key, editDeps), applyJourneyEdit(headers, id, request, key, editDeps)]);
    expect(outcomes.every(outcome => outcome.status === "SUCCESS")).toBe(true);
    const read = await getMyTrip(headers, id, deps(), "2030-11-14");
    expect(read.journey?.journey.departureMinute).toBe(480);
    expect(read.days[0]?.visits[0]?.startMinute).toBe(600);
    expect(await applyJourneyEdit(headers, id, request, key, { ...editDeps, now: () => new Date("2030-11-20T00:00:00Z") })).toMatchObject({ status: "SUCCESS", replayed: true });
    await expect(applyJourneyEdit(headers, id, request, `stale-${randomUUID()}`, editDeps)).rejects.toMatchObject({ code: "TRIP_REVISION_CONFLICT" });
    await expect(previewJourneyEdit(headers, id, { baseRevision: (await db.trip.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString(), journey }, { ...editDeps, ...deps(member) })).rejects.toMatchObject({ code: "TRIP_NOT_FOUND" });
  });
  it("supports explicit legacy opt-in only before its 00:00 Vietnam cutoff and preserves null on cancel", async () => {
    const legacy = await db.trip.create({ data: { userId: owner, startDate: new Date("2030-11-15"), durationDays: 1, transport: "CAR", days: { create: { dayIndex: 1, localDate: new Date("2030-11-15"), visits: { create: { destinationId: dest, startMinute: 600, plannedDurationMinutes: 60, order: 1 } } } } } });
    const routes = createStadiaRoutesProvider({ apiKey: () => "synthetic-only", fetcher: async () => Response.json({ trip: { summary: { time: 7200, length: 100 } } }) });
    const editDeps = { ...deps(), journeyRoutes: routes, now: () => new Date("2030-11-14T16:59:59Z") };
    const preview = await previewJourneyEdit(headers, legacy.id, { baseRevision: legacy.updatedAt.toISOString(), journey: COMPLETE_JOURNEY_FIXTURE }, editDeps);
    expect(preview.eligibleForConfirmation).toBe(true);
    expect((await db.trip.findUniqueOrThrow({ where: { id: legacy.id } })).journeySnapshot).toBeNull();
    expect(() => assertJourneyBeforeDeparture(legacy, new Date("2030-11-14T17:00:00Z"))).toThrowError(expect.objectContaining({ code: "JOURNEY_CHANGE_CLOSED" }));
    if (!preview.candidate) throw new Error("Opt-in candidate missing");
    const request = { baseRevision: legacy.updatedAt.toISOString(), candidate: preview.candidate, confirmed: true as const };
    await expect(applyJourneyEdit(headers, legacy.id, request, `late-optin-${randomUUID()}`, { ...editDeps, now: () => new Date("2030-11-14T17:00:00Z") })).rejects.toMatchObject({ code: "JOURNEY_CHANGE_CLOSED" });
    expect(await applyJourneyEdit(headers, legacy.id, request, `optin-${randomUUID()}`, editDeps)).toMatchObject({ status: "SUCCESS" });
    expect((await getMyTrip(headers, legacy.id, deps(), "2030-11-14")).journey?.journey).toEqual(COMPLETE_JOURNEY_FIXTURE);
  });
  it("rechecks cutoff after routing, rejects changed scope and preserves canonical origin/receipt on rejection", async () => {
    const result = await saveTrip(headers, input(), `cutoff-seed-${randomUUID()}`, deps(), now);
    if (result.status !== "SUCCESS") throw new Error("Seed failed");
    const initial = await db.trip.findUniqueOrThrow({ where: { id: result.data.tripId } });
    const candidate = input().proposal;
    candidate.journey!.departureMinute = 480;
    let time = new Date("2030-11-14T22:59:59Z"); // old departure 06:00 Vietnam
    const metric = { status: "VERIFIED" as const, reason: null, durationSeconds: 7200, distanceMeters: 100_000, provider: "STADIA_MAPS" as const };
    const editDeps = { ...deps(), now: () => time, journeyRoutes: { route: async (pair: import("../trip-planner/planner-routes").RoutePair) => ({ ...metric, fromDestinationId: pair.from.id, toDestinationId: pair.to.id }), coordinateRoute: async () => { time = new Date("2030-11-14T23:00:00Z"); return metric; } } };
    const request = { baseRevision: initial.updatedAt.toISOString(), candidate, confirmed: true as const };
    const key = `cutoff-cross-${randomUUID()}`;
    expect(await applyJourneyEdit(headers, initial.id, request, key, editDeps)).toMatchObject({ status: "FAILED", error: { code: "JOURNEY_CHANGE_CLOSED" } });
    expect((await db.trip.findUniqueOrThrow({ where: { id: initial.id } })).journeySnapshot).toEqual(initial.journeySnapshot);
    expect(await db.idempotencyRecord.count({ where: { scope: JSON.stringify([owner, "trip:journey-edit"]), key } })).toBe(0);
    time = now;
    const changed = structuredClone(request); changed.candidate.transport = "MOTORCYCLE";
    await expect(applyJourneyEdit(headers, initial.id, changed, `scope-${randomUUID()}`, editDeps)).rejects.toMatchObject({ code: "JOURNEY_SCOPE_CHANGED" });
    await db.trip.update({ where: { id: initial.id }, data: { manuallyCompletedAt: now } });
    const latest = await db.trip.findUniqueOrThrow({ where: { id: initial.id } });
    await expect(previewJourneyEdit(headers, initial.id, { baseRevision: latest.updatedAt.toISOString(), journey: COMPLETE_JOURNEY_FIXTURE }, { ...editDeps, now: () => now })).rejects.toMatchObject({ code: "JOURNEY_CHANGE_CLOSED" });
  });
  it("withholds stale journey legs/totals after an ordinary itinerary change, preserving private origin", async () => {
    const result = await saveTrip(headers, input(), `stale-plan-${randomUUID()}`, deps(), now);
    if (result.status !== "SUCCESS") throw new Error("Seed failed");
    const trip = await db.trip.findUniqueOrThrow({ where: { id: result.data.tripId }, include: { days: { include: { visits: true } } } });
    await db.itineraryVisit.update({ where: { id: trip.days[0]!.visits[0]!.id }, data: { startMinute: 660 } });
    const read = await getMyTrip(headers, trip.id, deps(), "2030-11-14");
    expect(read.journey?.journey.origin?.label).toBe("PRIVATE_ORIGIN_CANARY");
    expect(read.journey?.plan).toBeNull();
  });
  it("reconciles an actual committed-but-acknowledgement-lost Save with the identical request/key", async () => {
    let lost = false;
    const database = new Proxy(db, { get(target, property) {
      if (property === "$transaction") return async (execute: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        await target.$transaction(execute);
        lost = true;
        throw new Error("synthetic lost commit acknowledgement");
      };
      if (property === "idempotencyRecord") return new Proxy(target.idempotencyRecord, { get(delegate, method) {
        if (method === "findUnique") return async (...args: Parameters<typeof delegate.findUnique>) => {
          if (lost) { lost = false; throw new Error("synthetic receipt lookup unavailable"); }
          return delegate.findUnique(...args);
        };
        return Reflect.get(delegate, method);
      } });
      return Reflect.get(target, property);
    } });
    const key = `lost-ack-${randomUUID()}`, payload = input();
    const count = await db.trip.count({ where: { userId: owner } });
    const outcome = await saveTrip(headers, payload, key, { ...deps(), database }, now);
    expect(outcome).toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
    expect(await db.trip.count({ where: { userId: owner } })).toBe(count + 1);
    const route = vi.fn<TripSaveDependencies["getRoute"]>();
    const retry = await saveTrip(headers, payload, key, { ...deps(), getRoute: route }, now);
    expect(retry).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(route).not.toHaveBeenCalled();
    expect(await db.trip.count({ where: { userId: owner } })).toBe(count + 1);
  });
  it("keeps actual legacy ordinary visit preview/apply/replay working without origin or migration backfill", async () => {
    const legacy = await db.trip.create({ data: { userId: owner, startDate: new Date("2030-11-15"), durationDays: 1, transport: "CAR", days: { create: { dayIndex: 1, localDate: new Date("2030-11-15"), visits: { create: { destinationId: dest, startMinute: 600, plannedDurationMinutes: 60, order: 1 } } } } } });
    const page = await getTripForEdit(headers, legacy.id, deps());
    expect(page.journeyDisclosure).toBe("ORIGIN_LEGS_NOT_INCLUDED");
    const candidate = structuredClone(page.candidate); candidate.days[0]!.visits[0]!.startMinute = 660;
    const checked = await previewEdit(legacy.id, owner, page.baseRevision, candidate, deps(), now);
    expect(checked.eligibleForConfirmation).toBe(true);
    const request = { baseRevision: page.baseRevision, candidate, confirmed: true as const, kind: "MANUAL" as const };
    const editDeps = { database: db, getRoute: deps().getRoute, authorization: deps() };
    const key = `ordinary-legacy-${randomUUID()}`;
    expect(await applyEdit(headers, legacy.id, owner, request, key, editDeps, now)).toMatchObject({ status: "SUCCESS" });
    expect(await applyEdit(headers, legacy.id, owner, request, key, editDeps, now)).toMatchObject({ status: "SUCCESS", replayed: true });
    const read = await getMyTrip(headers, legacy.id, deps(), "2030-11-14");
    expect(read.journey).toBeNull(); expect(read.days[0]?.visits[0]?.startMinute).toBe(660);
    expect((await db.trip.findUniqueOrThrow({ where: { id: legacy.id } })).journeySnapshot).toBeNull();
  });
});
