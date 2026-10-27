import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrismaClient, type Database } from "@KLTN/db";
import { createPlanningRepository, planningHash } from "./planning-repository";
import { fixtureNeeds } from "../../test/planning-fixtures";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { PlanningClient } from "../../components/assistant/planning-client";
import { executePlanning, type PlanningDependencies } from "./planning-service";
import type { PlanningRequest } from "./planning-contract";

const enabled = process.env.ASSISTANT_PLANNING_DB_TESTS === "1";
describe.skipIf(!enabled)("Development PostgreSQL planning persistence", () => {
  let db: Database;
  const owner = `planning-test-${randomUUID()}`, other = `planning-test-${randomUUID()}`;
  const sessions = (id: string): AuthorizationDependencies => ({ database: db, resolveSession: async () => ({ user: { id } }) });
  const repo = (id: string) => createPlanningRepository(db, sessions(id), new Headers(), id);
  const keys: string[] = [];
  const key = () => { const value = `planning-test-${randomUUID()}`; keys.push(value); return value; };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname.split(".")[0].replace(/-pooler$/, "") !== "ep-purple-pond-b3xujb8o" || url.pathname !== "/neondb") throw Error("REFUSED_NON_DEVELOPMENT_TARGET");
    db = createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL! });
    const actual = await db.$queryRaw<Array<{ endpoint: string }>>`SELECT current_setting('neon.endpoint_id',true) AS endpoint`;
    if (actual[0]?.endpoint !== "ep-purple-pond-b3xujb8o") throw Error("DEVELOPMENT_IDENTITY_MISMATCH");
    for (const id of [owner, other]) await db.user.create({ data: { id, name: "Planning integration fixture", email: `${id}@example.invalid`, role: "TRAVELER" } });
  }, 30_000);
  afterAll(async () => {
    if (!db) return;
    // Only this test's UUID-owned resources; no pre-existing rows are touched.
    await db.qaConversation.deleteMany({ where: { principalKind: "USER", principalId: { in: [owner, other] } } });
    await db.idempotencyRecord.deleteMany({ where: { key: { in: keys } } });
    await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await db.$disconnect();
  }, 30_000);
  it("preserves canonical context, replays review and isolates owners", async () => {
    const own = repo(owner);
    const started = await own.start(null, key(), { type: "DESTINATION", destinationId: "public-context-fixture" });
    expect(started.context).toEqual({ type: "DESTINATION", destinationId: "public-context-fixture" });
    await expect(repo(other).read(started.conversationId)).rejects.toMatchObject({ status: 404 });
    const reviewKey = key();
    const reviewed = await own.review(started.conversationId, 0, fixtureNeeds, reviewKey);
    expect((await own.review(started.conversationId, 0, fixtureNeeds, reviewKey)).version).toBe(reviewed.version);
    await expect(own.review(started.conversationId, 0, { ...fixtureNeeds, requiredDestinationIds: ["changed"] }, reviewKey)).rejects.toMatchObject({ status: 409 });
    const published = await own.publishProposal(started.conversationId, reviewed.version, "a".repeat(64), key());
    await expect(own.assertProposal(started.conversationId, reviewed.version, "a".repeat(64))).rejects.toMatchObject({ status: 409 });
    expect(published.version).toBe(reviewed.version + 1);
  }, 30_000);
  it("persists unfinished dialogue separately, replays exactly and erases it with conversation history", async () => {
    const own = repo(owner);
    const started = await own.start(null, key());
    const request = { action: "CHECKPOINT" as const, conversationId: started.conversationId, version: 0, revision: 0,
      checkpoint: { needs: { requirement: { durationDays: 3 }, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} }, unresolved: [], resume: "NEEDS" as const },
      exchanges: [{ id: randomUUID(), question: "3 ngày", reply: "Bạn sẽ đi ô tô hay xe máy?", at: Date.now(), afterQaTurnId: null }] };
    const checkpointKey = key();
    const saved = await own.checkpoint(request, checkpointKey);
    expect(await own.checkpoint(request, checkpointKey)).toEqual(saved);
    const restored = await repo(owner).read(started.conversationId);
    expect(restored.needs.requirement.durationDays).toBeUndefined();
    expect(restored.checkpoint?.needs.requirement.durationDays).toBe(3);
    expect(restored.exchanges).toEqual(request.exchanges);
    expect(restored.savedTripId).toBeNull();
    await expect(repo(other).checkpoint(request, key())).rejects.toMatchObject({ status: 404 });
    await expect(own.checkpoint({ ...request, checkpoint: { ...request.checkpoint, needs: fixtureNeeds } }, checkpointKey)).rejects.toMatchObject({ status: 409 });
    await expect(own.checkpoint(request, key())).rejects.toMatchObject({ status: 409 });
    await db.qaConversation.update({ where: { id: started.conversationId }, data: { deletedAt: new Date() } });
    expect(await db.assistantPlanningTurn.count({ where: { conversationId: started.conversationId } })).toBe(0);
    await expect(own.read(started.conversationId)).rejects.toMatchObject({ status: 404 });
  }, 30_000);
  it("retains only an explicitly confirmed save intent until terminal reconciliation", async () => {
    const own = repo(owner);
    const started = await own.start(null, key());
    const input = { confirm: true as const, proposal: { startDate: "2026-11-02", durationDays: 1, transport: "CAR" as const, days: [{ dayIndex: 1, visits: [{ destinationId: "fixture", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }] } };
    const saveKey = key();
    await own.reserveSave(started.conversationId, 0, saveKey, planningHash(input), input);
    // A new repository represents reload/another server instance.
    expect(await repo(owner).pendingSave(started.conversationId)).toEqual({ key: saveKey, input });
    await expect(own.review(started.conversationId, 0, fixtureNeeds, key())).rejects.toMatchObject({ status: 409 });
    await own.finishSave(started.conversationId, saveKey, null);
    expect(await own.pendingSave(started.conversationId)).toBeNull();
    const stored = await db.assistantPlanningWorkspace.findUniqueOrThrow({ where: { conversationId: started.conversationId } });
    expect(stored.pendingSaveRequest).toBeNull();
    expect((await own.read(started.conversationId)).pendingSaveKey).toBeNull();
  }, 30_000);
  it("the actual client and service resume an unfinished dialogue from a fresh DB reader", async () => {
    const deps: PlanningDependencies = { repository: repo(owner), candidates: async () => [], recheck: async () => true, routes: { route: async () => { throw Error("No routing"); } },
      analyze: async (_text, draft) => ({ intent: "NEEDS", needs: { ...draft, requirement: { ...draft.requirement, durationDays: 3 } }, unresolved: [], message: "" }),
      generate: async () => { throw Error("No generation"); }, save: async () => { throw Error("No Trip Save"); }, validateForSave: async () => ({ canConfirm: false }), now: () => new Date("2026-10-27T03:00:00Z") };
    const wire = (body: string, operationKey: string) => { keys.push(operationKey); return executePlanning(JSON.parse(body) as PlanningRequest, operationKey, deps); };
    const first = new PlanningClient(`USER:${owner}`, wire);
    await first.send("Tôi muốn lập hành trình 3 ngày", null);
    expect(first.getSnapshot().error).toBeNull();
    const id = first.getSnapshot().workspace!.conversationId;
    const second = new PlanningClient(`USER:${owner}`, wire);
    await second.restore(id);
    expect(second.getSnapshot().error).toBeNull();
    expect(second.getSnapshot().draft.requirement.durationDays).toBe(3);
    expect(second.getSnapshot().messages).toEqual(first.getSnapshot().messages);
    expect(second.getSnapshot().prompt).toEqual({ kind: "NEED", field: "transport" });
    expect((await repo(owner).read(id)).needs.requirement.durationDays).toBeUndefined();
  }, 30_000);
  it("scrubs reviewed planning needs when the shared QA lifecycle deletes history", async () => {
    const own = repo(owner);
    const started = await own.start(null, key());
    const reviewKey = key();
    await own.review(started.conversationId, 0, { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, mobilityConstraints: { flags: [], note: "synthetic-private-note" } } }, reviewKey);
    await db.qaConversation.update({ where: { id: started.conversationId }, data: { deletedAt: new Date() } });
    expect(await db.assistantPlanningWorkspace.findUnique({ where: { conversationId: started.conversationId } })).toBeNull();
    const replay = await db.idempotencyRecord.findFirstOrThrow({ where: { key: reviewKey } });
    expect(replay.responseJson).not.toContain("synthetic-private-note");
    await expect(own.review(started.conversationId, 0, fixtureNeeds, reviewKey)).rejects.toMatchObject({ status: 404 });
  }, 30_000);
});
