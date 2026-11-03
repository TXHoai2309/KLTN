import type { Database, Prisma } from "@KLTN/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, observeCompanionLock, type CompanionTestFixture } from "./companion-test-fixture";
import { joinCompanion, getCompanionGroup } from "./companion-group-service";
import { getCompanionHistory, sendCompanionMessage } from "./companion-chat-service";
import { getTripForEdit, previewEdit } from "../trip-edit/trip-edit-service";
import { applyEdit } from "../trip-edit/apply-edit";
import { getCompanionUnread } from "./companion-unread-service";

describe.skipIf(!companionTestUrl)("TC-10 PostgreSQL confirmed itinerary/system notice atomicity", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc10"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  const dependencies = (database: Database = f.db) => ({ database, getRoute: async () => ({ kind: "ok" as const, durationSeconds: 0 }), authorization: { ...f.deps(), database } });
  const editRequest = async (tripId: string, minute: number) => {
    const page = await getTripForEdit(headers, tripId, f.deps());
    const candidate = structuredClone(page.candidate); candidate.days[0]!.visits[0]!.startMinute = minute;
    return { baseRevision: page.baseRevision, candidate, confirmed: true as const, kind: "MANUAL" as const };
  };
  it("preview/FAILED/no-op emit nothing; confirmed Save emits one ordered notice and replay emits none", async () => {
    const { id, tripId } = await f.create(); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await sendCompanionMessage(headers, id, { text: "before edit" }, randomUUID(), f.deps());
    const request = await editRequest(tripId, 540), key = randomUUID();
    const preview = await previewEdit(tripId, f.owner, request.baseRevision, request.candidate, dependencies(), f.clock.value);
    expect(preview.validation.canConfirm).toBe(true);
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items).toHaveLength(1);
    await expect(applyEdit(headers, tripId, f.owner, { ...request, confirmed: false } as any, randomUUID(), dependencies(), f.clock.value)).rejects.toMatchObject({ status: 400 });
    const invalid = structuredClone(request); invalid.candidate.days[0]!.visits[0]!.plannedDurationMinutes = 1;
    await expect(applyEdit(headers, tripId, f.owner, invalid, randomUUID(), dependencies(), f.clock.value)).rejects.toMatchObject({ status: 422 });
    const saved = await applyEdit(headers, tripId, f.owner, request, key, dependencies(), f.clock.value);
    expect(saved.status).toBe("SUCCESS");
    expect(await applyEdit(headers, tripId, f.owner, request, key, dependencies(), f.clock.value)).toMatchObject({ status: "SUCCESS", replayed: true });
    const history = await getCompanionHistory(headers, id, {}, f.deps(f.a));
    expect(history.items.map(row => row.sequence)).toEqual(["1", "2"]);
    expect(history.items[1]).toMatchObject({ kind: "SYSTEM", author: null, notice: { type: "ITINERARY_CHANGED", revision: "1", changes: { dates: false, destinations: false, times: true } } });
    const member = await getCompanionGroup(headers, id, f.deps(f.a));
    expect(member.itineraryRevision).toBe("1"); expect(member.itinerary.days[0]?.visits[0]?.startMinute).toBe(540);
    expect((await getCompanionUnread(headers, {}, f.deps(f.a))).items[0]?.unreadCount).toBe(2);
    const unchanged = await editRequest(tripId, 540);
    expect(await applyEdit(headers, tripId, f.owner, unchanged, randomUUID(), dependencies(), f.clock.value)).toMatchObject({ status: "SUCCESS" });
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items).toHaveLength(2);
  });
  it("failure storing notice rolls back itinerary/revision/message counter/result together", async () => {
    const { id, tripId } = await f.create(), request = await editRequest(tripId, 540), key = randomUUID(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => run(new Proxy(tx, { get(inner, key, recv) {
        if (key !== "tripCompanionMessage") return Reflect.get(inner, key, recv);
        return { ...inner.tripCompanionMessage, create: async () => { throw new Error("synthetic notice failure"); } };
      } })));
    } }) as Database;
    try { expect(await applyEdit(headers, tripId, f.owner, request, key, dependencies(wrapped), f.clock.value)).toMatchObject({ status: "UNKNOWN" }); }
    finally { log.mockRestore(); }
    const page = await getTripForEdit(headers, tripId, f.deps());
    expect(page.baseRevision).toBe(request.baseRevision); expect(page.candidate.days[0]?.visits[0]?.startMinute).toBe(480);
    const publication = await f.db.tripCompanionPublication.findUniqueOrThrow({ where: { id } });
    expect(publication.messageSequence.toString()).toBe("0"); expect(publication.itineraryRevision.toString()).toBe("0");
    expect(await applyEdit(headers, tripId, f.owner, request, key, dependencies(), f.clock.value)).toMatchObject({ status: "SUCCESS" });
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items).toHaveLength(1);
  });
  it("IN_TRIP confirmed writes use the same notice seam while preserving completed-visit checks", async () => {
    const { id, tripId } = await f.create();
    f.clock.value = new Date("2030-11-15T00:30:00Z");
    const request = await editRequest(tripId, 540);
    const result = await applyEdit(headers, tripId, f.owner, { ...request, kind: "IN_TRIP", location: { source: "MANUAL", latitude: 23, longitude: 105, accuracyMeters: null, capturedAt: f.clock.value.toISOString() }, mandatoryEndpoint: null }, randomUUID(), dependencies(), f.clock.value);
    expect(result.status).toBe("SUCCESS");
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items[0]).toMatchObject({ kind: "SYSTEM", notice: { type: "ITINERARY_CHANGED" } });
  });
  it("a held SYSTEM notice commit also blocks later USER allocation and cannot be lost behind a cursor", async () => {
    const { id, tripId } = await f.create(), request = await editRequest(tripId, 540);
    let announce!: () => void, release!: () => void;
    const announced = new Promise<void>(resolve => { announce = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => run(new Proxy(tx, { get(inner, key, recv) {
        if (key !== "tripCompanionMessage") return Reflect.get(inner, key, recv);
        return { ...inner.tripCompanionMessage, create: async (args: any) => { const message = await inner.tripCompanionMessage.create(args); announce(); await gate; return message; } };
      } })), { timeout: 10000 });
    } }) as Database;
    const save = applyEdit(headers, tripId, f.owner, request, randomUUID(), dependencies(wrapped), f.clock.value);
    await announced;
    const send = sendCompanionMessage(headers, id, { text: "after system change" }, randomUUID(), f.deps());
    try {
      expect(await observeCompanionLock(f.db)).toBe(true);
      expect((await getCompanionHistory(headers, id, {}, f.deps())).highWaterCursor).toBe("0");
    } finally { release(); }
    expect((await save).status).toBe("SUCCESS"); expect((await send).status).toBe("SUCCESS");
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items.map(row => [row.sequence, row.kind])).toEqual([["1", "SYSTEM"], ["2", "USER"]]);
  }, 15000);
});
