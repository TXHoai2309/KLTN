import "server-only";
import { createHash } from "node:crypto";
import type { MutationOutcome } from "../../lib/mutation-contract";
import type { TravelerActor } from "../../server/auth/require-traveler";
import { AppError } from "../../server/http/app-error";
import { EMBEDDING_PROVENANCE, type EmbeddingProvider } from "../rag-processing/embedding-contract";
import { MEMORY_LIMIT, memoryInputSchema, memoryTextSchema, type MemoryInput } from "./memory-contract";
import { isSensitiveMemory, normalizeMemory, permitsRemember } from "./memory-privacy";
import type { MemoryStore } from "./memory-store";

export type RememberSource = { messageId?: string; text: string };
const unavailable = () => new AppError("MEMORY_UNAVAILABLE", "Bộ nhớ chưa sẵn sàng. Vui lòng thử lại sau.", 503);
const notFound = () => new AppError("NOT_FOUND", "Không tìm thấy mục bộ nhớ.", 404);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const failure = (error: AppError): MutationOutcome<never> => ({
  status: "FAILED", httpStatus: error.status, error: { code: error.code, message: error.message },
});
const unconfirmed = (): MutationOutcome<never> => ({
  status: "UNKNOWN", retryWithSameKey: true,
  error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa thể xác nhận đã nhớ. Chỉ thử lại cùng nội dung và cùng yêu cầu." },
});

export function createMemoryService(store: MemoryStore, provider: EmbeddingProvider) {
  async function embed(text: string, signal?: AbortSignal): Promise<number[]> {
    try {
      signal?.throwIfAborted();
      const { provider: vendor, model, dimensions } = EMBEDDING_PROVENANCE;
      if (provider.provider !== vendor || provider.model !== model || provider.dimensions !== dimensions) throw unavailable();
      const response = await provider.embed({ input: [text], signal });
      const item = response[0];
      if (response.length !== 1 || item?.index !== 0 || !Array.isArray(item.embedding) || item.embedding.length !== dimensions) throw unavailable();
      const vector = Array.from(item.embedding, value => typeof value === "number" ? Math.fround(value) : NaN);
      if (vector.some(value => !Number.isFinite(value)) || !vector.some(value => value !== 0)) throw unavailable();
      signal?.throwIfAborted();
      return vector;
    } catch {
      throw unavailable();
    }
  }

  async function confirm(userId: string, outcome: MutationOutcome<{ id: string }>): Promise<MutationOutcome<{ id: string }>> {
    if (outcome.status !== "SUCCESS") return outcome;
    try {
      return await store.exists(userId, outcome.data.id) ? outcome : failure(notFound());
    } catch {
      return unconfirmed();
    }
  }

  async function remove(actor: TravelerActor, id: string | null, key: string) {
    return store.write({ actorId: actor.userId, operation: "memory:delete", key, input: { id } }, async tx => {
      const count = await tx.delete(id);
      if (id !== null && count === 0) throw notFound();
      return { count };
    });
  }

  return {
    async save(actor: TravelerActor, input: MemoryInput, source: RememberSource, signal?: AbortSignal): Promise<MutationOutcome<{ id: string }>> {
      const parsed = memoryInputSchema.safeParse(input);
      if (!parsed.success || !permitsRemember(parsed.data, source.text)) {
        return failure(new AppError("MEMORY_NOT_ALLOWED", "Chỉ có thể lưu yêu cầu ghi nhớ hoặc sở thích du lịch rõ ràng. Dữ liệu nhạy cảm không được lưu.", 422));
      }
      const payload = parsed.data;
      const normalizedHash = hash(normalizeMemory(payload.content));
      // The client preserves the latest user message ID across retries, so the model supplies neither identity nor key.
      const key = hash(JSON.stringify([source.messageId || source.text, normalizedHash]));
      const identity = { actorId: actor.userId, operation: "memory:remember", key, input: payload };
      const replay = await store.replay<{ id: string }>(identity);
      if (replay.status !== "ABSENT") return confirm(actor.userId, replay);
      let vector: number[];
      try {
        vector = await embed(payload.content, signal);
      } catch {
        return failure(unavailable());
      }
      const outcome = await store.write(identity, async tx => {
        const existing = await tx.findDuplicate(normalizedHash);
        if (existing) return { id: existing };
        if (await tx.count() >= MEMORY_LIMIT) {
          throw new AppError("MEMORY_LIMIT", "Bộ nhớ đã đủ 100 mục. Hãy xóa một mục trước khi lưu thêm.", 409);
        }
        const id = await tx.insert({ ...payload, normalizedHash, vector, model: EMBEDDING_PROVENANCE.model });
        return { id };
      });
      // Persist only the identifier in the idempotency ledger, then check the record after commit.
      return confirm(actor.userId, outcome);
    },
    list: (actor: TravelerActor) => store.list(actor.userId),
    async recall(actor: TravelerActor, query: string, signal?: AbortSignal) {
      const parsed = memoryTextSchema.safeParse(query);
      if (!parsed.success || isSensitiveMemory(parsed.data)) throw new AppError("MEMORY_QUERY_NOT_ALLOWED", "Không thể dùng dữ liệu nhạy cảm hoặc truy vấn không hợp lệ để tìm bộ nhớ.", 422);
      const vector = await embed(parsed.data, signal);
      return store.recall(actor.userId, vector, EMBEDDING_PROVENANCE.model);
    },
    delete: (actor: TravelerActor, id: string, key: string) => remove(actor, id, key),
    deleteAll: (actor: TravelerActor, key: string) => remove(actor, null, key),
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
