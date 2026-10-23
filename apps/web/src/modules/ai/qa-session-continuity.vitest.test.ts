import { describe, expect, it, vi } from "vitest";
import { createQaService } from "./qa-service";
import { createQaQuestionUnderstander } from "./qa-question-understander";
import { composeQaPrompt } from "./qa-prompt";
import { deterministicQuestionUnderstanding, matchKnownDestinations } from "./qa-question-understanding";
import type { QaCompletedTurn, QaKnowledgeMode, QaRequest } from "./qa-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import type { QaGenerator, QaHistoryTurn, QaRetriever } from "./qa-runtime-contract";
import { qaSessionHistory, QA_SESSION_HISTORY_LIMITS } from "./qa-session-history";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { createQaRetriever } from "./qa-retrieval";
import { createFakeEmbeddingProvider } from "../rag-processing/__fixtures__/fake-embedding-provider";
import type { Database } from "@KLTN/db";

const quanBa = "Cổng Trời Quản Bạ";
const lungCu = "Cột cờ Lũng Cú";
const priorAnswer = "Nội dung trả lời cũ không được dùng làm bằng chứng.";
const response: QaCompletedTurn = {
  conversationId: "session", turnId: "previous", turnState: "COMPLETED",
  context: { type: "GENERAL" }, knowledgeMode: "EXPANDED", status: "ANSWERED",
  answerParts: [{ text: priorAnswer, citationIds: [], mode: "EXPANDED" }],
  citations: [], unansweredAspects: [],
};

function envelope(subjects: string[], question: string, ambiguous = subjects.length === 0) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
    targetSubjects: subjects, intent: "SCHEDULE", attributes: ["thời gian tham quan"],
    temporalConstraint: question.includes("8-9h") ? "8-9h" : null, conditions: [],
    searchQuery: [...subjects, question].join(" "), ambiguous,
    clarificationQuestion: ambiguous ? "Bạn muốn hỏi về điểm đến nào?" : null,
  }) } }] }), { headers: { "content-type": "application/json" } });
}

function setup(initial: QaHistoryTurn[] = [], fetcher?: typeof fetch) {
  const history = [...initial];
  let request: QaRequest;
  const store = {
    reserve: vi.fn<QaConversationStore["reserve"]>(async (_principal, _key, input) => {
      request = input;
      return { kind: "RESERVED", conversationId: "session", turnId: `turn-${history.length}`,
        fence: 1, history: [...history], context: { type: "GENERAL" } };
    }),
    complete: vi.fn<QaConversationStore["complete"]>(async (_principal, _reservation, data) => {
      history.push({ question: request.question, response: data });
      return data;
    }),
    fail: vi.fn(async () => {}), history: vi.fn(), delete: vi.fn(), revokeGuest: vi.fn(), cleanup: vi.fn(),
  } satisfies QaConversationStore;
  const provider = vi.fn<typeof fetch>(fetcher ?? (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const input = JSON.parse(body.messages[1].content);
    // Simulates semantic resolution only when the real service sends the subject.
    const subjectQuestion = [input.question, ...[...input.recentUserQuestions].reverse()]
      .find((text: string) => /cổng trời|lũng cú/iu.test(text)) ?? "";
    return envelope(subjectQuestion.includes("lũng cú") ? [lungCu] : /cổng trời/iu.test(subjectQuestion) ? [quanBa] : [], input.question);
  }));
  const retriever = { retrieve: vi.fn<QaRetriever["retrieve"]>(async () => []), recheck: vi.fn(async () => true) };
  const generator = { generate: vi.fn<QaGenerator["generate"]>(async () => ({
    status: "ANSWERED", answerParts: [{ text: priorAnswer, mode: "EXPANDED", citationIds: [] }],
    citations: [], unansweredAspects: [],
  })) };
  const service = createQaService({ store, retriever, generator,
    understander: createQaQuestionUnderstander({ apiKey: () => "offline", fetcher: provider }) });
  const ask = (question: string, knowledgeMode: QaKnowledgeMode = "EXPANDED") => service.ask({ kind: "USER", id: "owned-user" }, `key-${history.length}`, {
    ...(history.length ? { conversationId: "session", parentTurnId: history.at(-1)!.response.turnId } : { context: { type: "GENERAL" as const } }),
    question, knowledgeMode,
  });
  return { ask, history, provider, generator, retriever, store };
}

