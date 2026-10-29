import "server-only";
import { randomUUID } from "node:crypto";
import type { Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";

export const SESSION_TTL_MS = 30 * 60_000;
export const sessionExpired = () => new AppError("ASSISTANT_SESSION_EXPIRED", "Phiên hoặc phương án đã thay đổi. Mở lại từ dữ liệu đã lưu; phương án cũ chưa được tự động áp dụng.", 409);
export type SessionHead = { id: string; userId: string; subject: string; startHash: string; version: number; keyHash: string | null; requestHash: string | null; leaseToken: string | null; leaseUntil: Date | null; expiresAt: Date };
export interface SessionHeadStore {
  create(input: Pick<SessionHead, "id" | "userId" | "subject" | "startHash">, now: number): Promise<SessionHead>;
  read(id: string, userId: string): Promise<SessionHead | null>;
  claim(input: { id: string; userId: string; subject: string; version: number; keyHash: string; requestHash: string }, now: number): Promise<string>;
  complete(id: string, userId: string, version: number, lease: string, now: number): Promise<void>;
  abandon(id: string, userId: string, lease: string, now: number): Promise<void>;
}

/** Shared CAS head only. Cipher state, candidates, prompts and location never
 * enter this table. A timed-out lease expires safely; it is never stolen to
 * repeat a possibly committed operation. Domain writes retain their own keys. */
export function createSessionHeadStore(db: Database): SessionHeadStore {
  return {
    async create(input, now) {
      await db.assistantV2SessionHead.deleteMany({ where: { userId: input.userId, expiresAt: { lt: new Date(now) } } });
      const row = await db.assistantV2SessionHead.upsert({ where: { id: input.id }, create: { ...input, expiresAt: new Date(now + SESSION_TTL_MS) }, update: {} });
      if (row.userId !== input.userId || row.subject !== input.subject || row.startHash !== input.startHash) throw new AppError("IDEMPOTENCY_CONFLICT", "Mã mở phiên đã dùng cho nội dung khác.", 409);
      return row;
    },
    async read(id, userId) { return db.assistantV2SessionHead.findFirst({ where: { id, userId } }); },
    async claim(input, now) {
      const lease = randomUUID();
      const updated = await db.assistantV2SessionHead.updateMany({ where: { id: input.id, userId: input.userId, subject: input.subject, version: input.version, leaseToken: null, expiresAt: { gt: new Date(now) } }, data: { keyHash: input.keyHash, requestHash: input.requestHash, leaseToken: lease, leaseUntil: new Date(now + 180_000), expiresAt: new Date(now + SESSION_TTL_MS) } });
      if (updated.count === 1) return lease;
      const current = await this.read(input.id, input.userId);
      if (current?.keyHash === input.keyHash && current.requestHash !== input.requestHash) throw new AppError("IDEMPOTENCY_CONFLICT", "Mã lượt đã dùng cho nội dung khác.", 409);
      if (current?.version === input.version && current.leaseUntil && current.leaseUntil.getTime() > now) throw new AppError("ASSISTANT_BUSY", "Lượt trước đang được xử lý. Giữ nguyên yêu cầu và kiểm tra lại.", 409);
      throw sessionExpired();
    },
    async complete(id, userId, version, lease, now) {
      const updated = await db.assistantV2SessionHead.updateMany({ where: { id, userId, version, leaseToken: lease, expiresAt: { gt: new Date(now) } }, data: { version: { increment: 1 }, leaseToken: null, leaseUntil: null, expiresAt: new Date(now + SESSION_TTL_MS) } });
      if (updated.count !== 1) throw new AppError("OPERATION_STATUS_UNKNOWN", "Chưa xác nhận được trạng thái phiên. Hãy đọc lại dữ liệu đã lưu trước khi thay đổi tiếp.", 503);
    },
    async abandon(id, userId, lease, now) { await db.assistantV2SessionHead.updateMany({ where: { id, userId, leaseToken: lease }, data: { expiresAt: new Date(now), leaseToken: null, leaseUntil: null } }); },
  };
}
