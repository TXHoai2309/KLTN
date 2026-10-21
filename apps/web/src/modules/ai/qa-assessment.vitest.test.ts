import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createFixtureQaGenerator as createQaGenerator } from "./__fixtures__/qa-generation-wire";
import { AppError } from "../../server/http/app-error";
import { createQaAssessor } from "./qa-assessment";
import { fixtureAssessmentWire } from "./__fixtures__/qa-assessment-wire";
import { createQaService } from "./qa-service";
import { createQaHttpHandlers } from "./qa-http";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import type { QaEvidence, QaAnswer, QaGenerationInput } from "./qa-runtime-contract";

const sentence = "Synthetic Alpha belongs to region Beta.";
const source: QaEvidence = { citationId: "c1", documentId: "internal_doc", generationId: "internal_gen", contentVersionId: "internal_rev", chunkId: "internal_chunk", chunkHash: "internal_hash", text: sentence, tokenCount: 9, score: 0.8, citation: { id: "c1", sourceId: "public_fixture", title: "Fictional source", sourceUrl: null, locators: [] } };
function assessmentOutput(status = "SUPPORTED") {
  return { intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }],
    aspects: [{ id: "region", status, supports: status === "SUPPORTED" ? [{ citationId: "c1", sentence }] : [] }] };
}
const envelope = (value: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
function setup(output: unknown = assessmentOutput(), transport?: typeof fetch, generated?: unknown) {
  const fetcher = vi.fn<typeof fetch>(transport ?? (async (_url, init) => envelope(fixtureAssessmentWire(output, JSON.parse(String(init?.body))))));
  const assessor = createQaAssessor({ apiKey: () => "offline-fixture", fetcher, timeoutMs: 30 });
  const store: QaConversationStore = { reserve: vi.fn(async () => ({ kind: "RESERVED" as const, conversationId: "conv", turnId: "turn", fence: 1, history: [] })),
    complete: vi.fn(async (_p, _r, data) => data), fail: vi.fn(async () => {}), history: vi.fn(async () => []), delete: vi.fn(async () => {}), revokeGuest: vi.fn(async () => {}), cleanup: vi.fn(async () => ({ processed: 0, hasMore: false, lockAcquired: true, lastSuccessfulSweep: null, eligibleBacklogCount: 0, oldestOverdueItem: null, failureCount: 0 })) };
  const retriever = { retrieve: vi.fn(async () => [source]), recheck: vi.fn(async () => true) };
  const generator = { generate: vi.fn(async (): Promise<QaAnswer> => ({ status: "ANSWERED", answerParts: [{ text: sentence, citationIds: ["c1"] }], citations: [source.citation], unansweredAspects: [] })) };
  const actualGenerator = generated === undefined ? generator : createQaGenerator({ apiKey: () => "offline-fixture", timeoutMs: 30, fetcher: async () => generated === "unavailable" ? new Response("unavailable", { status: 503 }) : generated === "timeout" ? new Promise<Response>(() => {}) : envelope(generated) });
  const service = createQaService({ store, retriever, assessor, generator: actualGenerator });
  const http = createQaHttpHandlers({ enabled: () => true, resolve: async () => ({ kind: "GUEST", id: "guest" }), ...service });
  const ask = (question = "Which region contains Synthetic Alpha?") => http.ask(new Request("http://localhost/api/ai/ask", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "Idempotency-Key": "fixture_key" }, body: JSON.stringify({ question }) }));
  return { fetcher, store, retriever, generator, ask };
}
describe("Phase A actual runtime assessment integration (offline)", () => {
  const input: QaGenerationInput = { question: "Which region contains Synthetic Alpha?", context: { type: "GENERAL" }, history: [], evidence: [source] };

  it.each(["SUFFICIENT", "PARTIAL"] as const)("creates and validates a %s assessment", async status => {
    const output = assessmentOutput();
    if (status === "PARTIAL") output.aspects.push({ id: "hours", status: "MISSING", supports: [] });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => envelope(fixtureAssessmentWire(output, JSON.parse(String(init?.body)))));
    const assessor = createQaAssessor({ apiKey: () => "offline-fixture", fetcher, timeoutMs: 30 });
    const result = await assessor.assess(input);
    expect(result.review.aspects[0]!.status).toBe("SUPPORTED");
    expect(fetcher).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request.response_format.json_schema.name).toBe("qa_source_assessment");
    expect(JSON.stringify(request.messages)).not.toMatch(/internal_doc|internal_gen|internal_rev|internal_chunk|internal_hash/);
  });
  it.each(["MISSING", "CONFLICTING", "UNCERTAIN"])("identifies %s evidence in assessment", async status => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => envelope(fixtureAssessmentWire(assessmentOutput(status), JSON.parse(String(init?.body)))));
    const assessor = createQaAssessor({ apiKey: () => "offline-fixture", fetcher, timeoutMs: 30 });
    const result = await assessor.assess(input);
    expect(result.review.aspects[0]!.status).toBe(status);
  });
  it("skips generation on empty retrieval", async () => {
    const t = setup(); t.retriever.retrieve.mockResolvedValue([]); const response = await t.ask();
    expect((await response.json()).data.status).toBe("INSUFFICIENT_SOURCE");
    expect(t.generator.generate).not.toHaveBeenCalled();
  });
  it.each(["quote", "citation", "malformed"])("rejects %s assessment defect", async defect => {
    const output = assessmentOutput();
    if (defect === "quote") output.aspects[0]!.supports[0]!.sentence = "Fabricated sentence.";
    if (defect === "citation") output.aspects[0]!.supports[0]!.citationId = "old_history";
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => envelope(defect === "malformed" ? {} : fixtureAssessmentWire(output, JSON.parse(String(init?.body)))));
    const assessor = createQaAssessor({ apiKey: () => "offline-fixture", fetcher, timeoutMs: 30 });
    await expect(assessor.assess(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it.each(["unavailable", "timeout"])("isolates assessment %s as a technical failure", async mode => {
    const fetcher = vi.fn<typeof fetch>(async () => mode === "timeout" ? new Promise<Response>(() => {}) : new Response("unavailable", { status: 503 }));
    const assessor = createQaAssessor({ apiKey: () => "offline-fixture", fetcher, timeoutMs: 30 });
    await expect(assessor.assess(input)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});

const answerOutput = (status = "ANSWERED", text = sentence, citationId = "c1") => ({ status, answerParts: [{ text, citationIds: [citationId] }], unanswered: status === "PARTIAL" });
describe("US23 actual generation HTTP integration", () => {
  it.each(["ANSWERED", "PARTIAL"])("persists %s with a real generator adapter", async status => {
    const t = setup(undefined, undefined, answerOutput(status));
    const response = await t.ask();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe(status);
    expect(body.data.citations).toEqual([source.citation]);
    expect(t.store.complete).toHaveBeenCalledOnce();
  });
  it.each(["fabricated citation", "empty text part"])("rejects %s without persisting success", async defect => {
    const output = answerOutput();
    if (defect === "fabricated citation") output.answerParts[0]!.citationIds = ["invented"];
    if (defect === "empty text part") output.answerParts[0]!.text = "   ";
    const t = setup(undefined, undefined, output);
    const response = await t.ask();
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("AI_INVALID_RESPONSE");
    expect(t.store.complete).not.toHaveBeenCalled();
    expect(t.store.fail).toHaveBeenCalledOnce();
  });
  it.each(["unavailable", "timeout"])("keeps generation %s technical", async failure => {
    const t = setup(undefined, undefined, failure);
    const response = await t.ask();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("AI_UNAVAILABLE");
    expect(t.store.complete).not.toHaveBeenCalled();
    expect(t.store.fail).toHaveBeenCalledOnce();
  });
  it.each(["embedding", "pgvector", "database", "retrieval timeout"])("isolates %s failure before generation", async failure => {
    const t = setup();
    t.retriever.retrieve.mockRejectedValue(new AppError("AI_UNAVAILABLE", failure, 503));
    const response = await t.ask();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("AI_UNAVAILABLE");
    expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("does not complete when source is revoked during post-retrieval check", async () => {
    const t = setup();
    t.retriever.recheck.mockResolvedValueOnce(false);
    const response = await t.ask();
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error.code).toBe("AI_INVALID_RESPONSE");
    expect(t.store.complete).not.toHaveBeenCalled();
  });
});

describe("US23 assessor scope and multi-turn boundaries", () => {
  const input: QaGenerationInput = { question: "And its hours?", evidence: [source], context: { type: "GENERAL" }, history: [{ question: "Which region contains Synthetic Alpha?", response: { conversationId: "conv", turnId: "old", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "ANSWERED", answerParts: [{ text: "OLD_FACT_NOT_EVIDENCE opens at nine.", citationIds: ["old_citation"] }], citations: [{ ...source.citation, id: "old_citation" }], unansweredAspects: [] } }] };
  it("history resolves intent but missing current evidence remains missing", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => envelope(fixtureAssessmentWire(assessmentOutput("MISSING"), JSON.parse(String(init?.body)))));
    const review = await createQaAssessor({ apiKey: () => "offline-fixture", fetcher }).assess(input);
    expect(review.review.aspects[0]!.status).toBe("MISSING");
    const prompt = String(fetcher.mock.calls[0]?.[1]?.body);
    expect(prompt).toContain(input.history[0]!.question); expect(prompt).not.toMatch(/OLD_FACT_NOT_EVIDENCE|old_citation/);
  });
  it("rejects historical quotes even when the model attaches a current citation", async () => {
    const output = assessmentOutput(); output.aspects[0]!.supports[0]!.sentence = "OLD_FACT_NOT_EVIDENCE opens at nine.";
    const assessor = createQaAssessor({ apiKey: () => "offline-fixture", fetcher: async (_url, init) => envelope(fixtureAssessmentWire(output, JSON.parse(String(init?.body)))) });
    await expect(assessor.assess(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", status: 502 });
  });
  it("does not expose or accept out-of-Destination sentences in the semantic review", async () => {
    const scoped: QaGenerationInput = { ...input, context: { type: "DESTINATION", destinationId: "synthetic_alpha", name: "Synthetic Alpha" }, evidence: [{ ...source, text: sentence + " Other Place opens at nine." }] };
    const output = assessmentOutput(); output.aspects[0]!.supports[0]!.sentence = "Other Place opens at nine.";
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => envelope(fixtureAssessmentWire(output, JSON.parse(String(init?.body)))));
    await expect(createQaAssessor({ apiKey: () => "offline-fixture", fetcher }).assess(scoped)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toContain("Other Place opens at nine.");
  });
});
