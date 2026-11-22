import type { MutationOutcome } from "../../lib/mutation-contract";
import { AppError } from "../../server/http/app-error";
import type { MemoryItem } from "./memory-contract";
import { MEMORY_MIN_SIMILARITY, MEMORY_TOP_K, type MemoryStore } from "./memory-store";

export function fakeMemoryStore(): MemoryStore & { loseNextWriteResponse: () => void } {
  const owners = new Map<string, (MemoryItem & { hash: string; vector: number[]; model: string })[]>();
  const ledger = new Map<string, { payload: string; data: unknown }>();
  const rows = (owner: string) => owners.get(owner) ?? [];
  let nextId = 0;
  let loseResponse = false;
  const scope = ({ actorId, operation, key }: Parameters<MemoryStore["write"]>[0]) => JSON.stringify([actorId, operation, key]);
  const cosine = (a: number[], b: number[]) =>
    a.reduce((sum, value, index) => sum + value * b[index]!, 0) / Math.hypot(...a) / Math.hypot(...b);
  const date = "2026-11-21T00:00:00.000Z";
  const store: MemoryStore = {
    list: async userId => rows(userId).map(({ id, content, kind, createdAt, updatedAt }) => ({ id, content, kind, createdAt, updatedAt })),
    exists: async (userId, id) => rows(userId).some(row => row.id === id),
    recall: async (userId, vector, model) => rows(userId)
      .filter(row => row.model === model)
      .map(row => ({ row, score: cosine(row.vector, vector) }))
      .filter(item => item.score >= MEMORY_MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, MEMORY_TOP_K)
      .map(({ row: { content, kind } }) => ({ content, kind })),
    async replay<T>(identity: Parameters<MemoryStore["write"]>[0]) {
      const saved = ledger.get(scope(identity));
      if (!saved) return { status: "ABSENT" };
      if (saved.payload !== JSON.stringify(identity.input)) {
        return { status: "FAILED", error: { code: "IDEMPOTENCY_KEY_REUSED", message: "Key reused" }, httpStatus: 409 };
      }
      return { status: "SUCCESS", data: saved.data as T, replayed: true };
    },
    async write<T>(identity: Parameters<MemoryStore["write"]>[0], execute: Parameters<MemoryStore["write"]>[1]): Promise<MutationOutcome<T>> {
      const replay = await store.replay<T>(identity);
      if (replay.status !== "ABSENT") return replay;
      const current = [...rows(identity.actorId)];
      try {
        const data = await execute({
          findDuplicate: async hash => current.find(row => row.hash === hash)?.id ?? null,
          count: async () => current.length,
          insert: async input => {
            const id = String(++nextId);
            current.push({ id, content: input.content, kind: input.kind, hash: input.normalizedHash, vector: input.vector, model: input.model, createdAt: date, updatedAt: date });
            return id;
          },
          delete: async id => {
            const before = current.length;
            if (id === null) current.length = 0;
            else {
              const index = current.findIndex(row => row.id === id);
              if (index !== -1) current.splice(index, 1);
            }
            return before - current.length;
          },
        }) as T;
        owners.set(identity.actorId, current);
        ledger.set(scope(identity), { payload: JSON.stringify(identity.input), data });
        if (loseResponse) {
          loseResponse = false;
          return { status: "UNKNOWN", retryWithSameKey: true, error: { code: "OPERATION_STATUS_UNKNOWN", message: "Lost response" } };
        }
        return { status: "SUCCESS", data };
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        return { status: "FAILED", httpStatus: error.status, error: { code: error.code, message: error.message } };
      }
    },
  };
  return { ...store, loseNextWriteResponse: () => { loseResponse = true; } };
}
