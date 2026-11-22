import { randomUUID } from "node:crypto";
import { AppError } from "../../server/http/app-error";
import { SESSION_TTL_MS, sessionExpired, type SessionHead, type SessionHeadStore } from "./session-head-store";

/** Mirrors the shared CAS contract for two independent HTTP service instances. */
export function createTestSessionHeadStore(): SessionHeadStore {
  const rows = new Map<string, SessionHead>();
  return {
    async create(input, now) {
      const previous = rows.get(input.id);
      if (previous) {
        if (previous.userId !== input.userId || previous.subject !== input.subject || previous.startHash !== input.startHash)
          throw new AppError("IDEMPOTENCY_CONFLICT", "start mismatch", 409);
        return { ...previous };
      }
      const row = { ...input, version: 0, keyHash: null, requestHash: null, leaseToken: null, leaseUntil: null, expiresAt: new Date(now + SESSION_TTL_MS) };
      rows.set(input.id, row);
      return { ...row };
    },
    async read(id, userId) { const row = rows.get(id); return row?.userId === userId ? { ...row } : null; },
    async claim(input, now) {
      const row = rows.get(input.id);
      if (row?.userId === input.userId && row.subject === input.subject && row.version === input.version && !row.leaseToken && row.expiresAt.getTime() > now) {
        const token = randomUUID(); Object.assign(row, { leaseToken: token, leaseUntil: new Date(now + 180_000), keyHash: input.keyHash, requestHash: input.requestHash, expiresAt: new Date(now + SESSION_TTL_MS) }); return token;
      }
      if (row?.keyHash === input.keyHash && row.requestHash !== input.requestHash) throw new AppError("IDEMPOTENCY_CONFLICT", "turn mismatch", 409);
      if (row?.version === input.version && row.leaseUntil && row.leaseUntil.getTime() > now) throw new AppError("ASSISTANT_BUSY", "busy", 409);
      throw sessionExpired();
    },
    async complete(id, userId, version, lease, now) {
      const row = rows.get(id);
      if (row?.userId !== userId || row.version !== version || row.leaseToken !== lease || row.expiresAt.getTime() <= now) throw new AppError("OPERATION_STATUS_UNKNOWN", "head mismatch", 503);
      Object.assign(row, { version: version + 1, leaseToken: null, leaseUntil: null, expiresAt: new Date(now + SESSION_TTL_MS) });
    },
    async abandon(id, userId, lease, now) { const row = rows.get(id); if (row?.userId === userId && row.leaseToken === lease) Object.assign(row, { expiresAt: new Date(now), leaseToken: null, leaseUntil: null }); },
  };
}
