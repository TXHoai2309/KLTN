import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Database } from "@KLTN/db";
import { Prisma, PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { sha256 } from "../rag-processing/content-hash";
import { EMBEDDING_PROVENANCE } from "../rag-processing/embedding-contract";
import { createRagIndexStore } from "./rag-index-store";
import type { ContentVersionInput, IndexGenerationInput } from "./rag-index-contract";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.US19_TASK184_TEST_DATABASE_URL;
const disposableConfirmation = process.env.US19_TASK184_TEST_DISPOSABLE;
const expectedDisposableConfirmation = "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE";
const integrationDescribe = databaseUrl ? describe : describe.skip;

type ModelName = "RagContentVersion" | "RagIndexGeneration";

function assertSafeTestTarget(raw: string): void {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("Refusing Task184 integration test: invalid test-only database URL.");
  }
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    !allowedHosts.has(target.hostname) ||
    target.pathname.replace(/^\//u, "") !== "task184_test" ||
    target.username !== "task184_test" ||
    target.searchParams.get("sslmode") !== "disable" ||
    disposableConfirmation !== expectedDisposableConfirmation
  ) {
    throw new Error("Refusing Task184 integration test: only the explicitly confirmed disposable loopback database is allowed.");
  }
}

function createPairBarrier() {
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    arrivals += 1;
    if (arrivals === 2) release();
    await gate;
    return operation();
  };
}

async function runConcurrentPair<T>(operation: () => Promise<T>): Promise<[T, T]> {
  const barrier = createPairBarrier();
  return Promise.all([barrier(operation), barrier(operation)]);
}

