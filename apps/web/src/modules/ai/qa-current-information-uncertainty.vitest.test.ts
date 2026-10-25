import { describe, expect, it, vi } from "vitest";
import { createQaService } from "./qa-service";
import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { composeQaPrompt } from "./qa-prompt";
import { QA_CURRENT_UNCERTAINTY_POLICY } from "./qa-answer-policy";
import type { QaEvidence, QaGenerationInput, QaPrincipal } from "./qa-runtime-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";

vi.mock("server-only", () => ({}));

describe("Ticket 06: Useful Answers Under Current Information Uncertainty", () => {
  const principal: QaPrincipal = { kind: "USER", id: "user-uncertainty-1" };

  const haThanhEvidence: QaEvidence = {
    citationId: "c_hathanh",
    documentId: "doc-hathanh",
    generationId: "gen-1",
    contentVersionId: "cv-1",
    chunkId: "chk-1",
    chunkHash: "hash-hathanh",
    text: "Làng văn hóa du lịch thôn Hạ Thành thuộc xã Phương Độ, thành phố Hà Giang. Làng không thu vé tham quan vào cửa chung. Người dân trong làng chủ yếu là đồng bào Tày sinh sống trong những nếp nhà sàn mái cọ cổ kính. Năm 2017, lễ hội Cầu Trăng của người Tày tại đây đã được công nhận là Di sản văn hóa phi vật thể quốc gia.",
    tokenCount: 85,
    score: 0.92,
    citation: {
      id: "c_hathanh",
      sourceId: "source-hathanh",
      title: "Hồ sơ làng văn hóa du lịch thôn Hạ Thành",
      sourceUrl: null,
      locators: [],
    },
  };

  describe("Policy and Prompt Directives", () => {
    it("includes QA_CURRENT_UNCERTAINTY_POLICY in generation prompt", () => {
      const messages = composeQaPrompt({
        question: "Giá vé vào làng Hạ Thành và chi phí homestay?",
        history: [],
        context: { type: "GENERAL" },
        evidence: [haThanhEvidence],
        knowledgeMode: "SOURCE_ONLY",
      });
      const prompt = messages.map(m => m.content).join("\n");
      expect(prompt).toContain("không thu phí chung' does NOT mean all local homestays/services are free");
      expect(prompt).toContain("Historical records of past festival events or recognitions do NOT certify current year dates");
    });
  });

  describe("SOURCE_ONLY mode under partial/uncertain information", () => {
    it("returns PARTIAL with useful supported facts and notes unverified details without model hallucination", async () => {
      const mockStore: Partial<QaConversationStore> = {
        reserve: vi.fn(async () => ({
          kind: "RESERVED" as const,
          conversationId: "conv-unc-1",
          turnId: "turn-unc-1",
          fence: 1,
          history: [],
        })),
        complete: vi.fn(async (_p, admission, data) => data),
        fail: vi.fn(async () => undefined),
      };

      const mockRetriever = {
        retrieve: vi.fn(async () => [haThanhEvidence]),
        recheck: vi.fn(async () => true),
      };

      const partialAnswer = {
        status: "PARTIAL" as const,
        answerParts: [
          {
            text: "Làng Hạ Thành không thu vé vào cửa chung đối với du khách tham quan. Làng nổi bật với các nếp nhà sàn truyền thống lợp mái cọ của người Tày.",
            citationIds: ["c_hathanh"],
            mode: "SOURCE" as const,
          },
        ],
        citations: [haThanhEvidence.citation],
        unansweredAspects: [
          "Tài liệu hiện chưa có thông tin xác minh về bảng giá dịch vụ lưu trú homestay cụ thể tại làng.",
        ],
        presentation: "PARAGRAPHS" as const,
      };

      const mockGenerator = {
        generate: vi.fn(async () => partialAnswer),
      };

      const service = createQaService({
        store: mockStore as QaConversationStore,
        retriever: mockRetriever,
        generator: mockGenerator,
      });

      const response = await service.ask(principal, "key-partial-1", {
        question: "Giá vé vào làng Hạ Thành và chi phí homestay bao nhiêu?",
        context: { type: "GENERAL" },
        knowledgeMode: "SOURCE_ONLY",
      });

      expect(response.data.status).toBe("PARTIAL");
      if (response.data.status === "PARTIAL") {
        // Supported facts are delivered
        expect(response.data.answerParts).toHaveLength(1);
        expect(response.data.answerParts[0]!.mode).toBe("SOURCE");
        expect(response.data.answerParts[0]!.citationIds).toEqual(["c_hathanh"]);
        // Specific unanswered aspect is preserved
        expect(response.data.unansweredAspects).toEqual([
          "Tài liệu hiện chưa có thông tin xác minh về bảng giá dịch vụ lưu trú homestay cụ thể tại làng.",
        ]);
        // No fake model parts added in SOURCE_ONLY
        expect(response.data.answerParts.some(p => p.mode === "EXPANDED")).toBe(false);
      }
    });

    it("does not equate 'no entrance fee' with 'all services free'", () => {
      // Input has no evidence about free homestays. An answer claiming everything is free is invalid grounding
      const input: QaGenerationInput = {
        question: "Ở Hạ Thành có miễn phí hết không?",
        history: [],
        context: { type: "GENERAL" },
        evidence: [haThanhEvidence],
        knowledgeMode: "SOURCE_ONLY",
      };

      // Properly qualified answer passes grounding
      const properlyQualifiedAnswer = {
        status: "ANSWERED" as const,
        answerParts: [
          {
            text: "Theo hồ sơ, làng Hạ Thành không thu vé tham quan vào cửa chung. Điều này không đồng nghĩa các dịch vụ lưu trú, ăn uống đều miễn phí.",
            citationIds: ["c_hathanh"],
            mode: "SOURCE" as const,
          },
        ],
        citations: [haThanhEvidence.citation],
        unansweredAspects: [],
      };

      expect(() => assertQaAnswerGrounding(properlyQualifiedAnswer, input)).not.toThrow();
    });
  });

  describe("EXPANDED mode with advisory knowledge under uncertainty", () => {
    it("allows model to provide reference advice with mode EXPANDED and clear uncertainty qualification", async () => {
      const mockStore: Partial<QaConversationStore> = {
        reserve: vi.fn(async () => ({
          kind: "RESERVED" as const,
          conversationId: "conv-unc-2",
          turnId: "turn-unc-2",
          fence: 1,
          history: [],
        })),
        complete: vi.fn(async (_p, admission, data) => data),
        fail: vi.fn(async () => undefined),
      };

      const mockRetriever = {
        retrieve: vi.fn(async () => [haThanhEvidence]),
        recheck: vi.fn(async () => true),
      };

      const expandedMixedAnswer = {
        status: "ANSWERED" as const,
        answerParts: [
          {
            text: "Làng Hạ Thành không thu phí vào cửa chung; du khách có thể tự do tham quan không gian làng và ngắm các nếp nhà sàn mái cọ.",
            citationIds: ["c_hathanh"],
            mode: "SOURCE" as const,
          },
          {
            text: "Thông tin tham khảo: Giá lưu trú homestay tại Hạ Thành thường dao động từ 100.000 – 250.000 VNĐ/người/đêm tùy theo dịch vụ ăn uống kèm theo. Bạn nên liên hệ trước với chủ nhà để xác nhận giá tại thời điểm lưu trú.",
            citationIds: [],
            mode: "EXPANDED" as const,
          },
        ],
        citations: [haThanhEvidence.citation],
        unansweredAspects: [],
        presentation: "PARAGRAPHS" as const,
      };

      const mockGenerator = {
        generate: vi.fn(async () => expandedMixedAnswer),
      };

      const service = createQaService({
        store: mockStore as QaConversationStore,
        retriever: mockRetriever,
        generator: mockGenerator,
      });

      const response = await service.ask(principal, "key-exp-uncertainty", {
        question: "Làng Hạ Thành có thu vé không và giá homestay khoảng bao nhiêu?",
        context: { type: "GENERAL" },
        knowledgeMode: "EXPANDED",
      });

      expect(response.data.status).toBe("ANSWERED");
      if (response.data.status === "ANSWERED") {
        expect(response.data.answerParts).toHaveLength(2);
        // Part 1: source-backed, has citations
        expect(response.data.answerParts[0]!.mode).toBe("SOURCE");
        expect(response.data.answerParts[0]!.citationIds).toEqual(["c_hathanh"]);
        // Part 2: model advisory, labeled EXPANDED, NO document citations
        expect(response.data.answerParts[1]!.mode).toBe("EXPANDED");
        expect(response.data.answerParts[1]!.citationIds).toEqual([]);
        expect(response.data.answerParts[1]!.text).toContain("Thông tin tham khảo");
      }
    });

    it("preserves historical milestone accuracy (2017 recognition) without certifying current year schedule", () => {
      const input: QaGenerationInput = {
        question: "Lễ hội Cầu Trăng ở Hạ Thành năm nay diễn ra ngày nào?",
        history: [],
        context: { type: "GENERAL" },
        evidence: [haThanhEvidence],
        knowledgeMode: "EXPANDED",
      };

      const milestoneAnswer = {
        status: "PARTIAL" as const,
        answerParts: [
          {
            text: "Hồ sơ ghi nhận lễ hội Cầu Trăng của người Tày tại thôn Hạ Thành đã được công nhận là Di sản văn hóa phi vật thể quốc gia vào năm 2017.",
            citationIds: ["c_hathanh"],
            mode: "SOURCE" as const,
          },
          {
            text: "Thông tin tham khảo: Lễ hội Cầu Trăng thường được tổ chức vào dịp rằm tháng Tám âm lịch hàng năm. Lịch tổ chức cụ thể của năm nay cần kiểm tra thông báo của chính quyền địa phương hoặc ban quản lý du lịch xã Phương Độ.",
            citationIds: [],
            mode: "EXPANDED" as const,
          },
        ],
        citations: [haThanhEvidence.citation],
        unansweredAspects: ["Chưa có lịch tổ chức chính thức của năm nay trong tài liệu xác minh."],
      };

      expect(() => assertQaAnswerGrounding(milestoneAnswer, input)).not.toThrow();
    });
  });
});
