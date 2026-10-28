import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { getCompanionDelta } from "./companion-delta-service";
import { getCompanionUnread } from "./companion-unread-service";
import type { CompanionDependencies } from "./companion-service";

function idleGroup(state = "ACTIVE") {
  const messages = vi.fn().mockResolvedValue([]);
  const membership = vi.fn().mockImplementation(async () => ({ state }));
  const row = { id: "synthetic-publication", tripId: "synthetic-trip", trip: { userId: "synthetic-host" }, messageSequence: BigInt(3), canceledAt: null };
  const tx = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "synthetic-member", role: "TRAVELER", status: "ACTIVE" }) },
    tripCompanionPublication: { findUnique: vi.fn().mockResolvedValue(row) },
    tripCompanionMembership: { findUnique: membership },
    tripCompanionMessage: { findMany: messages },
  };
  const database = { ...tx, $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } as unknown as Database;
  const deps: CompanionDependencies = { database, resolveSession: async () => ({ user: { id: "synthetic-member" } }) };
  return { deps, row, messages, membership, tx };
}

describe("companion polling work", () => {
  it("returns an idle delta without fetching an already consumed message range", async () => {
    const t = idleGroup();
    const result = await getCompanionDelta(new Headers(), t.row.id, { after: "3" }, t.deps);
    expect(result).toMatchObject({ items: [], nextCursor: "3", highWaterCursor: "3", hasMore: false, relationship: "MEMBER" });
    expect(t.membership).toHaveBeenCalledOnce();
    expect(t.messages).not.toHaveBeenCalled();
  });

  it("still checks current membership and account on every idle poll", async () => {
    const t = idleGroup();
    await getCompanionDelta(new Headers(), t.row.id, { after: "3" }, t.deps);
    t.membership.mockResolvedValueOnce({ state: "BANNED" });
    await expect(getCompanionDelta(new Headers(), t.row.id, { after: "3" }, t.deps)).rejects.toMatchObject({ status: 403 });
    t.tx.user.findUnique.mockResolvedValueOnce({ id: "synthetic-member", role: "TRAVELER", status: "LOCKED" });
    await expect(getCompanionDelta(new Headers(), t.row.id, { after: "3" }, t.deps)).rejects.toMatchObject({ status: 403 });
  });

  it("preserves future-cursor rejection and reads new committed messages", async () => {
    const t = idleGroup();
    await expect(getCompanionDelta(new Headers(), t.row.id, { after: "4" }, t.deps)).rejects.toMatchObject({ status: 400 });
    await getCompanionDelta(new Headers(), t.row.id, { after: "2" }, t.deps);
    expect(t.messages).toHaveBeenCalledOnce();
    expect(t.messages.mock.calls[0]?.[0]).toMatchObject({ where: { sequence: { gt: BigInt(2), lte: BigInt(3) } } });
  });

  it("skips unread aggregation only when every group has consumed its committed cut", async () => {
    const t = idleGroup();
    const rows = [{ ...t.row, readMarkers: [{ lastReadSequence: BigInt(3) }] }];
    const aggregate = vi.fn().mockResolvedValue([{ publicationId: t.row.id, unread: BigInt(2) }]);
    Object.assign(t.tx.tripCompanionPublication, { findMany: vi.fn().mockResolvedValue(rows) });
    Object.assign(t.tx, { $queryRaw: aggregate });
    const read = () => getCompanionUnread(new Headers(), {}, t.deps);
    expect((await read()).items[0]).toMatchObject({ unreadCount: 0, lastReadCursor: "3", highWaterCursor: "3" });
    expect(aggregate).not.toHaveBeenCalled();
    rows[0]!.readMarkers[0]!.lastReadSequence = BigInt(1);
    expect((await read()).items[0]?.unreadCount).toBe(2);
    expect(aggregate).toHaveBeenCalledOnce();
    rows[0]!.readMarkers = [];
    expect((await read()).items[0]?.lastReadCursor).toBe("0");
    expect(aggregate).toHaveBeenCalledTimes(2);
  });
});
