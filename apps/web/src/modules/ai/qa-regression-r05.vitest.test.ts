import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createQaService } from "./qa-service";
import { validateQaAssessment } from "./qa-assessment";
import { validateQaGenerationOutput } from "./qa-generation";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";
import type { QaAnswer, QaEvidence, QaGenerationInput, QaPrincipal } from "./qa-runtime-contract";
import type { QaConversationStore, QaReservation } from "./qa-conversation-store";

function createMockStore(principal: QaPrincipal) {
  let activeTurnId: string | null = null;
  const turns: Record<string, any> = {};

  const store: QaConversationStore = {
    reserve: vi.fn(async (p, key, req) => {
      if (activeTurnId) throw new Error("CONVERSATION_BUSY");
      const turnId = `turn_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      activeTurnId = turnId;
      turns[turnId] = { id: turnId, key, req, state: "PROCESSING" };
      const reservation: QaReservation = {
        kind: "RESERVED",
        conversationId: "conv_1",
        turnId,
        fence: 1,
        history: [],
      };
      return reservation;
    }),
    complete: vi.fn(async (p, r, data) => {
      activeTurnId = null;
      turns[r.turnId] = { ...turns[r.turnId], state: "COMPLETED", response: data };
      return data;
    }),
    fail: vi.fn(async (p, r, code) => {
      activeTurnId = null;
      turns[r.turnId] = { ...turns[r.turnId], state: "FAILED", errorCode: code };
    }),
    history: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
    revokeGuest: vi.fn(async () => {}),
    cleanup: vi.fn(async () => ({
      processed: 0,
      hasMore: false,
      lockAcquired: true,
      lastSuccessfulSweep: null,
      eligibleBacklogCount: 0,
      oldestOverdueItem: null,
      failureCount: 0,
    })),
  };

  return { store, getTurns: () => turns, getActiveTurn: () => activeTurnId };
}

describe("US-23 R05 AI_INVALID_RESPONSE Regression Suite", () => {
  const citation1 = { id: "c1", sourceId: "dong_van_source", title: "Hồ sơ Cao nguyên đá Đồng Văn", sourceUrl: null, locators: [] };
  const citation2 = { id: "c2", sourceId: "dong_van_source", title: "Hồ sơ Cao nguyên đá Đồng Văn", sourceUrl: null, locators: [] };

  const geologyEvidence: QaEvidence = {
    citationId: "c1",
    documentId: "doc_dong_van",
    generationId: "gen_1",
    contentVersionId: "ver_1",
    chunkId: "chunk_1",
    chunkHash: "hash_1",
    text: "Công viên địa chất toàn cầu UNESCO Cao nguyên đá Đồng Văn nằm trên địa bàn bốn huyện cũ Quản Bạ, Yên Minh, Đồng Văn và Mèo Vạc.",
    tokenCount: 30,
    score: 0.65,
    citation: citation1,
  };

  const designationEvidence: QaEvidence = {
    citationId: "c2",
    documentId: "doc_dong_van",
    generationId: "gen_1",
    contentVersionId: "ver_1",
    chunkId: "chunk_2",
    chunkHash: "hash_2",
    text: "Danh hiệu phù hợp: UNESCO Global Geopark là một danh hiệu thuộc hệ thống công viên địa chất, không đồng nghĩa với danh mục Di sản thế giới UNESCO.",
    tokenCount: 35,
    score: 0.60,
    citation: citation2,
  };

  it("R05: Không có giá vé được xác minh → trả về INSUFFICIENT_SOURCE (không phải 502 AI_INVALID_RESPONSE)", async () => {
    const input: QaGenerationInput = {
      question: "Giá vé tham quan toàn bộ Cao nguyên đá Đồng Văn hôm nay chính xác là bao nhiêu?",
      context: { type: "GENERAL" },
      history: [],
      evidence: [geologyEvidence, designationEvidence],
    };

    // Case A: Model outputs empty aspects array because no sources are relevant
    const rawAssessorOutput = {
      intent: "CLEAR",
      exhaustive: true,
      relevance: [
        { citationId: "c1", status: "UNRELATED" },
        { citationId: "c2", status: "UNRELATED" },
      ],
      aspects: [],
    };

    // Server assessment validation normalizes this to a MISSING aspect
    const assessment = validateQaAssessment(rawAssessorOutput, input);
    expect(assessment.intent).toBe("CLEAR");
    expect(assessment.review.aspects).toHaveLength(1);
    expect(assessment.review.aspects[0]!.status).toBe("MISSING");

    // Source sufficiency evaluates cleanly to INSUFFICIENT / UNRELATED
    const decision = evaluateQaSourceSufficiency({
      kind: "COMPLETED",
      eligibility: "CURRENT",
      input,
      review: assessment.review,
    });
    expect(decision.status).toBe("INSUFFICIENT");
    expect(decision.reason).toBe("UNRELATED");

    // Service workflow
    const { store } = createMockStore({ kind: "USER", id: "user_1" });
    const retriever = { retrieve: vi.fn(async () => [geologyEvidence, designationEvidence]), recheck: vi.fn(async () => true) };
    const assessor = { assess: vi.fn(async () => assessment) };
    const generator = { generate: vi.fn(async () => ({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE } as QaAnswer)) };

    const service = createQaService({ store, retriever, assessor, generator });
    const result = await service.ask({ kind: "USER", id: "user_1" }, "r05_key", {
      question: input.question,
      context: { type: "GENERAL" },
    });

    expect(result.data.status).toBe("INSUFFICIENT_SOURCE");
    if (result.data.status === "INSUFFICIENT_SOURCE") {
      expect(result.data.message).toBe(QA_INSUFFICIENT_SOURCE_MESSAGE);
    }
    // Assessor removed: generator is called with question and evidence, returning INSUFFICIENT_SOURCE
    expect(generator.generate).toHaveBeenCalled();
    expect(store.complete).toHaveBeenCalled();
  });

  it("Có giá vé cũ (năm 2018) nhưng hỏi giá 'hôm nay' → không khẳng định giá hiện hành (status MISSING)", async () => {
    const historicalPriceEvidence: QaEvidence = {
      citationId: "c1",
      documentId: "doc_old",
      generationId: "gen_1",
      contentVersionId: "ver_1",
      chunkId: "chunk_old",
      chunkHash: "hash_old",
      text: "Năm 2018, mức thu phí tham quan một số điểm di tích trên địa bàn là 20.000 đồng một lượt.",
      tokenCount: 25,
      score: 0.7,
      citation: citation1,
    };

    const input: QaGenerationInput = {
      question: "Giá vé tham quan Cao nguyên đá Đồng Văn hôm nay chính xác là bao nhiêu?",
      context: { type: "GENERAL" },
      history: [],
      evidence: [historicalPriceEvidence],
    };

    // Assessor correctly marks current_ticket_price as MISSING because 2018 data does not verify "hôm nay"
    const assessorOutput = {
      intent: "CLEAR",
      exhaustive: true,
      relevance: [{ citationId: "c1", status: "UNRELATED" }],
      aspects: [{ id: "current_ticket_price", status: "MISSING", supports: [] }],
    };

    const assessment = validateQaAssessment(assessorOutput, input);
    const decision = evaluateQaSourceSufficiency({
      kind: "COMPLETED",
      eligibility: "CURRENT",
      input,
      review: assessment.review,
    });

    expect(decision.status).toBe("INSUFFICIENT");
    expect(decision.reason).toBe("UNRELATED");
  });

  it("R01, R02, R04: Câu hỏi có dữ liệu đầy đủ → ANSWERED với citation chuẩn", async () => {
    const input: QaGenerationInput = {
      question: "Cao nguyên đá Đồng Văn được UNESCO công nhận là gì?",
      context: { type: "GENERAL" },
      history: [],
      evidence: [geologyEvidence, designationEvidence],
    };

    const validSentence = "Công viên địa chất toàn cầu UNESCO Cao nguyên đá Đồng Văn nằm trên địa bàn bốn huyện cũ Quản Bạ, Yên Minh, Đồng Văn và Mèo Vạc.";
    const assessorOutput = {
      intent: "CLEAR",
      exhaustive: true,
      relevance: [
        { citationId: "c1", status: "RELATED" },
        { citationId: "c2", status: "UNRELATED" },
      ],
      aspects: [
        {
          id: "unesco_designation",
          status: "SUPPORTED",
          supports: [{ citationId: "c1", sentence: validSentence }],
        },
      ],
    };

    const assessment = validateQaAssessment(assessorOutput, input);
    const decision = evaluateQaSourceSufficiency({
      kind: "COMPLETED",
      eligibility: "CURRENT",
      input,
      review: assessment.review,
    });
    expect(decision.status).toBe("SUFFICIENT");
    expect(decision.reason).toBe("COMPLETE_COVERAGE");

    const generatorOutput = {
      status: "ANSWERED",
      unanswered: false,
      answerParts: [{ text: validSentence, citationIds: ["c1"] }],
    };
    const answer = validateQaGenerationOutput(generatorOutput, {
      ...input,
      sourceReview: assessment.review,
      sourceSufficiency: decision,
    });

    expect(answer.status).toBe("ANSWERED");
    expect(answer.answerParts).toHaveLength(1);
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]!.id).toBe("c1");
  });

  it("Model trả JSON sai cú pháp hoặc sai schema → lỗi được phân loại chính xác là SCHEMA", () => {
    const input: QaGenerationInput = {
      question: "Hỏi thông tin bất kỳ?",
      context: { type: "GENERAL" },
      history: [],
      evidence: [geologyEvidence],
    };

    expect(() => validateQaAssessment({ invalid: "data" }, input)).toThrow(
      expect.objectContaining({ code: "AI_INVALID_RESPONSE" })
    );

    expect(() => validateQaGenerationOutput({ status: "UNKNOWN_STATUS" }, input)).toThrow(
      expect.objectContaining({ code: "AI_INVALID_RESPONSE" })
    );
  });

  it("Model bịa citation ID không tồn tại trong evidence → bị từ chối với AI_INVALID_RESPONSE", () => {
    const input: QaGenerationInput = {
      question: "Giá vé là bao nhiêu?",
      context: { type: "GENERAL" },
      history: [],
      evidence: [geologyEvidence],
    };

    // Fabricated citation ID not in evidence registry
    const fakeCitationOutput = {
      status: "ANSWERED",
      unanswered: false,
      answerParts: [{ text: geologyEvidence.text, citationIds: ["fake_citation_id"] }],
    };

    expect(() => validateQaGenerationOutput(fakeCitationOutput, input)).toThrow(
      expect.objectContaining({ code: "AI_INVALID_RESPONSE" })
    );

    // Empty text part also rejected
    const emptyTextOutput = {
      status: "ANSWERED",
      unanswered: false,
      answerParts: [{ text: "   ", citationIds: ["c1"] }],
    };
    expect(() => validateQaGenerationOutput(emptyTextOutput, input)).toThrow(
      expect.objectContaining({ code: "AI_INVALID_RESPONSE" })
    );
  });

  it("Cả Guest và User đều hoạt động bình thường", async () => {
    const guestPrincipal: QaPrincipal = { kind: "GUEST", id: "guest_abc" };
    const userPrincipal: QaPrincipal = { kind: "USER", id: "user_xyz" };

    const mockGuest = createMockStore(guestPrincipal);
    const mockUser = createMockStore(userPrincipal);

    const question = "Giá vé tham quan là bao nhiêu?";
    const context = { type: "GENERAL" as const };
    const input: QaGenerationInput = {
      question,
      context,
      history: [],
      evidence: [geologyEvidence],
    };

    const emptyAssessment = validateQaAssessment(
      {
        intent: "CLEAR",
        exhaustive: true,
        relevance: [{ citationId: "c1", status: "UNRELATED" }],
        aspects: [],
      },
      input
    );

    const retriever = { retrieve: vi.fn(async () => [geologyEvidence]), recheck: vi.fn(async () => true) };
    const assessor = { assess: vi.fn(async () => emptyAssessment) };
    const generator = { generate: vi.fn(async () => ({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE } as QaAnswer)) };

    const guestService = createQaService({ store: mockGuest.store, retriever, assessor, generator });
    const userService = createQaService({ store: mockUser.store, retriever, assessor, generator });

    const guestResult = await guestService.ask(guestPrincipal, "key_guest", { question, context });
    const userResult = await userService.ask(userPrincipal, "key_user", { question, context });

    expect(guestResult.data.status).toBe("INSUFFICIENT_SOURCE");
    if (guestResult.data.status === "INSUFFICIENT_SOURCE") {
      expect(guestResult.data.message).toBe(QA_INSUFFICIENT_SOURCE_MESSAGE);
    }
    expect(userResult.data.status).toBe("INSUFFICIENT_SOURCE");
    if (userResult.data.status === "INSUFFICIENT_SOURCE") {
      expect(userResult.data.message).toBe(QA_INSUFFICIENT_SOURCE_MESSAGE);
    }
  });

  it("Thất bại kỹ thuật không làm treo conversation hoặc idempotency", async () => {
    const principal: QaPrincipal = { kind: "USER", id: "user_1" };
    const { store, getActiveTurn } = createMockStore(principal);

    const retriever = {
      retrieve: vi.fn(async () => [geologyEvidence]),
      recheck: vi.fn(async () => true),
    };
    const assessor = {
      assess: vi.fn(async () => {
        throw new Error("Provider parse error");
      }),
    };
    const generator = {
      generate: vi.fn(async () => {
        throw new Error("Provider parse error");
      }),
    };

    const service = createQaService({ store, retriever, assessor, generator });

    await expect(service.ask(principal, "failed_key", { question: "Câu hỏi lỗi", context: { type: "GENERAL" } })).rejects.toThrow();

    // Verify active turn was cleared and fail was called so conversation is not stuck in BUSY
    expect(store.fail).toHaveBeenCalledOnce();
    expect(getActiveTurn()).toBeNull();
  });
});
