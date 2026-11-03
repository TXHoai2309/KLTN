import type { Database, Prisma } from "@KLTN/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, companionTestRequest, observeCompanionLock, type CompanionTestFixture } from "./companion-test-fixture";
import { getCompanionGroup, joinCompanion } from "./companion-group-service";
import { companionJoinResponse, companionGroupResponse } from "./companion-group-http";
import { listJoinedCompanions, listPublicCompanions } from "./companion-discovery-service";
import { getPublicCompanion } from "./companion-service";
import { deleteMyTrip } from "../trip-read/trip-management-service";
import { getMyTrip } from "../trip-read/trip-read-service";

describe.skipIf(!companionTestUrl)("TC-03 PostgreSQL membership and historical deletion", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc03"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });

  it("serializes contenders for the last place, idempotent retries and host without a place", async () => {
    const { id } = await f.create();
    const results = await Promise.all([f.a, f.b].map(actor => joinCompanion(headers, id, input, randomUUID(), f.deps(actor))));
    expect(results.filter(r => r.status === "SUCCESS")).toHaveLength(1);
    expect(results.find(r => r.status === "FAILED")).toMatchObject({ error: { code: "COMPANION_FULL" } });
    const winner = (await f.db.tripCompanionMembership.findFirstOrThrow({ where: { publicationId: id } })).userId;
    const key = randomUUID();
    const retry = await Promise.all(Array.from({ length: 4 }, () => joinCompanion(headers, id, input, key, f.deps(winner))));
    expect(retry.every(r => r.status === "SUCCESS")).toBe(true);
    expect(await f.db.tripCompanionMembership.count({ where: { publicationId: id } })).toBe(1);
    expect(await joinCompanion(headers, id, input, randomUUID(), f.deps())).toMatchObject({ status: "SUCCESS" });
    expect((await getPublicCompanion(id, f.db)).introduction.availablePlaces).toBe(0);
    expect((await listPublicCompanions({ availableOnly: "true" }, f.deps(null))).items).toEqual([]);
    expect((await listJoinedCompanions(headers, {}, f.deps(winner))).items[0]?.publicationId).toBe(id);
    expect((await listJoinedCompanions(headers, {}, f.deps())).items[0]?.publicationId).toBe(id);
  });

  it("keeps private Trip endpoints owner-only, member itinerary safe/current, and rejects other actors", async () => {
    const { id, tripId } = await f.create();
    const response = await companionJoinResponse(companionTestRequest(id, "join"), id, f.deps(f.a));
    expect(await response.json()).toMatchObject({ operationStatus: "SUCCESS", data: { publicationId: id } });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const member = await getCompanionGroup(headers, id, f.deps(f.a));
    expect(member.relationship).toBe("MEMBER"); expect(member.memberCount).toBe(2);
    expect(member.itinerary.days[0]?.visits[0]?.startMinute).toBe(480);
    await expect(getMyTrip(headers, tripId, f.deps(f.a), "2030-11-14")).rejects.toMatchObject({ status: 404 });
    for (const actor of [f.b, f.admin]) await expect(getCompanionGroup(headers, id, f.deps(actor))).rejects.toMatchObject({ status: 403 });
    await expect(getCompanionGroup(headers, id, f.deps(null))).rejects.toMatchObject({ status: 401 });
    await f.db.destination.update({ where: { id: f.destination }, data: { visibility: "HIDDEN", name: "PRIVATE_HIDDEN_NAME" } });
    const hidden = await getCompanionGroup(headers, id, f.deps(f.a));
    expect(JSON.stringify(hidden)).not.toContain("PRIVATE_");
    expect(hidden.itinerary.days[0]?.visits[0]?.destination).toMatchObject({ destinationId: null, availability: "UNAVAILABLE", latitude: null });
    await f.db.user.update({ where: { id: f.a }, data: { status: "LOCKED" } });
    expect((await companionGroupResponse(new Request("http://localhost/group"), id, f.deps(f.a))).status).toBe(403);
  });

  it("guards service and raw deletion forever even if membership rows are removed; join/delete races do not orphan a group", async () => {
    const { id, tripId } = await f.create();
    expect(await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a))).toMatchObject({ status: "SUCCESS" });
    await f.db.tripCompanionMembership.deleteMany({ where: { publicationId: id } });
    expect(await deleteMyTrip(headers, tripId, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", httpStatus: 409, error: { code: "TRIP_HAS_COMPANION_HISTORY" } });
    await expect(f.db.trip.delete({ where: { id: tripId } })).rejects.toThrow();
    const other = await f.create();
    await Promise.allSettled([joinCompanion(headers, other.id, input, randomUUID(), f.deps(f.b)), deleteMyTrip(headers, other.tripId, randomUUID(), f.deps())]);
    const trip = await f.db.trip.findUnique({ where: { id: other.tripId } });
    const count = await f.db.tripCompanionMembership.count({ where: { publicationId: other.id } });
    expect(trip ? count : 0).toBe(count);
    if (trip) expect((await f.db.tripCompanionPublication.findUniqueOrThrow({ where: { id: other.id } })).everHadMembers).toBe(true);
  });

  it("rechecks Vietnam date and account eligibility and rejects identity spoofing", async () => {
    const { id } = await f.create();
    expect((await companionJoinResponse(companionTestRequest(id, "join", { ...input, userId: f.b }), id, f.deps(f.a))).status).toBe(400);
    expect((await companionJoinResponse(companionTestRequest(id, "join"), id, f.deps(null))).status).toBe(401);
    f.clock.value = new Date("2030-11-14T17:00:00Z");
    expect(await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a))).toMatchObject({ status: "FAILED", error: { code: "COMPANION_RECRUITMENT_CLOSED" } });
    expect(await f.db.tripCompanionMembership.count()).toBe(0);
  });

  it("rolls membership/history/idempotency back together on replay-result storage failure", async () => {
    const { id } = await f.create(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => run(new Proxy(tx, { get(inner, key, recv) {
        if (key !== "idempotencyRecord") return Reflect.get(inner, key, recv);
        return { ...inner.idempotencyRecord, update: async () => { throw new Error("synthetic replay failure"); } };
      } })));
    } }) as Database;
    try { expect(await joinCompanion(headers, id, input, randomUUID(), { ...f.deps(f.a), database: wrapped })).toMatchObject({ status: "UNKNOWN" }); }
    finally { log.mockRestore(); }
    expect(await f.db.tripCompanionMembership.count({ where: { publicationId: id } })).toBe(0);
    expect((await f.db.tripCompanionPublication.findUniqueOrThrow({ where: { id } })).everHadMembers).toBe(false);
  });

  it("lost acknowledgement reconciles exactly one committed membership using the same key", async () => {
    const { id } = await f.create(), key = randomUUID(); let lost = false;
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop === "$transaction") return async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => { await target.$transaction(run); lost = true; throw new Error("synthetic lost ack"); };
      if (prop === "idempotencyRecord") return { ...target.idempotencyRecord, findUnique: async (args: any) => { if (lost) throw new Error("synthetic reconciliation outage"); return target.idempotencyRecord.findUnique(args); } };
      return Reflect.get(target, prop, receiver);
    } }) as Database;
    expect(await joinCompanion(headers, id, input, key, { ...f.deps(f.a), database: wrapped })).toMatchObject({ status: "UNKNOWN" });
    expect(await joinCompanion(headers, id, input, key, f.deps(f.a))).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(await f.db.tripCompanionMembership.count({ where: { publicationId: id } })).toBe(1);
  });
  it("rejects a changed trusted identity during transactional reauthorization", async () => {
    const { id } = await f.create(); let calls = 0;
    const deps = { ...f.deps(f.a), resolveSession: async () => ({ user: { id: ++calls === 1 ? f.a : f.b } }) };
    expect(await joinCompanion(headers, id, input, randomUUID(), deps)).toMatchObject({ status: "FAILED", httpStatus: 401 });
    expect(await f.db.tripCompanionMembership.count({ where: { publicationId: id } })).toBe(0);
  });
  it.each(["date", "midnight", "completion", "account-lock"])("rechecks %s after an observed real lock wait", async scenario => {
    const { id, tripId } = await f.create();
    let announce!: () => void, release!: () => void;
    const announced = new Promise<void>(resolve => { announce = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const blocker = f.db.$transaction(async tx => {
      if (scenario === "account-lock") {
        await tx.$queryRaw`SELECT id FROM "user" WHERE id=${f.a} FOR UPDATE`;
        await tx.user.update({ where: { id: f.a }, data: { status: "LOCKED" } });
      } else {
        await tx.$queryRaw`SELECT id FROM trip WHERE id=${tripId} FOR UPDATE`;
        if (scenario === "date") await tx.trip.update({ where: { id: tripId }, data: { startDate: new Date("2030-11-14") } });
        if (scenario === "completion") await tx.trip.update({ where: { id: tripId }, data: { manuallyCompletedAt: f.clock.value } });
      }
      announce(); await gate;
    }, { timeout: 10000 });
    await announced;
    const join = joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    try {
      expect(await observeCompanionLock(f.db)).toBe(true);
      if (scenario === "midnight") f.clock.value = new Date("2030-11-14T17:00:00Z");
    } finally { release(); }
    await blocker;
    expect(await join).toMatchObject({ status: "FAILED", httpStatus: scenario === "account-lock" ? 403 : 409 });
    expect(await f.db.tripCompanionMembership.count({ where: { publicationId: id } })).toBe(0);
  }, 15000);
});
