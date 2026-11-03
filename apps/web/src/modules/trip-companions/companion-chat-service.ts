import type { Database, Prisma } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { assertCompanionCanSend, companionId, groupRelationship, lockCompanion, requireGroup } from "./companion-group-service";
import { companionHistoryQuerySchema, companionHistorySchema, companionMessageSchema, companionSendResultSchema, companionSendSchema } from "./companion-chat-contract";
import type { CompanionDependencies } from "./companion-service";

export const invalidChatCursor = () => new AppError("COMPANION_CURSOR_INVALID", "Mốc tin nhắn không hợp lệ.", 400);
export const chatMessageSelect = { id: true, sequence: true, kind: true, text: true, notice: true, createdAt: true, author: { select: { id: true, name: true, image: true } } } satisfies Prisma.TripCompanionMessageSelect;
export function projectChatMessage(row: Prisma.TripCompanionMessageGetPayload<{ select: typeof chatMessageSelect }>) {
  if (row.kind === "SYSTEM") return companionMessageSchema.parse({ id: row.id, sequence: row.sequence.toString(), kind: "SYSTEM", text: row.text, createdAt: row.createdAt.toISOString(), author: null, notice: row.notice });
  if (!row.author) throw new Error("Invalid persisted user-message authorship");
  return companionMessageSchema.parse({ id: row.id, sequence: row.sequence.toString(), kind: row.kind, text: row.text, createdAt: row.createdAt.toISOString(),
    author: { userId: row.author.id, displayName: row.author.name, avatarUrl: publicHttpsUrl.safeParse(row.author.image).success ? row.author.image : null },
  });
}
export function chatInput(input: unknown) {
  const parsed = companionSendSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_COMPANION_INPUT", "Tin nhắn cần có từ 1 đến 4000 ký tự văn bản.", 400);
  return parsed.data;
}
export async function sendCompanionMessage(headers: Headers, rawId: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), payload = chatInput(input), { actor, row: current } = await requireGroup(headers, id, deps);
  assertCompanionCanSend(current);
  return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip-companions:send", key, input: { publicationId: id, ...payload }, execute: async tx => {
    const row = await lockCompanion(tx, id, actor.userId, headers, deps);
    await groupRelationship(tx, row, actor.userId);
    assertCompanionCanSend(row);
    const updated = await tx.tripCompanionPublication.update({ where: { id }, data: { messageSequence: { increment: 1 } }, select: { messageSequence: true } });
    const message = await tx.tripCompanionMessage.create({ data: { publicationId: id, sequence: updated.messageSequence, authorId: actor.userId, text: payload.text }, select: { id: true } });
    return companionSendResultSchema.parse({ publicationId: id, messageId: message.id, sequence: updated.messageSequence.toString() });
  } });
}
export async function getCompanionHistory(headers: Headers, rawId: string, input: unknown, deps: CompanionDependencies) {
  const id = companionId(rawId), parsed = companionHistoryQuerySchema.safeParse(input);
  if (!parsed.success) throw invalidChatCursor();
  const query = parsed.data;
  return deps.database.$transaction(async tx => {
    const { row } = await requireGroup(headers, id, { ...deps, database: tx as Database });
    const before = query.before === undefined ? null : BigInt(query.before);
    if (before !== null && before > row.messageSequence + BigInt(1)) throw invalidChatCursor();
    const rows = await tx.tripCompanionMessage.findMany({ where: { publicationId: id, sequence: { lte: row.messageSequence, ...(before !== null ? { lt: before } : {}) } }, orderBy: { sequence: "desc" }, take: query.limit + 1, select: chatMessageSelect });
    const page = rows.slice(0, query.limit).reverse();
    return companionHistorySchema.parse({ publicationId: id, items: page.map(projectChatMessage), olderCursor: rows.length > query.limit ? page[0]!.sequence.toString() : null, highWaterCursor: row.messageSequence.toString(), canSend: !row.canceledAt });
  }, { isolationLevel: "RepeatableRead" });
}
