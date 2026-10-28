import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import { executeIdempotentWrite } from "../../server/http/idempotency";
import { requireTraveler } from "../../server/auth/require-traveler";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { EMPTY_PLANNING_NEEDS, planningNeedsSchema, planningCheckpointSchema, type PlanningNeeds, type PlanningWorkspace, type PlanningRequest } from "./planning-contract";
import { qaContextSchema, type QaContext } from "../ai/qa-contract";
import { tripSaveRequestSchema, type TripSaveRequest } from "../trip-save/trip-save-contract";

export const planningHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const missing = () => new AppError("PLANNING_NOT_FOUND", "Cuộc trò chuyện không tồn tại hoặc không thuộc tài khoản này.", 404);
const conflict = () => new AppError("PLANNING_CHANGED", "Nhu cầu đã thay đổi hoặc có lần lưu chưa rõ kết quả. Hãy mở lại trạng thái hiện tại.", 409);
type Store = Pick<Prisma.TransactionClient, "qaConversation" | "assistantPlanningWorkspace" | "assistantPlanningTurn" | "qaTurn" | "idempotencyRecord" | "trip">;
export function createPlanningRepository(database: Database, authorization: AuthorizationDependencies, headers: Headers, userId: string) {
  async function conversation(store: Store, id: string) {
    const row = await store.qaConversation.findFirst({ where: { id, principalKind: "USER", principalId: userId, deletedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, context: true } });
    if (!row) throw missing();
    return row;
  }
  async function owned(store: Store, id: string) {
    const parent = await conversation(store, id);
    const row = await store.assistantPlanningWorkspace.findFirst({ where: { conversationId: id, userId } });
    if (!row) throw missing();
    return { ...row, context: qaContextSchema.parse(parent.context) };
  }
  function project(row: Awaited<ReturnType<typeof owned>>): PlanningWorkspace {
    return { conversationId: row.conversationId, version: row.version, needs: planningNeedsSchema.parse(row.needs), pendingSaveKey: row.pendingSaveKey, savedTripId: row.savedTripId, context: row.context, dialogueRevision: row.dialogueRevision, checkpoint: row.dialogueCheckpoint ? planningCheckpointSchema.parse(row.dialogueCheckpoint) : null };
  }
  async function write<T>(operation: string, key: string, input: unknown, execute: (store: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const outcome = await executeIdempotentWrite({ database, actorId: userId, operation, key, input, execute: async store => {
      await requireTraveler(headers, { ...authorization, database: store });
      return execute(store);
    } });
    if (outcome.status === "SUCCESS") {
      if (outcome.data && typeof outcome.data === "object" && "conversationId" in outcome.data && typeof outcome.data.conversationId === "string") await conversation(database, outcome.data.conversationId);
      return outcome.data;
    }
    if (outcome.status === "FAILED") throw new AppError(outcome.error.code, outcome.error.message, outcome.httpStatus);
    throw new AppError("OPERATION_STATUS_UNKNOWN", "Chưa rõ kết quả. Hãy thử lại cùng yêu cầu, không bắt đầu thao tác khác.", 503);
  }
  return {
    async start(id: string | null, key: string, context: QaContext = { type: "GENERAL" }) {
      if (id) await conversation(database, id);
      return write("planning:start", key, { conversationId: id, context }, async store => {
        if (id) await conversation(store, id);
        const conversationId = id ?? randomUUID();
        if (!id) await store.qaConversation.create({ data: { id: conversationId, principalKind: "USER", principalId: userId, context, title: "Lập hành trình Hà Giang", expiresAt: new Date(Date.now() + 30 * 86400_000) } });
        await store.assistantPlanningWorkspace.upsert({ where: { conversationId }, create: { conversationId, userId, needs: EMPTY_PLANNING_NEEDS }, update: {} });
        return project(await owned(store, conversationId));
      });
    },
    async read(id: string): Promise<PlanningWorkspace> {
      let row = await owned(database, id);
      if (row.pendingSaveKey) {
        const record = await database.idempotencyRecord.findUnique({ where: { scope_key: { scope: JSON.stringify([userId, "trip:create"]), key: row.pendingSaveKey } } });
        if (record) {
          const parsed = JSON.parse(record.responseJson) as { tripId?: unknown };
          if (typeof parsed.tripId === "string" && await database.trip.findFirst({ where: { id: parsed.tripId, userId }, select: { id: true } })) {
            await database.assistantPlanningWorkspace.updateMany({ where: { conversationId: id, userId, pendingSaveKey: row.pendingSaveKey }, data: { savedTripId: parsed.tripId, completedSaveKey: row.pendingSaveKey, completedSaveHash: row.pendingSaveHash, pendingSaveKey: null, pendingSaveHash: null, pendingSaveRequest: Prisma.DbNull } });
            row = await owned(database, id);
          }
        }
      }
      const turns = await database.assistantPlanningTurn.findMany({ where: { conversationId: id }, orderBy: { sequence: "asc" } });
      return { ...project(row), exchanges: turns.map(turn => ({ id: turn.id, question: turn.question, reply: turn.reply, at: turn.at.getTime(), afterQaTurnId: turn.afterQaTurnId })) };
    },
    async checkpoint(request: Extract<PlanningRequest, { action: "CHECKPOINT" }>, key: string) {
      await owned(database, request.conversationId);
      return write("planning:checkpoint", key, request, async store => {
        await owned(store, request.conversationId);
        const updated = await store.assistantPlanningWorkspace.updateMany({ where: { conversationId: request.conversationId, userId, version: request.version, dialogueRevision: request.revision }, data: { dialogueCheckpoint: request.checkpoint as Prisma.InputJsonValue, dialogueRevision: { increment: 1 } } });
        if (updated.count !== 1) throw conflict();
        const boundaries = [...new Set(request.exchanges.map(turn => turn.afterQaTurnId).filter((id): id is string => !!id))];
        if (boundaries.length && await store.qaTurn.count({ where: { id: { in: boundaries }, conversationId: request.conversationId } }) !== boundaries.length) throw conflict();
        for (const turn of request.exchanges) {
          const previous = await store.assistantPlanningTurn.findUnique({ where: { id: turn.id } });
          if (previous) {
            if (previous.conversationId !== request.conversationId || previous.question !== turn.question || previous.reply !== turn.reply || previous.at.getTime() !== turn.at || previous.afterQaTurnId !== (turn.afterQaTurnId ?? null)) throw conflict();
          } else await store.assistantPlanningTurn.create({ data: { ...turn, at: new Date(turn.at), afterQaTurnId: turn.afterQaTurnId ?? null, conversationId: request.conversationId } });
        }
        const now = new Date();
        if (request.exchanges.length) await store.qaConversation.update({ where: { id: request.conversationId }, data: { lastActivityAt: now, expiresAt: new Date(now.getTime() + 30 * 86400_000) } });
        return { conversationId: request.conversationId, dialogueRevision: request.revision + 1 };
      });
    },
    async assertVersion(id: string, version: number, allowPending = false) {
      const row = await owned(database, id);
      if (row.version !== version || (!allowPending && row.pendingSaveKey)) throw conflict();
      return project(row);
    },
    async review(id: string, version: number, needs: PlanningNeeds, key: string) {
      await owned(database, id);
      return write("planning:review", key, { id, version, needs }, async store => {
        await owned(store, id);
        const updated = await store.assistantPlanningWorkspace.updateMany({ where: { conversationId: id, userId, version, pendingSaveKey: null }, data: { needs: needs as Prisma.InputJsonValue, version: { increment: 1 }, savedTripId: null, proposalHash: null, completedSaveKey: null, completedSaveHash: null } });
        if (updated.count !== 1) throw conflict();
        await store.qaConversation.update({ where: { id }, data: { lastActivityAt: new Date() } });
        return project(await owned(store, id));
      });
    },
    async publishProposal(id: string, version: number, hash: string, key: string) {
      return write("planning:proposal", key, { id, version, hash }, async store => {
        await owned(store, id);
        const updated = await store.assistantPlanningWorkspace.updateMany({ where: { conversationId: id, userId, version, pendingSaveKey: null }, data: { version: { increment: 1 }, proposalHash: hash } });
        if (updated.count !== 1) throw conflict();
        return project(await owned(store, id));
      });
    },
    async assertProposal(id: string, version: number, hash: string) {
      const row = await owned(database, id);
      if (row.version !== version || row.proposalHash !== hash) throw conflict();
    },
    async completedSave(id: string, key: string, hash: string) {
      const row = await owned(database, id);
      if (!row.savedTripId) return null;
      if (row.completedSaveKey !== key || row.completedSaveHash !== hash) throw conflict();
      return row.savedTripId;
    },
    async pendingSave(id: string) {
      const row = await owned(database, id);
      if (!row.pendingSaveKey || !row.pendingSaveRequest) return null;
      return { key: row.pendingSaveKey, input: tripSaveRequestSchema.parse(row.pendingSaveRequest) };
    },
    async reserveSave(id: string, version: number, key: string, hash: string, input: TripSaveRequest) {
      // Recheck even on replay: another operation must never share the slot.
      const current = await owned(database, id);
      if (current.version !== version || current.savedTripId || (current.pendingSaveKey && (current.pendingSaveKey !== key || current.pendingSaveHash !== hash))) throw conflict();
      await write("planning:save-reserve", key, { id, version, hash }, async store => {
        await owned(store, id);
        const changed = await store.assistantPlanningWorkspace.updateMany({ where: { conversationId: id, userId, version, savedTripId: null, pendingSaveKey: null }, data: { pendingSaveKey: key, pendingSaveHash: hash, pendingSaveRequest: input } });
        if (changed.count !== 1) throw conflict();
        return { reserved: true };
      });
      // A previous FAILED save may have cleared the slot. Idempotency replay
      // alone must not allow another writer to interleave with this retry.
      await database.$transaction(async store => {
        await requireTraveler(headers, { ...authorization, database: store });
        await owned(store, id);
        const updated = await store.assistantPlanningWorkspace.updateMany({ where: { conversationId: id, userId, version, savedTripId: null, OR: [{ pendingSaveKey: null }, { pendingSaveKey: key, pendingSaveHash: hash }] }, data: { pendingSaveKey: key, pendingSaveHash: hash, pendingSaveRequest: input } });
        if (updated.count !== 1) throw conflict();
      });
    },
    async finishSave(id: string, key: string, tripId: string | null) {
      const row = await owned(database, id);
      await database.assistantPlanningWorkspace.updateMany({ where: { conversationId: id, userId, pendingSaveKey: key }, data: { savedTripId: tripId, completedSaveKey: tripId ? key : null, completedSaveHash: tripId ? row.pendingSaveHash : null, pendingSaveKey: null, pendingSaveHash: null, pendingSaveRequest: Prisma.DbNull } });
    },
  };
}
export type PlanningRepository = ReturnType<typeof createPlanningRepository>;
