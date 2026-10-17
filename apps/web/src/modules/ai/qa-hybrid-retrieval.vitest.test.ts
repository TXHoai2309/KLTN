import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { createQaRetriever, qaKeywordQuery } from "./qa-retrieval";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
vi.mock("server-only", () => ({}));
const text = "Điểm Mẫu A có thông tin kiểm thử.";
const row = (id: number, score = .9) => ({ documentId: "approved", generationId: "g", contentVersionId: "v", chunkId: `chunk_${id}`, chunkHash: "h", text, tokenCount: countEmbeddingTokens(text), score, sourceTitle: "Nguồn hư cấu", fileType: "TXT", locators: [] });
function setup() {
  const query = vi.fn();
  const embed = vi.fn(async () => [{ index: 0, embedding: [1, ...Array(1535).fill(0)] }]);
  const provider = { provider: "openai", model: "text-embedding-3-small", dimensions: 1536, embed } as const;
  return { query, embed, provider, db: { $queryRaw: query } as unknown as Database };
}
describe("bounded independent keyword candidates", () => {
  it("uses the same eligibility/publication/allowlist/context and parameterizes both SQL branches", async () => {
    const s = setup(); s.query.mockResolvedValueOnce([row(0)]).mockResolvedValueOnce([row(1, .1), row(0)]);
    const evidence = await createQaRetriever(s.db, { provider: s.provider, publicSourceIds: new Set(["approved"]), hybrid: true, topK: 2 }).retrieve("Giá vé vào thì sao?", [], undefined, { type: "DESTINATION", destinationId: "place", name: "Điểm Mẫu A" });
    expect(evidence.map(row => row.chunkId)).toEqual(["chunk_0", "chunk_1"]);
    expect(s.embed).toHaveBeenCalledOnce(); expect(s.query).toHaveBeenCalledTimes(2);
    const queries = s.query.mock.calls.map(call => call[0] as { sql: string; values: unknown[] });
    for (const query of queries) {
      for (const guard of ["rag_index_publication", "INDEXED", "READY", "embeddingModel", "strpos"]) expect(query.sql).toContain(guard);
      expect(query.values).toContain("Điểm Mẫu A"); expect(query.values).toContain("approved");
    }
    expect(queries[1]!.sql).toContain("to_tsvector"); expect(queries[1]!.values).toContain("gia | ve | phi");
    expect(queries[1]!.sql).not.toContain("gia | ve | phi");
  });
  it("keeps the final count/token budget, deduplicates chunks and propagates keyword failures", async () => {
    const s = setup(); s.query.mockResolvedValueOnce([row(0)]).mockResolvedValueOnce([row(1), row(2)]);
    expect(await createQaRetriever(s.db, { provider: s.provider, publicSourceIds: new Set(["approved"]), hybrid: true, topK: 1 }).retrieve("giá vé?", [])).toHaveLength(1);
    s.query.mockResolvedValueOnce([row(0)]).mockRejectedValueOnce(new Error("keyword unavailable"));
    await expect(createQaRetriever(s.db, { provider: s.provider, publicSourceIds: new Set(["approved"]), hybrid: true }).retrieve("giá vé?", [])).rejects.toThrow("keyword unavailable");
  });
  it("never admits an unallowlisted or over-budget keyword row", async () => {
    const s = setup(); s.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...row(0), documentId: "private" }, row(1)]);
    expect(await createQaRetriever(s.db, { provider: s.provider, publicSourceIds: new Set(["approved"]), hybrid: true, maxEvidenceTokens: 1 }).retrieve("giá vé?", [])).toEqual([]);
  });
  it.each([["giá vé vào thì sao? ,./", "gia | ve | phi"], ["DIEN TICH DONG VAN", "dien & tich"], ["giờ mở đóng cửa chung", "gio & (cua | hoat)"], ["ĐỒNG VĂN <script> & 'không'", "dong | van | script | khong"], ["tôi muốn tìm hiểu về", "mo & ta"]])("folds and bounds candidate search vocabulary for %s", (question, expected) => {
    expect(qaKeywordQuery(question)).toBe(expected);
  });
});
