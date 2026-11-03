import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companionTestFixture, companionTestUrl, companionTestHeaders as headers, confirmCompanion as input, type CompanionTestFixture } from "./companion-test-fixture";
import { joinCompanion, leaveCompanion } from "./companion-group-service";
import { sendCompanionMessage } from "./companion-chat-service";
import { getCompanionDelta, reconcileCompanionMessage } from "./companion-delta-service";
import { companionChatReadResponse } from "./companion-chat-http";

describe.skipIf(!companionTestUrl)("TC-08 PostgreSQL delta/reconciliation", () => {
  let f: CompanionTestFixture;
  beforeAll(async () => { f = await companionTestFixture("tc08"); });
  beforeEach(async () => { await f.clean(); });
  afterAll(async () => { await f?.close(); });
  it("delta pages advance only delivered messages and reconcile actor/payload/key without a duplicate write", async () => {
    const { id } = await f.create(); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    const key = randomUUID();
    expect(await reconcileCompanionMessage(headers, id, { text: "original" }, key, f.deps())).toMatchObject({ status: "UNKNOWN" });
    expect(await f.db.tripCompanionMessage.count()).toBe(0);
    const sent = await sendCompanionMessage(headers, id, { text: "original" }, key, f.deps());
    expect(await reconcileCompanionMessage(headers, id, { text: "original" }, key, f.deps())).toMatchObject({ ...sent, replayed: true });
    expect(await reconcileCompanionMessage(headers, id, { text: "changed" }, key, f.deps())).toMatchObject({ status: "FAILED", error: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(await reconcileCompanionMessage(headers, id, { text: "original" }, key, f.deps(f.a))).toMatchObject({ status: "UNKNOWN" });
    for (let i = 0; i < 4; i++) await sendCompanionMessage(headers, id, { text: `message ${i}` }, randomUUID(), f.deps());
    const first = await getCompanionDelta(headers, id, { after: "0", limit: "2" }, f.deps(f.a));
    expect(first.items.map(row => row.sequence)).toEqual(["1", "2"]); expect(first.nextCursor).toBe("2"); expect(first.highWaterCursor).toBe("5"); expect(first.hasMore).toBe(true);
    await sendCompanionMessage(headers, id, { text: "arrived during paging" }, randomUUID(), f.deps());
    const second = await getCompanionDelta(headers, id, { after: first.nextCursor }, f.deps(f.a));
    expect(second.items.map(row => row.sequence)).toEqual(["3", "4", "5", "6"]); expect(second.nextCursor).toBe("6");
    const empty = await getCompanionDelta(headers, id, { after: second.nextCursor }, f.deps(f.a));
    expect(empty.items).toEqual([]); expect(empty.nextCursor).toBe("6"); expect(empty.canSend).toBe(true);
  });
  it("old cursor/key cannot retain access after leave, and future/malformed/duplicate queries fail", async () => {
    const { id } = await f.create(); await joinCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    for (const after of ["-1", "1.0", "999999999999999999999", "1"]) await expect(getCompanionDelta(headers, id, { after }, f.deps(f.a))).rejects.toMatchObject({ status: 400 });
    const response = await companionChatReadResponse(new Request("http://localhost/delta?after=0&after=1"), query => getCompanionDelta(headers, id, query, f.deps(f.a)));
    expect(response.status).toBe(400); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await leaveCompanion(headers, id, input, randomUUID(), f.deps(f.a));
    await expect(getCompanionDelta(headers, id, { after: "0" }, f.deps(f.a))).rejects.toMatchObject({ status: 403 });
    await expect(reconcileCompanionMessage(headers, id, { text: "x" }, randomUUID(), f.deps(f.a))).rejects.toMatchObject({ status: 403 });
  });
});
