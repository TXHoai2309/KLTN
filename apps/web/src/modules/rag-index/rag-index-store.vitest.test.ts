import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { sha256 } from "../rag-processing/content-hash";
import type { DocumentChunk } from "../rag-processing/chunk-contract";
import { EMBEDDING_PROVENANCE, type EmbeddedChunk } from "../rag-processing/embedding-contract";
import { generationIdentity } from "./rag-index-identity";
import { createRagIndexStore } from "./rag-index-store";

vi.mock("server-only", () => ({}));

type TestGeneration = {
  id: string; ragDocumentId: string; state: "BUILDING" | "READY"; embeddingProvider: string;
  embeddingModel: string; embeddingDimensions: number; tokenizer: string; tokenizerVersion: string;
  expectedChunkCount: number; expectedTokenCount: number; contentVersionId: string; generationKey: string; chunkerVersion: string;
  chunkOptions?: Record<string, number>;
};

function fakeDatabase(options: { contentVersionRaceCall?: number; generationRaceCall?: number } = {}) {
  const generations = new Map<string, TestGeneration>();
  const documentStatus = new Map<string, string>([["doc-1", "APPROVED"]]);
  const chunks = new Map<string, Record<string, unknown>>();
  const contentVersions = new Map<string, Record<string, unknown>>();
  const generationKeys = new Map<string, string>();
  const embeddings = new Map<string, { id: string; chunkId: string; inputHash: string; vectorHash: string; tokenCount: number; vector: string }>();
  const publications = new Map<string, { ragDocumentId: string; generationId: string }>();
  let vectorInsertCount = 0;
  let contentVersionUpsertCalls = 0;
  let generationUpsertCalls = 0;
  const keyForChunk = (generationId: string, index: number) => `${generationId}:${index}`;
  const queryText = (query: { sql?: string; strings?: string[] }) => query.sql ?? query.strings?.join(" ? ") ?? "";
  const db: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
    $queryRaw: async (query: { sql?: string; strings?: string[]; values?: unknown[] }) => {
      const sql = queryText(query); const values = query.values ?? [];
      if (sql.includes('FROM "rag_index_generation"') && sql.includes("FOR UPDATE")) {
        const generation = generations.get(String(values[0]));
        return generation && generation.ragDocumentId === values[1] ? [{ ...generation }] : [];
      }
      if (sql.includes('FROM "rag_chunk" c') && sql.includes('JOIN "rag_chunk_embedding" e ON e."chunkId" = c."id"') && !sql.includes("LEFT JOIN")) {
        const [ragDocumentId, generationId, ...indexes] = values.map(String);
        return [...chunks.values()]
          .filter(row => row.ragDocumentId === ragDocumentId && row.generationId === generationId && indexes.includes(String(row.index)))
          .flatMap(row => {
            const embedding = embeddings.get(String(row.id));
            return embedding ? [{ chunkIndex: Number(row.index), textHash: row.textHash, inputHash: embedding.inputHash, vectorHash: embedding.vectorHash, tokenCount: embedding.tokenCount }] : [];
          });
      }
      if (sql.includes('FROM "rag_chunk" c')) {
        const generationId = String(values[0]);
        const generationChunks = [...chunks.values()].filter(row => row.generationId === generationId);
        const embedded = generationChunks.map(row => embeddings.get(String(row.id))).filter(Boolean);
        return [{ chunkCount: generationChunks.length, embeddingCount: embedded.length, tokenCount: embedded.reduce((sum, row) => sum + row!.tokenCount, 0) }];
      }
      if (sql.includes('FROM "rag_document"') && sql.includes("FOR UPDATE")) {
        const status = documentStatus.get(String(values[0]));
        return status ? [{ status }] : [];
      }
      if (sql.includes('FROM "rag_chunk_embedding" WHERE "chunkId"')) {
        const row = embeddings.get(String(values[0]));
        return row ? [{ inputHash: row.inputHash, vectorHash: row.vectorHash, tokenCount: row.tokenCount }] : [];
      }
      if (sql.includes('FROM "rag_index_publication"')) {
        const publication = publications.get(String(values[0]));
        const generation = publication ? generations.get(publication.generationId) : undefined;
        if (!publication || documentStatus.get(String(values[0])) !== "INDEXED" || generation?.state !== "READY") return [];
        return [{
          ragDocumentId: publication.ragDocumentId, generationId: generation.id, contentVersionId: generation.contentVersionId,
          generationKey: generation.generationKey, chunkerVersion: generation.chunkerVersion,
          embeddingProvider: generation.embeddingProvider, embeddingModel: generation.embeddingModel,
          embeddingDimensions: generation.embeddingDimensions, tokenizer: generation.tokenizer,
          tokenizerVersion: generation.tokenizerVersion, expectedChunkCount: generation.expectedChunkCount,
          expectedTokenCount: generation.expectedTokenCount,
        }];
      }
      return [];
    },
    $executeRaw: async (query: { sql?: string; strings?: string[]; values?: unknown[] }) => {
      const sql = queryText(query); const values = query.values ?? [];
      if (sql.includes('INSERT INTO "rag_chunk_embedding"')) {
        const [id, chunkId, inputHash, vectorHash, tokenCount, vector] = values as [string, string, string, string, number, string];
        if (!embeddings.has(chunkId)) { embeddings.set(chunkId, { id, chunkId, inputHash, vectorHash, tokenCount, vector }); vectorInsertCount += 1; }
        return 1;
      }
      return 0;
    },
    ragChunk: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const row of data) {
          const key = keyForChunk(String(row.generationId), Number(row.index));
          if (!chunks.has(key)) chunks.set(key, row);
        }
        return { count: data.length };
      },
      findMany: async ({ where }: { where: { generationId: string; index?: { in: number[] } } }) => [...chunks.values()]
        .filter(row => row.generationId === where.generationId && (!where.index || where.index.in.includes(Number(row.index))))
        .sort((a, b) => Number(a.index) - Number(b.index)),
    },
    ragContentVersion: {
      upsert: async ({ where, create }: { where: { ragDocumentId_identityHash: { ragDocumentId: string; identityHash: string } }; create: Record<string, unknown> }) => {
        contentVersionUpsertCalls += 1;
        if (contentVersionUpsertCalls === options.contentVersionRaceCall) throw { code: "P2002" };
        const key = `${where.ragDocumentId_identityHash.ragDocumentId}:${where.ragDocumentId_identityHash.identityHash}`;
        let row = contentVersions.get(key);
        if (!row) { row = { id: `cv-${contentVersions.size + 1}`, ...create }; contentVersions.set(key, row); }
        return row;
      },
      findUnique: async ({ where }: { where: { ragDocumentId_identityHash: { ragDocumentId: string; identityHash: string } } }) => contentVersions.get(`${where.ragDocumentId_identityHash.ragDocumentId}:${where.ragDocumentId_identityHash.identityHash}`) ?? null,
    },
    ragIndexGeneration: {
      upsert: async ({ where, create }: { where: { ragDocumentId_generationKey: { ragDocumentId: string; generationKey: string } }; create: Record<string, unknown> }) => {
        generationUpsertCalls += 1;
        if (generationUpsertCalls === options.generationRaceCall) throw { code: "P2002" };
        const key = `${where.ragDocumentId_generationKey.ragDocumentId}:${where.ragDocumentId_generationKey.generationKey}`;
        let id = generationKeys.get(key);
        let row = id ? generations.get(id) : undefined;
        if (!row) {
          id = `generation-${generationKeys.size + 1}`;
          row = { id, state: "BUILDING", ...create } as TestGeneration;
          generations.set(id, row); generationKeys.set(key, id);
        }
        return row;
      },
      findUnique: async ({ where }: { where: { ragDocumentId_generationKey: { ragDocumentId: string; generationKey: string } } }) => {
        const id = generationKeys.get(`${where.ragDocumentId_generationKey.ragDocumentId}:${where.ragDocumentId_generationKey.generationKey}`);
        return id ? generations.get(id) ?? null : null;
      },
      updateMany: async ({ where, data }: { where: { id: string; ragDocumentId: string; state: string }; data: Partial<TestGeneration> }) => {
        const row = generations.get(where.id);
        if (!row || row.ragDocumentId !== where.ragDocumentId || row.state !== where.state) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    },
    ragIndexPublication: {
      upsert: async ({ where, create, update }: { where: { ragDocumentId: string }; create: { ragDocumentId: string; generationId: string }; update: { generationId: string } }) => {
        publications.set(where.ragDocumentId, { ragDocumentId: create.ragDocumentId, generationId: update.generationId }); return { id: "publication" };
      },
    },
  };
  return { database: db as Database, generations, contentVersions, documentStatus, chunks, embeddings, publications, get vectorInsertCount() { return vectorInsertCount; } };
}

