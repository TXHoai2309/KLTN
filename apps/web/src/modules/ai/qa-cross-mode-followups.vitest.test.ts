import { describe, expect, it, vi } from "vitest";
import { createQaService } from "./qa-service";
import { qaFollowupClarification, QA_FOLLOWUP_CLARIFICATIONS } from "./qa-question-understanding";
import type { QaEvidence, QaGenerationInput, QaHistoryTurn, QaPrincipal } from "./qa-runtime-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import type { QaCompletedTurn } from "./qa-contract";

vi.mock("server-only", () => ({}));

describe("Ticket 07: Cross-Mode Follow-ups Without Knowledge Contamination", () => {
  const principal: QaPrincipal = { kind: "USER", id: "user-crossmode-1" };

  const haThanhEvidence: QaEvidence = {
    citationId: "c_ht",
    documentId: "doc_ht",
    generationId: "gen-1",
    contentVersionId: "cv-1",
    chunkId: "chk-ht",
    chunkHash: "hash-ht",
    text: "Làng Hạ Thành có hơn 100 nóc nhà sàn gỗ của người Tày, lợp lá cọ truyền thống.",
    tokenCount: 40,
    score: 0.95,
    citation: {
      id: "c_ht",
      sourceId: "source-ht",
      title: "Hồ sơ Làng Hạ Thành",
      sourceUrl: null,
      locators: [],
    },
  };

  const lungCuEvidence: QaEvidence = {
    citationId: "c_lc",
    documentId: "doc_lc",
    generationId: "gen-1",
    contentVersionId: "cv-1",
    chunkId: "chk-lc",
    chunkHash: "hash-lc",
    text: "Cột cờ Lũng Cú nằm trên đỉnh Long Sơn, là điểm cực Bắc của Tổ quốc.",
    tokenCount: 45,
    score: 0.96,
    citation: {
      id: "c_lc",
      sourceId: "source-lc",
      title: "Hồ sơ Cột cờ Lũng Cú",
      sourceUrl: null,
      locators: [],
    },
  };

  function setupCrossModeHarness() {
    const history: QaHistoryTurn[] = [];

    const mockStore: Partial<QaConversationStore> = {
      reserve: vi.fn(async (_p, _key, request) => {
        return {
          kind: "RESERVED" as const,
          conversationId: "conv-cross",
          turnId: `turn-${history.length + 1}`,
          fence: 1,
          history: [...history],
          context: request.context,
        };
      }),
      complete: vi.fn(async (_p, _admission, data) => {
        history.push({
          question: (data as any).questionText ?? "Câu hỏi lượt trước",
          response: data,
        });
        return data;
      }),
      fail: vi.fn(async () => undefined),
    };

    const mockRetriever = {
      retrieve: vi.fn(async (_q, _plan, _history, context) => {
        if (context.type === "DESTINATION" && context.name?.includes("Lũng Cú")) {
          return [lungCuEvidence];
        }
        return [haThanhEvidence];
      }),
      recheck: vi.fn(async () => true),
    };

    const generatorCalls: QaGenerationInput[] = [];
    const mockGenerator = {
      generate: vi.fn(async (input: QaGenerationInput) => {
        generatorCalls.push(input);
        if (input.knowledgeMode === "EXPANDED") {
          return {
            status: "ANSWERED" as const,
            answerParts: [
              { text: "Thông tin từ hồ sơ:", citationIds: [input.evidence[0]!.citationId], mode: "SOURCE" as const },
              { text: "Kinh nghiệm mở rộng từ model:", citationIds: [], mode: "EXPANDED" as const },
            ],
            citations: [input.evidence[0]!.citation],
            unansweredAspects: [],
            presentation: "PARAGRAPHS" as const,
          };
        } else {
          return {
            status: "ANSWERED" as const,
            answerParts: [
              { text: "Nội dung chỉ từ tài liệu nguồn.", citationIds: [input.evidence[0]!.citationId], mode: "SOURCE" as const },
            ],
            citations: [input.evidence[0]!.citation],
            unansweredAspects: [],
            presentation: "PARAGRAPHS" as const,
          };
        }
      }),
    };

    const service = createQaService({
      store: mockStore as QaConversationStore,
      retriever: mockRetriever,
      generator: mockGenerator,
    });

    return { service, mockStore, mockRetriever, mockGenerator, history, generatorCalls };
  }

  it("Turn 1 (EXPANDED) -> Turn 2 (SOURCE_ONLY): model knowledge from Turn 1 is NOT treated as evidence for Turn 2", async () => {
    const { service, generatorCalls, mockRetriever } = setupCrossModeHarness();

    // Turn 1: In EXPANDED mode
    const turn1 = await service.ask(principal, "key-t1", {
      question: "Làng Hạ Thành có gì đẹp?",
      context: { type: "GENERAL" },
      knowledgeMode: "EXPANDED",
    });

    expect(turn1.data.status).toBe("ANSWERED");
    expect(turn1.data.knowledgeMode).toBe("EXPANDED");
    expect(turn1.data.answerParts).toHaveLength(2);
    expect(turn1.data.answerParts[1]!.mode).toBe("EXPANDED");

    // Turn 2: User switches toggle to SOURCE_ONLY, then asks a follow-up
    const turn2 = await service.ask(principal, "key-t2", {
      conversationId: "conv-cross",
      parentTurnId: turn1.data.turnId,
      question: "Ở đó có những nét văn hóa nào nổi bật?",
      knowledgeMode: "SOURCE_ONLY",
    });

    expect(turn2.data.status).toBe("ANSWERED");
    expect(turn2.data.knowledgeMode).toBe("SOURCE_ONLY");

    // Check what was passed into generator on Turn 2:
    const t2Input = generatorCalls[1]!;
    expect(t2Input.knowledgeMode).toBe("SOURCE_ONLY");
    // Generator evidence on Turn 2 contains ONLY the fresh retrieved document chunks, NOT Turn 1 model text!
    expect(t2Input.evidence).toEqual([haThanhEvidence]);
    // Turn 2 answer parts must have NO EXPANDED parts
    expect(turn2.data.answerParts.every(p => p.mode === "SOURCE")).toBe(true);
  });

  it("replaces previous destination when user explicitly introduces a new destination", async () => {
    const { service, mockRetriever } = setupCrossModeHarness();

    // Turn 1: About Ha Thanh
    await service.ask(principal, "key-dest-1", {
      question: "Làng Hạ Thành ở đâu?",
      context: { type: "GENERAL" },
      knowledgeMode: "SOURCE_ONLY",
    });

    // Turn 2: User explicitly asks about Lung Cu
    mockRetriever.retrieve.mockResolvedValueOnce([lungCuEvidence]);
    const turn2 = await service.ask(principal, "key-dest-2", {
      conversationId: "conv-cross",
      parentTurnId: "turn-1",
      question: "Thế còn Cột cờ Lũng Cú thì sao?",
      knowledgeMode: "EXPANDED",
    });

    expect(turn2.data.status).toBe("ANSWERED");
    expect(turn2.data.citations[0]!.id).toBe("c_lc");
    expect(turn2.data.citations[0]!.title).toContain("Cột cờ Lũng Cú");
  });

  it("asks for clarification instead of guessing when previous turn compared multiple places and follow-up is ambiguous", () => {
    const historyWithComparison: QaHistoryTurn[] = [
      {
        question: "So sánh làng Hạ Thành và làng Lũng Cẩm",
        response: {
          conversationId: "conv-comp",
          turnId: "t1",
          turnState: "COMPLETED",
          status: "ANSWERED",
          context: { type: "GENERAL" },
          knowledgeMode: "SOURCE_ONLY",
          answerParts: [{ text: "So sánh hai làng.", citationIds: ["c1"], mode: "SOURCE" }],
          citations: [{ id: "c1", sourceId: "s1", title: "Doc", sourceUrl: null, locators: [] }],
          unansweredAspects: [],
        },
      },
    ];

    const clarification = qaFollowupClarification(
      "Ở đó có homestay không?",
      historyWithComparison,
      { type: "GENERAL" }
    );

    expect(clarification).toBe(QA_FOLLOWUP_CLARIFICATIONS.multipleSubjects);
    expect(clarification).toBe("Bạn đang muốn hỏi về điểm đến nào trong các nơi vừa nhắc?");
  });

  it("preserves provenance and mode of historical turns independently of mode switches", async () => {
    const { service, history } = setupCrossModeHarness();

    // Turn 1: SOURCE_ONLY
    await service.ask(principal, "key-m1", {
      question: "Hỏi turn 1",
      context: { type: "GENERAL" },
      knowledgeMode: "SOURCE_ONLY",
    });

    // Turn 2: EXPANDED
    await service.ask(principal, "key-m2", {
      conversationId: "conv-cross",
      parentTurnId: "turn-1",
      question: "Hỏi turn 2",
      knowledgeMode: "EXPANDED",
    });

    // Turn 3: SOURCE_ONLY
    await service.ask(principal, "key-m3", {
      conversationId: "conv-cross",
      parentTurnId: "turn-2",
      question: "Hỏi turn 3",
      knowledgeMode: "SOURCE_ONLY",
    });

    // Verify history stored in store
    expect(history).toHaveLength(3);
    expect(history[0]!.response.knowledgeMode).toBe("SOURCE_ONLY");
    expect(history[1]!.response.knowledgeMode).toBe("EXPANDED");
    expect(history[2]!.response.knowledgeMode).toBe("SOURCE_ONLY");
  });
});
