import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Database, Prisma } from "@KLTN/db";
import type { MutationOutcome } from "../../lib/mutation-contract";
import { AppError } from "../../server/http/app-error";
import { executeIdempotentWrite } from "../../server/http/idempotency";
import { generateConversationTitle } from "../ai/qa-conversation-title";
import {
  ASSISTANT_CONVERSATION_RETENTION_DAYS,
  assistantConversationDetailSchema,
  assistantConversationListSchema,
  sanitizeStoredParts,
  type AssistantConversationDetail,
  type AssistantConversationList,
  type StoredAssistantPart,
} from "./assistant-conversation-contract";

export type RecordUserMessageResult = { conversationId: string; title: string; messageId: string };
export type RecordAssistantMessageResult = { conversationId: string; messageId: string };
export type DeleteConversationResult = { deleted: true; id: string };
export type DeleteAllConversationsResult = { deletedCount: number };

export interface AssistantConversationStore {
  list(userId: string, options?: { limit?: number; cursor?: string | null; search?: string }): Promise<AssistantConversationList>;
  get(userId: string, conversationId: string): Promise<AssistantConversationDetail>;
  recordUserMessage(input: {
    userId: string;
    conversationId?: string | null;
    clientMessageId: string;
    text: string;
  }): Promise<MutationOutcome<RecordUserMessageResult>>;
  recordAssistantMessage(input: {
    userId: string;
    conversationId: string;
    clientMessageId: string;
    parts: readonly unknown[];
  }): Promise<MutationOutcome<RecordAssistantMessageResult>>;
  deleteOne(userId: string, conversationId: string, idempotencyKey: string): Promise<MutationOutcome<DeleteConversationResult>>;
  deleteAll(userId: string, idempotencyKey: string): Promise<MutationOutcome<DeleteAllConversationsResult>>;
  cleanup(batchSize?: number): Promise<{ deletedCount: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = ASSISTANT_CONVERSATION_RETENTION_DAYS * DAY_MS;
const notFound = () => new AppError("NOT_FOUND", "Không tìm thấy cuộc hội thoại.", 404);

function hashContent(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function encodeCursor(item: { updatedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ updatedAt: item.updatedAt.toISOString(), id: item.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
    if (typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string" || !parsed.id) return null;
    const date = new Date(parsed.updatedAt);
    return Number.isFinite(date.getTime()) ? { updatedAt: date, id: parsed.id } : null;
  } catch {
    return null;
  }
}

export function createAssistantConversationStore(db: Database, options: { now?: () => Date } = {}): AssistantConversationStore {
  const now = () => options.now?.() ?? new Date();
  const expiresAtFrom = (at: Date) => new Date(at.getTime() + RETENTION_MS);

  return {
    async list(userId, opts = {}) {
      const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
      const search = opts.search?.normalize("NFC").trim() || undefined;
      const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
      const at = now();

      const where: Prisma.AssistantConversationWhereInput = {
        userId,
        expiresAt: { gt: at },
        ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: cursor.updatedAt } },
                { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      };

      const rows = await db.assistantConversation.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: { id: true, title: true, createdAt: true, updatedAt: true },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const items = page.map(row => ({
        id: row.id,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));
      const last = page.at(-1);
      return assistantConversationListSchema.parse({
        items,
        nextCursor: hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null,
        hasMore,
      });
    },

    async get(userId, conversationId) {
      const at = now();
      const row = await db.assistantConversation.findFirst({
        where: { id: conversationId, userId, expiresAt: { gt: at } },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, role: true, parts: true, createdAt: true },
          },
        },
      });
      if (!row) throw notFound();
      const messages = row.messages
        .filter(msg => msg.role === "user" || msg.role === "assistant")
        .map(msg => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          parts: sanitizeStoredParts(Array.isArray(msg.parts) ? msg.parts : []),
          createdAt: msg.createdAt.toISOString(),
        }))
        .filter(msg => msg.parts.length > 0);
      return assistantConversationDetailSchema.parse({
        conversation: {
          id: row.id,
          title: row.title,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        messages,
      });
    },

    async recordUserMessage(input) {
      const text = input.text.normalize("NFC").trim();
      const parts: StoredAssistantPart[] = [{ type: "text", text }];
      const contentHash = hashContent({ role: "user", parts });
      const at = now();

      // If the client retried after learning the conversationId from an earlier attempt with the same clientMessageId,
      // replay cleanly when the stored message belongs to this owner and has identical content.
      if (input.conversationId) {
        try {
          const existing = await db.assistantMessage.findFirst({
            where: {
              conversationId: input.conversationId,
              role: "user",
              clientMessageId: input.clientMessageId,
              conversation: { userId: input.userId, expiresAt: { gt: at } },
            },
            select: {
              id: true,
              contentHash: true,
              conversation: { select: { id: true, title: true } },
            },
          });
          if (existing) {
            if (existing.contentHash !== contentHash) {
              return {
                status: "FAILED",
                httpStatus: 409,
                error: { code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency-Key này đã được dùng cho một nội dung request khác" },
              };
            }
            return {
              status: "SUCCESS",
              replayed: true,
              data: { conversationId: existing.conversation.id, title: existing.conversation.title, messageId: existing.id },
            };
          }
        } catch {
          return {
            status: "UNKNOWN",
            error: {
              code: "OPERATION_STATUS_UNKNOWN",
              message: "Chưa thể xác định thao tác đã hoàn tất hay chưa. Hãy thử lại với cùng Idempotency-Key.",
            },
            retryWithSameKey: true,
          };
        }
      }

      return executeIdempotentWrite<RecordUserMessageResult>({
        database: db,
        actorId: input.userId,
        operation: "assistant-conversation:user-message",
        key: input.clientMessageId,
        input: { conversationId: input.conversationId ?? null, text },
        execute: async tx => {
          const writeAt = now();
          const expiresAt = expiresAtFrom(writeAt);
          let conversationId = input.conversationId ?? null;
          let title: string;
          if (conversationId) {
            const owned = await tx.assistantConversation.findFirst({
              where: { id: conversationId, userId: input.userId, expiresAt: { gt: writeAt } },
              select: { id: true, title: true },
            });
            if (!owned) throw notFound();
            title = owned.title;
            await tx.assistantConversation.update({
              where: { id: owned.id },
              data: { updatedAt: writeAt, expiresAt },
            });
          } else {
            conversationId = randomUUID();
            title = generateConversationTitle(text);
            await tx.assistantConversation.create({
              data: { id: conversationId, userId: input.userId, title, createdAt: writeAt, updatedAt: writeAt, expiresAt },
            });
          }
          const messageId = randomUUID();
          await tx.assistantMessage.create({
            data: {
              id: messageId,
              conversationId,
              role: "user",
              clientMessageId: input.clientMessageId,
              contentHash,
              parts: parts as unknown as Prisma.InputJsonValue,
              createdAt: writeAt,
            },
          });
          return { conversationId, title, messageId };
        },
      });
    },

    async recordAssistantMessage(input) {
      const sanitized = sanitizeStoredParts(input.parts);
      if (!sanitized.length) {
        return {
          status: "FAILED",
          httpStatus: 400,
          error: { code: "EMPTY_ASSISTANT_MESSAGE", message: "Không có nội dung hợp lệ để lưu." },
        };
      }
      const contentHash = hashContent({ role: "assistant", parts: sanitized });

      return executeIdempotentWrite<RecordAssistantMessageResult>({
        database: db,
        actorId: input.userId,
        operation: "assistant-conversation:assistant-message",
        key: input.clientMessageId,
        input: { conversationId: input.conversationId, contentHash },
        execute: async tx => {
          const current = now();
          const owned = await tx.assistantConversation.findFirst({
            where: { id: input.conversationId, userId: input.userId, expiresAt: { gt: current } },
            select: { id: true, updatedAt: true },
          });
          if (!owned) throw notFound();
          // Ensure deterministic chronological order even if the user and assistant messages commit within the same ms.
          const writeAt = new Date(Math.max(current.getTime(), owned.updatedAt.getTime() + 1));
          const messageId = randomUUID();
          await tx.assistantMessage.create({
            data: {
              id: messageId,
              conversationId: owned.id,
              role: "assistant",
              clientMessageId: input.clientMessageId,
              contentHash,
              parts: sanitized as unknown as Prisma.InputJsonValue,
              createdAt: writeAt,
            },
          });
          await tx.assistantConversation.update({
            where: { id: owned.id },
            data: { updatedAt: writeAt, expiresAt: expiresAtFrom(writeAt) },
          });
          return { conversationId: owned.id, messageId };
        },
      });
    },

    async deleteOne(userId, conversationId, idempotencyKey) {
      return executeIdempotentWrite<DeleteConversationResult>({
        database: db,
        actorId: userId,
        operation: "assistant-conversation:delete-one",
        key: idempotencyKey,
        input: { conversationId },
        execute: async tx => {
          const owned = await tx.assistantConversation.findFirst({
            where: { id: conversationId, userId },
            select: { id: true },
          });
          if (!owned) throw notFound();
          await tx.assistantConversation.delete({ where: { id: owned.id } });
          return { deleted: true, id: owned.id };
        },
      });
    },

    async deleteAll(userId, idempotencyKey) {
      return executeIdempotentWrite<DeleteAllConversationsResult>({
        database: db,
        actorId: userId,
        operation: "assistant-conversation:delete-all",
        key: idempotencyKey,
        input: { scope: "ALL" },
        execute: async tx => {
          const result = await tx.assistantConversation.deleteMany({ where: { userId } });
          return { deletedCount: result.count };
        },
      });
    },

    async cleanup(batchSize = 100) {
      const limit = Math.max(1, Math.min(500, batchSize));
      const expired = await db.assistantConversation.findMany({
        where: { expiresAt: { lte: now() } },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: limit,
        select: { id: true },
      });
      if (!expired.length) return { deletedCount: 0 };
      const result = await db.assistantConversation.deleteMany({
        where: { id: { in: expired.map(item => item.id) } },
      });
      return { deletedCount: result.count };
    },
  };
}