const chunkInput = (texts: string[]): DocumentChunk[] => texts.map((text, index) => ({
  index, text, refs: [{ segmentId: `s${index}`, segmentStart: 0, segmentEnd: text.length, chunkStart: 0, chunkEnd: text.length }],
  locators: [{ format: "TXT", lineStart: index + 1, lineEnd: index + 1 }],
  textHash: sha256(text), chunkHash: sha256(`hash:${text}:${index}`), chunkerVersion: "structure-grapheme-v1",
}));
const embeddedInput = (chunks: DocumentChunk[]): EmbeddedChunk[] => chunks.map((chunk, index) => ({
  chunkIndex: chunk.index, inputHash: chunk.textHash, tokenCount: index + 3,
  vector: [1, ...Array<number>(1535).fill(0)], provenance: EMBEDDING_PROVENANCE,
}));

describe("US-19 Task184 versioned RAG persistence", () => {
  it("creates/finds stable identities and recovers concurrent unique-key races", async () => {
    const fake = fakeDatabase({ contentVersionRaceCall: 2, generationRaceCall: 2 }); const store = createRagIndexStore(fake.database);
    const content = {
      ragDocumentId: "doc-1", originalBytesHash: sha256("original"), normalizedContentHash: sha256("normalized"),
      extractorVersion: "txt-v1", normalizationVersion: "nfc-v1",
    };
    const firstVersion = await store.createOrFindContentVersion(content);
    const replayedVersion = await store.createOrFindContentVersion(content);
    expect(replayedVersion).toEqual(firstVersion);
    const chunks = chunkInput(["one"]); const embeddings = embeddedInput(chunks);
    const input = {
      ragDocumentId: "doc-1", contentVersionId: firstVersion.id, chunkerVersion: "structure-grapheme-v1",
      chunkOptions: { maxChunkUtf16Units: 1600, overlapUtf16Units: 200 }, provenance: EMBEDDING_PROVENANCE, chunks, embeddings,
    };
    const firstGeneration = await store.createOrFindGeneration(input);
    const replayedGeneration = await store.createOrFindGeneration(input);
    expect(replayedGeneration).toEqual(firstGeneration);
    expect(firstGeneration).toMatchObject({ state: "BUILDING", generationKey: generationIdentity(input) });
    expect(fake.generations.size).toBe(1);
  });

  it("derives a stable generation key independent of response order and rejects mismatched vectors", () => {
    const chunks = chunkInput(["một", "hai"]); const embeddings = embeddedInput(chunks);
    const base = { ragDocumentId: "doc-1", contentVersionId: "cv-1", chunkerVersion: "structure-grapheme-v1", chunkOptions: { maxChunkUtf16Units: 1600, overlapUtf16Units: 200 }, provenance: EMBEDDING_PROVENANCE, chunks, embeddings };
    expect(generationIdentity(base)).toBe(generationIdentity({ ...base, embeddings: [...embeddings].reverse() }));
    expect(generationIdentity(base)).not.toBe(generationIdentity({ ...base, chunkerVersion: "chunker-v2", chunks: chunks.map(chunk => ({ ...chunk, chunkerVersion: "chunker-v2" })) }));
    expect(() => generationIdentity({ ...base, embeddings: embeddings.map(item => ({ ...item, inputHash: "0".repeat(64) })) })).toThrowError("INVALID_INDEX_INPUT");
  });

  it("replays canonical chunks and vectors idempotently and rejects mismatched replay content", async () => {
    const fake = fakeDatabase(); const store = createRagIndexStore(fake.database);
    const chunks = chunkInput(["Hà Giang", "địa chất"]); const embeddings = embeddedInput(chunks);
    fake.generations.set("gen-1", {
      id: "gen-1", ragDocumentId: "doc-1", state: "BUILDING", embeddingProvider: "openai", embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536, tokenizer: "cl100k_base", tokenizerVersion: "js-tiktoken@1.0.21", expectedChunkCount: 2,
      expectedTokenCount: 7, contentVersionId: "cv-1", generationKey: "g".repeat(64), chunkerVersion: "structure-grapheme-v1",
    });
    expect(await store.persistChunks("doc-1", "gen-1", chunks.slice(0, 1))).toBe(1);
    expect(await store.persistChunks("doc-1", "gen-1", chunks.slice(1))).toBe(1);
    expect(await store.persistChunks("doc-1", "gen-1", chunks)).toBe(2);
    expect(fake.chunks.size).toBe(2);
    expect(await store.persistEmbeddings("doc-1", "gen-1", embeddings.slice(0, 1))).toBe(1);
    expect(await store.persistEmbeddings("doc-1", "gen-1", embeddings.slice(1))).toBe(1);
    expect(await store.persistEmbeddings("doc-1", "gen-1", embeddings)).toBe(2);
    expect(fake.vectorInsertCount).toBe(2);
    expect([...fake.embeddings.values()].every(row => row.vector.startsWith("[") && row.vector.split(",").length === 1536)).toBe(true);
    await expect(store.persistChunks("doc-1", "gen-1", [{ ...chunks[0]!, chunkHash: sha256("different canonical chunk") }, chunks[1]!])).rejects.toMatchObject({ code: "CHUNK_CONFLICT" });
    await expect(store.persistEmbeddings("doc-1", "gen-1", [{ ...embeddings[0]!, vector: [2, ...Array<number>(1535).fill(0)] }])).rejects.toMatchObject({ code: "EMBEDDING_CONFLICT" });
    expect(fake.vectorInsertCount).toBe(2);
  });

  it("marks READY only after all chunk embeddings and token totals match", async () => {
    const fake = fakeDatabase(); const store = createRagIndexStore(fake.database);
    const chunks = chunkInput(["one", "two"]); const embeddings = embeddedInput(chunks);
    fake.generations.set("gen-1", {
      id: "gen-1", ragDocumentId: "doc-1", state: "BUILDING", embeddingProvider: "openai", embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536, tokenizer: "cl100k_base", tokenizerVersion: "js-tiktoken@1.0.21", expectedChunkCount: 2,
      expectedTokenCount: 7, contentVersionId: "cv-1", generationKey: "g".repeat(64), chunkerVersion: "structure-grapheme-v1",
    });
    await store.persistChunks("doc-1", "gen-1", chunks);
    expect(await store.verifyGeneration("doc-1", "gen-1")).toMatchObject({ state: "BUILDING", actualChunkCount: 2, actualEmbeddingCount: 0, complete: false });
    await store.persistEmbeddings("doc-1", "gen-1", embeddings.slice(0, 1));
    expect(await store.verifyGeneration("doc-1", "gen-1")).toMatchObject({ state: "BUILDING", actualEmbeddingCount: 1, complete: false });
    await store.persistEmbeddings("doc-1", "gen-1", embeddings.slice(1));
    expect(await store.verifyGeneration("doc-1", "gen-1")).toMatchObject({ state: "READY", actualEmbeddingCount: 2, actualTokenCount: 7, complete: true });
    expect(await store.verifyGeneration("doc-1", "gen-1")).toMatchObject({ state: "READY", complete: true });
  });

  it("verifies resumed persisted embedding metadata against current chunk identity", async () => {
    const fake = fakeDatabase(); const store = createRagIndexStore(fake.database);
    const chunks = chunkInput(["Hà Giang source text"]); const embeddings = embeddedInput(chunks);
    fake.generations.set("gen-1", {
      id: "gen-1", ragDocumentId: "doc-1", state: "BUILDING", embeddingProvider: "openai", embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536, tokenizer: "cl100k_base", tokenizerVersion: "js-tiktoken@1.0.21", expectedChunkCount: 1,
      expectedTokenCount: 3, contentVersionId: "cv-1", generationKey: "g".repeat(64), chunkerVersion: "structure-grapheme-v1",
    });
    await store.persistChunks("doc-1", "gen-1", chunks);
    await store.persistEmbeddings("doc-1", "gen-1", embeddings);
    await expect(store.verifyPersistedEmbeddingMetadata("doc-1", "gen-1", [{
      chunkIndex: 0, inputHash: chunks[0]!.textHash, tokenCount: embeddings[0]!.tokenCount,
    }])).resolves.toBeUndefined();
    await expect(store.verifyPersistedEmbeddingMetadata("doc-1", "gen-1", [{
      chunkIndex: 0, inputHash: sha256("different input"), tokenCount: embeddings[0]!.tokenCount,
    }])).rejects.toMatchObject({ code: "EMBEDDING_CONFLICT" });
  });

  it("uses one publication pointer, keeps old generations, and excludes APPROVED or DISABLED documents from retrieval metadata", async () => {
    const fake = fakeDatabase(); const store = createRagIndexStore(fake.database);
    for (const id of ["gen-1", "gen-2"]) {
      const chunks = chunkInput([`synthetic ${id}`]);
      const embeddings = embeddedInput(chunks);
      fake.generations.set(id, {
      id, ragDocumentId: "doc-1", state: "BUILDING", embeddingProvider: "openai", embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536, tokenizer: "cl100k_base", tokenizerVersion: "js-tiktoken@1.0.21", expectedChunkCount: 1,
      expectedTokenCount: 3, contentVersionId: `cv-${id}`, generationKey: sha256(id), chunkerVersion: "structure-grapheme-v1",
      });
      await store.persistChunks("doc-1", id, chunks);
      await store.persistEmbeddings("doc-1", id, embeddings);
      await store.verifyGeneration("doc-1", id);
    }
    await store.publishReadyGeneration("doc-1", "gen-1");
    expect(fake.publications.get("doc-1")?.generationId).toBe("gen-1");
    expect(await store.getPublishedGenerationMetadata("doc-1")).toBeNull();
    fake.documentStatus.set("doc-1", "INDEXED");
    expect(await store.getPublishedGenerationMetadata("doc-1")).toMatchObject({ generationId: "gen-1", embeddingModel: "text-embedding-3-small" });
    await store.publishReadyGeneration("doc-1", "gen-2");
    expect(fake.publications.get("doc-1")?.generationId).toBe("gen-2");
    expect(fake.generations.has("gen-1")).toBe(true);
    fake.documentStatus.set("doc-1", "DISABLED");
    expect(await store.getPublishedGenerationMetadata("doc-1")).toBeNull();
    await expect(store.publishReadyGeneration("doc-1", "gen-2")).rejects.toMatchObject({ code: "DOCUMENT_NOT_ELIGIBLE" });
  });
});