describe("session continuity from the Quan Ba screenshot", () => {
  it("keeps the subject through timing questions, corrections and colloquial follow-ups", async () => {
    const t = setup();
    for (const question of [
      "Giới thiệu cho tôi chi tiết về cổng trời quản bạ",
      "nên tham quan thời gian nào là hợp lý nhất",
      "trong ngày thì nên đi giờ nào ?",
      "tôi hỏi cổng trời quản bạ mà, nên đi thời gian trong ngày như nào",
      "tầm 8-9h có dc k, có gì đặc biệt k",
      "đầu giờ chiều có ổn k nhỉ",
    ]) {
      expect((await t.ask(question)).data.status).toBe("ANSWERED");
      const call = t.generator.generate.mock.lastCall![0];
      const payload = JSON.parse(composeQaPrompt(call)[1]!.content);
      expect(payload.RESOLVED_QUESTION.targetSubjects).toEqual([quanBa]);
      expect(t.retriever.retrieve.mock.lastCall![4]!.targetSubjects).toEqual([quanBa]);
      expect(JSON.stringify(payload)).not.toContain(priorAnswer);
    }
    const finalPayload = JSON.parse(JSON.parse(String(t.provider.mock.lastCall![1]?.body)).messages[1].content);
    expect(finalPayload.recentUserQuestions).toContain("tầm 8-9h có dc k, có gì đặc biệt k");
    expect(JSON.stringify(finalPayload)).not.toContain(priorAnswer);
  });

  it("keeps intervening conditions and the named subject beyond two turns", async () => {
    const questions = ["giới thiệu cổng trời quản bạ", "tôi đi cùng người lớn tuổi", "không đi xe máy", "tháng 10/2026", "cần lưu ý gì"];
    const t = setup(questions.map(question => ({ question, response })));
    await t.ask("đầu giờ chiều có ổn k nhỉ");
    const body = JSON.parse(String(t.provider.mock.lastCall![1]?.body));
    expect(JSON.parse(body.messages[1].content).recentUserQuestions).toEqual(questions);
    const payload = JSON.parse(composeQaPrompt(t.generator.generate.mock.lastCall![0])[1]!.content);
    expect(payload.HISTORY_QUESTIONS).toEqual(questions);
  });

  it("switches to a newly named place and does not revive the previous one", async () => {
    const t = setup([{ question: "Giới thiệu cổng trời quản bạ", response }]);
    await t.ask("Còn cột cờ lũng cú thì sao?");
    await t.ask("đầu giờ chiều có ổn k nhỉ");
    const payload = JSON.parse(composeQaPrompt(t.generator.generate.mock.lastCall![0])[1]!.content);
    expect(payload.RESOLVED_QUESTION.targetSubjects).toEqual([lungCu]);
  });

  it("keeps explicit subjects when the provider proposes an unrelated one", async () => {
    const understander = createQaQuestionUnderstander({ apiKey: () => "offline",
      fetcher: async () => envelope(["Cao nguyên đá Đồng Văn"], "Đồng Văn buổi sáng") });
    const result = await understander.understand({ question: "Giới thiệu cổng trời quản bạ" });
    expect(result.targetSubjects).toEqual([quanBa]);
    expect(result.searchQuery).toContain(quanBa);
    expect(result.searchQuery).not.toContain("Đồng Văn");
  });

  it("asks which subject after a comparison even when the provider chooses one", async () => {
    const t = setup([{ question: "So sánh cổng trời quản bạ và cột cờ lũng cú", response }],
      async () => envelope([quanBa], "ở đó vào giờ nào"));
    expect((await t.ask("trong ngày thì nên đi giờ nào?")).data.status).toBe("CLARIFICATION_REQUIRED");
    expect(t.retriever.retrieve).not.toHaveBeenCalled();
    expect(t.generator.generate).not.toHaveBeenCalled();
  });

  it("falls back to the active subject when understanding is unavailable", async () => {
    const t = setup([{ question: "Giới thiệu cổng trời quản bạ", response },
      { question: "nên tham quan thời gian nào là hợp lý nhất", response }], async () => new Response("unavailable", { status: 503 }));
    await t.ask("trong ngày thì nên đi giờ nào ?");
    expect(t.retriever.retrieve.mock.lastCall![4]!.targetSubjects).toEqual([quanBa]);
  });

  it("separates Cong Troi, Nui Doi, and the broader Quan Ba area", () => {
    expect(matchKnownDestinations("cổng trời quản bạ")).toEqual([quanBa]);
    expect(matchKnownDestinations("núi đôi quản bạ")).toEqual(["Núi Đôi Quản Bạ"]);
    expect(matchKnownDestinations("Quản Bạ")).toEqual([]);
  });

  it("asks for a destination for an unanchored time follow-up", () => {
    expect(deterministicQuestionUnderstanding("trong ngày thì nên đi giờ nào ?").ambiguous).toBe(true);
  });

  it("does not carry another chat's subject into a fresh chat", async () => {
    const previous = setup();
    await previous.ask("Giới thiệu cổng trời quản bạ");
    const fresh = setup();
    expect((await fresh.ask("trong ngày thì nên đi giờ nào?")).data.status).toBe("CLARIFICATION_REQUIRED");
    expect(fresh.retriever.retrieve).not.toHaveBeenCalled();
  });

  it("does not promote an expanded old answer to evidence after switching to source-only", async () => {
    const t = setup();
    await t.ask("Giới thiệu cổng trời quản bạ");
    const result = await t.ask("trong ngày thì nên đi giờ nào?", "SOURCE_ONLY");
    expect(result.data.status).toBe("INSUFFICIENT_SOURCE");
    expect(t.generator.generate).toHaveBeenCalledTimes(1);
    expect(result.data.citations).toEqual([]);
  });

  it("uses the latest comparison rather than an older single subject", async () => {
    const t = setup([{ question: "Giới thiệu cổng trời quản bạ", response },
      { question: "So sánh cổng trời quản bạ và cột cờ lũng cú", response }],
      async () => envelope([quanBa], "tham quan buổi sáng"));
    expect((await t.ask("trong ngày thì nên đi giờ nào?")).data.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("keeps the authorized destination context when the provider names another place", async () => {
    const understander = createQaQuestionUnderstander({ apiKey: () => "offline",
      fetcher: async () => envelope([lungCu], "Lũng Cú buổi sáng") });
    const result = await understander.understand({ question: "nên đi giờ nào?",
      context: { type: "DESTINATION", destinationId: "destination-quanba", name: quanBa } });
    expect(result.targetSubjects).toEqual([quanBa]);
    expect(result.searchQuery).not.toContain(lungCu);
  });

  it("does not clear semantic ambiguity merely because subject candidates exist", async () => {
    const understander = createQaQuestionUnderstander({ apiKey: () => "offline",
      fetcher: async () => envelope(["Làng Nậm Đăm", "Du Già"], "chỗ còn lại thì sao", true) });
    const result = await understander.understand({ question: "chỗ còn lại thì sao?",
      history: [{ question: "Giới thiệu làng Nậm Đăm và Du Già", response }] });
    expect(result.ambiguous).toBe(true);
    expect(result.clarificationQuestion).toBeTruthy();
  });

  it("bounds history to twelve recent questions without leaking responses", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ question: `câu hỏi ${i}`, response }));
    const selected = qaSessionHistory(history);
    expect(selected.map(turn => turn.question)).toEqual(history.slice(-12).map(turn => turn.question));
    expect(selected.reduce((sum, turn) => sum + countEmbeddingTokens(JSON.stringify(turn.question)), 0))
      .toBeLessThanOrEqual(QA_SESSION_HISTORY_LIMITS.tokens);
  });

  it("does not skip an oversized recent condition to retrieve an older subject", () => {
    const history = [{ question: "giới thiệu cổng trời quản bạ", response }, { question: "旅 ".repeat(950), response }];
    expect(qaSessionHistory(history)).toEqual([]);
  });

  it("retrieves a canonical mixed-case subject against lowercased database text", async () => {
    const text = `${quanBa} là điểm ngắm cảnh ở Hà Giang.`;
    const rows = [{ documentId: "doc-quanba", generationId: "gen-quanba", contentVersionId: "cv-quanba",
      chunkId: "chunk-quanba", chunkHash: "hash-quanba", text, tokenCount: countEmbeddingTokens(text),
      score: 0.9, sourceTitle: quanBa, fileType: "TXT", locators: [] }];
    const query = vi.fn(async (statement: { sql: string; values: unknown[] }) => {
      // Mirrors PostgreSQL strpos(lower(text), needle): the bound needle must
      // use the same case as the normalized column, in both retrieval branches.
      if (statement.sql.includes('e."embedding" <=>')) {
        return statement.values.includes(quanBa.toLocaleLowerCase("vi")) ? rows : [];
      }
      return [];
    });
    const retriever = createQaRetriever({ $queryRaw: query } as unknown as Database,
      { provider: createFakeEmbeddingProvider().provider, hybrid: true });
    const evidence = await retriever.retrieve("trong ngày thì nên đi giờ nào?", [], undefined,
      { type: "GENERAL" }, deterministicQuestionUnderstanding(`nên đi giờ nào ở ${quanBa}?`));
    expect(evidence.map(item => item.chunkId)).toEqual(["chunk-quanba"]);
    const retrievalCalls = query.mock.calls.filter(([statement]) => statement.sql.includes('e."embedding" <=>'));
    expect(retrievalCalls).toHaveLength(2);
    expect(retrievalCalls.every(([statement]) => statement.values.includes(quanBa.toLocaleLowerCase("vi")))).toBe(true);
  });
});
