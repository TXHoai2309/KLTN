import "server-only";
import { Prisma, type Database } from "@KLTN/db";
import { canonical, sha256 } from "../rag-processing/content-hash";
import type { DocumentChunk } from "../rag-processing/chunk-contract";
import type { EmbeddedChunk } from "../rag-processing/embedding-contract";
import { RagIndexError } from "./rag-index-errors";
import { contentVersionIdentity, generationIdentity } from "./rag-index-identity";
import { lockAndAssertRagIndexJobLease, type RagIndexJobLease } from "./rag-index-job-store";
import type { ContentVersionInput, GenerationProgress, IndexGenerationInput, PublishedGenerationMetadata } from "./rag-index-contract";

type Transaction = Prisma.TransactionClient;

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function sameChunk(row: { index: number; text: string; refs: unknown; locators: unknown; textHash: string; chunkHash: string; chunkerVersion: string }, chunk: DocumentChunk): boolean {
  return row.index === chunk.index && row.text === chunk.text && canonical(row.refs) === canonical(chunk.refs) &&
    canonical(row.locators) === canonical(chunk.locators) && row.textHash === chunk.textHash &&
    row.chunkHash === chunk.chunkHash && row.chunkerVersion === chunk.chunkerVersion;
}

function vectorString(vector: readonly number[]): string {
  if (!Array.isArray(vector)) throw new RagIndexError("INVALID_INDEX_INPUT");
  let squaredNorm = 0;
  for (const value of vector) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RagIndexError("INVALID_INDEX_INPUT");
    squaredNorm += value * value;
  }
  if (vector.length !== 1536 || !Number.isFinite(squaredNorm) || squaredNorm <= 0) throw new RagIndexError("INVALID_INDEX_INPUT");
  return `[${vector.map(value => Object.is(value, -0) ? "0" : String(value)).join(",")}]`;
}

function vectorDigest(vector: readonly number[]): string {
  return sha256(canonical(vector.map(value => Object.is(value, -0) ? 0 : value)));
}

async function lockGeneration(tx: Transaction, ragDocumentId: string, generationId: string) {
  const rows = await tx.$queryRaw<Array<{
    id: string; state: "BUILDING" | "READY"; embeddingProvider: string; embeddingModel: string;
    embeddingDimensions: number; tokenizer: string; tokenizerVersion: string;
    expectedChunkCount: number; expectedTokenCount: number; chunkerVersion: string;
  }>>(Prisma.sql`
    SELECT "id", "state"::text AS "state", "embeddingProvider", "embeddingModel", "embeddingDimensions",
      "tokenizer", "tokenizerVersion", "expectedChunkCount", "expectedTokenCount", "chunkerVersion"
    FROM "rag_index_generation"
    WHERE "id" = ${generationId} AND "ragDocumentId" = ${ragDocumentId}
    FOR UPDATE
  `);
  if (!rows[0]) throw new RagIndexError("RAG_DOCUMENT_NOT_FOUND");
  return rows[0];
}

async function readProgress(tx: Transaction, generationId: string) {
  const rows = await tx.$queryRaw<Array<{
    chunkCount: number; embeddingCount: number; tokenCount: number;
  }>>(Prisma.sql`
    SELECT count(c."id")::int AS "chunkCount", count(e."chunkId")::int AS "embeddingCount",
      COALESCE(sum(e."tokenCount"), 0)::int AS "tokenCount"
    FROM "rag_chunk" c
    LEFT JOIN "rag_chunk_embedding" e ON e."chunkId" = c."id"
    WHERE c."generationId" = ${generationId}
  `);
  return rows[0] ?? { chunkCount: 0, embeddingCount: 0, tokenCount: 0 };
}

