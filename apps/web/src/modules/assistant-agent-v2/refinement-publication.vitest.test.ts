import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningRepository } from "../assistant-planning/planning-repository";
import { planningNeedsSchema } from "../assistant-planning/planning-contract";
import { fixtureNeeds } from "../../test/planning-fixtures";

type Row = {
  conversationId: string; userId: string; version: number; proposalHash: string | null;
  needs: ReturnType<typeof planningNeedsSchema.parse>; pendingSaveKey: string | null; savedTripId: string | null;
  dialogueRevision: number; dialogueCheckpoint: null;
};
type RecordRow = { scope: string; key: string; requestHash: string; responseJson: string };
type Lookup = { where: Partial<Row> };
type Update = { where: Partial<Row>; data: { version: { increment: number }; proposalHash: string; needs?: Row["needs"] } };

/** Transactional test double exercises the real repository + idempotency helper,
 * including rollback. No database/provider or schema change is required. */
function fixture() {
  let row: Row = { conversationId: "chat", userId: "owner", version: 2, proposalHash: "old-hash", needs: planningNeedsSchema.parse(fixtureNeeds), pendingSaveKey: null, savedTripId: null, dialogueRevision: 0, dialogueCheckpoint: null };
  let records: RecordRow[] = [];
  let status = "ACTIVE";
  let failWrite = false;
  const updates = vi.fn();
  const matches = (value: Row, where: Partial<Row>) => Object.entries(where).every(([key, expected]) => value[key as keyof Row] === expected);
  const conversation = { findFirst: async ({ where }: { where: { id: string; principalId: string } }) => where.id === row.conversationId && where.principalId === row.userId ? { id: row.conversationId, context: { type: "GENERAL" } } : null };
  const database = {
    user: { findUnique: async () => ({ id: "owner", role: "TRAVELER", status }) },
    qaConversation: conversation,
    assistantPlanningWorkspace: { findFirst: async ({ where }: Lookup) => matches(row, where) ? structuredClone(row) : null },
    idempotencyRecord: { findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => records.find(record => record.scope === where.scope_key.scope && record.key === where.scope_key.key) ?? null },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      let pending = structuredClone(row); const pendingRecords = structuredClone(records);
      const result = await work({
        user: database.user, qaConversation: conversation,
        assistantPlanningWorkspace: {
          findFirst: async ({ where }: Lookup) => matches(pending, where) ? structuredClone(pending) : null,
          updateMany: async (input: Update) => {
            updates(input);
            if (failWrite) throw new Error("fixture transaction failure");
            if (!matches(pending, input.where)) return { count: 0 };
            pending = { ...pending, ...input.data, version: pending.version + input.data.version.increment };
            return { count: 1 };
          },
        },
        idempotencyRecord: {
          create: async ({ data }: { data: RecordRow }) => { pendingRecords.push(data); },
          update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
            const record = pendingRecords.find(value => value.scope === where.scope_key.scope && value.key === where.scope_key.key);
            if (!record) throw new Error("Missing replay record"); record.responseJson = data.responseJson;
          },
        },
      });
      row = pending; records = pendingRecords; return result;
    },
  };
  const auth: AuthorizationDependencies = { database: database as unknown as Pick<Database, "user">, resolveSession: async () => ({ user: { id: "owner" } }) };
  const repository = createPlanningRepository(database as unknown as Database, auth, new Headers(), "owner");
  const needs = planningNeedsSchema.parse({ ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["CULTURE_HISTORY"] } });
  return { repository, needs, updates, state: () => structuredClone(row), records: () => structuredClone(records), lock: () => { status = "LOCKED"; }, fail: (value: boolean) => { failWrite = value; } };
}

describe("V2 preference publication on the existing repository", () => {
  it("atomically replaces needs/hash/version once and replays an identical key before stale-version checks", async () => {
    const f = fixture();
    const args = ["chat", 2, "new-hash", "refinement-key", { needs: f.needs, previousHash: "old-hash" }] as const;
    const result = await f.repository.publishProposal(...args);
    expect(result).toMatchObject({ version: 3, needs: f.needs });
    expect(f.state()).toMatchObject({ version: 3, proposalHash: "new-hash", needs: f.needs });
    expect(f.updates).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { conversationId: "chat", userId: "owner", version: 2, pendingSaveKey: null, savedTripId: null, proposalHash: "old-hash" } }));
    expect(await f.repository.publishProposal(...args)).toEqual(result);
    expect(f.updates).toHaveBeenCalledTimes(1); expect(f.records()).toHaveLength(1);
    await expect(f.repository.publishProposal("chat", 2, "different-hash", "refinement-key", { needs: f.needs, previousHash: "old-hash" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it.each([[1, "old-hash"], [2, "superseded-hash"]] as const)("rejects version/hash mismatch %s/%s without erasing old needs or fingerprint", async (version, previousHash) => {
    const f = fixture(); const before = f.state();
    await expect(f.repository.publishProposal("chat", version, "new-hash", "refinement-stale", { needs: f.needs, previousHash })).rejects.toMatchObject({ code: "PLANNING_CHANGED" });
    expect(f.state()).toEqual(before); expect(f.records()).toHaveLength(0);
  });

  it("rechecks persisted role and ownership in the transactional publication boundary", async () => {
    const f = fixture(); const before = f.state(); f.lock();
    await expect(f.repository.publishProposal("chat", 2, "new-hash", "refinement-locked", { needs: f.needs, previousHash: "old-hash" })).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(f.updates).not.toHaveBeenCalled(); expect(f.state()).toEqual(before);
    await expect(f.repository.assertProposal("foreign", 2, "old-hash")).rejects.toMatchObject({ code: "PLANNING_NOT_FOUND" });
  });

  it("rolls back failed publication and preserves same-key recovery semantics", async () => {
    const f = fixture(); const before = f.state(); f.fail(true);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(f.repository.publishProposal("chat", 2, "new-hash", "refinement-retry", { needs: f.needs, previousHash: "old-hash" })).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
      expect(f.state()).toEqual(before); expect(f.records()).toHaveLength(0);
      f.fail(false);
      expect(await f.repository.publishProposal("chat", 2, "new-hash", "refinement-retry", { needs: f.needs, previousHash: "old-hash" })).toMatchObject({ version: 3, needs: f.needs });
    } finally { errorLog.mockRestore(); }
  });

  it("leaves the four-argument V1 publication contract and needs untouched", async () => {
    const f = fixture(); const originalNeeds = f.state().needs;
    await f.repository.publishProposal("chat", 2, "v1-new-hash", "v1-publication-key");
    expect(f.updates).toHaveBeenCalledExactlyOnceWith({ where: { conversationId: "chat", userId: "owner", version: 2, pendingSaveKey: null }, data: { version: { increment: 1 }, proposalHash: "v1-new-hash" } });
    expect(f.state().needs).toEqual(originalNeeds);
  });
});
