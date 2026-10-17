import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createQaService } from "./qa-service";
import { createQaAssessor } from "./qa-assessment";
import { createFixtureQaGenerator as createQaGenerator } from "./__fixtures__/qa-generation-wire";
import type { QaConversationStore, QaReservation } from "./qa-conversation-store";
import type { QaCompletedTurn } from "./qa-contract";
import type { QaEvidence, QaHistoryTurn } from "./qa-runtime-contract";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";
import { QA_CONVERSATION_MESSAGES } from "./qa-conversation";
import { qaImprovementCases } from "./__fixtures__/qa-improvement-cases";
import { fixtureAssessmentWire } from "./__fixtures__/qa-assessment-wire";

const principal = { kind: "GUEST" as const, id: "fixture_guest" };
const sentence = "Điểm Mẫu A có thuộc tính kiểm thử.";
const evidence: QaEvidence = { citationId: "c1", documentId: "fixture_document", generationId: "fixture_generation", contentVersionId: "fixture_version", chunkId: "fixture_chunk", chunkHash: "fixture_hash", text: sentence, tokenCount: 15, score: .9,
  citation: { id: "c1", sourceId: "fixture_source", title: "Nguồn hư cấu cho đánh giá offline", sourceUrl: null, locators: [] } };
const oldResponse: QaCompletedTurn = { status: "INSUFFICIENT_SOURCE", message: QA_INSUFFICIENT_SOURCE_MESSAGE, answerParts: [], citations: [], conversationId: "fixture_conversation", turnId: "fixture_old", context: { type: "GENERAL" }, turnState: "COMPLETED" };
const results: { id: string; group: string; passed: boolean; status: string; providerCalls: number; retrievalMatched: boolean; historyMatched: boolean }[] = [];
describe("AI improvement batch 1: 40 offline annotated behavior cases (not corpus acceptance)", () => {
  it.each(qaImprovementCases)("$id", async test => {
    const history: QaHistoryTurn[] = test.previous ? [{ question: test.previous, response: oldResponse }] : [];
    if (test.socialBetween) history.push({ question: "cảm ơn", response: { ...oldResponse, status: "CONVERSATIONAL", message: QA_CONVERSATION_MESSAGES.thanks } });
    const context = test.destination ? { type: "DESTINATION" as const, destinationId: "fixture_place" } : { type: "GENERAL" as const };
    const admission: QaReservation = { kind: "RESERVED", conversationId: "fixture_conversation", turnId: "fixture_turn", fence: 1, history, context };
    const store = { reserve: vi.fn<QaConversationStore["reserve"]>(async () => admission), complete: vi.fn<QaConversationStore["complete"]>(async (_p, _r, value) => value), fail: vi.fn(), history: vi.fn(), delete: vi.fn(), revokeGuest: vi.fn(), cleanup: vi.fn() } satisfies QaConversationStore;
    const retrieve = vi.fn(async () => [evidence]);
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const name = JSON.parse(String(init?.body)).response_format.json_schema.name;
      const output = name === "qa_source_assessment" ? { intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }], aspects: [{ id: "fixture_fact", status: "SUPPORTED", supports: [{ citationId: "c1", sentence }] }] }
        : { status: "ANSWERED", unanswered: false, answerParts: [{ text: sentence, citationIds: ["c1"] }] };
      return Response.json({ model: "gpt-6-luna", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(name === "qa_source_assessment" ? fixtureAssessmentWire(output, JSON.parse(String(init?.body))) : output) } }] });
    });
    const options = { apiKey: () => "fixture-only", fetcher };
    const service = createQaService({ store, retriever: { retrieve, recheck: async () => true }, assessor: createQaAssessor(options), generator: createQaGenerator(options),
      resolveContext: async () => test.destination ? { ...context as { type: "DESTINATION"; destinationId: string }, name: "Điểm Mẫu A" } : { type: "GENERAL" } });
    const result = await service.ask(principal, `fixture_${test.id}`, { question: test.question, context });
    const calls = retrieve.mock.calls as unknown as [string, QaHistoryTurn[]][];
    const retrievalMatched = test.status === "ANSWERED" ? calls[0]?.[0] === test.expectedQuery : calls.length === 0;
    const historyMatched = test.status !== "ANSWERED" || JSON.stringify(calls[0]?.[1].map(turn => turn.question)) === JSON.stringify(test.expectedHistory);
    const passed = result.data.status === test.status && retrievalMatched && historyMatched;
    results.push({ id: test.id, group: test.group, passed, status: result.data.status, providerCalls: fetcher.mock.calls.length, retrievalMatched, historyMatched });
    expect({ status: result.data.status, retrievalMatched, historyMatched }).toEqual({ status: test.status, retrievalMatched: true, historyMatched: true });
    expect(fetcher).toHaveBeenCalledTimes(test.status === "ANSWERED" ? 2 : 0);
    expect(store.reserve.mock.calls[0]?.[2].question).toBe(test.question);
    expect(store.complete).toHaveBeenCalledOnce();
  });
  it("reports the entire run, including failures, without claiming semantic/corpus accuracy", () => {
    console.info("QA_IMPROVEMENT_EVALUATION", JSON.stringify({ evidenceClass: "FICTIONAL_OFFLINE_BEHAVIOR", semanticQuality: "NOT_EVALUATED", ownerCorpusAcceptance: "PENDING", cases: results.length, passed: results.filter(row => row.passed).length, results }));
    expect(qaImprovementCases).toHaveLength(40);
    expect(new Set(qaImprovementCases.map(row => row.id)).size).toBe(40);
  });
});
