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
import { qaOrigin, qaProviderInvoked, qaProviderMetadata, qaStage } from "./qa-diagnostics";
import { destinationEvidenceSentences } from "./qa-destination-context";
import { qaFactualQuestion, qaIntentHistory } from "./qa-question-understanding";

type Reader = Pick<Database, "$queryRaw"> & Partial<Pick<Database, "$transaction">>;
type Row = { documentId: string; generationId: string; contentVersionId: string; chunkId: string;
  chunkHash: string; text: string; tokenCount: number; score: number; sourceTitle: string; fileType: string; locators: unknown };
export type QaRetrievalOptions = { provider?: EmbeddingProvider; topK?: number; maxEvidenceTokens?: number; minScore?: number; publicSourceIds?: ReadonlySet<string>; hybrid?: boolean };

const searchStopWords = new Set("tôi mình muốn tìm hiểu về ở đâu là của có thì sao vào cho một các những và theo trong được nào bao nhiêu thế này đó nổi bật bạn thể giới thiệu".split(" "));
export function qaKeywordQuery(question: string): string {
  const text = qaFactualQuestion(question);
  const folded = text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
  // Attribute vocabulary only, no destination-specific facts or gold answers.
  // Keep tsquery operators authored here; user tokens are letters/digits only.
  if (/gio.*(?:mo|dong|hoat)|mo.*dong.*cua/u.test(folded)) return "gio & (cua | hoat)";
  if (/dien tich/u.test(folded)) return "dien & tich";
  if (/nhom dan toc|bao nhieu.*dan toc/u.test(folded)) return "dan & toc";
  if (/dinh.*cao nhat/u.test(folded)) return "dinh & cao";
  if (/gioi thieu|tim hieu/u.test(folded) && !/gia|phi|gio mo/u.test(folded)) return "mo & ta";
  const words = /(?:^|\s)(?:giá|vé|phí|gia|phi)(?:\s|$)/u.test(text)
    ? ["giá", "vé", "phí"]
    : (text.match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => !searchStopWords.has(word));
  // Search form only: original text/negation/numbers still reach embedding and
  // semantic review. No keyword overlap can certify an answer.
  return [...new Set(words.map(word => word.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d")))].slice(0, 16).join(" | ");
}

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
const eligible = Prisma.sql`d."status" = 'INDEXED' AND d."publicQaApproved" = true AND g."state" = 'READY'
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

async function recheckWith(reader: Reader, evidence: readonly QaEvidence[], publicSourceIds?: ReadonlySet<string>): Promise<boolean> {
  if (evidence.length === 0) return true;
  if (evidence.length > 20) return false;
  if (publicSourceIds && evidence.some(item => !publicSourceIds.has(item.documentId))) return false;
  const identities = evidence.map(item => Prisma.sql`(d."id" = ${item.documentId} AND g."id" = ${item.generationId}
    AND g."contentVersionId" = ${item.contentVersionId} AND c."id" = ${item.chunkId} AND c."chunkHash" = ${item.chunkHash})`);
  const rows = await reader.$queryRaw<Array<{ chunkId: string; documentId: string; generationId: string; contentVersionId: string; chunkHash: string }>>(Prisma.sql`SELECT c."id" AS "chunkId", d."id" AS "documentId", g."id" AS "generationId", g."contentVersionId", c."chunkHash" ${joins}
    WHERE ${eligible} AND (${Prisma.join(identities, " OR ")})`);
  return evidence.every(item => rows.some(row => row.chunkId === item.chunkId && row.documentId === item.documentId &&
    row.generationId === item.generationId && row.contentVersionId === item.contentVersionId && row.chunkHash === item.chunkHash));
}

/** Call inside the same transaction as completion. Disable and index publication
 * use this document lock too, so eligibility stays valid through the commit. */
export async function lockQaEvidenceEligibility(tx: Prisma.TransactionClient, evidence: readonly QaEvidence[], publicSourceIds?: ReadonlySet<string>): Promise<boolean> {
  if (evidence.length === 0) return true;
  if (evidence.length > 20) return false;
  if (publicSourceIds && evidence.some(item => !publicSourceIds.has(item.documentId))) return false;
  const ids = [...new Set(evidence.map(item => item.documentId))].sort();
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "rag_document" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
  return recheckWith(tx, evidence, publicSourceIds);
}

export function createQaRetriever(database: Reader, options: QaRetrievalOptions = {}): QaRetriever {
  const provider = options.provider ?? createOpenAiEmbeddingProvider({ fetcher: async (url, init) => {
    qaProviderInvoked("embedding");
    const response = await fetch(url, init);
    qaProviderMetadata("embedding", response);
    return response;
  } });
  if (provider.provider !== EMBEDDING_PROVENANCE.provider || provider.model !== EMBEDDING_PROVENANCE.model || provider.dimensions !== 1536) throw new EmbeddingError("INVALID_INPUT", false);
  const topK = boundedInteger(options.topK, 6, 20);
  const maxEvidenceTokens = boundedInteger(options.maxEvidenceTokens, 6000, 12000);
  // This is a retrieval heuristic, not a semantic sufficiency certificate.
  const minScore = options.minScore ?? 0.25;
  // If publicSourceIds is explicitly specified (e.g. testing or scoped deployment),
  // enforce it fail-closed; if undefined, query all eligible database documents.
  const restrictBySourceIds = options.publicSourceIds !== undefined;
  const approvedSourceIds = restrictBySourceIds
    ? [...options.publicSourceIds!]
        .filter(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/u.test(id))
        .sort()
    : [];
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) throw new EmbeddingError("INVALID_INPUT", false);
  return {
    async retrieve(question, history, signal, context = { type: "GENERAL" }): Promise<QaEvidence[]> {
      const validated = qaQuestionSchema.parse(question);
      const normalized = qaFactualQuestion(validated) || validated;
      if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
      // Only authorized prior questions help resolve intent. Prior answers/citations
      // are never queried, projected, or returned as current evidence.
      const previousQuestions = qaIntentHistory(validated, history).map(turn => qaQuestionSchema.parse(turn.question));
      const query = [...(context.type === "DESTINATION" ? [JSON.stringify({ destination: context.name })] : []), ...previousQuestions, normalized].join("\n");
      if (countEmbeddingTokens(query) > 8191) throw new EmbeddingError("RESOURCE_LIMIT", false);
      qaStage("QUESTION_EMBEDDING_STARTED");
      let response;
      try { response = await provider.embed({ input: [query], signal }); }
      catch (error) { throw qaOrigin(error, error instanceof EmbeddingError && error.code === "INVALID_PROVIDER_RESPONSE" ? "QUESTION_EMBEDDING_VALIDATION" : "QUESTION_EMBEDDING_STARTED", error instanceof EmbeddingError && error.code === "INVALID_PROVIDER_RESPONSE" ? "SCHEMA" : "PROVIDER_FAILURE"); }
      qaStage("QUESTION_EMBEDDING_VALIDATION");
      const vector = response[0]?.embedding;
      if (response.length !== 1 || response[0]?.index !== 0 || !Array.isArray(vector) || vector.length !== 1536 ||
        Array.from(vector).some(value => typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) {
        throw qaOrigin(new EmbeddingError("INVALID_PROVIDER_RESPONSE", false), "QUESTION_EMBEDDING_VALIDATION", "EMBEDDING_VECTOR");
      }
      // pgvector stores float32 values; reject vectors that become zero or overflow.
      const squaredNorm = vector.reduce((sum, value) => sum + Math.fround(value) ** 2, 0);
      if (!Number.isFinite(squaredNorm) || squaredNorm <= 0) throw qaOrigin(new EmbeddingError("INVALID_PROVIDER_RESPONSE", false), "QUESTION_EMBEDDING_VALIDATION", "EMBEDDING_VECTOR");
      qaStage("QUESTION_EMBEDDING_COMPLETED");
      qaStage("RETRIEVAL_STARTED");
      if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
      if (restrictBySourceIds && approvedSourceIds.length === 0) {
        qaStage("RETRIEVAL_COMPLETED", {
          retrievedChunks: 0,
          candidateChunks: 0,
          candidatesBeforeThreshold: 0,
          candidatesAfterThreshold: 0,
          topSimilarityScore: null,
          minScore,
          allowlistCount: 0,
          hasDongVanDocument: false,
          contextType: context.type,
          firstZeroStage: "I",
          retrievalReason: "NO_APPROVED_SOURCES",
        });
        return [];
      }
      const vectorLiteral = `[${vector.join(",")}]`;
      // Literal substring matching avoids wildcard interpretation of metadata.
      const contextFilter = context.type === "DESTINATION"
        ? Prisma.sql`AND strpos(lower(normalize(c."text", NFC)), lower(${context.name})) > 0`
        : Prisma.empty;
      const sourceFilter = restrictBySourceIds
        ? Prisma.sql`AND d."id" IN (${Prisma.join(approvedSourceIds)})`
        : Prisma.empty;
      const keywordQuery = options.hybrid ? qaKeywordQuery(normalized) : "";
      const { vectorRows, keywordRows } = await boundedRead(database, async reader => {
      const vectorRows = await reader.$queryRaw<Row[]>(Prisma.sql`SELECT d."id" AS "documentId", g."id" AS "generationId",
        g."contentVersionId", c."id" AS "chunkId", c."chunkHash", c."text", e."tokenCount",
        d."sourceTitle", d."fileType"::text AS "fileType", c."locators",
        (1 - (e."embedding" <=> ${vectorLiteral}::vector))::double precision AS "score"
        ${joins} WHERE ${eligible} AND e."tokenCount" > 0
        ${sourceFilter}
        ${contextFilter}
        ORDER BY e."embedding" <=> ${vectorLiteral}::vector, d."id", g."id", c."index", c."id" LIMIT ${topK}`);
      let keywordRows: Row[] = [];
      if (keywordQuery) {
        if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
        const searchText = Prisma.sql`regexp_replace(translate(lower(normalize(c."text", NFD)), 'đ', 'd'), '[̀-ͯ]', '', 'g')`;
        keywordRows = await reader.$queryRaw<Row[]>(Prisma.sql`SELECT d."id" AS "documentId", g."id" AS "generationId",
          g."contentVersionId", c."id" AS "chunkId", c."chunkHash", c."text", e."tokenCount",
          d."sourceTitle", d."fileType"::text AS "fileType", c."locators",
          (1 - (e."embedding" <=> ${vectorLiteral}::vector))::double precision AS "score"
          ${joins} WHERE ${eligible} AND e."tokenCount" > 0
          ${sourceFilter} ${contextFilter}
          AND to_tsvector('simple', ${searchText}) @@ to_tsquery('simple', ${keywordQuery})
          ORDER BY ts_rank_cd(to_tsvector('simple', ${searchText}), to_tsquery('simple', ${keywordQuery})) DESC,
          d."id", g."id", c."index", c."id" LIMIT ${topK}`);
      }
      return { vectorRows, keywordRows };
      });
      // Two independent candidate branches, same eligibility/context. Interleave
      // ranks without adding vector and lexical scores of incompatible units.
      // Keep the same final topK and token budget; dedupe by current chunk ID.
      const seen = new Set<string>();
      const candidateRows: Row[] = [];
      for (let index = 0; index < topK; index++) for (const row of [vectorRows[index], keywordRows[index]]) {
        if (!row || seen.has(row.chunkId)) continue;
        seen.add(row.chunkId); candidateRows.push(row);
      }
      if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
      const topSimilarityScore = candidateRows[0]?.score != null && Number.isFinite(candidateRows[0].score)
        ? Math.round(candidateRows[0].score * 10000) / 10000
        : null;
      const candidatesBeforeThreshold = candidateRows.length;
      const lexicalIds = new Set(keywordRows.map(row => row.chunkId));
      const rows = candidateRows.filter(r => Number.isFinite(r.score) && (r.score >= minScore || lexicalIds.has(r.chunkId)));
      const candidatesAfterThreshold = rows.length;

      let firstZeroStage: string;
      if (candidateRows.length === 0) {
        firstZeroStage = context.type === "DESTINATION" ? "K" : "D";
      } else if (rows.length === 0) {
        firstZeroStage = "J";
      } else {
        firstZeroStage = "NONE";
      }

      const evidence: QaEvidence[] = [];
      let usedTokens = 0;
      for (const row of rows) {
        if (evidence.length >= topK) break;
        if (restrictBySourceIds && !options.publicSourceIds!.has(row.documentId)) continue;
        if (!Number.isFinite(row.score) || !row.text.trim()) continue;
        if (context.type === "DESTINATION" && !destinationEvidenceSentences(row.text, context.name).length) continue;
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
      const retrievalReason = candidateRows.length === 0
        ? "NO_CANDIDATES"
        : rows.length === 0
          ? "ALL_CANDIDATES_FILTERED"
          : evidence.length === 0
            ? "ALL_CANDIDATES_FILTERED"
            : "EVIDENCE_RETRIEVED";
      qaStage("RETRIEVAL_COMPLETED", {
        retrievedChunks: evidence.length,
        candidateChunks: rows.length,
        candidatesBeforeThreshold,
        candidatesAfterThreshold,
        topSimilarityScore,
        minScore,
        allowlistCount: restrictBySourceIds ? approvedSourceIds.length : -1,
        hasDongVanDocument: restrictBySourceIds ? approvedSourceIds.includes("cmvapg3l0001j7w9w61egpl01") : true,
        contextType: context.type,
        firstZeroStage,
        retrievalReason,
      });
      return evidence;
    },
    recheck: evidence => boundedRead(database, reader => recheckWith(reader, evidence, options.publicSourceIds)),
  };
}
