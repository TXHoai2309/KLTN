import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { planQaQuestion } from "./qa-question-plan";
import { validateQaAssessment, createQaAssessor } from "./qa-assessment";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import { createQaGenerator } from "./qa-generation";
import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { createQaRetriever } from "./qa-retrieval";
import { createQaService } from "./qa-service";
import { assistantSourceReply } from "../../components/assistant/assistant-source-reply";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";
import { qaIntentHistory } from "./qa-question-understanding";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import type { QaGenerationInput, QaEvidence } from "./qa-runtime-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import type { Database } from "@KLTN/db";
import { QA_ADVANCED_CASES } from "./__fixtures__/qa-advanced-cases";

const envelope = (data: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }] });
function evidence(text: string, title: string, index = 1): QaEvidence {
  return { citationId: `c${index}`, documentId: `doc_${index}`, generationId: `gen_${index}`, contentVersionId: `ver_${index}`, chunkId: `chunk_${index}`, chunkHash: `hash_${index}`, text, tokenCount: countEmbeddingTokens(text), score: .8,
    citation: { id: `c${index}`, sourceId: `public_${index}`, title, sourceUrl: null, locators: [] } };
}
function input(question: string, sources: QaEvidence[]): QaGenerationInput {
  const context = { type: "GENERAL" as const };
  return { question, history: [], evidence: sources, context, questionPlan: planQaQuestion(question, [], context) };
}
function reviewed(value: QaGenerationInput, missingSecond = false) {
  return validateQaAssessment({ intent: "CLEAR", exhaustive: true, relevance: value.evidence.map(item => ({ citationId: item.citationId, status: "RELATED" })),
    aspects: value.questionPlan?.facets.map(facet => {
      const item = value.evidence.find(item => item.citation.title.toLocaleLowerCase("vi") === facet.subject);
      return { id: facet.id, kind: facet.kind, status: item && !(missingSecond && facet.id.startsWith("q2")) ? "SUPPORTED" : "MISSING", supports: item && !(missingSecond && facet.id.startsWith("q2")) ? [{ citationId: item.citationId, sentence: item.text }] : [] };
    }) ?? [{ id: "fact", status: "SUPPORTED", supports: [{ citationId: "c1", sentence: value.evidence[0]!.text }] }],
  }, value).review;
}
describe("owner advanced reasoning regressions (offline, annotated evidence)", () => {
  it.each(QA_ADVANCED_CASES)("case $id preserves source meaning and coverage", async fixture => {
    const sources = [evidence(fixture.text, fixture.title)];
    if ("other" in fixture) sources.push(evidence(fixture.other, "Chợ tình Khâu Vai", 2));
    const value = input(fixture.question, sources);
    value.sourceReview = fixture.id === 7 || fixture.id === 8 ? validateQaAssessment({ intent: "CLEAR", exhaustive: true,
      relevance: [{ citationId: "c1", status: "UNRELATED" }], aspects: value.questionPlan!.facets.map(facet => ({ id: facet.id, kind: facet.kind, status: "MISSING", supports: [] })),
    }, value).review : reviewed(value);
    value.sourceSufficiency = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input: value, review: value.sourceReview });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const prompt = JSON.parse(body.messages[1].content);
      return envelope({ status: value.sourceSufficiency!.status === "PARTIAL" ? "PARTIAL" : "ANSWERED", unanswered: value.sourceSufficiency!.status === "PARTIAL",
        facets: Object.fromEntries(prompt.REVIEWED_SUPPORT.map((aspect: { id: string; supportIds: string[] }) => [aspect.id, [{ text: prompt.SUPPORT_REGISTRY.find((ref: { id: string }) => ref.id === aspect.supportIds[0]).sentence, supportIds: [aspect.supportIds[0]] }]])) });
    });
    const answer = await createQaGenerator({ apiKey: () => "fixture", fetcher }).generate(value);
    if (fixture.id === 7 || fixture.id === 8) {
      expect(answer.status).toBe("INSUFFICIENT_SOURCE"); expect(fetcher).not.toHaveBeenCalled();
      const reply = assistantSourceReply({ ...answer, status: "INSUFFICIENT_SOURCE", message: QA_INSUFFICIENT_SOURCE_MESSAGE, answerParts: [], citations: [], conversationId: "conv", turnId: "turn", turnState: "COMPLETED", context: { type: "GENERAL" } }, fixture.question);
      expect(JSON.stringify(reply)).not.toMatch(/\?|miễn phí|24\/7|27\/3/);
    } else {
      expect(answer.status).toBe("ANSWERED"); expect(answer.answerParts.map(part => part.text).join(" ")).toContain(fixture.expected);
      if (fixture.id === 5) { expect(answer.citations.map(item => item.id)).toEqual(["c1", "c2"]); expect(answer.answerParts.some(part => part.text.includes("Chợ tình Khâu Vai"))).toBe(true); }
      expect(() => assertQaAnswerGrounding(answer, value)).not.toThrow();
    }
  });
  it.each([QA_ADVANCED_CASES[6], QA_ADVANCED_CASES[7]])("clear missing evidence cannot become clarification: $id", async fixture => {
    const value = input(fixture.question, [evidence(fixture.text, fixture.title)]);
    expect(value.questionPlan?.subjects).toEqual([fixture.title.toLocaleLowerCase("vi")]);
    const assessor = createQaAssessor({ apiKey: () => "fixture", fetcher: async () => envelope({ intent: "AMBIGUOUS", exhaustive: true, relevance: [{ citationId: "c1", status: "UNCERTAIN" }], aspects: [] }) });
    const result = await assessor.assess(value);
    expect(result.intent).toBe("CLEAR"); expect(result.review.aspects.every(aspect => aspect.status === "MISSING")).toBe(true);
  });
  it("keeps real ambiguity and selected destination scope intact", () => {
    expect(planQaQuestion("Cái đó thì sao?")).toBeUndefined();
    expect(planQaQuestion("So sánh Hồ Alpha với Đồi Beta về cảnh quan", [], { type: "DESTINATION", destinationId: "selected", name: "Hồ Alpha" })).toBeUndefined();
    const value = input("Cái nào?", [evidence("Một mô tả.", "Nguồn")]);
    expect(validateQaAssessment({ intent: "AMBIGUOUS", exhaustive: true, relevance: [{ citationId: "c1", status: "UNCERTAIN" }], aspects: [] }, value).intent).toBe("AMBIGUOUS");
  });
  it("resolves a hidden subject in a year follow-up and drops it on an explicit topic change", () => {
    const old = { question: QA_ADVANCED_CASES[7].question, response: { status: "INSUFFICIENT_SOURCE" as const, conversationId: "c", turnId: "t", turnState: "COMPLETED" as const, context: { type: "GENERAL" as const }, message: QA_INSUFFICIENT_SOURCE_MESSAGE as "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này.", answerParts: [] as [], citations: [] as [] } };
    const history = qaIntentHistory("Còn năm 2027 thì sao?", [old]);
    expect(history).toHaveLength(1);
    const plan = planQaQuestion("Còn năm 2027 thì sao?", history);
    expect(plan?.subjects).toEqual(["căng bắc mê"]);
    expect(plan?.facets.every(facet => facet.year === "2027")).toBe(true);
    expect(qaIntentHistory("Chợ tình Khâu Vai thường tổ chức phiên chính ngày nào?", [old])).toEqual([]);
  });
  it("plans other names and preserves a missing side instead of certifying complete coverage", async () => {
    const value = input("So sánh Hồ Alpha với Đồi Beta về cảnh quan", [evidence("Hồ Alpha có mặt nước rộng.", "Hồ Alpha")]);
    expect(value.questionPlan?.subjects).toEqual(["hồ alpha", "đồi beta"]);
    const review = reviewed(value);
    expect(evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input: value, review }).status).toBe("PARTIAL");
    value.sourceReview = review;
    value.sourceSufficiency = { status: "PARTIAL", reason: "PARTIAL_COVERAGE" };
    const answer = await createQaGenerator({ apiKey: () => "fixture", fetcher: async () => envelope({ status: "PARTIAL", unanswered: true,
      facets: { q1_1: [{ text: value.evidence[0]!.text, supportIds: ["s1"] }] },
    }) }).generate(value);
    expect(answer.status).toBe("PARTIAL");
    expect(answer.citations.map(item => item.id)).toEqual(["c1"]);
    expect("unansweredAspects" in answer && answer.unansweredAspects.join(" ")).toContain("đồi beta");
    expect(() => assertQaAnswerGrounding(answer, value)).not.toThrow();
    const omitted = { ...review, aspects: review.aspects.slice(0, 1) };
    expect(evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input: value, review: omitted }).reason).toBe("INVALID_REVIEW");
    const borrowed = { ...review, aspects: review.aspects.map(aspect => ({ ...aspect, status: "SUPPORTED" as const, supports: [{ citationId: "c1", sentence: value.evidence[0]!.text }] })) };
    expect(evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input: value, review: borrowed }).reason).toBe("INVALID_REVIEW");
  });
  it("does not let generation downgrade an explicit comparison to an unrelated clarification", async () => {
    const value = input("So sánh Hồ Alpha với Đồi Beta về cảnh quan", [evidence("Hồ Alpha có mặt nước rộng.", "Hồ Alpha"), evidence("Đồi Beta có cây xanh.", "Đồi Beta", 2)]);
    value.sourceReview = reviewed(value); value.sourceSufficiency = { status: "SUFFICIENT", reason: "COMPLETE_COVERAGE" };
    const answer = await createQaGenerator({ apiKey: () => "fixture", fetcher: async () => envelope({ status: "CLARIFICATION_REQUIRED", unanswered: false, facets: { q1_1: [], q2_1: [] } }) }).generate(value);
    expect(answer).toMatchObject({ status: "INSUFFICIENT_SOURCE", reason: "MISSING_SUPPORT", citations: [] });
  });
  it("keeps independent admission and hours obligations for each compared subject", () => {
    const plan = planQaQuestion("So sánh Hồ Alpha với Đồi Beta về giá vé và giờ mở cửa năm 2026");
    expect(plan?.facets).toHaveLength(4);
    expect(plan?.facets.map(facet => facet.kind)).toEqual(["ADMISSION", "OPENING_HOURS", "ADMISSION", "OPENING_HOURS"]);
  });
  it("reserves tokens for a second subject instead of filling the budget with the first one", async () => {
    const vector = [1, ...Array(1535).fill(0)];
    const a = evidence("Hồ Alpha. " + "mô tả ".repeat(60), "Hồ Alpha");
    const b = evidence("Đồi Beta có cây xanh.", "Đồi Beta", 2);
    const small = evidence("Hồ Alpha có hồ nước.", "Hồ Alpha", 3);
    let call = 0;
    const query = vi.fn(async () => (++call === 1 ? [a, small] : [b]).map(item => ({ ...item, sourceTitle: item.citation.title, fileType: "TXT", locators: [] })));
    const retriever = createQaRetriever({ $queryRaw: query } as unknown as Database, { provider: { provider: "openai", model: "text-embedding-3-small", dimensions: 1536, embed: async ({ input }) => input.map((_, index) => ({ index, embedding: vector })) }, topK: 4, maxEvidenceTokens: a.tokenCount });
    const result = await retriever.retrieve("So sánh Hồ Alpha với Đồi Beta về cảnh quan", []);
    expect(result.map(item => item.chunkId)).toEqual([b.chunkId, small.chunkId]);
  });
  it("fills omitted planned slots as MISSING, never as supported", () => {
    const value = input("So sánh Hồ Alpha với Đồi Beta về cảnh quan", [evidence("Hồ Alpha có mặt nước rộng.", "Hồ Alpha")]);
    const result = validateQaAssessment({ intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }], aspects: [{ id: "q1_1", status: "SUPPORTED", supports: [{ citationId: "c1", sentence: value.evidence[0]!.text }] }] }, value);
    expect(result.review.aspects[1]).toMatchObject({ id: "q2_1", status: "MISSING", supports: [] });
  });
  it("excludes a 2026 event from 2027 obligations and ignores REVIEW_REQUIRED as visitor facts", () => {
    const value = input(QA_ADVANCED_CASES[6].question, [evidence("Chợ tình Khâu Vai năm 2026 tổ chức một chương trình lễ hội.", "Chợ tình Khâu Vai")]);
    const output = { intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }], aspects: value.questionPlan!.facets.map(facet => ({ id: facet.id, status: "SUPPORTED", supports: [{ citationId: "c1", sentence: value.evidence[0]!.text }] })) };
    expect(validateQaAssessment(output, value).review.aspects.every(aspect => aspect.status === "MISSING")).toBe(true);
    value.evidence = [evidence("REVIEW_REQUIRED: Chợ tình Khâu Vai năm 2027 chưa được xác minh.", "Chợ tình Khâu Vai")];
    output.aspects.forEach(aspect => { aspect.supports[0]!.sentence = value.evidence[0]!.text; });
    expect(validateQaAssessment(output, value).review.aspects.every(aspect => aspect.status === "MISSING")).toBe(true);
  });
  it("batch embeds two subjects, queries both eligible branches and round-robins whole chunks", async () => {
    const vector = [1, ...Array(1535).fill(0)];
    const embed = vi.fn(async ({ input: queries }: { input: readonly string[] }) => queries.map((_, index) => ({ index, embedding: vector })));
    const a = [1, 2, 3, 4].map(index => evidence(`Hồ Alpha có dữ kiện số ${index}.`, "Hồ Alpha", index));
    const b = evidence("Đồi Beta có cây xanh.", "Đồi Beta", 5);
    let calls = 0;
    const query = vi.fn(async () => (++calls <= 2 ? a : [b]).map(item => ({ ...item, sourceTitle: item.citation.title, fileType: "TXT", locators: [] })));
    const retriever = createQaRetriever({ $queryRaw: query } as unknown as Database, { provider: { provider: "openai", model: "text-embedding-3-small", dimensions: 1536, embed }, hybrid: true, topK: 4 });
    const result = await retriever.retrieve("So sánh Hồ Alpha với Đồi Beta về cảnh quan", []);
    expect(embed).toHaveBeenCalledOnce(); expect(embed.mock.calls[0]![0].input).toHaveLength(2); expect(query).toHaveBeenCalledTimes(4);
    expect(result.map(item => item.chunkId)).toEqual(["chunk_1", "chunk_5", "chunk_2", "chunk_3"]);
    expect(new Set(result.map(item => item.citationId)).size).toBe(4);
    for (const [sql] of query.mock.calls as unknown as [{ sql: string }][]) { expect(sql.sql).toContain('"publicQaApproved" = true'); expect(sql.sql).toContain("INDEXED"); expect(sql.sql).toContain("READY"); }
  });
  it("keeps a technical assessment failure FAILED with no completed turn", async () => {
    const fixture = QA_ADVANCED_CASES[7];
    const store = { reserve: vi.fn(async () => ({ kind: "RESERVED", conversationId: "c", turnId: "t", fence: 1, history: [] })), fail: vi.fn(async () => {}), complete: vi.fn() } as unknown as QaConversationStore;
    const service = createQaService({ store, retriever: { retrieve: async () => [evidence(fixture.text, fixture.title)], recheck: async () => true }, assessor: createQaAssessor({ apiKey: () => "fixture", fetcher: async () => new Response("unavailable", { status: 503 }) }), generator: { generate: vi.fn() } });
    await expect(service.ask({ kind: "GUEST", id: "g" }, "test_key", { question: fixture.question, context: { type: "GENERAL" } })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(store.complete).not.toHaveBeenCalled(); expect(store.fail).toHaveBeenCalled();
  });
});
