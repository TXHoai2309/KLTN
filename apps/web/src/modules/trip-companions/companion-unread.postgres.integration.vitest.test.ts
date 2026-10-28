import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, type CompanionTestFixture } from "./companion-test-fixture";
import { joinCompanion, leaveCompanion } from "./companion-group-service";
import { sendCompanionMessage } from "./companion-chat-service";
import { getCompanionUnread, markCompanionRead } from "./companion-unread-service";

describe.skipIf(!companionTestUrl)("TC-09 PostgreSQL read markers/unread isolation", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc09"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  it("tracks real unseen messages per actor including host; summary fetch never marks background data read", async () => {
    const { id } = await f.create(2); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await sendCompanionMessage(headers, id, { text: "one" }, randomUUID(), f.deps());
    await sendCompanionMessage(headers, id, { text: "own" }, randomUUID(), f.deps(f.a));
    await sendCompanionMessage(headers, id, { text: "three" }, randomUUID(), f.deps());
    await joinCompanion(headers, id, input, randomUUID(), f.deps(f.b));
    for (const [actor, count] of [[f.owner, 1], [f.a, 2], [f.b, 3]] as const) {
      const summary = await getCompanionUnread(headers, {}, f.deps(actor));
      expect(summary.items[0]).toMatchObject({ publicationId: id, unreadCount: count, lastReadCursor: "0", highWaterCursor: "3" });
    }
    expect(await f.db.tripCompanionReadMarker.count()).toBe(0);
    expect(await markCompanionRead(headers, id, { sequence: "2" }, randomUUID(), f.deps(f.a))).toMatchObject({ status: "SUCCESS", data: { sequence: "2" } });
    expect((await getCompanionUnread(headers, {}, f.deps(f.a))).items[0]?.unreadCount).toBe(1);
    expect((await getCompanionUnread(headers, {}, f.deps(f.b))).items[0]?.unreadCount).toBe(3);
  });
  it("is monotonic under concurrent marks, rejects future/foreign cursors and hides summaries after revoke", async () => {
    const { id } = await f.create(); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    for (let i = 0; i < 3; i++) await sendCompanionMessage(headers, id, { text: `m${i}` }, randomUUID(), f.deps());
    await Promise.all(["3", "1", "2"].map(sequence => markCompanionRead(headers, id, { sequence }, randomUUID(), f.deps(f.a))));
    expect((await getCompanionUnread(headers, {}, f.deps(f.a))).items[0]).toMatchObject({ lastReadCursor: "3", unreadCount: 0 });
    expect(await markCompanionRead(headers, id, { sequence: "4" }, randomUUID(), f.deps(f.a))).toMatchObject({ status: "FAILED", httpStatus: 400 });
    await expect(markCompanionRead(headers, id, { sequence: "3", userId: f.b }, randomUUID(), f.deps(f.a))).rejects.toMatchObject({ status: 400 });
    await expect(markCompanionRead(headers, id, { sequence: "1" }, randomUUID(), f.deps(f.admin))).rejects.toMatchObject({ status: 403 });
    await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    expect((await getCompanionUnread(headers, {}, f.deps(f.a))).items).toEqual([]);
    await expect(markCompanionRead(headers, id, { sequence: "1" }, randomUUID(), f.deps(f.a))).rejects.toMatchObject({ status: 403 });
    await expect(getCompanionUnread(headers, {}, f.deps(null))).rejects.toMatchObject({ status: 401 });
  });
  it("keeps per-group markers independent across paginated summaries", async () => {
    const groups = [await f.create(), await f.create()];
    for (const group of groups) { await joinCompanion(headers, group.id, input, randomUUID(), f.deps(f.a)); await sendCompanionMessage(headers, group.id, { text: "one per group" }, randomUUID(), f.deps()); }
    await markCompanionRead(headers, groups[0]!.id, { sequence: "1" }, randomUUID(), f.deps(f.a));
    const first = await getCompanionUnread(headers, { limit: "1" }, f.deps(f.a));
    const second = await getCompanionUnread(headers, { limit: "1", after: first.nextCursor }, f.deps(f.a));
    const rows = [...first.items, ...second.items];
    expect(new Set(rows.map(row => row.publicationId)).size).toBe(2);
    expect(rows.find(row => row.publicationId === groups[0]!.id)?.unreadCount).toBe(0);
    expect(rows.find(row => row.publicationId === groups[1]!.id)?.unreadCount).toBe(1);
    expect(second.nextCursor).toBeNull();
  });
});