async function assertComplete(tx: Transaction, generationId: string, expectedChunkCount: number, expectedTokenCount: number): Promise<GenerationProgress> {
  const progress = await readProgress(tx, generationId);
  const complete = progress.chunkCount === expectedChunkCount && progress.embeddingCount === expectedChunkCount && progress.tokenCount === expectedTokenCount;
  return {
    state: "BUILDING", expectedChunkCount, actualChunkCount: progress.chunkCount,
    actualEmbeddingCount: progress.embeddingCount, expectedTokenCount, actualTokenCount: progress.tokenCount, complete,
  };
}

export function createRagIndexStore(database: Database) {
  return {
    async createOrFindContentVersion(input: ContentVersionInput, lease?: RagIndexJobLease): Promise<{ id: string; identityHash: string }> {
      const identityHash = contentVersionIdentity(input);
      const where = { ragDocumentId_identityHash: { ragDocumentId: input.ragDocumentId, identityHash } };
      const select = { id: true, identityHash: true, originalBytesHash: true, normalizedContentHash: true, extractorVersion: true, normalizationVersion: true } as const;
      let row;
      try {
        const upsert = (target: Pick<Database, "ragContentVersion">) => target.ragContentVersion.upsert({
          where, create: { ...input, identityHash }, update: {}, select,
        });
        row = lease
          ? await database.$transaction(async tx => {
              const locked = await lockAndAssertRagIndexJobLease(tx, lease);
              if (locked.ragDocumentId !== input.ragDocumentId) throw new RagIndexError("JOB_LEASE_LOST");
              return tx.ragContentVersion.upsert({ where, create: { ...input, identityHash }, update: {}, select });
            })
          : await upsert(database);
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        const raced = await database.ragContentVersion.findUnique({ where, select });
        if (!raced) throw error;
        row = raced;
      }
      if (row.identityHash !== identityHash || row.originalBytesHash !== input.originalBytesHash || row.normalizedContentHash !== input.normalizedContentHash || row.extractorVersion !== input.extractorVersion || row.normalizationVersion !== input.normalizationVersion) {
        throw new RagIndexError("CONTENT_VERSION_CONFLICT");
      }
      return { id: row.id, identityHash };
    },

    async createOrFindGeneration(input: IndexGenerationInput, lease?: RagIndexJobLease): Promise<{ id: string; generationKey: string; state: "BUILDING" | "READY" }> {
      const generationKey = generationIdentity(input);
      const expectedTokenCount = input.embeddings.reduce((sum, item) => sum + item.tokenCount, 0);
      const where = { ragDocumentId_generationKey: { ragDocumentId: input.ragDocumentId, generationKey } };
      const select = { id: true, state: true, contentVersionId: true, chunkerVersion: true, chunkOptions: true, embeddingProvider: true, embeddingModel: true, embeddingDimensions: true, tokenizer: true, tokenizerVersion: true, expectedChunkCount: true, expectedTokenCount: true } as const;
      let row;
      try {
        const upsert = (target: Pick<Database, "ragIndexGeneration">) => target.ragIndexGeneration.upsert({
          where,
          create: {
            ragDocumentId: input.ragDocumentId,
            contentVersionId: input.contentVersionId,
            generationKey,
            chunkerVersion: input.chunkerVersion,
            chunkOptions: JSON.parse(JSON.stringify(input.chunkOptions)) as Prisma.InputJsonValue,
            embeddingProvider: input.provenance.provider,
            embeddingModel: input.provenance.model,
            embeddingDimensions: input.provenance.dimensions,
            tokenizer: input.provenance.tokenizer,
            tokenizerVersion: input.provenance.tokenizerVersion,
            expectedChunkCount: input.chunks.length,
            expectedTokenCount,
          },
          update: {},
          select,
        });
        row = lease
          ? await database.$transaction(async tx => {
              const locked = await lockAndAssertRagIndexJobLease(tx, lease);
              if (locked.ragDocumentId !== input.ragDocumentId) throw new RagIndexError("JOB_LEASE_LOST");
              return tx.ragIndexGeneration.upsert({
                where,
                create: {
                  ragDocumentId: input.ragDocumentId, contentVersionId: input.contentVersionId, generationKey,
                  chunkerVersion: input.chunkerVersion,
                  chunkOptions: JSON.parse(JSON.stringify(input.chunkOptions)) as Prisma.InputJsonValue,
                  embeddingProvider: input.provenance.provider, embeddingModel: input.provenance.model,
                  embeddingDimensions: input.provenance.dimensions, tokenizer: input.provenance.tokenizer,
                  tokenizerVersion: input.provenance.tokenizerVersion, expectedChunkCount: input.chunks.length,
                  expectedTokenCount,
                },
                update: {}, select,
              });
            })
          : await upsert(database);
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        const raced = await database.ragIndexGeneration.findUnique({ where, select });
        if (!raced) throw error;
        row = raced;
      }
      if (row.contentVersionId !== input.contentVersionId || row.chunkerVersion !== input.chunkerVersion || canonical(row.chunkOptions) !== canonical(input.chunkOptions) || row.embeddingProvider !== input.provenance.provider || row.embeddingModel !== input.provenance.model || row.embeddingDimensions !== input.provenance.dimensions || row.tokenizer !== input.provenance.tokenizer || row.tokenizerVersion !== input.provenance.tokenizerVersion || row.expectedChunkCount !== input.chunks.length || row.expectedTokenCount !== expectedTokenCount) {
        throw new RagIndexError("GENERATION_CONFLICT");
      }
      return { id: row.id, generationKey, state: row.state };
    },

    async persistChunks(ragDocumentId: string, generationId: string, chunks: readonly DocumentChunk[], lease?: RagIndexJobLease): Promise<number> {
      if (!Array.isArray(chunks) || chunks.length === 0 || new Set(chunks.map(chunk => chunk.index)).size !== chunks.length) throw new RagIndexError("INVALID_INDEX_INPUT");
      return database.$transaction(async tx => {
        if (lease) {
          const locked = await lockAndAssertRagIndexJobLease(tx, lease);
          if (locked.ragDocumentId !== ragDocumentId) throw new RagIndexError("JOB_LEASE_LOST");
        }
        const generation = await lockGeneration(tx, ragDocumentId, generationId);
        for (const chunk of chunks) {
          if (!Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= generation.expectedChunkCount || chunk.chunkerVersion !== generation.chunkerVersion ||
            typeof chunk.text !== "string" || chunk.text.trim().length === 0 || !Array.isArray(chunk.refs) || chunk.refs.length === 0 ||
            !Array.isArray(chunk.locators) || chunk.locators.length === 0 || !/^[a-f0-9]{64}$/u.test(chunk.textHash) || sha256(chunk.text) !== chunk.textHash ||
            !/^[a-f0-9]{64}$/u.test(chunk.chunkHash)) throw new RagIndexError("INVALID_INDEX_INPUT");
        }
        const indexes = chunks.map(chunk => chunk.index);
        if (generation.state === "BUILDING") {
          await tx.ragChunk.createMany({
            data: chunks.map(chunk => ({
              id: sha256(`rag-chunk\0${generationId}\0${chunk.index}\0${chunk.chunkHash}`),
              ragDocumentId, generationId, index: chunk.index, text: chunk.text,
              refs: JSON.parse(JSON.stringify(chunk.refs)) as Prisma.InputJsonValue,
              locators: JSON.parse(JSON.stringify(chunk.locators)) as Prisma.InputJsonValue,
              textHash: chunk.textHash, chunkHash: chunk.chunkHash, chunkerVersion: chunk.chunkerVersion,
            })),
            skipDuplicates: true,
          });
        }
        const rows = await tx.ragChunk.findMany({ where: { generationId, index: { in: indexes } }, orderBy: { index: "asc" }, select: { index: true, text: true, refs: true, locators: true, textHash: true, chunkHash: true, chunkerVersion: true } });
        const ordered = [...chunks].sort((a, b) => a.index - b.index);
        if (rows.length !== ordered.length || ordered.some((chunk, index) => !rows[index] || !sameChunk(rows[index]!, chunk))) throw new RagIndexError("CHUNK_CONFLICT");
        return rows.length;
      });
    },

    async persistEmbeddings(ragDocumentId: string, generationId: string, embeddings: readonly EmbeddedChunk[], lease?: RagIndexJobLease): Promise<number> {
      if (!Array.isArray(embeddings) || embeddings.length === 0 || embeddings.some(item => !item || !Number.isInteger(item.chunkIndex) || !Array.isArray(item.vector) || !item.provenance) || new Set(embeddings.map(item => item.chunkIndex)).size !== embeddings.length) throw new RagIndexError("INVALID_INDEX_INPUT");
      return database.$transaction(async tx => {
        let jobId: string | undefined;
        if (lease) {
          const locked = await lockAndAssertRagIndexJobLease(tx, lease);
          if (locked.ragDocumentId !== ragDocumentId) throw new RagIndexError("JOB_LEASE_LOST");
          const pending = locked.job.pendingBatchIndexes;
          const expected = [...embeddings.map(item => item.chunkIndex)].sort((a, b) => a - b);
          if (!Array.isArray(pending) || canonical(pending) !== canonical(expected)) throw new RagIndexError("JOB_LEASE_LOST");
          jobId = locked.job.id;
        }
        const generation = await lockGeneration(tx, ragDocumentId, generationId);
        if (generation.embeddingProvider !== "openai" || generation.embeddingModel !== "text-embedding-3-small" || generation.embeddingDimensions !== 1536 || generation.tokenizer !== "cl100k_base") throw new RagIndexError("GENERATION_CONFLICT");
        const indexes = embeddings.map(item => item.chunkIndex);
        if (indexes.some(index => !Number.isInteger(index) || index < 0 || index >= generation.expectedChunkCount)) throw new RagIndexError("INVALID_INDEX_INPUT");
        const chunks = await tx.ragChunk.findMany({ where: { generationId, index: { in: indexes } }, select: { id: true, index: true, textHash: true } });
        const byIndex = new Map(chunks.map(chunk => [chunk.index, chunk]));
        if (chunks.length !== embeddings.length) throw new RagIndexError("INVALID_INDEX_INPUT");
        for (const item of embeddings) {
          const chunk = byIndex.get(item.chunkIndex);
          if (!chunk || item.inputHash !== chunk.textHash || item.provenance.provider !== generation.embeddingProvider || item.provenance.model !== generation.embeddingModel || item.provenance.dimensions !== generation.embeddingDimensions || item.provenance.tokenizer !== generation.tokenizer || item.provenance.tokenizerVersion !== generation.tokenizerVersion || !Number.isInteger(item.tokenCount) || item.tokenCount < 1 || item.tokenCount > 8192) throw new RagIndexError("INVALID_INDEX_INPUT");
          const vector = vectorString(item.vector);
          const vectorHash = vectorDigest(item.vector);
          if (generation.state === "BUILDING") {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "rag_chunk_embedding" ("id", "chunkId", "inputHash", "vectorHash", "tokenCount", "embedding")
              VALUES (${sha256(`rag-embedding\0${chunk.id}`)}, ${chunk.id}, ${item.inputHash}, ${vectorHash}, ${item.tokenCount}, ${vector}::vector)
              ON CONFLICT ("chunkId") DO NOTHING
            `);
          }
          const saved = await tx.$queryRaw<Array<{ inputHash: string; vectorHash: string; tokenCount: number }>>(Prisma.sql`
            SELECT "inputHash", "vectorHash", "tokenCount" FROM "rag_chunk_embedding" WHERE "chunkId" = ${chunk.id}
          `);
          if (!saved[0] || saved[0].inputHash !== item.inputHash || saved[0].vectorHash !== vectorHash || saved[0].tokenCount !== item.tokenCount) throw new RagIndexError("EMBEDDING_CONFLICT");
        }
        if (jobId) {
          await tx.ragIndexJob.update({
            where: { id: jobId },
            data: { phase: "PERSISTING_EMBEDDINGS", pendingBatchIndexes: Prisma.DbNull },
            select: { id: true },
          });
        }
        return embeddings.length;
      });
    },

    async verifyPersistedEmbeddingMetadata(
      ragDocumentId: string,
      generationId: string,
      expected: readonly { chunkIndex: number; inputHash: string; tokenCount: number }[],
      lease?: RagIndexJobLease,
    ): Promise<void> {
      if (!expected.length || new Set(expected.map(item => item.chunkIndex)).size !== expected.length) throw new RagIndexError("INVALID_INDEX_INPUT");
      const indexes = expected.map(item => item.chunkIndex);
      if (indexes.some(index => !Number.isInteger(index) || index < 0)) throw new RagIndexError("INVALID_INDEX_INPUT");
      if (lease) {
        await database.$transaction(async tx => {
          const locked = await lockAndAssertRagIndexJobLease(tx, lease);
          if (locked.ragDocumentId !== ragDocumentId) throw new RagIndexError("JOB_LEASE_LOST");
        });
      }
      const rows = await database.$queryRaw<Array<{
        chunkIndex: number; textHash: string; inputHash: string; vectorHash: string; tokenCount: number;
      }>>(Prisma.sql`
        SELECT c."index" AS "chunkIndex", c."textHash", e."inputHash", e."vectorHash", e."tokenCount"
        FROM "rag_chunk" c
        JOIN "rag_chunk_embedding" e ON e."chunkId" = c."id"
        WHERE c."ragDocumentId" = ${ragDocumentId} AND c."generationId" = ${generationId}
          AND c."index" IN (${Prisma.join(indexes)})
      `);
      if (rows.length !== expected.length) throw new RagIndexError("EMBEDDING_CONFLICT");
      const actualByIndex = new Map(rows.map(row => [row.chunkIndex, row]));
      for (const item of expected) {
        const row = actualByIndex.get(item.chunkIndex);
        if (!row || row.textHash !== item.inputHash || row.inputHash !== item.inputHash || row.tokenCount !== item.tokenCount || !/^[a-f0-9]{64}$/u.test(row.vectorHash)) {
          throw new RagIndexError("EMBEDDING_CONFLICT");
        }
      }
    },

    async verifyGeneration(ragDocumentId: string, generationId: string, lease?: RagIndexJobLease): Promise<GenerationProgress> {
      return database.$transaction(async tx => {
        if (lease) {
          const locked = await lockAndAssertRagIndexJobLease(tx, lease);
          if (locked.ragDocumentId !== ragDocumentId || locked.job.pendingBatchIndexes !== null) throw new RagIndexError("JOB_LEASE_LOST");
        }
        const generation = await lockGeneration(tx, ragDocumentId, generationId);
        const progress = await assertComplete(tx, generationId, generation.expectedChunkCount, generation.expectedTokenCount);
        if (generation.state === "READY") return { ...progress, state: "READY", complete: progress.complete };
        if (!progress.complete) return progress;
        const updated = await tx.ragIndexGeneration.updateMany({ where: { id: generationId, ragDocumentId, state: "BUILDING" }, data: { state: "READY", readyAt: new Date() } });
        if (updated.count !== 1) throw new RagIndexError("GENERATION_CONFLICT");
        return { ...progress, state: "READY", complete: true };
      });
    },

    async publishReadyGeneration(ragDocumentId: string, generationId: string): Promise<void> {
      await database.$transaction(async tx => {
        const documents = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`SELECT "status"::text AS "status" FROM "rag_document" WHERE "id" = ${ragDocumentId} FOR UPDATE`);
        const status = documents[0]?.status;
        if (status !== "APPROVED" && status !== "INDEXED") throw new RagIndexError(status ? "DOCUMENT_NOT_ELIGIBLE" : "RAG_DOCUMENT_NOT_FOUND");
        const generation = await lockGeneration(tx, ragDocumentId, generationId);
        if (generation.state !== "READY") throw new RagIndexError("GENERATION_NOT_READY");
        const progress = await assertComplete(tx, generationId, generation.expectedChunkCount, generation.expectedTokenCount);
        if (!progress.complete) throw new RagIndexError("GENERATION_NOT_COMPLETE");
        const now = new Date();
        await tx.ragIndexPublication.upsert({
          where: { ragDocumentId },
          create: { ragDocumentId, generationId, publishedAt: now, updatedAt: now },
          update: { generationId, publishedAt: now, updatedAt: now },
          select: { id: true },
        });
      });
    },

    async finalizeReadyGeneration(ragDocumentId: string, generationId: string, lease: RagIndexJobLease): Promise<void> {
      await database.$transaction(async tx => {
        const locked = await lockAndAssertRagIndexJobLease(tx, lease);
        if (locked.ragDocumentId !== ragDocumentId || locked.documentStatus !== "APPROVED" && locked.documentStatus !== "INDEXED" || locked.job.pendingBatchIndexes !== null) {
          throw new RagIndexError("DOCUMENT_NOT_ELIGIBLE");
        }
        const generation = await lockGeneration(tx, ragDocumentId, generationId);
        if (generation.state !== "READY") throw new RagIndexError("GENERATION_NOT_READY");
        const progress = await assertComplete(tx, generationId, generation.expectedChunkCount, generation.expectedTokenCount);
        if (!progress.complete) throw new RagIndexError("GENERATION_NOT_COMPLETE");
        const now = new Date();
        await tx.ragIndexPublication.upsert({
          where: { ragDocumentId },
          create: { ragDocumentId, generationId, publishedAt: now, updatedAt: now },
          update: { generationId, publishedAt: now, updatedAt: now },
          select: { id: true },
        });
        const transitioned = await tx.$executeRaw(Prisma.sql`
          UPDATE "rag_document" SET "status" = 'INDEXED', "updatedAt" = ${now}
          WHERE "id" = ${ragDocumentId} AND "status" IN ('APPROVED', 'INDEXED')
        `);
        if (transitioned !== 1) throw new RagIndexError("DOCUMENT_NOT_ELIGIBLE");
        const completed = await tx.ragIndexJob.updateMany({
          where: { id: lease.jobId, status: "RUNNING", leaseToken: lease.leaseToken },
          data: { status: "COMPLETED", phase: "COMPLETED", leaseToken: null, leaseExpiresAt: null, failureCode: null, completedAt: now },
        });
        if (completed.count !== 1) throw new RagIndexError("JOB_LEASE_LOST");
      });
    },

    async getPublishedGenerationMetadata(ragDocumentId: string): Promise<PublishedGenerationMetadata | null> {
      const rows = await database.$queryRaw<PublishedGenerationMetadata[]>(Prisma.sql`
        SELECT d."id" AS "ragDocumentId", g."id" AS "generationId", g."contentVersionId", g."generationKey",
          g."chunkerVersion", g."embeddingProvider", g."embeddingModel", g."embeddingDimensions",
          g."tokenizer", g."tokenizerVersion", g."expectedChunkCount", g."expectedTokenCount"
        FROM "rag_index_publication" p
        JOIN "rag_document" d ON d."id" = p."ragDocumentId"
        JOIN "rag_index_generation" g ON g."id" = p."generationId" AND g."ragDocumentId" = d."id"
        WHERE d."id" = ${ragDocumentId} AND d."status" = 'INDEXED' AND g."state" = 'READY'
        LIMIT 1
      `);
      return rows[0] ?? null;
    },
  };
}
