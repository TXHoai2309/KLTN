import { describe, expect, it, vi } from "vitest";
import { createQaService } from "./qa-service";
import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { composeQaPrompt } from "./qa-prompt";
import {
  qaFirstTurnRequestSchema,
  qaFollowUpRequestSchema,
  qaCompletedTurnSchema,
  qaAnswerPartSchema,
} from "./qa-contract";
import { qaRequestHash } from "./qa-conversation-store";
import type { QaEvidence, QaGenerationInput, QaPrincipal } from "./qa-runtime-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";

vi.mock("server-only", () => ({}));

describe("Ticket 04: Opt-in Expanded Knowledge Answers", () => {
  const principal: QaPrincipal = { kind: "USER", id: "user-expanded-1" };
  const baseEvidenceText = "Cột cờ Lũng Cú tọa lạc tại đỉnh Long Sơn, xã Lũng Cú, huyện Đồng Văn, tỉnh Hà Giang.";
  const sampleEvidence: QaEvidence = {
    citationId: "c1",
    documentId: "doc-1",
    generationId: "gen-1",
    contentVersionId: "cv-1",
    chunkId: "chk-1",
    chunkHash: "hash-1",
    text: baseEvidenceText,
    tokenCount: countEmbeddingTokens(baseEvidenceText),
    score: 0.95,
    citation: {
      id: "c1",
      sourceId: "source-1",
      title: "Hồ sơ Cột cờ Lũng Cú",
      sourceUrl: null,
      locators: [],
    },
  };

  describe("Schema and Contract validation", () => {
    it("parses requests with knowledgeMode EXPANDED and SOURCE_ONLY", () => {
      const parsedExpanded = qaFirstTurnRequestSchema.parse({
        question: "Cột cờ Lũng Cú ở đâu?",
        context: { type: "GENERAL" },
        knowledgeMode: "EXPANDED",
      });
      expect(parsedExpanded.knowledgeMode).toBe("EXPANDED");

      const parsedSource = qaFirstTurnRequestSchema.parse({
        question: "Cột cờ Lũng Cú ở đâu?",
        context: { type: "GENERAL" },
        knowledgeMode: "SOURCE_ONLY",
      });
      expect(parsedSource.knowledgeMode).toBe("SOURCE_ONLY");

      const parsedDefault = qaFirstTurnRequestSchema.parse({
        question: "Cột cờ Lũng Cú ở đâu?",
        context: { type: "GENERAL" },
      });
      expect(parsedDefault.knowledgeMode ?? "SOURCE_ONLY").toBe("SOURCE_ONLY");
    });

    it("parses answer parts with mode SOURCE or EXPANDED", () => {
      const sourcePart = qaAnswerPartSchema.parse({
        text: "Cột cờ Lũng Cú nằm tại đỉnh Long Sơn.",
        citationIds: ["c1"],
        mode: "SOURCE",
      });
      expect(sourcePart.mode).toBe("SOURCE");

      const expandedPart = qaAnswerPartSchema.parse({
        text: "Kinh nghiệm: Bạn nên mang theo áo khoác ấm vì gió trên đỉnh cột cờ khá mạnh.",
        citationIds: [],
        mode: "EXPANDED",
      });
      expect(expandedPart.mode).toBe("EXPANDED");
      expect(expandedPart.citationIds).toEqual([]);
    });

    it("qaCompletedTurnSchema enforces mode invariants", () => {
      const turnBase = {
        conversationId: "conv-1",
        turnId: "turn-1",
        turnState: "COMPLETED" as const,
        context: { type: "GENERAL" as const },
      };

      // Valid: SOURCE_ONLY turn has only SOURCE parts
      const validSourceTurn = qaCompletedTurnSchema.parse({
        ...turnBase,
        status: "ANSWERED",
        knowledgeMode: "SOURCE_ONLY",
        answerParts: [{ text: "Nằm ở Lũng Cú.", citationIds: ["c1"], mode: "SOURCE" }],
        citations: [sampleEvidence.citation],
        unansweredAspects: [],
      });
      expect(validSourceTurn.knowledgeMode).toBe("SOURCE_ONLY");

      // Invalid: SOURCE_ONLY turn contains EXPANDED parts
      expect(() =>
        qaCompletedTurnSchema.parse({
          ...turnBase,
          status: "ANSWERED",
          knowledgeMode: "SOURCE_ONLY",
          answerParts: [{ text: "Gợi ý kinh nghiệm.", citationIds: [], mode: "EXPANDED" }],
          citations: [],
          unansweredAspects: [],
        })
      ).toThrow();

      // Valid: EXPANDED turn can have purely EXPANDED parts with empty citations array
      const validExpandedTurn = qaCompletedTurnSchema.parse({
        ...turnBase,
        status: "ANSWERED",
        knowledgeMode: "EXPANDED",
        answerParts: [{ text: "Gợi ý kinh nghiệm du lịch Hà Giang.", citationIds: [], mode: "EXPANDED" }],
        citations: [],
        unansweredAspects: [],
      });
      expect(validExpandedTurn.citations).toEqual([]);

      // Valid: EXPANDED turn can have mixed parts
      const validMixedTurn = qaCompletedTurnSchema.parse({
        ...turnBase,
        status: "ANSWERED",
        knowledgeMode: "EXPANDED",
        answerParts: [
          { text: "Cột cờ ở đỉnh Long Sơn.", citationIds: ["c1"], mode: "SOURCE" },
          { text: "Bạn nên đi vào buổi sáng để đón bình minh.", citationIds: [], mode: "EXPANDED" },
        ],
        citations: [sampleEvidence.citation],
        unansweredAspects: [],
      });
      expect(validMixedTurn.answerParts).toHaveLength(2);
    });
  });

  describe("Grounding Assertion (assertQaAnswerGrounding)", () => {
    const input: QaGenerationInput = {
      question: "Thông tin Cột cờ Lũng Cú?",
      history: [],
      context: { type: "GENERAL" },
      evidence: [sampleEvidence],
      knowledgeMode: "EXPANDED",
    };

    it("passes for mixed answer when knowledgeMode is EXPANDED", () => {
      expect(() =>
        assertQaAnswerGrounding(
          {
            status: "ANSWERED",
            answerParts: [
              { text: "Cột cờ Lũng Cú nằm ở đỉnh Long Sơn.", citationIds: ["c1"], mode: "SOURCE" },
              { text: "Bạn nên leo bộ 839 bậc đá để ngắm toàn cảnh.", citationIds: [], mode: "EXPANDED" },
            ],
            citations: [sampleEvidence.citation],
            unansweredAspects: [],
          },
          input
        )
      ).not.toThrow();
    });

    it("rejects EXPANDED parts if citations are falsely attached to them", () => {
      expect(() =>
        assertQaAnswerGrounding(
          {
            status: "ANSWERED",
            answerParts: [
              {
                text: "Bạn nên leo bộ 839 bậc đá.",
                citationIds: ["c1"], // Forbidden!
                mode: "EXPANDED",
              },
            ],
            citations: [sampleEvidence.citation],
            unansweredAspects: [],
          },
          input
        )
      ).toThrow();
    });

    it("rejects EXPANDED parts when knowledgeMode is SOURCE_ONLY", () => {
      const sourceOnlyInput: QaGenerationInput = {
        ...input,
        knowledgeMode: "SOURCE_ONLY",
      };
      expect(() =>
        assertQaAnswerGrounding(
          {
            status: "ANSWERED",
            answerParts: [
              { text: "Mẹo du lịch.", citationIds: [], mode: "EXPANDED" },
            ],
            citations: [],
            unansweredAspects: [],
          },
          sourceOnlyInput
        )
      ).toThrow();
    });
  });

  describe("Prompt Composition", () => {
    it("includes EXPANDED directives and tag guidance when knowledgeMode is EXPANDED", () => {
      const messages = composeQaPrompt({
        question: "Cột cờ Lũng Cú ở đâu?",
        history: [],
        context: { type: "GENERAL" },
        evidence: [sampleEvidence],
        knowledgeMode: "EXPANDED",
      });
      const prompt = messages.map(m => m.content).join("\n");
      expect(prompt).toContain("KNOWLEDGE MODE: EXPANDED");
      expect(prompt).toContain("mode: 'EXPANDED'");
    });

    it("includes SOURCE_ONLY directives when knowledgeMode is SOURCE_ONLY", () => {
      const messages = composeQaPrompt({
        question: "Cột cờ Lũng Cú ở đâu?",
        history: [],
        context: { type: "GENERAL" },
        evidence: [sampleEvidence],
        knowledgeMode: "SOURCE_ONLY",
      });
      const prompt = messages.map(m => m.content).join("\n");
      expect(prompt).toContain("KNOWLEDGE MODE: SOURCE_ONLY");
      expect(prompt).toContain("Rely strictly on CURRENT_EVIDENCE");
    });
  });

  describe("End-to-End Service Flow with Expanded Mode", () => {
    function setupHarness(options: { generatorOutcome?: any } = {}) {
      const mockStore: Partial<QaConversationStore> = {
        reserve: vi.fn(async () => ({
          kind: "RESERVED" as const,
          conversationId: "conv-exp-1",
          turnId: "turn-exp-1",
          fence: 1,
          history: [],
        })),
        complete: vi.fn(async (_p, admission, data) => data),
        fail: vi.fn(async () => undefined),
      };

      const mockRetriever = {
        retrieve: vi.fn(async () => [sampleEvidence]),
        recheck: vi.fn(async () => true),
      };

      const mockGenerator = {
        generate: vi.fn(async (input: QaGenerationInput) => {
          return (
            options.generatorOutcome ?? {
              status: "ANSWERED" as const,
              answerParts: [
                { text: "Cột cờ Lũng Cú tại đỉnh Long Sơn.", citationIds: ["c1"], mode: "SOURCE" as const },
                {
                  text: "Kinh nghiệm du lịch: Bạn nên mang giày thể thao thoải mái khi leo bậc thang.",
                  citationIds: [],
                  mode: "EXPANDED" as const,
                },
              ],
              citations: [sampleEvidence.citation],
              unansweredAspects: [],
              presentation: "PARAGRAPHS" as const,
            }
          );
        }),
      };

      const service = createQaService({
        store: mockStore as QaConversationStore,
        retriever: mockRetriever,
        generator: mockGenerator,
      });

      return { service, mockStore, mockRetriever, mockGenerator };
    }

    it("executes EXPANDED mode and passes knowledgeMode to generator and store", async () => {
      const { service, mockGenerator, mockStore } = setupHarness();

      const response = await service.ask(principal, "key-exp-1", {
        question: "Giới thiệu cột cờ Lũng Cú và kinh nghiệm đi",
        context: { type: "GENERAL" },
        knowledgeMode: "EXPANDED",
      });

      expect(mockGenerator.generate).toHaveBeenCalledWith(
        expect.objectContaining({ knowledgeMode: "EXPANDED" })
      );
      expect(mockStore.complete).toHaveBeenCalledWith(
        principal,
        expect.anything(),
        expect.objectContaining({ knowledgeMode: "EXPANDED" }),
        expect.anything()
      );

      expect(response.data.status).toBe("ANSWERED");
      if (response.data.status === "ANSWERED") {
        expect(response.data.knowledgeMode).toBe("EXPANDED");
        expect(response.data.answerParts).toHaveLength(2);
        expect(response.data.answerParts[0]!.mode).toBe("SOURCE");
        expect(response.data.answerParts[1]!.mode).toBe("EXPANDED");
      }
    });

    it("in EXPANDED mode, proceeds with generation even when retrieval yields 0 evidence", async () => {
      const { service, mockRetriever, mockGenerator } = setupHarness({
        generatorOutcome: {
          status: "ANSWERED" as const,
          answerParts: [
            {
              text: "Theo thông tin tham khảo chung, món cháo ấu tẩu là đặc sản nổi tiếng của Hà Giang.",
              citationIds: [],
              mode: "EXPANDED" as const,
            },
          ],
          citations: [],
          unansweredAspects: [],
          presentation: "PARAGRAPHS" as const,
        },
      });
      mockRetriever.retrieve.mockResolvedValueOnce([]);

      const response = await service.ask(principal, "key-exp-zero-evidence", {
        question: "Món cháo ấu tẩu Hà Giang như thế nào?",
        context: { type: "GENERAL" },
        knowledgeMode: "EXPANDED",
      });

      expect(mockGenerator.generate).toHaveBeenCalledWith(
        expect.objectContaining({ evidence: [], knowledgeMode: "EXPANDED" })
      );
      expect(response.data.status).toBe("ANSWERED");
      if (response.data.status === "ANSWERED") {
        expect(response.data.answerParts[0]!.mode).toBe("EXPANDED");
        expect(response.data.citations).toEqual([]);
      }
    });

    it("in SOURCE_ONLY mode, fails immediately with INSUFFICIENT_SOURCE when retrieval yields 0 evidence", async () => {
      const { service, mockRetriever, mockGenerator } = setupHarness();
      mockRetriever.retrieve.mockResolvedValueOnce([]);

      const response = await service.ask(principal, "key-src-zero-evidence", {
        question: "Món cháo ấu tẩu Hà Giang như thế nào?",
        context: { type: "GENERAL" },
        knowledgeMode: "SOURCE_ONLY",
      });

      expect(mockGenerator.generate).not.toHaveBeenCalled();
      expect(response.data.status).toBe("INSUFFICIENT_SOURCE");
    });
  });

  describe("Idempotency Hash with Knowledge Mode", () => {
    it("produces different request hashes when knowledgeMode differs", () => {
      const hashSource = qaRequestHash({
        question: "Cột cờ Lũng Cú",
        context: { type: "GENERAL" },
        knowledgeMode: "SOURCE_ONLY",
      });

      const hashExpanded = qaRequestHash({
        question: "Cột cờ Lũng Cú",
        context: { type: "GENERAL" },
        knowledgeMode: "EXPANDED",
      });

      const hashDefault = qaRequestHash({
        question: "Cột cờ Lũng Cú",
        context: { type: "GENERAL" },
      });

      expect(hashSource).not.toBe(hashExpanded);
      expect(hashDefault).toBe(hashSource);
    });
  });
});
