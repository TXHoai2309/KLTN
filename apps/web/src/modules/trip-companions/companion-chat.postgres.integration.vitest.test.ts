import type { Database, Prisma } from "@KLTN/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, type CompanionTestFixture } from "./companion-test-fixture";
import { joinCompanion, leaveCompanion } from "./companion-group-service";
import { getCompanionHistory, sendCompanionMessage } from "./companion-chat-service";
import { deleteMyTrip } from "../trip-read/trip-management-service";

describe.skipIf(!companionTestUrl)("TC-07 PostgreSQL chat commit ordering and replay", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc07"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  it("trusted authors send concurrently, retry once, and a later member can page the whole history", async () => {
    const { id } = await f.create(2); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => sendCompanionMessage(headers, id, { text: `Tin ${i} https://example.invalid` }, randomUUID(), f.deps(i % 2 ? f.a : f.owner))));
    expect(results.every(r => r.status === "SUCCESS")).toBe(true);
    const key = randomUUID(); await Promise.all(Array.from({ length: 3 }, () => sendCompanionMessage(headers, id, { text: "<script>plain text</script>" }, key, f.deps(f.a))));
    expect(await f.db.tripCompanionMessage.count({ where: { publicationId: id } })).toBe(7);
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.b));
    let before: string | undefined; const found = [];
    do {
      const page = await getCompanionHistory(headers, id, { limit: "2", ...(before ? { before } : {}) }, f.deps(f.b));
      expect(page.highWaterCursor).toBe("7"); found.unshift(...page.items);
      before = page.olderCursor ?? undefined;
    } while (before);
    expect(found.map(message => message.sequence)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(found.at(-1)?.text).toBe("<script>plain text</script>");
    expect(new Set(found.map(message => message.author?.userId))).toEqual(new Set([f.owner, f.a]));
    await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await expect(getCompanionHistory(headers, id, {}, f.deps(f.a))).rejects.toMatchObject({ status: 403 });
    await expect(sendCompanionMessage(headers, id, { text: "blocked" }, randomUUID(), f.deps(f.admin))).rejects.toMatchObject({ status: 403 });
    await expect(sendCompanionMessage(headers, id, { text: "spoof", authorId: f.owner }, randomUUID(), f.deps(f.b))).rejects.toMatchObject({ status: 400 });
  });

  it("uncommitted allocation cannot advance the public read cut and later send must wait for commit", async () => {
    const { id } = await f.create();
    let inserted!: () => void, release!: () => void;
    const insertedGate = new Promise<void>(resolve => { inserted = resolve; });
    const commitGate = new Promise<void>(resolve => { release = resolve; });
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => run(new Proxy(tx, { get(inner, key, recv) {
        if (key !== "tripCompanionMessage") return Reflect.get(inner, key, recv);
        return { ...inner.tripCompanionMessage, create: async (args: any) => { const result = await inner.tripCompanionMessage.create(args); inserted(); await commitGate; return result; } };
      } })), { timeout: 10000 });
    } }) as Database;
    const first = sendCompanionMessage(headers, id, { text: "first held before commit" }, randomUUID(), { ...f.deps(), database: wrapped });
    await insertedGate;
    const second = sendCompanionMessage(headers, id, { text: "second" }, randomUUID(), f.deps());
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 80 && !waiting; attempt++) {
        const rows = await f.db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%') AS waiting`;
        waiting = rows[0]!.waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      const page = await getCompanionHistory(headers, id, {}, f.deps());
      expect(page.items).toEqual([]); expect(page.highWaterCursor).toBe("0");
    } finally { release(); }
    expect((await first).status).toBe("SUCCESS"); expect((await second).status).toBe("SUCCESS");
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items.map(row => row.sequence)).toEqual(["1", "2"]);
  }, 15000);

  it("rolls back sequence/message/result together; host-only chat also prevents Trip deletion", async () => {
    const { id, tripId } = await f.create(), key = randomUUID(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => run(new Proxy(tx, { get(inner, key, recv) {
        if (key !== "idempotencyRecord") return Reflect.get(inner, key, recv);
        return { ...inner.idempotencyRecord, update: async () => { throw new Error("synthetic result failure"); } };
      } })));
    } }) as Database;
    try { expect(await sendCompanionMessage(headers, id, { text: "rollback" }, key, { ...f.deps(), database: wrapped })).toMatchObject({ status: "UNKNOWN" }); }
    finally { log.mockRestore(); }
    expect((await getCompanionHistory(headers, id, {}, f.deps())).highWaterCursor).toBe("0");
    expect(await sendCompanionMessage(headers, id, { text: "rollback" }, key, f.deps())).toMatchObject({ status: "SUCCESS", data: { sequence: "1" } });
    expect(await deleteMyTrip(headers, tripId, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", error: { code: "TRIP_HAS_COMPANION_HISTORY" } });
  });

  it("lost send acknowledgement reconciles the same committed message without duplicate text", async () => {
    const { id } = await f.create(), key = randomUUID(); let lost = false;
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop === "$transaction") return async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => { await target.$transaction(run); lost = true; throw new Error("lost ack"); };
      if (prop === "idempotencyRecord") return { ...target.idempotencyRecord, findUnique: async (args: any) => { if (lost) throw new Error("reconciliation unavailable"); return target.idempotencyRecord.findUnique(args); } };
      return Reflect.get(target, prop, receiver);
    } }) as Database;
    expect(await sendCompanionMessage(headers, id, { text: "one message" }, key, { ...f.deps(), database: wrapped })).toMatchObject({ status: "UNKNOWN" });
    expect(await sendCompanionMessage(headers, id, { text: "one message" }, key, f.deps())).toMatchObject({ status: "SUCCESS", replayed: true, data: { sequence: "1" } });
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items).toHaveLength(1);
  });
});
