import { describe, expect, it, vi } from "vitest";
import {
  deterministicQuestionUnderstanding,
  matchKnownDestinations,
  foldVi,
} from "./qa-question-understanding";
import { createQaQuestionUnderstander } from "./qa-question-understander";
import { createQaRetriever, qaKeywordQuery } from "./qa-retrieval";
import type { Database } from "@KLTN/db";
import { createFakeEmbeddingProvider } from "../rag-processing/__fixtures__/fake-embedding-provider";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";

vi.mock("server-only", () => ({}));

describe("Ticket 02: AI Question Understanding & Subject-Aware Retrieval", () => {
  describe("matchKnownDestinations", () => {
    it("recognizes full canonical names and short aliases", () => {
      expect(matchKnownDestinations("Làng văn hóa du lịch cộng đồng Hạ Thành là điểm đến như thế nào")).toContain(
        "Làng văn hóa du lịch cộng đồng Hạ Thành"
      );
      expect(matchKnownDestinations("ở hạ thành có những dịch vụ gì")).toContain(
        "Làng văn hóa du lịch cộng đồng Hạ Thành"
      );
      expect(matchKnownDestinations("ha thanh co gi dep")).toContain(
        "Làng văn hóa du lịch cộng đồng Hạ Thành"
      );
      expect(matchKnownDestinations("Cao nguyên đá Đồng Văn có danh hiệu gì")).toContain(
        "Cao nguyên đá Đồng Văn"
      );
    });

    it("matches multiple subjects in comparison questions", () => {
      const matched = matchKnownDestinations("So sánh làng Hạ Thành và Đồng Văn");
      expect(matched).toContain("Làng văn hóa du lịch cộng đồng Hạ Thành");
      expect(matched).toContain("Cao nguyên đá Đồng Văn");
    });
  });

  describe("deterministicQuestionUnderstanding", () => {
    it("extracts Hạ Thành subject, overview intent, and preserves attributes", () => {
      const q = "Làng văn hóa du lịch cộng đồng Hạ Thành là điểm đến như thế nào";
      const res = deterministicQuestionUnderstanding(q);
      expect(res.targetSubjects).toContain("Làng văn hóa du lịch cộng đồng Hạ Thành");
      expect(res.intent).toBe("OVERVIEW");
      expect(res.ambiguous).toBe(false);
      expect(res.searchQuery).toContain("Hạ Thành");
    });

    it("preserves negations, numbers, and temporal constraints", () => {
      const q = "Hạ Thành có mất phí vào cửa không trong năm 2026 cho người cao tuổi";
      const res = deterministicQuestionUnderstanding(q);
      expect(res.targetSubjects).toContain("Làng văn hóa du lịch cộng đồng Hạ Thành");
      expect(res.intent).toBe("ADMISSION");
      expect(res.temporalConstraint).toBe("2026");
      expect(res.conditions).toContain("người cao tuổi");
      expect(res.conditions.some(c => c.includes("không"))).toBe(true);
    });

    it("resolves follow-up pronouns using history", () => {
      const history = [
        {
          question: "Làng Hạ Thành ở đâu?",
          response: {
            conversationId: "conv-1",
            turnId: "t-1",
            turnState: "COMPLETED" as const,
            status: "ANSWERED" as const,
            answerParts: [{ text: "Hạ Thành ở TP Hà Giang.", citationIds: ["c1"] }],
            citations: [{ id: "c1", sourceId: "s1", title: "Hạ Thành", sourceUrl: null, locators: [] }],
            unansweredAspects: [],
            presentation: "PARAGRAPHS" as const,
            context: { type: "GENERAL" as const },
          },
        },
      ];
      const res = deterministicQuestionUnderstanding("Ở đó có gì đặc biệt?", history);
      expect(res.targetSubjects).toContain("Làng văn hóa du lịch cộng đồng Hạ Thành");
      expect(res.intent).toBe("OVERVIEW");
    });

    it("switches subject when user explicitly mentions a new destination in follow-up", () => {
      const history = [
        {
          question: "Hạ Thành có gì hay?",
          response: {
            conversationId: "conv-1",
            turnId: "t-1",
            turnState: "COMPLETED" as const,
            status: "ANSWERED" as const,
            answerParts: [{ text: "Hạ Thành có nhà sàn.", citationIds: ["c1"] }],
            citations: [{ id: "c1", sourceId: "s1", title: "Hạ Thành", sourceUrl: null, locators: [] }],
            unansweredAspects: [],
            presentation: "PARAGRAPHS" as const,
            context: { type: "GENERAL" as const },
          },
        },
      ];
      const res = deterministicQuestionUnderstanding("Còn Đồng Văn thì sao?", history);
      expect(res.targetSubjects).toContain("Cao nguyên đá Đồng Văn");
      expect(res.targetSubjects).not.toContain("Làng văn hóa du lịch cộng đồng Hạ Thành");
    });

    it("detects ambiguous question when subject is absent", () => {
      const res = deterministicQuestionUnderstanding("Ở đó có giá vé bao nhiêu?");
      expect(res.ambiguous).toBe(true);
      expect(res.clarificationQuestion).toBeTruthy();
    });
  });

  describe("createQaQuestionUnderstander with provider and fallback", () => {
    it("calls OpenAI structured output and parses successfully", async () => {
      const fakeFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    targetSubjects: ["Làng văn hóa du lịch cộng đồng Hạ Thành"],
                    intent: "OVERVIEW",
                    attributes: ["nhà sàn", "văn hóa Tày"],
                    temporalConstraint: null,
                    conditions: [],
                    searchQuery: "Làng văn hóa du lịch cộng đồng Hạ Thành giới thiệu nhà sàn",
                    ambiguous: false,
                    clarificationQuestion: null,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      });

      const understander = createQaQuestionUnderstander({
        apiKey: () => "test-key",
        fetcher: fakeFetch as typeof fetch,
      });

      const res = await understander.understand({
        question: "Làng văn hóa du lịch cộng đồng Hạ Thành là điểm đến như thế nào",
      });

      expect(res.targetSubjects).toContain("Làng văn hóa du lịch cộng đồng Hạ Thành");
      expect(res.intent).toBe("OVERVIEW");
      expect(res.attributes).toEqual(["nhà sàn", "văn hóa Tày"]);
    });

    it("falls back gracefully to deterministic understanding on provider error without repeating retries", async () => {
      const failFetch = vi.fn(async () => {
        return new Response("Internal Server Error", { status: 500 });
      });

      const understander = createQaQuestionUnderstander({
        apiKey: () => "test-key",
        fetcher: failFetch as typeof fetch,
      });

      const res = await understander.understand({
        question: "Làng văn hóa du lịch cộng đồng Hạ Thành là điểm đến như thế nào",
      });

      expect(failFetch).toHaveBeenCalledTimes(1);
      expect(res.targetSubjects).toContain("Làng văn hóa du lịch cộng đồng Hạ Thành");
      expect(res.intent).toBe("OVERVIEW");
    });
  });

  describe("Ha Thanh Retrieval Ranking Fix", () => {
    it("ranks Ha Thanh chunks ahead of Dong Van chunks when querying Ha Thanh", async () => {
      const t1 = "Cao nguyên đá Đồng Văn là điểm đến văn hóa du lịch cộng đồng nổi tiếng của Hà Giang.";
      const t2 = "Làng văn hóa du lịch cộng đồng thôn Hạ Thành thuộc xã Phương Độ, thành phố Hà Giang, nổi bật với nhà sàn truyền thống.";
      const mockRows = [
        {
          documentId: "doc-dongvan",
          generationId: "gen-1",
          contentVersionId: "cv-1",
          chunkId: "c-dv-1",
          chunkHash: "hash-dv-1",
          text: t1,
          tokenCount: countEmbeddingTokens(t1),
          score: 0.85,
          sourceTitle: "Cao nguyên đá Đồng Văn",
          fileType: "DOCX",
          locators: [],
        },
        {
          documentId: "doc-hathanh",
          generationId: "gen-1",
          contentVersionId: "cv-1",
          chunkId: "c-ht-1",
          chunkHash: "hash-ht-1",
          text: t2,
          tokenCount: countEmbeddingTokens(t2),
          score: 0.75,
          sourceTitle: "Làng văn hóa du lịch cộng đồng Hạ Thành",
          fileType: "TXT",
          locators: [],
        },
      ];

      const fakeDb = {
        $queryRaw: vi.fn(async () => mockRows),
        $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(fakeDb)),
      };

      const retriever = createQaRetriever(fakeDb as unknown as Database, {
        provider: createFakeEmbeddingProvider().provider,
        topK: 4,
        hybrid: false,
      });

      const evidence = await retriever.retrieve(
        "Làng văn hóa du lịch cộng đồng Hạ Thành là điểm đến như thế nào",
        []
      );

      expect(evidence.length).toBeGreaterThan(0);
      // Ha Thanh chunk must be ranked #1 despite lower raw vector score than Dong Van!
      expect(evidence[0]!.chunkId).toBe("c-ht-1");
      expect(evidence[0]!.citation.title).toBe("Làng văn hóa du lịch cộng đồng Hạ Thành");
    });
  });
});
