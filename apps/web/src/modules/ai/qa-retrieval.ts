import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type Database } from "@KLTN/db";
import { qaCitationLocatorSchema, qaPublicCitationSchema, qaQuestionSchema, type QaPublicCitation } from "./qa-contract";
import type { QaEvidence, QaHistoryTurn, QaRetriever } from "./qa-runtime-contract";
import { EMBEDDING_PROVENANCE, type EmbeddingProvider } from "../rag-processing/embedding-contract";
import { EmbeddingError } from "../rag-processing/embedding-errors";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { createOpenAiEmbeddingProvider } from "../rag-processing/openai-embedding-provider";
import { isQaPublicMetadataSafe } from "./qa-public-safety";

type Reader = Pick<Database, "$queryRaw"> & Partial<Pick<Database, "$transaction">>;
type Row = { documentId: string; generationId: string; contentVersionId: string; chunkId: string;
  chunkHash: string; text: string; tokenCount: number; score: number; sourceTitle: string; fileType: string; locators: unknown };
export type QaRetrievalOptions = { provider?: EmbeddingProvider; topK?: number; maxEvidenceTokens?: number; minScore?: number; publicSourceIds?: ReadonlySet<string> };

async function boundedRead<T>(database: Reader, work: (reader: Pick<Database, "$queryRaw">) => Promise<T>): Promise<T> {
  // The query-only adapter exists for deterministic tests. Real Prisma readers
  // always scope statement_timeout to a transaction, never to a pooled session.
  if (!database.$transaction) return work(database);
  return database.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT set_config('statement_timeout', '5000ms', true)`);
    return work(tx);
  }, { maxWait: 5000, timeout: 7000 });
}

// Exact publication join prevents stale/building generations from becoming evidence.
const joins = Prisma.sql`FROM "rag_index_publication" p
  JOIN "rag_document" d ON d."id" = p."ragDocumentId"
  JOIN "rag_index_generation" g ON g."id" = p."generationId" AND g."ragDocumentId" = d."id"
  JOIN "rag_chunk" c ON c."generationId" = g."id" AND c."ragDocumentId" = d."id"
  JOIN "rag_chunk_embedding" e ON e."chunkId" = c."id"`;
const eligible = Prisma.sql`d."status" = 'INDEXED' AND g."state" = 'READY'
  AND g."embeddingProvider" = ${EMBEDDING_PROVENANCE.provider}
  AND g."embeddingModel" = ${EMBEDDING_PROVENANCE.model}
  AND g."embeddingDimensions" = ${EMBEDDING_PROVENANCE.dimensions}`;

function boundedInteger(value: number | undefined, fallback: number, ceiling: number): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > ceiling) throw new EmbeddingError("INVALID_INPUT", false);
  return result;
}

export function qaPublicSourceAlias(documentId: string): string {
  return `source_${createHash("sha256").update("kltn-public-rag-source-v1\0").update(documentId).digest("hex")}`;
}

export function projectQaLocators(fileType: string, raw: unknown): QaPublicCitation["locators"] {
  if (!Array.isArray(raw)) return [];
  const result: QaPublicCitation["locators"] = [];
  const seen = new Set<string>();
  for (const value of raw.slice(0, 100)) {
    if (!value || typeof value !== "object") continue;
    const origin = value as { format?: unknown; pageNumber?: unknown; section?: { title?: unknown } };
    const projection = fileType === "PDF" && origin.format === "PDF" ? { pageNumber: origin.pageNumber }
      : fileType === "DOCX" && origin.format === "DOCX" && origin.section ? { section: origin.section.title } : undefined;
    const parsed = qaCitationLocatorSchema.safeParse(projection);
    if (!parsed.success) continue;
    const key = JSON.stringify(parsed.data);
    if (!seen.has(key)) { seen.add(key); result.push(parsed.data); }
  }
  return result;
}

async function recheckWith(reader: Reader, evidence: readonly QaEvidence[], publicSourceIds: ReadonlySet<string>): Promise<boolean> {
  if (evidence.length === 0) return true;
  if (evidence.length > 20) return false;
  if (evidence.some(item => !publicSourceIds.has(item.documentId))) return false;
  const identities = evidence.map(item => Prisma.sql`(d."id" = ${item.documentId} AND g."id" = ${item.generationId}
    AND g."contentVersionId" = ${item.contentVersionId} AND c."id" = ${item.chunkId} AND c."chunkHash" = ${item.chunkHash})`);
  const rows = await reader.$queryRaw<Array<{ chunkId: string; documentId: string; generationId: string; contentVersionId: string; chunkHash: string }>>(Prisma.sql`SELECT c."id" AS "chunkId", d."id" AS "documentId", g."id" AS "generationId", g."contentVersionId", c."chunkHash" ${joins}
    WHERE ${eligible} AND (${Prisma.join(identities, " OR ")})`);
  return evidence.every(item => rows.some(row => row.chunkId === item.chunkId && row.documentId === item.documentId &&
    row.generationId === item.generationId && row.contentVersionId === item.contentVersionId && row.chunkHash === item.chunkHash));
}

/** Call inside the same transaction as completion. Disable and index publication
 * use this document lock too, so eligibility stays valid through the commit. */
export async function lockQaEvidenceEligibility(tx: Prisma.TransactionClient, evidence: readonly QaEvidence[], publicSourceIds: ReadonlySet<string> = new Set()): Promise<boolean> {
  if (evidence.length === 0) return true;
  if (evidence.length > 20) return false;
  if (evidence.some(item => !publicSourceIds.has(item.documentId))) return false;
  const ids = [...new Set(evidence.map(item => item.documentId))].sort();
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "rag_document" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
  return recheckWith(tx, evidence, publicSourceIds);
}

export function createQaRetriever(database: Reader, options: QaRetrievalOptions = {}): QaRetriever {
  const provider = options.provider ?? createOpenAiEmbeddingProvider();
  if (provider.provider !== EMBEDDING_PROVENANCE.provider || provider.model !== EMBEDDING_PROVENANCE.model || provider.dimensions !== 1536) throw new EmbeddingError("INVALID_INPUT", false);
  const topK = boundedInteger(options.topK, 6, 20);
  const maxEvidenceTokens = boundedInteger(options.maxEvidenceTokens, 6000, 12000);
  // This is a retrieval heuristic, not a semantic sufficiency certificate.
  const minScore = options.minScore ?? 0.25;
  // A database row does not prove that its title or headings may be disclosed.
  // Only source IDs explicitly approved by the server-side deployment allowlist
  // can become evidence; the empty default fails closed.
  const publicSourceIds = options.publicSourceIds ?? new Set<string>();
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) throw new EmbeddingError("INVALID_INPUT", false);
  return {
    async retrieve(question: string, history: readonly QaHistoryTurn[], signal?: AbortSignal): Promise<QaEvidence[]> {
      const normalized = qaQuestionSchema.parse(question);
      if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
      // Only authorized prior questions help resolve intent. Prior answers/citations
      // are never queried, projected, or returned as current evidence.
      const previousQuestions = history.slice(-2).map(turn => qaQuestionSchema.parse(turn.question));
      const query = [...previousQuestions, normalized].join("\n");
      if (countEmbeddingTokens(query) > 8191) throw new EmbeddingError("RESOURCE_LIMIT", false);
      const response = await provider.embed({ input: [query], signal });
      const vector = response[0]?.embedding;
      if (response.length !== 1 || response[0]?.index !== 0 || !Array.isArray(vector) || vector.length !== 1536 ||
        Array.from(vector).some(value => typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) {
        throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
      }
      // pgvector stores float32 values; reject vectors that become zero or overflow.
      const squaredNorm = vector.reduce((sum, value) => sum + Math.fround(value) ** 2, 0);
      if (!Number.isFinite(squaredNorm) || squaredNorm <= 0) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
      if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
      const vectorLiteral = `[${vector.join(",")}]`;
      const rows = await boundedRead(database, reader => reader.$queryRaw<Row[]>(Prisma.sql`SELECT d."id" AS "documentId", g."id" AS "generationId",
        g."contentVersionId", c."id" AS "chunkId", c."chunkHash", c."text", e."tokenCount",
        d."sourceTitle", d."fileType"::text AS "fileType", c."locators",
        (1 - (e."embedding" <=> ${vectorLiteral}::vector))::double precision AS "score"
        ${joins} WHERE ${eligible} AND e."tokenCount" > 0
        AND 1 - (e."embedding" <=> ${vectorLiteral}::vector) >= ${minScore}
        ORDER BY e."embedding" <=> ${vectorLiteral}::vector, d."id", g."id", c."index", c."id" LIMIT ${topK}`));
      if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
      const evidence: QaEvidence[] = [];
      let usedTokens = 0;
      for (const row of rows) {
        if (!publicSourceIds.has(row.documentId)) continue;
        if (!Number.isFinite(row.score) || row.score < minScore || !row.text.trim()) continue;
        const actualTokens = countEmbeddingTokens(row.text);
        if (!Number.isInteger(row.tokenCount) || actualTokens !== row.tokenCount || usedTokens + actualTokens > maxEvidenceTokens) continue;
        const citationId = `c${evidence.length + 1}`;
        const locators=projectQaLocators(row.fileType,row.locators);
        if(!isQaPublicMetadataSafe({title:row.sourceTitle,locators}))continue;
        const citation = qaPublicCitationSchema.safeParse({ id: citationId, sourceId: qaPublicSourceAlias(row.documentId),
          title: row.sourceTitle, sourceUrl: null, locators });
        if (!citation.success) continue;
        usedTokens += actualTokens;
        evidence.push({ citationId, documentId: row.documentId, generationId: row.generationId, contentVersionId: row.contentVersionId,
          chunkId: row.chunkId, chunkHash: row.chunkHash, text: row.text, tokenCount: actualTokens, score: row.score, citation: citation.data });
      }
      return evidence;
    },
    recheck: evidence => boundedRead(database, reader => recheckWith(reader, evidence, publicSourceIds)),
  };
}
