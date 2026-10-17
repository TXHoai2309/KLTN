import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createPrismaClient, Prisma, type Database } from "@KLTN/db";
import { createQaRetriever } from "./qa-retrieval";
import { qaCorpusReviewCases } from "./__fixtures__/qa-corpus-review-cases";
vi.mock("server-only", () => ({}));

// Bounded opt-in: 40 embedding requests, no generation, no writes to the DB.
describe.skipIf(process.env.QA_CORPUS_RECALL !== "1")("approved development corpus literal-source recall (not semantic acceptance)", () => {
  it("measures 40 fixed named/attribute/punctuation/unaccented variants", async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development" || target.hostname !== process.env.QA_RUNTIME_ALLOWED_DATABASE_HOST || decodeURIComponent(target.pathname.slice(1)) !== process.env.QA_RUNTIME_ALLOWED_DATABASE_NAME) throw new Error("Development target mismatch");
    const ids = (process.env.QA_PUBLIC_SOURCE_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
    if (!ids.length) throw new Error("No approved sources");
    const db = createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL! });
    const read = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(async tx => { await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$queryRawUnsafe("SELECT set_config('statement_timeout', '5000ms', true)"); return work(tx); }, { timeout: 10000 });
    const reader = { $queryRaw: (query: Parameters<Database["$queryRaw"]>[0]) => read(tx => tx.$queryRaw(query)) } as unknown as Database;
    try {
      const snapshot = await read(tx => tx.$queryRaw<{ text: string; id: string; chunkHash: string; generationId: string }[]>(Prisma.sql`SELECT c.text,c.id,c."chunkHash",g.id AS "generationId" FROM "rag_index_publication" p JOIN "rag_document" d ON d.id=p."ragDocumentId" JOIN "rag_index_generation" g ON g.id=p."generationId" JOIN "rag_chunk" c ON c."generationId"=g.id WHERE d.status='INDEXED' AND g.state='READY' AND g."embeddingModel"='text-embedding-3-small' AND g."embeddingDimensions"=1536 AND d.id IN (${Prisma.join(ids)}) ORDER BY c.id`));
      const snapshotSha256 = createHash("sha256").update(JSON.stringify(snapshot.map(({ text: _text, ...identity }) => identity))).digest("hex");
      const retriever = createQaRetriever(reader, { publicSourceIds: new Set(ids), topK: 4, maxEvidenceTokens: 3000, hybrid: process.env.QA_RECALL_HYBRID === "1" });
      const results = [];
      for (const test of qaCorpusReviewCases) {
        const available = snapshot.some(row => row.text.includes(test.requiredText));
        const start = Date.now(); const evidence = await retriever.retrieve(test.question, []);
        results.push({ id: test.id, available, recalled: evidence.some(row => row.text.includes(test.requiredText)), chunks: evidence.length, elapsedMs: Date.now() - start });
      }
      const report = { evidenceClass: "LITERAL_SOURCE_RECALL_NOT_SEMANTIC_ACCEPTANCE", ownerReview: "PENDING", hybrid: process.env.QA_RECALL_HYBRID === "1", snapshotSha256, eligibleChunks: snapshot.length, total: results.length, available: results.filter(row => row.available).length, recalled: results.filter(row => row.available && row.recalled).length, results };
      console.info("QA_CORPUS_RECALL", JSON.stringify(report));
      if (process.env.QA_RECALL_REPORT) await writeFile(process.env.QA_RECALL_REPORT, JSON.stringify(report, null, 2));
      expect(results).toHaveLength(40); expect(report.available).toBe(40);
      // Measure misses, never rerun to hide them or equate literal recall with truth.
    } finally { await db.$disconnect(); }
  }, 180000);
});
