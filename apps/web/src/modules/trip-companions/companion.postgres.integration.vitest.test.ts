import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database, Prisma } from "@KLTN/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { saveTrip } from "../trip-save/trip-save-service";
import { deleteMyTrip } from "../trip-read/trip-management-service";
import { getMyTrip } from "../trip-read/trip-read-service";
import { getCompanionFormContext, getPublicCompanion, previewCompanion, publishCompanion, type CompanionDependencies } from "./companion-service";
import { companionPublicationResponse, publicCompanionResponse } from "./companion-http";

const raw = process.env.TC01_TEST_DATABASE_URL;
describe.skipIf(!raw)("TC-01 actual disposable PostgreSQL", () => {
  let db: PrismaClient;
  const headers = new Headers(), now = new Date("2030-11-14T16:59:59Z");
  const prefix = `tc01-${randomUUID()}`, owner = `${prefix}-owner`, outsider = `${prefix}-outsider`, admin = `${prefix}-admin`;
  const visible = `${prefix}-visible`, hidden = `${prefix}-hidden`, deleted = `${prefix}-deleted`;
  const media = `${prefix}-media`;
  const draft = { title: "Synthetic trip", introduction: "Synthetic introduction", additionalCapacity: 2, imageMediaId: null as string | null };
  const input = { ...draft, confirm: true };
  const deps = (userId: string | null = owner): CompanionDependencies => ({ database: db, resolveSession: async () => userId ? { user: { id: userId } } : null, now: () => now });
  const createTrip = () => db.trip.create({ data: { userId: owner, startDate: new Date("2030-11-15"), durationDays: 1, transport: "CAR",
    days: { create: { dayIndex: 1, localDate: new Date("2030-11-15"), visits: { create: { destinationId: visible, startMinute: 480, plannedDurationMinutes: 60, order: 1 } } } },
  }, select: { id: true } });
  beforeAll(async () => {
    const target = new URL(raw!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/tc01_test" || target.username !== "tc01_test" || target.searchParams.get("sslmode") !== "disable" || process.env.TC01_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-disposable TC01 target");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(identity[0]?.name).toBe("tc01_test");
    await db.user.createMany({ data: [owner, outsider, admin].map(id => ({ id, name: "Synthetic Host", email: `${id}@example.invalid`, role: id === admin ? "ADMIN" : "TRAVELER" })) });
    for (const id of [visible, hidden, deleted]) await db.destination.create({ data: {
      id, name: id === visible ? "Public destination" : `PRIVATE_DESTINATION_${id}`, description: "PRIVATE_DESCRIPTION", area: "test", category: "test", latitude: 23, longitude: 105,
      visibility: "VISIBLE", minimumDurationMinutes: 30,
      openingDays: { create: { dayOfWeek: "FRIDAY", status: "OPEN", intervals: { create: { opensAtMinute: 0, closesAtMinute: 1440 } } } },
      media: { create: { id: id === visible ? media : `${id}-media`, url: `https://example.invalid/${id}.jpg`, alt: id === visible ? "Public image" : "PRIVATE_IMAGE", websiteRights: "APPROVED", rightsEvidence: "Synthetic disposable evidence", reviewedBy: admin, reviewedAt: now } },
    } });
  }, 30_000);
  afterAll(async () => { await db?.$disconnect(); }); // Runner removes the entire owned container.

  it("applies real migration with checks, unique index and Cascade/SetNull FKs", async () => {
    const ledger = await db.$queryRaw<{ name: string }[]>`SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(ledger).toHaveLength(15);
    expect(ledger.some(row => row.name === "20261028120000_trip_companion_publication")).toBe(true);
    const constraints = await db.$queryRaw<{ definition: string }[]>`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'trip_companion_publication'::regclass`;
    expect(constraints.some(c => c.definition.includes("ON DELETE CASCADE"))).toBe(true);
    expect(constraints.some(c => c.definition.includes("ON DELETE SET NULL"))).toBe(true);
    const trip = await createTrip();
    await expect(db.tripCompanionPublication.create({ data: { tripId: trip.id, title: "Invalid", introduction: "Invalid", additionalCapacity: 0 } })).rejects.toThrow();
    await expect(db.tripCompanionPublication.create({ data: { tripId: trip.id, title: "   ", introduction: "Invalid", additionalCapacity: 1 } })).rejects.toThrow();
    expect(await db.tripCompanionPublication.count({ where: { tripId: trip.id } })).toBe(0);
  });

  it("canonical Save → preview → publish → fresh Guest read excludes hidden/deleted data and keeps private Trip owner-only", async () => {
    const saved = await saveTrip(headers, { confirm: true, proposal: {
      startDate: "2030-11-15", durationDays: 1, transport: "CAR", days: [{ dayIndex: 1, visits: [visible, hidden, deleted].map((destinationId, index) => ({ destinationId, order: index + 1, startMinute: 480 + index * 120, plannedDurationMinutes: 60 })) }],
    } }, `save-${randomUUID()}`, { ...deps(), getRoute: async () => ({ kind: "ok", durationSeconds: 0 }) }, now);
    expect(saved.status).toBe("SUCCESS"); if (saved.status !== "SUCCESS") throw new Error("Synthetic official Save failed");
    const tripId = saved.data.tripId;
    await db.destination.update({ where: { id: hidden }, data: { visibility: "HIDDEN" } });
    await db.destination.update({ where: { id: deleted }, data: { deletedAt: now } });
    const withImage = { ...draft, imageMediaId: media };
    const context = await getCompanionFormContext(headers, tripId, deps());
    expect(context.trip.routeSummary).toEqual([{ destinationId: visible, name: "Public destination" }]);
    expect(context.imageOptions.map(m => m.mediaId)).toEqual([media]);
    const preview = await previewCompanion(headers, tripId, withImage, deps());
    const published = await publishCompanion(headers, tripId, { ...withImage, confirm: true }, `publish-${randomUUID()}`, deps());
    expect(published.status).toBe("SUCCESS"); if (published.status !== "SUCCESS") throw new Error("Publish failed");
    const reader = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    try {
      const guest = await publicCompanionResponse(new Request(`http://localhost/api/trip-companions/${published.data.publicationId}`), published.data.publicationId, reader);
      expect(guest.status).toBe(200); expect(guest.headers.get("Cache-Control")).toBe("private, no-store");
      const body = await guest.json(); expect(body.data.introduction).toEqual(preview.introduction);
      expect(JSON.stringify(body)).not.toMatch(/PRIVATE_|startMinute|plannedDuration|email|userId|storageReference|websiteRights|days|members|chat/);
      for (const actor of [outsider, admin]) await expect(getMyTrip(headers, tripId, deps(actor), "2030-11-14")).rejects.toMatchObject({ code: "TRIP_NOT_FOUND" });
      expect((await getMyTrip(headers, tripId, deps(), "2030-11-14")).days[0]?.visits).toHaveLength(3);
      await db.contentMedia.update({ where: { id: media }, data: { websiteRights: "REJECTED" } });
      expect((await getPublicCompanion(published.data.publicationId, reader)).introduction.image).toBeNull();
      await db.contentMedia.update({ where: { id: media }, data: { websiteRights: "APPROVED" } });
      await db.destination.update({ where: { id: visible }, data: { visibility: "HIDDEN" } });
      expect((await getPublicCompanion(published.data.publicationId, reader)).introduction).toMatchObject({ routeSummary: [], image: null });
      await db.destination.update({ where: { id: visible }, data: { visibility: "VISIBLE" } });
    } finally { await reader.$disconnect(); }
  }, 30_000);

  it("distinct concurrent keys publish once; identical concurrent retries replay one committed result", async () => {
    for (const sameKey of [false, true]) {
      const trip = await createTrip(), key = randomUUID();
      const results = await Promise.all(Array.from({ length: 6 }, (_, index) => publishCompanion(headers, trip.id, input, sameKey ? key : `${key}-${index}`, deps())));
      expect(await db.tripCompanionPublication.count({ where: { tripId: trip.id } })).toBe(1);
      const successes = results.filter(r => r.status === "SUCCESS");
      expect(successes).toHaveLength(sameKey ? 6 : 1);
      expect(new Set(successes.map(r => r.status === "SUCCESS" && r.data.publicationId)).size).toBe(1);
      if (!sameKey) expect(results.filter(r => r.status === "FAILED")).toHaveLength(5);
      else expect(successes.filter(r => r.status === "SUCCESS" && r.replayed)).toHaveLength(5);
    }
  }, 30_000);

  it("commit acknowledgement loss reconciles original row; failure before replay persistence rolls back publication", async () => {
    const trip = await createTrip(), key = randomUUID(); let loseAck = false;
    const unreliable = {
      user: db.user,
      idempotencyRecord: { findUnique: async (args: any) => { if (loseAck) throw new Error("Synthetic lost DB response"); return db.idempotencyRecord.findUnique(args); } },
      $transaction: async (execute: (tx: Prisma.TransactionClient) => Promise<unknown>) => { await db.$transaction(execute); loseAck = true; throw new Error("Synthetic lost commit acknowledgement"); },
    } as unknown as Database;
    expect(await publishCompanion(headers, trip.id, input, key, { ...deps(), database: unreliable })).toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
    const committed = await db.tripCompanionPublication.findUniqueOrThrow({ where: { tripId: trip.id } });
    expect(await publishCompanion(headers, trip.id, input, key, deps())).toMatchObject({ status: "SUCCESS", replayed: true, data: { publicationId: committed.id } });
    const rollbackTrip = await createTrip(), rollbackKey = randomUUID();
    const failing = { user: db.user, idempotencyRecord: db.idempotencyRecord,
      $transaction: (execute: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(tx => execute(new Proxy(tx, { get(target, prop) {
        if (prop === "idempotencyRecord") return { ...tx.idempotencyRecord, update: async () => { throw new Error("Synthetic replay write failure"); } };
        return Reflect.get(target, prop);
      } }))),
    } as unknown as Database;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { expect(await publishCompanion(headers, rollbackTrip.id, input, rollbackKey, { ...deps(), database: failing })).toMatchObject({ status: "UNKNOWN" }); }
    finally { log.mockRestore(); }
    expect(await db.tripCompanionPublication.count({ where: { tripId: rollbackTrip.id } })).toBe(0);
    expect(await db.idempotencyRecord.count({ where: { key: rollbackKey } })).toBe(0);
  });

  async function waitForBlockedQuery(table: "trip" | "user") {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const blocked = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${`%FROM "${table}"%`}`;
      if (Number(blocked[0]?.count) > 0) return;
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error("Did not observe real PostgreSQL lock contention");
  }
  function latch() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

  it.each(["midnight", "date-change", "completion", "account-lock"] as const)("rechecks eligibility after actual competing %s transaction", async scenario => {
    const trip = await createTrip(), held = latch(), release = latch(); let clock = now;
    const blocker = db.$transaction(async tx => {
      if (scenario === "account-lock") await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${owner} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM trip WHERE id = ${trip.id} FOR UPDATE`;
      held.resolve(); await release.promise;
      if (scenario === "completion") await tx.trip.update({ where: { id: trip.id }, data: { manuallyCompletedAt: now } });
      if (scenario === "date-change") await tx.trip.update({ where: { id: trip.id }, data: { startDate: new Date("2030-11-14") } });
      if (scenario === "account-lock") await tx.user.update({ where: { id: owner }, data: { status: "LOCKED" } });
    }, { timeout: 20_000 });
    await held.promise;
    const publishing = publishCompanion(headers, trip.id, input, randomUUID(), { ...deps(), now: () => clock });
    try {
      await waitForBlockedQuery(scenario === "account-lock" ? "user" : "trip");
      if (scenario === "midnight") clock = new Date("2030-11-14T17:00:00Z");
    } finally { release.resolve(); }
    await blocker;
    expect(await publishing).toMatchObject({ status: "FAILED", error: { code: scenario === "account-lock" ? "ACCOUNT_LOCKED" : "TRIP_NOT_PUBLISHABLE" } });
    expect(await db.tripCompanionPublication.count({ where: { tripId: trip.id } })).toBe(0);
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }, 30_000);

  it("Guest, locked, outsider and foreign Admin fail HTTP writes against actual persisted account/ownership", async () => {
    const trip = await createTrip();
    const request = () => new Request(`http://localhost/api/trips/${trip.id}/publication`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify(input) });
    for (const [actor, expected] of [[null, 401], [outsider, 404], [admin, 404]] as const) {
      expect((await companionPublicationResponse(request(), trip.id, deps(actor))).status).toBe(expected);
    }
    await db.user.update({ where: { id: owner }, data: { status: "LOCKED" } });
    expect((await companionPublicationResponse(request(), trip.id, deps())).status).toBe(403);
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
    expect(await db.tripCompanionPublication.count({ where: { tripId: trip.id } })).toBe(0);
  });

  it("media delete sets null; existing owner delete cascades publication on a Trip with no members", async () => {
    const trip = await createTrip();
    const result = await publishCompanion(headers, trip.id, { ...input, imageMediaId: media }, randomUUID(), deps());
    expect(result.status).toBe("SUCCESS"); if (result.status !== "SUCCESS") throw new Error("Publish failed");
    await db.contentMedia.delete({ where: { id: media } });
    expect((await db.tripCompanionPublication.findUniqueOrThrow({ where: { id: result.data.publicationId } })).imageMediaId).toBeNull();
    expect((await getPublicCompanion(result.data.publicationId, db)).introduction.image).toBeNull();
    expect(await deleteMyTrip(headers, trip.id, randomUUID(), deps())).toMatchObject({ status: "SUCCESS" });
    expect(await db.tripCompanionPublication.findUnique({ where: { id: result.data.publicationId } })).toBeNull();
    await expect(getPublicCompanion(result.data.publicationId, db)).rejects.toMatchObject({ code: "COMPANION_NOT_FOUND" });
    expect(await db.destination.count({ where: { id: visible } })).toBe(1);
  });
});
