import { describe, expect, it, vi } from "vitest";
import { createQaService } from "./qa-service";
import { createQaGenerator } from "./qa-generation";
import type { QaEvidence, QaHistoryTurn, QaPrincipal } from "./qa-runtime-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import type { Database } from "@KLTN/db";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";

vi.mock("server-only", () => ({}));

describe("Ticket 03: Natural Source-Only Answers with Simplified AI Flow", () => {
  const principal: QaPrincipal = { kind: "USER", id: "user-1" };
  const baseEvidenceText = "Làng văn hóa du lịch cộng đồng thôn Hạ Thành thuộc xã Phương Độ, thành phố Hà Giang. Làng có hơn 100 nóc nhà sàn gỗ của người Tày, mái lợp lá cọ.";
  const sampleEvidence: QaEvidence = {
    citationId: "c1",
    documentId: "doc-1",
    generationId: "gen-1",
    contentVersionId: "cv-1",
    chunkId: "chk-1",
    chunkHash: "hash-1",
    text: baseEvidenceText,
    tokenCount: countEmbeddingTokens(baseEvidenceText),
    score: 0.88,
    citation: {
      id: "c1",
      sourceId: "source-1",
      title: "Hồ sơ Làng văn hóa Hạ Thành",
      sourceUrl: null,
      locators: [],
    },
  };

  function setupHarness(options: { generatorOutcome?: any } = {}) {
    const mockStore: Partial<QaConversationStore> = {
      reserve: vi.fn(async () => ({
        kind: "RESERVED" as const,
        conversationId: "conv-1",
        turnId: "turn-1",
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

    const mockAssessor = {
      assess: vi.fn(async () => {
        throw new Error("Assessor should NOT be called in simplified normal flow!");
      }),
    };

    const defaultAnswer = options.generatorOutcome ?? {
      status: "ANSWERED" as const,
      answerParts: [
        {
          text: "Hạ Thành là một bản làng bình yên nằm tại xã Phương Độ, nổi bật với quần thể hơn 100 nếp nhà sàn truyền thống của đồng bào Tày nép mình dưới những rặng cọ xanh mát.",
          citationIds: ["c1"],
        },
      ],
      citations: [sampleEvidence.citation],
      unansweredAspects: [],
      presentation: "PARAGRAPHS" as const,
    };

    const mockGenerator = {
      generate: vi.fn(async () => defaultAnswer),
    };

    const service = createQaService({
      store: mockStore as QaConversationStore,
      retriever: mockRetriever,
      generator: mockGenerator,
      assessor: mockAssessor,
      eligibilityPollMs: 5000,
    });

    return { service, mockStore, mockRetriever, mockGenerator, mockAssessor };
  }

  it("does NOT dispatch assessor in the normal flow", async () => {
    const { service, mockAssessor, mockGenerator } = setupHarness();

    const response = await service.ask(principal, "key-1", {
      question: "Làng Hạ Thành có điểm gì đặc biệt?",
      context: { type: "GENERAL" },
    });

    expect(mockAssessor.assess).not.toHaveBeenCalled();
    expect(mockGenerator.generate).toHaveBeenCalledOnce();
    expect(response.data.status).toBe("ANSWERED");
  });

  it("accepts natural paraphrasing that is not verbatim copied from source text", async () => {
    const paraphrasedText =
      "Đến với Hạ Thành, du khách sẽ ấn tượng trước khung cảnh thanh bình và hơn 100 ngôi nhà sàn mái cọ cổ kính của người Tày.";
    const { service } = setupHarness({
      generatorOutcome: {
        status: "ANSWERED" as const,
        answerParts: [{ text: paraphrasedText, citationIds: ["c1"] }],
        citations: [sampleEvidence.citation],
        unansweredAspects: [],
        presentation: "PARAGRAPHS" as const,
      },
    });

    const response = await service.ask(principal, "key-2", {
      question: "Giới thiệu về làng Hạ Thành",
      context: { type: "GENERAL" },
    });

    expect(response.data.status).toBe("ANSWERED");
    expect(response.data.answerParts[0]!.text).toBe(paraphrasedText);
    expect(response.data.citations).toHaveLength(1);
  });

  it("accepts structured paragraph and list presentations", async () => {
    const { service } = setupHarness({
      generatorOutcome: {
        status: "ANSWERED" as const,
        answerParts: [
          { text: "Làng Hạ Thành có hai nét văn hóa tiêu biểu:", citationIds: ["c1"] },
          { text: "1. Quần thể hơn 100 ngôi nhà sàn lợp lá cọ truyền thống.", citationIds: ["c1"] },
          { text: "2. Nếp sống văn hóa đậm đà bản sắc của dân tộc Tày.", citationIds: ["c1"] },
        ],
        citations: [sampleEvidence.citation],
        unansweredAspects: [],
        presentation: "LIST" as const,
      },
    });

    const response = await service.ask(principal, "key-3", {
      question: "Liệt kê các điểm đặc sắc của làng Hạ Thành",
      context: { type: "GENERAL" },
    });

    expect(response.data.status).toBe("ANSWERED");
    expect(response.data.answerParts).toHaveLength(3);
  });

  it("preserves partial answers when missing specific unverified attributes", async () => {
    const { service } = setupHarness({
      generatorOutcome: {
        status: "PARTIAL" as const,
        answerParts: [
          {
            text: "Làng Hạ Thành có hơn 100 nóc nhà sàn gỗ của người Tày. Hiện chưa có thông tin xác minh về bảng giá dịch vụ lưu trú homestay cụ thể.",
            citationIds: ["c1"],
          },
        ],
        citations: [sampleEvidence.citation],
        unansweredAspects: ["Chưa xác minh được chi phí lưu trú cụ thể tại thời điểm hỏi."],
        presentation: "PARAGRAPHS" as const,
      },
    });

    const response = await service.ask(principal, "key-4", {
      question: "Làng Hạ Thành có gì và giá phòng homestay bao nhiêu?",
      context: { type: "GENERAL" },
    });

    expect(response.data.status).toBe("PARTIAL");
    expect(response.data.answerParts).toHaveLength(1);
    if (response.data.status === "PARTIAL") {
      expect(response.data.unansweredAspects.length).toBeGreaterThan(0);
    }
  });

  it("fails closed with 502 if generator emits a fabricated non-existent citation ID", async () => {
    const { service } = setupHarness({
      generatorOutcome: {
        status: "ANSWERED" as const,
        answerParts: [{ text: "Thông tin bịa nguồn.", citationIds: ["c99"] }],
        citations: [{ ...sampleEvidence.citation, id: "c99" }],
        unansweredAspects: [],
      },
    });

    await expect(
      service.ask(principal, "key-5", { question: "Câu hỏi test", context: { type: "GENERAL" } })
    ).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("returns INSUFFICIENT_SOURCE without calling generator when no evidence is retrieved", async () => {
    const { service, mockRetriever, mockGenerator } = setupHarness();
    mockRetriever.retrieve.mockResolvedValueOnce([]);

    const response = await service.ask(principal, "key-6", {
      question: "Địa điểm không có trong cơ sở dữ liệu?",
      context: { type: "GENERAL" },
    });

    expect(response.data.status).toBe("INSUFFICIENT_SOURCE");
    expect(mockGenerator.generate).not.toHaveBeenCalled();
  });
});
