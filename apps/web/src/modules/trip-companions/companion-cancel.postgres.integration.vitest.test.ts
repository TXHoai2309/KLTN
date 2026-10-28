import type { Database, Prisma } from "@KLTN/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, type CompanionTestFixture } from "./companion-test-fixture";
import { getCompanionGroup, joinCompanion } from "./companion-group-service";
import { getCompanionHistory, sendCompanionMessage } from "./companion-chat-service";
import { getCompanionDelta } from "./companion-delta-service";
import { cancelCompanion } from "./companion-cancel-service";
import { getCompanionManagement, updateCompanionManagement } from "./companion-management-service";
import { getPublicCompanion } from "./companion-service";
import { listMyCompanionPublications, listPublicCompanions } from "./companion-discovery-service";
import { banCompanionMember } from "./companion-members-service";
import { getTripForEdit } from "../trip-edit/trip-edit-service";
import { applyEdit } from "../trip-edit/apply-edit";
import { deleteMyTrip, setMyTripCompletion } from "../trip-read/trip-management-service";

describe.skipIf(!companionTestUrl)("TC-11 PostgreSQL terminal cancellation/completion lifecycle", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc11"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  it("cancels once, keeps current member history and live itinerary; cannot reopen or bypass with old permission", async () => {
    const { id, tripId } = await f.create(2), key = randomUUID();
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await sendCompanionMessage(headers, id, { text: "keep history" }, randomUUID(), f.deps(f.a));
    for (const actor of [f.a, f.admin]) await expect(cancelCompanion(headers, id, input, randomUUID(), f.deps(actor))).rejects.toMatchObject({ status: 403 });
    expect(await cancelCompanion(headers, id, input, key, f.deps())).toMatchObject({ status: "SUCCESS" });
    expect(await cancelCompanion(headers, id, input, key, f.deps())).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(await cancelCompanion(headers, id, input, randomUUID(), f.deps())).toMatchObject({ status: "SUCCESS" });
    const history = await getCompanionHistory(headers, id, {}, f.deps(f.a));
    expect(history.items).toHaveLength(2); expect(history.items[1]).toMatchObject({ kind: "SYSTEM", notice: { type: "COMPANION_CANCELED" } }); expect(history.canSend).toBe(false);
    expect((await getCompanionDelta(headers, id, { after: "0" }, f.deps(f.a))).canSend).toBe(false);
    expect((await getCompanionGroup(headers, id, f.deps(f.a))).canSend).toBe(false);
    expect((await listPublicCompanions({}, f.deps(null))).items).toEqual([]);
    expect((await listMyCompanionPublications(headers, {}, f.deps())).items[0]?.recruitmentStatus).toBe("CANCELED");
    await expect(getPublicCompanion(id, f.db)).rejects.toMatchObject({ status: 404 });
    await expect(joinCompanion(headers, id, input, randomUUID(), f.deps(f.b))).rejects.toMatchObject({ status: 404 });
    for (const actor of [f.owner, f.a]) await expect(sendCompanionMessage(headers, id, { text: "blocked" }, randomUUID(), f.deps(actor))).rejects.toMatchObject({ code: "COMPANION_CANCELED" });
    const manage = await getCompanionManagement(headers, id, f.deps()); expect(manage.canReopen).toBe(false);
    expect(await updateCompanionManagement(headers, id, { ...manage.draft, visibility: "PUBLIC", recruitmentOpen: true, baseRevision: manage.managementRevision, confirm: true }, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", httpStatus: 409 });
    await expect(f.db.tripCompanionPublication.update({ where: { id }, data: { canceledAt: null } })).rejects.toThrow();
    expect(await deleteMyTrip(headers, tripId, randomUUID(), f.deps())).toMatchObject({ status: "FAILED", error: { code: "TRIP_HAS_COMPANION_HISTORY" } });
    const page = await getTripForEdit(headers, tripId, f.deps()), candidate = structuredClone(page.candidate);
    candidate.days[0]!.visits[0]!.startMinute = 540;
    const edited = await applyEdit(headers, tripId, f.owner, { baseRevision: page.baseRevision, candidate, confirmed: true, kind: "MANUAL" }, randomUUID(), { database: f.db, authorization: f.deps(), getRoute: async () => ({ kind: "ok", durationSeconds: 0 }) }, f.clock.value);
    expect(edited.status).toBe("SUCCESS");
    const refreshed = await getCompanionHistory(headers, id, {}, f.deps(f.a));
    expect(refreshed.items).toHaveLength(3); expect(refreshed.items[2]).toMatchObject({ kind: "SYSTEM", notice: { type: "ITINERARY_CHANGED" } }); expect(refreshed.canSend).toBe(false);
    expect((await getCompanionGroup(headers, id, f.deps(f.a))).itinerary.days[0]?.visits[0]?.startMinute).toBe(540);
    await banCompanionMember(headers, id, f.a, input, randomUUID(), f.deps());
    await expect(getCompanionHistory(headers, id, {}, f.deps(f.a))).rejects.toMatchObject({ status: 403 });
  });
  it("normal manual/calendar completion continues chat without TTL", async () => {
    const { id, tripId } = await f.create(); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    expect(await setMyTripCompletion(headers, tripId, true, randomUUID(), f.deps(), f.clock.value)).toMatchObject({ status: "SUCCESS" });
    expect(await sendCompanionMessage(headers, id, { text: "after manual completion" }, randomUUID(), f.deps(f.a))).toMatchObject({ status: "SUCCESS" });
    f.clock.value = new Date("2032-11-15T00:00:00Z");
    expect(await sendCompanionMessage(headers, id, { text: "years later" }, randomUUID(), f.deps())).toMatchObject({ status: "SUCCESS" });
    expect((await getCompanionHistory(headers, id, {}, f.deps(f.a))).canSend).toBe(true);
  });
  it("cancel racing join/send has a single cut: no user message may follow the cancellation notice", async () => {
    const { id } = await f.create(2); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    const results = await Promise.allSettled([
      sendCompanionMessage(headers, id, { text: "racing send" }, randomUUID(), f.deps(f.a)),
      joinCompanion(headers, id, input, randomUUID(), f.deps(f.b)),
      cancelCompanion(headers, id, input, randomUUID(), f.deps()),
    ]);
    expect(results[2]).toMatchObject({ status: "fulfilled", value: { status: "SUCCESS" } });
    const history = await getCompanionHistory(headers, id, {}, f.deps(f.a));
    const cancel = history.items.find(row => row.kind === "SYSTEM" && row.notice.type === "COMPANION_CANCELED")!;
    expect(history.items.filter(row => row.kind === "USER").every(row => BigInt(row.sequence) < BigInt(cancel.sequence))).toBe(true);
    expect(history.items.filter(row => row.kind === "SYSTEM")).toHaveLength(1);
    await expect(sendCompanionMessage(headers, id, { text: "late" }, randomUUID(), f.deps(f.a))).rejects.toMatchObject({ code: "COMPANION_CANCELED" });
  });
  it("notice/result failure rolls back terminal state/counter, then same-key retry cancels exactly once", async () => {
    const { id } = await f.create(), key = randomUUID(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapped = new Proxy(f.db, { get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => run(new Proxy(tx, { get(inner, key, recv) {
        if (key !== "tripCompanionMessage") return Reflect.get(inner, key, recv);
        return { ...inner.tripCompanionMessage, create: async () => { throw new Error("synthetic cancellation notice failure"); } };
      } })));
    } }) as Database;
    try { expect(await cancelCompanion(headers, id, input, key, { ...f.deps(), database: wrapped })).toMatchObject({ status: "UNKNOWN" }); }
    finally { log.mockRestore(); }
    const row = await f.db.tripCompanionPublication.findUniqueOrThrow({ where: { id } });
    expect(row.canceledAt).toBeNull(); expect(row.messageSequence.toString()).toBe("0"); expect(row.recruitmentOpen).toBe(true);
    expect(await cancelCompanion(headers, id, input, key, f.deps())).toMatchObject({ status: "SUCCESS" });
    expect((await getCompanionHistory(headers, id, {}, f.deps())).items).toHaveLength(1);
  });
});