function isP2002(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

integrationDescribe("US-19 Task184 REAL PostgreSQL concurrency (SKIPPED unless the test runner sets its explicit disposable URL)", () => {
  let prisma!: PrismaClient;
  let store!: ReturnType<typeof createRagIndexStore>;
  const observations = {
    p2002: new Map<ModelName, number>(),
    pendingRecoveryReads: new Map<ModelName, number>(),
    recoveredReadBacks: new Map<ModelName, number>(),
  };

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("US19_TASK184_TEST_DATABASE_URL was not provided.");
    assertSafeTestTarget(databaseUrl);

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const identity = await prisma.$queryRaw<Array<{ database: string; serverVersion: string }>>(Prisma.sql`
      SELECT current_database()::text AS "database", version()::text AS "serverVersion"
    `);
    expect(identity[0]?.database).toBe("task184_test");

    const extensions = await prisma.$queryRaw<Array<{ name: string; version: string }>>(Prisma.sql`
      SELECT extname::text AS "name", extversion::text AS "version"
      FROM pg_extension WHERE extname = 'vector'
    `);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]?.version).toMatch(/^0\.8\.6/u);

    const extended = prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const trackedModel = model === "RagContentVersion" || model === "RagIndexGeneration" ? model : undefined;
            const operationName = operation as string;
            try {
              const result = await query(args);
              if (trackedModel && operationName === "findUnique" && (observations.pendingRecoveryReads.get(trackedModel) ?? 0) > 0) {
                observations.pendingRecoveryReads.set(trackedModel, observations.pendingRecoveryReads.get(trackedModel)! - 1);
                observations.recoveredReadBacks.set(trackedModel, (observations.recoveredReadBacks.get(trackedModel) ?? 0) + 1);
              }
              return result;
            } catch (error) {
              if (trackedModel && operationName === "upsert" && isP2002(error)) {
                observations.p2002.set(trackedModel, (observations.p2002.get(trackedModel) ?? 0) + 1);
                observations.pendingRecoveryReads.set(trackedModel, (observations.pendingRecoveryReads.get(trackedModel) ?? 0) + 1);
              }
              throw error;
            }
          },
        },
      },
    });
    store = createRagIndexStore(extended as unknown as Database);

    const vectorColumn = await prisma.$queryRaw<Array<{ type: string }>>(Prisma.sql`
      SELECT format_type(a.atttypid, a.atttypmod)::text AS "type"
      FROM pg_attribute a
      WHERE a.attrelid = 'public.rag_chunk_embedding'::regclass AND a.attname = 'embedding'
    `);
    expect(vectorColumn[0]?.type).toBe("vector(1536)");

    const pgVersion = identity[0]?.serverVersion.match(/PostgreSQL ([0-9.]+)/u)?.[1] ?? "unknown";
    console.info(`[Task184 isolated PostgreSQL] PostgreSQL ${pgVersion}; pgvector ${extensions[0]!.version}`);
  }, 30_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("recovers real concurrent P2002 races outside aborted transactions and rejects mismatched provenance", async () => {
    const documentId = `task184-it-${randomUUID()}`;
    await prisma.ragDocument.create({
      data: {
        id: documentId,
        originalFileName: "synthetic-task184.txt",
        fileType: "TXT",
        mimeType: "text/plain",
        sizeBytes: 32,
        storagePath: `synthetic/${documentId}`,
        sourceTitle: "Synthetic Task184 integration record",
        uploadedById: "synthetic-integration-user",
        status: "APPROVED",
      },
    });

    const contentInputs: ContentVersionInput[] = Array.from({ length: 6 }, (_, index) => ({
      ragDocumentId: documentId,
      originalBytesHash: sha256(`synthetic-original-${index}`),
      normalizedContentHash: sha256(`synthetic-normalized-${index}`),
      extractorVersion: "integration-test-extractor-v1",
      normalizationVersion: "integration-test-normalization-v1",
    }));
    const contentResults = await Promise.all(contentInputs.map(async (input) => {
      const [left, right] = await runConcurrentPair(() => store.createOrFindContentVersion(input));
      expect(left).toEqual(right);
      expect(left.identityHash).toBeDefined();
      return left;
    }));

    const chunkText = "Synthetic Hà Giang integration content.";
    const chunk = {
      index: 0,
      text: chunkText,
      refs: [{ segmentId: "synthetic-segment", segmentStart: 0, segmentEnd: chunkText.length, chunkStart: 0, chunkEnd: chunkText.length }],
      locators: [{ format: "TXT" as const, lineStart: 1, lineEnd: 1 }],
      textHash: sha256(chunkText),
      chunkHash: sha256(`synthetic-chunk:${chunkText}`),
      chunkerVersion: "integration-test-chunker-v1",
    };
    const embedding = {
      chunkIndex: 0,
      inputHash: chunk.textHash,
      tokenCount: 1,
      vector: [1, ...Array<number>(1535).fill(0)],
      provenance: EMBEDDING_PROVENANCE,
    };
    const generationInputs: IndexGenerationInput[] = Array.from({ length: 6 }, (_, index) => ({
      ragDocumentId: documentId,
      contentVersionId: contentResults[0]!.id,
      chunkerVersion: chunk.chunkerVersion,
      chunkOptions: { maxChunkUtf16Units: 1000 + index, overlapUtf16Units: index },
      provenance: EMBEDDING_PROVENANCE,
      chunks: [chunk],
      embeddings: [embedding],
    }));
    const generationResults = await Promise.all(generationInputs.map(async (input) => {
      const [left, right] = await runConcurrentPair(() => store.createOrFindGeneration(input));
      expect(left).toEqual(right);
      expect(left.generationKey).toBeDefined();
      expect(left.state).toBe("BUILDING");
      return left;
    }));

    expect(observations.p2002.get("RagContentVersion") ?? 0).toBeGreaterThan(0);
    expect(observations.p2002.get("RagIndexGeneration") ?? 0).toBeGreaterThan(0);
    // A successful SELECT after a real PostgreSQL unique violation demonstrates
    // that the read-back uses a healthy query, outside the failed transaction.
    expect(observations.recoveredReadBacks.get("RagContentVersion") ?? 0).toBeGreaterThan(0);
    expect(observations.recoveredReadBacks.get("RagIndexGeneration") ?? 0).toBeGreaterThan(0);
    expect([...observations.pendingRecoveryReads.values()].every((count) => count === 0)).toBe(true);
    console.info(
      `[Task184 race recovery] P2002 content=${observations.p2002.get("RagContentVersion") ?? 0}, ` +
      `generation=${observations.p2002.get("RagIndexGeneration") ?? 0}; successful post-conflict read-backs verified.`,
    );

    const storedContentVersions = await prisma.ragContentVersion.findMany({
      where: { ragDocumentId: documentId },
      select: { id: true, ragDocumentId: true, identityHash: true, originalBytesHash: true, normalizedContentHash: true, extractorVersion: true, normalizationVersion: true },
    });
    for (const [index, input] of contentInputs.entries()) {
      expect(storedContentVersions).toContainEqual({ id: contentResults[index]!.id, identityHash: contentResults[index]!.identityHash, ...input });
    }

    const storedGenerations = await prisma.ragIndexGeneration.findMany({
      where: { ragDocumentId: documentId },
      select: {
        id: true, generationKey: true, contentVersionId: true, chunkerVersion: true, chunkOptions: true,
        embeddingProvider: true, embeddingModel: true, embeddingDimensions: true, tokenizer: true,
        tokenizerVersion: true, expectedChunkCount: true, expectedTokenCount: true,
      },
    });
    for (const [index, input] of generationInputs.entries()) {
      expect(storedGenerations).toContainEqual({
        id: generationResults[index]!.id,
        generationKey: generationResults[index]!.generationKey,
        contentVersionId: input.contentVersionId,
        chunkerVersion: input.chunkerVersion,
        chunkOptions: input.chunkOptions,
        embeddingProvider: input.provenance.provider,
        embeddingModel: input.provenance.model,
        embeddingDimensions: input.provenance.dimensions,
        tokenizer: input.provenance.tokenizer,
        tokenizerVersion: input.provenance.tokenizerVersion,
        expectedChunkCount: input.chunks.length,
        expectedTokenCount: input.embeddings.reduce((sum, item) => sum + item.tokenCount, 0),
      });
    }

    const contentReplay = await store.createOrFindContentVersion(contentInputs[0]!);
    const generationReplay = await store.createOrFindGeneration(generationInputs[0]!);
    expect(contentReplay).toEqual(contentResults[0]);
    expect(generationReplay).toEqual(generationResults[0]);

    const generationBeforeMismatch = await prisma.ragIndexGeneration.findUniqueOrThrow({
      where: { id: generationResults[0]!.id },
      select: { embeddingModel: true },
    });
    await prisma.ragIndexGeneration.update({
      where: { id: generationResults[0]!.id },
      data: { embeddingModel: "synthetic-mismatched-model" },
    });
    try {
      await expect(store.createOrFindGeneration(generationInputs[0]!)).rejects.toMatchObject({ code: "GENERATION_CONFLICT" });
    } finally {
      await prisma.ragIndexGeneration.update({
        where: { id: generationResults[0]!.id },
        data: { embeddingModel: generationBeforeMismatch.embeddingModel },
      });
    }

    expect(await prisma.ragContentVersion.count({ where: { ragDocumentId: documentId } })).toBe(contentInputs.length);
    expect(await prisma.ragIndexGeneration.count({ where: { ragDocumentId: documentId } })).toBe(generationInputs.length);
    expect(await prisma.ragIndexPublication.count({ where: { ragDocumentId: documentId } })).toBe(0);

    const duplicateContentIdentities = await prisma.ragContentVersion.groupBy({
      by: ["identityHash"],
      where: { ragDocumentId: documentId },
      _count: { identityHash: true },
    });
    const duplicateGenerationIdentities = await prisma.ragIndexGeneration.groupBy({
      by: ["generationKey"],
      where: { ragDocumentId: documentId },
      _count: { generationKey: true },
    });
    expect(duplicateContentIdentities.every((row) => row._count.identityHash === 1)).toBe(true);
    expect(duplicateGenerationIdentities.every((row) => row._count.generationKey === 1)).toBe(true);

    const orphanRows = await prisma.$queryRaw<Array<{
      contentVersions: number;
      generations: number;
      chunks: number;
      embeddings: number;
      publications: number;
    }>>(Prisma.sql`
      SELECT
        (SELECT count(*)::int FROM "rag_content_version" cv LEFT JOIN "rag_document" d ON d."id" = cv."ragDocumentId" WHERE d."id" IS NULL) AS "contentVersions",
        (SELECT count(*)::int FROM "rag_index_generation" g LEFT JOIN "rag_document" d ON d."id" = g."ragDocumentId" LEFT JOIN "rag_content_version" cv ON cv."ragDocumentId" = g."ragDocumentId" AND cv."id" = g."contentVersionId" WHERE d."id" IS NULL OR cv."id" IS NULL) AS "generations",
        (SELECT count(*)::int FROM "rag_chunk" c LEFT JOIN "rag_index_generation" g ON g."ragDocumentId" = c."ragDocumentId" AND g."id" = c."generationId" WHERE g."id" IS NULL) AS "chunks",
        (SELECT count(*)::int FROM "rag_chunk_embedding" e LEFT JOIN "rag_chunk" c ON c."id" = e."chunkId" WHERE c."id" IS NULL) AS "embeddings",
        (SELECT count(*)::int FROM "rag_index_publication" p LEFT JOIN "rag_index_generation" g ON g."ragDocumentId" = p."ragDocumentId" AND g."id" = p."generationId" WHERE g."id" IS NULL) AS "publications"
    `);
    expect(orphanRows[0]).toEqual({ contentVersions: 0, generations: 0, chunks: 0, embeddings: 0, publications: 0 });
  }, 60_000);
});
