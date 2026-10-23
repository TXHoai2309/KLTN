import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { createQaConversationStore } from "./qa-conversation-store";

const now = new Date("2026-10-22T00:00:00Z");
const principal = { kind: "GUEST" as const, id: "performance_guest" };

function setup(due = false) {
  const query = vi.fn(async (sql: { sql: string }) => {
    if (sql.sql.includes('AS "cleanupDue"')) return [{ cleanupDue: due }];
    if (sql.sql.includes("FROM qa_guest_identity") && sql.sql.includes("FOR SHARE")) return [{ id: principal.id }];
    return [];
  });
  const execute = vi.fn(async () => 0);
  const tx = { $queryRaw: query, $executeRaw: execute };
  const transaction = vi.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx));
  const db = { ...tx, $transaction: transaction } as unknown as Database;
  const clock = vi.fn(() => now);
  return { query, execute, transaction, clock, store: createQaConversationStore(db, { now: clock }) };
}

describe("history read round trips", () => {
  it("does not issue maintenance writes for an empty, unexpired principal", async () => {
    const t = setup();
    expect(await t.store.list!(principal)).toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(t.execute).not.toHaveBeenCalled();
    expect(t.query.mock.calls.filter(([sql]) => sql.sql.includes('AS "cleanupDue"'))).toHaveLength(1);
    // Maintenance and authorization remain independently committed transactions.
    expect(t.transaction).toHaveBeenCalledTimes(2);
  });

  it("runs due cleanup once before the list, rather than repeating it in the read transaction", async () => {
    const t = setup(true);
    await t.store.list!(principal);
    expect(t.execute).toHaveBeenCalledTimes(2);
    expect(t.query.mock.calls.filter(([sql]) => sql.sql.includes("SELECT id FROM qa_conversation"))).toHaveLength(1);
  });

  it("commits due cleanup even when the requested history is absent", async () => {
    const t = setup(true);
    await expect(t.store.get!(principal, "missing_conversation")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(t.execute).toHaveBeenCalledTimes(2);
    expect(t.transaction).toHaveBeenCalledTimes(2);
  });

  it("samples the clock only after each principal lock, without unused BEGIN-time reads", async () => {
    const t = setup();
    await t.store.list!(principal);
    expect(t.clock).toHaveBeenCalledTimes(2);
    const lockCalls = t.query.mock.calls.flatMap(([sql], index) => sql.sql.includes("pg_advisory_xact_lock") ? [index] : []);
    expect(lockCalls).toHaveLength(2);
    for (const [index, queryIndex] of lockCalls.entries()) {
      expect(t.query.mock.invocationCallOrder[queryIndex]).toBeLessThan(t.clock.mock.invocationCallOrder[index]!);
    }
  });
});
