import "server-only";
import { randomUUID } from "node:crypto";
import type { Database, Prisma } from "@KLTN/db";
import type { MutationOutcome } from "../../lib/mutation-contract";
import { AppError } from "../../server/http/app-error";
import { executeIdempotentWrite, preflightIdempotentReplay } from "../../server/http/idempotency";
import { MEMORY_LIMIT, type MemoryInput, type MemoryItem } from "./memory-contract";

export const MEMORY_TOP_K = 5;
// Require at least moderate cosine similarity before putting private memories in model context.
// This conservative starting point is adjustable after relevance measurements with real embeddings.
export const MEMORY_MIN_SIMILARITY = 0.5;

type Identity = { actorId: string; operation: string; key: string; input: unknown };
type NewMemory = MemoryInput & { normalizedHash: string; vector: number[]; model: string };
type MemoryTransaction = {
  findDuplicate(normalizedHash: string): Promise<string | null>;
  count(): Promise<number>;
  insert(input: NewMemory): Promise<string>;
  delete(id: string | null): Promise<number>;
};
export type MemoryStore = {
  list(userId: string): Promise<MemoryItem[]>;
  exists(userId: string, id: string): Promise<boolean>;
  recall(userId: string, vector: number[], model: string): Promise<MemoryInput[]>;
  replay<T>(identity: Identity): Promise<MutationOutcome<T> | { status: "ABSENT" }>;
  write<T>(identity: Identity, execute: (transaction: MemoryTransaction) => Promise<T>): Promise<MutationOutcome<T>>;
};

function ownerTransaction(tx: Prisma.TransactionClient, userId: string): MemoryTransaction {
  return {
    async findDuplicate(normalizedHash) {
      const row = await tx.travelerMemory.findUnique({
        where: { userId_normalizedHash: { userId, normalizedHash } }, select: { id: true },
      });
      return row?.id ?? null;
    },
    count: () => tx.travelerMemory.count({ where: { userId } }),
    async insert(input) {
      const id = randomUUID();
      const vector = `[${input.vector.join(",")}]`;
      await tx.$executeRaw`
        INSERT INTO "traveler_memory" ("id","userId","content","normalizedHash","kind","embedding","embeddingModel","updatedAt")
        VALUES (${id}, ${userId}, ${input.content}, ${input.normalizedHash}, ${input.kind}::"TravelerMemoryKind",
          ${vector}::vector, ${input.model}, CURRENT_TIMESTAMP)`;
      return id;
    },
    async delete(id) {
      const result = await tx.travelerMemory.deleteMany({ where: { userId, ...(id === null ? {} : { id }) } });
      return result.count;
    },
  };
}

export function createMemoryStore(database: Database): MemoryStore {
  return {
    async list(userId) {
      const rows = await database.travelerMemory.findMany({
        where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MEMORY_LIMIT,
        select: { id: true, content: true, kind: true, createdAt: true, updatedAt: true },
      });
      return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
    },
    async exists(userId, id) {
      return Boolean(await database.travelerMemory.findFirst({ where: { userId, id }, select: { id: true } }));
    },
    recall(userId, vector, model) {
      const literal = `[${vector.join(",")}]`;
      return database.$queryRaw<MemoryInput[]>`
        SELECT "content", "kind"::text AS "kind"
        FROM "traveler_memory"
        WHERE "userId" = ${userId} AND "embeddingModel" = ${model}
          AND ("embedding" <=> ${literal}::vector) <= ${1 - MEMORY_MIN_SIMILARITY}
        ORDER BY "embedding" <=> ${literal}::vector, "id"
        LIMIT ${MEMORY_TOP_K}`;
    },
    replay: identity => preflightIdempotentReplay({ ...identity, database }),
    write: (identity, execute) => executeIdempotentWrite({
      ...identity,
      database,
      execute: async tx => {
        // Serialize saves and deletes for this user across processes, keeping the cap atomic.
        const owner = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "user" WHERE "id" = ${identity.actorId} FOR UPDATE`;
        if (!owner.length) throw new AppError("NOT_FOUND", "Không tìm thấy mục bộ nhớ.", 404);
        return execute(ownerTransaction(tx, identity.actorId));
      },
    }),
  };
}
