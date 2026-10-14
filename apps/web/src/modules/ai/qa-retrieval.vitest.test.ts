import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { EmbeddingProvider } from "../rag-processing/embedding-contract";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { createQaRetriever, lockQaEvidenceEligibility, projectQaLocators, qaPublicSourceAlias } from "./qa-retrieval";
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
  it("embeds normalized questions with bounded question history, never historical answers", async () => {
    const s = setup([row()]);
    const retriever = createQaRetriever(s.db, { provider: s.provider, publicSourceIds: allowSyntheticSources() });
    const history = [{ question: " Earlier? ", response: { answerParts: [{ text: "POISON_HISTORY" }] } }] as never;
    const result = await retriever.retrieve(" Current? ", history);
    expect(s.embed).toHaveBeenCalledWith({ input: ["Earlier?\nCurrent?"], signal: undefined });
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
});
