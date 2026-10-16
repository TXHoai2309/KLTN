import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { EmbeddingProvider } from "../rag-processing/embedding-contract";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { createQaRetriever, lockQaEvidenceEligibility, projectQaLocators, qaPublicSourceAlias } from "./qa-retrieval";
import { createQaDiagnostics, type QaDiagnosticEvent } from "./qa-diagnostics";
import { researchDocx } from "../rag-processing/__fixtures__/research-docx";
import { extractDocument } from "../rag-processing/extract-document";
import { chunkDocument } from "../rag-processing/chunk-document";
vi.mock("server-only", () => ({}));

const vector = Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0);
function setup(rows: unknown[] = []) {
  const embed = vi.fn(async () => [{ index: 0, embedding: vector }]);
  const provider: EmbeddingProvider = { provider: "openai", model: "text-embedding-3-small", dimensions: 1536, embed };
  const query = vi.fn(async (_sql: unknown) => rows);
  const db = { $queryRaw: query } as unknown as Database;
  return { embed, provider, query, db };
}
function row(index = 0) {
  const text = "Synthetic verified source.";
  return { documentId: `private-document-${index}`, generationId: "gen", contentVersionId: "version", chunkId: `chunk-${index}`,
    chunkHash: "a".repeat(64), text, tokenCount: countEmbeddingTokens(text), score: 0.8,
    sourceTitle: "Synthetic source", fileType: "PDF", locators: [{ format: "PDF", pageNumber: 3, blockIndex: 0 }],
    sourceUrl: "https://private.invalid/signed?token=private", storagePath: "private/storage" };
}
const allowSyntheticSources = () => new Set(["private-document-0", "private-document-1", "private-document-2"]);
describe("US21 retrieval", () => {
  it.each(["Cao nguyên đá Đồng Văn", "Di tích Căng Bắc Mê", "Chợ tình Khâu Vai"])("retains DOCX source labels and URLs in retrieved evidence: %s", async title => {
    const extracted = await extractDocument({format:"DOCX",bytes:researchDocx(title)});
    if (extracted.status !== "EXTRACTED") throw new Error(extracted.status);
    const chunked = chunkDocument(extracted.document);
    if (chunked.status !== "CHUNKED") throw new Error(chunked.status);
    const source = chunked.chunks.find(chunk => chunk.text.includes("[S01]") && chunk.text.includes("https://example.org/source?x=1&y=2"))!;
    expect(source).toBeDefined();
    const s = setup([{...row(),text:source.text,tokenCount:countEmbeddingTokens(source.text),fileType:"DOCX",locators:source.locators}]);
    const evidence = await createQaRetriever(s.db,{provider:s.provider,publicSourceIds:allowSyntheticSources()}).retrieve("Nguồn tài liệu?", []);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].text).toBe(source.text);
    // A mentioned URL is retained as evidence text, never promoted to verified citation metadata.
    expect(evidence[0].citation.sourceUrl).toBeNull();
  });
  it("embeds normalized questions with bounded question history, never historical answers", async () => {
    const s = setup([row()]);
    const retriever = createQaRetriever(s.db, { provider: s.provider, publicSourceIds: allowSyntheticSources() });
    const history = [{ question: " Earlier? ", response: { answerParts: [{ text: "POISON_HISTORY" }] } }] as never;
    const result = await retriever.retrieve(" Nó ở đâu? ", history);
    expect(s.embed).toHaveBeenCalledWith({ input: ["earlier\nnó ở đâu"], signal: undefined });
    expect(result).toHaveLength(1);
    expect(result[0]!.citation).toEqual({ id: "c1", sourceId: qaPublicSourceAlias("private-document-0"), title: "Synthetic source", sourceUrl: null, locators: [{ pageNumber: 3 }] });
    expect(JSON.stringify(result[0]!.citation)).not.toMatch(/private|chunk|gen|version|token/);
    const sql = s.query.mock.calls[0]![0] as unknown as { sql: string; values: unknown[] };
    expect(sql.sql).toMatch(/rag_index_publication/);
    expect(sql.sql).toMatch(/INDEXED/); expect(sql.sql).toMatch(/READY/);
    expect(sql.sql).toMatch(/ORDER BY/); expect(sql.sql).not.toContain(vector.join(","));
  });
  it("returns no evidence for empty retrieval and excludes invalid metadata, bad counts and over-budget chunks", async () => {
    const empty = setup();
    expect(await createQaRetriever(empty.db, { provider: empty.provider }).retrieve("Q?", [])).toEqual([]);
    const s = setup([{ ...row(), sourceTitle: "" }, { ...row(1), tokenCount: 999 }, row(2)]);
    expect(await createQaRetriever(s.db, { provider: s.provider, publicSourceIds: allowSyntheticSources(), maxEvidenceTokens: 1 }).retrieve("Q?", [])).toEqual([]);
  });
  it("budgets whole chunks, leaves later fitting evidence eligible", async () => {
    const a = row(), b = row(1);
    const s = setup([a, b]);
    const result = await createQaRetriever(s.db, { provider: s.provider, publicSourceIds: allowSyntheticSources(), maxEvidenceTokens: a.tokenCount }).retrieve("Q?", []);
    expect(result.map(item => item.chunkId)).toEqual([a.chunkId]);
  });
  it.each([[], [0], Array(1536).fill(0), Array(1536).fill(NaN), Array(1536).fill(1e40), Array(1536).fill(1e-300)])("rejects malformed embedding %j", async bad => {
    const s = setup(); s.embed.mockResolvedValue([{ index: 0, embedding: bad }]);
    await expect(createQaRetriever(s.db, { provider: s.provider }).retrieve("Q?", [])).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    expect(s.query).not.toHaveBeenCalled();
  });
  it("propagates technical failures and cancellation without classifying them as empty source", async () => {
    const s = setup(); s.embed.mockRejectedValue(new Error("synthetic failure"));
    await expect(createQaRetriever(s.db, { provider: s.provider }).retrieve("Q?", [])).rejects.toThrow("synthetic failure");
    const aborted = AbortSignal.abort();
    await expect(createQaRetriever(s.db, { provider: s.provider }).retrieve("Q?", [], aborted)).rejects.toMatchObject({ code: "CANCELLED" });
  });
  it("bounds runtime options", () => {
    const s = setup();
    for (const options of [{ topK: 21 }, { topK: NaN }, { maxEvidenceTokens: 12001 }, { minScore: -1 }, { minScore: Infinity }]) {
      expect(() => createQaRetriever(s.db, { provider: s.provider, ...options })).toThrow();
    }
  });
  it("scopes database timeout to retrieval and recheck transactions", async () => {
    const s = setup([row()]);
    const transaction = vi.fn(async (work: (tx: Database) => Promise<unknown>) => work(s.db));
    const db = { $queryRaw: s.query, $transaction: transaction } as unknown as Database;
    const retriever = createQaRetriever(db, { provider: s.provider, publicSourceIds: allowSyntheticSources() });
    const evidence = await retriever.retrieve("Q?", []);
    expect(await retriever.recheck(evidence)).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 7000 });
    expect((s.query.mock.calls[0]![0] as { sql: string }).sql).toContain("set_config('statement_timeout', '5000ms', true)");
    expect((s.query.mock.calls[2]![0] as { sql: string }).sql).toContain("set_config('statement_timeout', '5000ms', true)");
  });
  it("rechecks every exact identity and locks before checking completion eligibility", async () => {
    const s = setup([row()]);
    const retriever = createQaRetriever(s.db, { provider: s.provider, publicSourceIds: allowSyntheticSources() });
    const evidence = await retriever.retrieve("Q?", []);
    expect(await retriever.recheck(evidence)).toBe(true);
    expect(await retriever.recheck([{ ...evidence[0]!, generationId: "stale" }])).toBe(false);
    expect(await retriever.recheck([...evidence, { ...evidence[0]!, chunkHash: "bad" }])).toBe(false);
    s.query.mockClear();
    expect(await lockQaEvidenceEligibility(s.db as never, evidence, allowSyntheticSources())).toBe(true);
    expect((s.query.mock.calls[0]![0] as unknown as { sql: string }).sql).toMatch(/ORDER BY "id" FOR UPDATE/);
    expect(s.query).toHaveBeenCalledTimes(2);
  });
  it("only exposes trustworthy format locators and stable opaque document aliases", () => {
    expect(projectQaLocators("TXT", [{ format: "TXT", pageNumber: 9 }])).toEqual([]);
    expect(projectQaLocators("DOCX", [{ format: "DOCX", pageNumber: 2, section: { title: " Heading " } }])).toEqual([{ section: "Heading" }]);
    expect(projectQaLocators("PDF", [{ format: "PDF", pageNumber: 0 }, { format: "DOCX", pageNumber: 2 }])).toEqual([]);
    expect(qaPublicSourceAlias("d1")).toBe(qaPublicSourceAlias("d1"));
    expect(qaPublicSourceAlias("d1")).not.toBe(qaPublicSourceAlias("d2"));
  });
  it("fails closed when a source title and locator lack explicit public metadata approval", async () => {
    const s = setup([row()]);
    expect(await createQaRetriever(s.db, { provider: s.provider }).retrieve("Q?", [])).toEqual([]);
  });
  it.each(["file:///private/source.pdf", "C:\\private\\source.pdf", "\\\\nas01\\share\\source.pdf", "/var/private/source.pdf", "https://blob.invalid/file?token=secret"])("excludes approved evidence with unsafe citation metadata: %s", async title => {
    const s=setup([{...row(),sourceTitle:title}]);
    expect(await createQaRetriever(s.db,{provider:s.provider,publicSourceIds:allowSyntheticSources()}).retrieve("Q?",[])).toEqual([]);
  });
  it("pushes approved source IDs into SQL WHERE clause so unapproved documents ranked higher do not displace approved evidence", async () => {
    const approvedDocId = "approved-doc-1";
    const unapprovedDocId = "unapproved-doc-test";
    const approvedChunk = {
      ...row(0),
      documentId: approvedDocId,
      score: 0.65,
      text: "Văn bản Đồng Văn được phê duyệt.",
      tokenCount: countEmbeddingTokens("Văn bản Đồng Văn được phê duyệt."),
      sourceTitle: "Tài liệu Đồng Văn",
    };

    // Mock DB that verifies SQL WHERE clause contains d."id" IN (${approvedDocId})
    const query = vi.fn(async (sqlArg: unknown) => {
      const sqlObj = sqlArg as { sql: string; values: unknown[] };
      expect(sqlObj.sql).toMatch(/d\."id" IN/);
      expect(sqlObj.values).toContain(approvedDocId);
      expect(sqlObj.values).not.toContain(unapprovedDocId);
      return [approvedChunk];
    });
    const db = { $queryRaw: query } as unknown as Database;
    const embed = vi.fn(async () => [{ index: 0, embedding: vector }]);
    const provider: EmbeddingProvider = { provider: "openai", model: "text-embedding-3-small", dimensions: 1536, embed };

    const retriever = createQaRetriever(db, {
      provider,
      topK: 4,
      publicSourceIds: new Set([approvedDocId]),
    });
    const evidence = await retriever.retrieve("Thông tin về Đồng Văn?", []);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.documentId).toBe(approvedDocId);
    expect(evidence[0]!.score).toBe(0.65);
    expect(evidence[0]!.text).toBe("Văn bản Đồng Văn được phê duyệt.");
  });
  it("fails closed when publicSourceIds is empty without querying the database", async () => {
    const s = setup([row(0)]);
    const retriever = createQaRetriever(s.db, {
      provider: s.provider,
      publicSourceIds: new Set(),
    });
    const evidence = await retriever.retrieve("Câu hỏi?", []);
    expect(evidence).toEqual([]);
    expect(s.query).not.toHaveBeenCalled();
  });
  it("records aggregate retrieval diagnostics with reason codes and zero secrets", async () => {
    const approvedDocId = "approved-doc-1";
    const approvedChunk = {
      ...row(0),
      documentId: approvedDocId,
      score: 0.7,
      text: "Thông tin xác minh công khai.",
      tokenCount: countEmbeddingTokens("Thông tin xác minh công khai."),
      sourceTitle: "Nguồn công khai",
    };
    const s = setup([approvedChunk]);
    const events: QaDiagnosticEvent[] = [];
    const diagnostics = createQaDiagnostics({
      nodeEnv: "development",
      sink: e => events.push(e),
    });

    const retriever = createQaRetriever(s.db, {
      provider: s.provider,
      publicSourceIds: new Set([approvedDocId]),
    });

    await diagnostics.run(async () => {
      const evidence = await retriever.retrieve("Câu hỏi?", []);
      expect(evidence).toHaveLength(1);
    });

    const retrievalEvent = events.find(e => e.stage === "RETRIEVAL_COMPLETED");
    expect(retrievalEvent).toBeDefined();
    expect(retrievalEvent).toMatchObject({
      retrievedChunks: 1,
      candidateChunks: 1,
      candidatesBeforeThreshold: 1,
      candidatesAfterThreshold: 1,
      topSimilarityScore: 0.7,
      firstZeroStage: "NONE",
      allowlistCount: 1,
      retrievalReason: "EVIDENCE_RETRIEVED",
    });
    expect(JSON.stringify(events)).not.toMatch(/approved-doc-1|Thông tin xác minh|Câu hỏi/);
  });
  it("distinguishes Stage J when candidates exist but fail minScore threshold", async () => {
    const approvedDocId = "approved-doc-low-score";
    const lowScoreChunk = {
      ...row(0),
      documentId: approvedDocId,
      score: 0.18, // Below 0.25 minScore
      text: "Nội dung có độ tương đồng thấp.",
      tokenCount: countEmbeddingTokens("Nội dung có độ tương đồng thấp."),
      sourceTitle: "Nguồn điểm thấp",
    };
    const s = setup([lowScoreChunk]);
    const events: QaDiagnosticEvent[] = [];
    const diagnostics = createQaDiagnostics({
      nodeEnv: "development",
      sink: e => events.push(e),
    });

    const retriever = createQaRetriever(s.db, {
      provider: s.provider,
      minScore: 0.25,
      publicSourceIds: new Set([approvedDocId]),
    });

    await diagnostics.run(async () => {
      const evidence = await retriever.retrieve("Câu hỏi?", []);
      expect(evidence).toHaveLength(0);
    });

    const retrievalEvent = events.find(e => e.stage === "RETRIEVAL_COMPLETED");
    expect(retrievalEvent).toBeDefined();
    expect(retrievalEvent).toMatchObject({
      retrievedChunks: 0,
      candidateChunks: 0,
      candidatesBeforeThreshold: 1,
      candidatesAfterThreshold: 0,
      topSimilarityScore: 0.18,
      minScore: 0.25,
      firstZeroStage: "J",
      allowlistCount: 1,
      retrievalReason: "ALL_CANDIDATES_FILTERED",
    });
  });
});
