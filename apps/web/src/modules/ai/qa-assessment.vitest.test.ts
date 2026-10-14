import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createQaGenerator } from "./qa-generation";
import { AppError } from "../../server/http/app-error";
import { createQaAssessor } from "./qa-assessment";
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
  const fetcher = vi.fn<typeof fetch>(transport ?? (async () => envelope(output)));
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
  it.each(["SUFFICIENT", "PARTIAL"] as const)("creates and validates a %s assessment before generation/persistence", async status => {
    const output = assessmentOutput();
    if (status === "PARTIAL") output.aspects.push({ id: "hours", status: "MISSING", supports: [] });
    const t = setup(output);
    if (status === "PARTIAL") t.generator.generate.mockResolvedValue({ status: "PARTIAL", answerParts: [{ text: sentence, citationIds: ["c1"] }], citations: [source.citation], unansweredAspects: ["Chưa đủ dữ liệu."] });
    const response = await t.ask(); const body = await response.json();
    expect(response.status).toBe(200); expect(body.data.status).toBe(status === "PARTIAL" ? "PARTIAL" : "ANSWERED");
    expect(t.fetcher).toHaveBeenCalledOnce();
    expect(t.generator.generate).toHaveBeenCalledWith(expect.objectContaining({ sourceSufficiency: expect.objectContaining({ status }), sourceReview: expect.objectContaining({ binding: expect.any(String) }) }));
    expect(t.store.complete).toHaveBeenCalledOnce(); expect(t.store.fail).not.toHaveBeenCalled();
    const request = JSON.parse(String(t.fetcher.mock.calls[0]?.[1]?.body));
    expect(request.response_format.json_schema.name).toBe("qa_source_assessment");
    expect(JSON.stringify(request.messages)).not.toMatch(/internal_doc|internal_gen|internal_rev|internal_chunk|internal_hash/);
    expect(JSON.stringify(body)).not.toMatch(/sourceReview|binding|internal_doc/);
  });
  it.each(["MISSING", "CONFLICTING", "UNCERTAIN"])("keeps %s evidence out of factual generation", async status => {
    const t = setup(assessmentOutput(status)); const response = await t.ask(); const body = await response.json();
    expect(response.status).toBe(200); expect(body.data).toMatchObject({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE });
    expect(t.generator.generate).not.toHaveBeenCalled(); expect(t.store.complete).toHaveBeenCalledOnce(); expect(t.store.fail).not.toHaveBeenCalled();
  });
  it("skips both assessment and generation on empty retrieval", async () => {
    const t = setup(); t.retriever.retrieve.mockResolvedValue([]); const response = await t.ask();
    expect((await response.json()).data.status).toBe("INSUFFICIENT_SOURCE");
    expect(t.fetcher).not.toHaveBeenCalled(); expect(t.generator.generate).not.toHaveBeenCalled();
  });
  it.each(["quote", "citation", "malformed"])("rejects %s assessment without a successful turn", async defect => {
    const output = assessmentOutput();
    if (defect === "quote") output.aspects[0]!.supports[0]!.sentence = "Fabricated sentence.";
    if (defect === "citation") output.aspects[0]!.supports[0]!.citationId = "old_history";
    const t = setup(defect === "malformed" ? {} : output); const response = await t.ask();
    expect(response.status).toBe(502); expect((await response.json()).operationStatus).toBe("FAILED");
    expect(t.generator.generate).not.toHaveBeenCalled(); expect(t.store.complete).not.toHaveBeenCalled(); expect(t.store.fail).toHaveBeenCalledOnce();
  });
  it.each(["unavailable", "timeout"])("isolates assessment %s as a technical failure", async mode => {
    const t = setup(undefined, async () => mode === "timeout" ? new Promise<Response>(() => {}) : new Response("unavailable", { status: 503 }));
    const response = await t.ask(); expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("AI_UNAVAILABLE");
    expect(t.store.complete).not.toHaveBeenCalled(); expect(t.store.fail).toHaveBeenCalledOnce(); expect(t.generator.generate).not.toHaveBeenCalled();
  });
});

const answerOutput = (status = "ANSWERED", text = sentence, citationId = "c1") => ({ status, answerParts: [{ text, citationIds: [citationId] }], unanswered: status === "PARTIAL" });
describe("US23 actual assessment and generation HTTP integration", () => {
  it("rejects a real current quote/citation not reviewed as support for the question", async () => {
    const unrelated = "Synthetic Alpha opens at nine.";
    const t = setup(assessmentOutput(), undefined, answerOutput("ANSWERED", unrelated));
    t.retriever.retrieve.mockResolvedValue([{ ...source, text: sentence + " " + unrelated }]);
    const response = await t.ask(); expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("AI_INVALID_RESPONSE");
    expect(t.store.complete).not.toHaveBeenCalled(); expect(t.store.fail).toHaveBeenCalledOnce();
  });
  it("PARTIAL may omit missing aspects but never supported aspects", async () => {
    const second = "Synthetic Alpha opens at nine."; const review = assessmentOutput();
    review.aspects.push({ id: "hours", status: "SUPPORTED", supports: [{ citationId: "c1", sentence: second }] }, { id: "price", status: "MISSING", supports: [] });
    const t = setup(review, undefined, answerOutput("PARTIAL"));
    t.retriever.retrieve.mockResolvedValue([{ ...source, text: sentence + " " + second }]);
    expect((await t.ask()).status).toBe(502); expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("does not accept an exact current citation for a different requested fact", async () => {
    const t = setup(assessmentOutput("MISSING"), undefined, answerOutput());
    const response = await t.ask("What are the opening hours of Synthetic Alpha?");
    expect(response.status).toBe(200); expect((await response.json()).data).toMatchObject({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [] });
    expect(t.store.complete).toHaveBeenCalledOnce(); expect(t.store.fail).not.toHaveBeenCalled();
  });
  it.each(["ANSWERED", "PARTIAL"])("persists reviewed %s with a real generator adapter", async status => {
    const review = assessmentOutput();
    if (status === "PARTIAL") review.aspects.push({ id: "hours", status: "MISSING", supports: [] });
    const t = setup(review, undefined, answerOutput(status)); const response = await t.ask();
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.data.status).toBe(status); expect(body.data.citations).toEqual([source.citation]);
    expect(t.store.complete).toHaveBeenCalledOnce();
  });
  it.each(["fabricated citation", "unsupported fact", "incomplete ANSWERED", "omitted supported aspect"])("rejects %s without persisting success", async defect => {
    const review = assessmentOutput(); const output = answerOutput(); const t = setup(review, undefined, output);
    if (defect === "fabricated citation") output.answerParts[0]!.citationIds = ["invented"];
    if (defect === "unsupported fact") output.answerParts[0]!.text = "Synthetic Alpha opens at nine.";
    if (defect === "incomplete ANSWERED") review.aspects.push({ id: "hours", status: "MISSING", supports: [] });
    if (defect === "omitted supported aspect") {
      const second = "Synthetic Alpha opens at nine.";
      t.retriever.retrieve.mockResolvedValue([{ ...source, text: sentence + " " + second }]);
      review.aspects.push({ id: "hours", status: "SUPPORTED", supports: [{ citationId: "c1", sentence: second }] });
    }
    const response = await t.ask(); expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("AI_INVALID_RESPONSE");
    expect(t.store.complete).not.toHaveBeenCalled(); expect(t.store.fail).toHaveBeenCalledOnce();
  });
  it.each(["unavailable", "timeout"])("keeps generation %s technical after successful assessment", async failure => {
    const t = setup(assessmentOutput(), undefined, failure); const response = await t.ask();
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("AI_UNAVAILABLE");
    expect(t.store.complete).not.toHaveBeenCalled(); expect(t.store.fail).toHaveBeenCalledOnce();
  });
  it.each(["embedding", "pgvector", "database", "retrieval timeout"])("isolates %s failure before semantic assessment", async failure => {
    const t = setup(); t.retriever.retrieve.mockRejectedValue(new AppError("AI_UNAVAILABLE", failure, 503));
    const response = await t.ask(); expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("AI_UNAVAILABLE");
    expect(t.fetcher).not.toHaveBeenCalled(); expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("does not generate from unrelated or non-exhaustive review", async () => {
    for (const mode of ["unrelated", "non-exhaustive"]) {
      const review = assessmentOutput(mode === "unrelated" ? "MISSING" : "SUPPORTED");
      if (mode === "unrelated") review.relevance[0]!.status = "UNRELATED";
      else review.exhaustive = false;
      const t = setup(review); expect((await (await t.ask()).json()).data.status).toBe("INSUFFICIENT_SOURCE");
      expect(t.generator.generate).not.toHaveBeenCalled();
    }
  });
  it("returns clarification for valid ambiguous intent without factual generation", async () => {
    const review = { intent: "AMBIGUOUS", exhaustive: false, relevance: [{ citationId: "c1", status: "UNCERTAIN" }], aspects: [] };
    const t = setup(review); expect((await (await t.ask()).json()).data.status).toBe("CLARIFICATION_REQUIRED");
    expect(t.generator.generate).not.toHaveBeenCalled();
  });
  it("does not generate from a source revoked during assessment", async () => {
    const t = setup(); t.retriever.recheck.mockResolvedValueOnce(true).mockResolvedValue(false);
    const response = await t.ask(); const body = await response.json();
    expect(response.status).toBe(502); expect(body.error.code).toBe("AI_INVALID_RESPONSE");
    expect(t.store.complete).not.toHaveBeenCalled(); expect(t.generator.generate).not.toHaveBeenCalled();
  });
});

describe("US23 assessor scope and multi-turn boundaries", () => {
  const input: QaGenerationInput = { question: "And its hours?", evidence: [source], context: { type: "GENERAL" }, history: [{ question: "Which region contains Synthetic Alpha?", response: { conversationId: "conv", turnId: "old", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "ANSWERED", answerParts: [{ text: "OLD_FACT_NOT_EVIDENCE opens at nine.", citationIds: ["old_citation"] }], citations: [{ ...source.citation, id: "old_citation" }], unansweredAspects: [] } }] };
  it("history resolves intent but missing current evidence remains missing", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => envelope(assessmentOutput("MISSING")));
    const review = await createQaAssessor({ apiKey: () => "offline-fixture", fetcher }).assess(input);
    expect(review.review.aspects[0]!.status).toBe("MISSING");
    const prompt = String(fetcher.mock.calls[0]?.[1]?.body);
    expect(prompt).toContain(input.history[0]!.question); expect(prompt).not.toMatch(/OLD_FACT_NOT_EVIDENCE|old_citation/);
  });
  it("rejects historical quotes even when the model attaches a current citation", async () => {
    const output = assessmentOutput(); output.aspects[0]!.supports[0]!.sentence = "OLD_FACT_NOT_EVIDENCE opens at nine.";
    const assessor = createQaAssessor({ apiKey: () => "offline-fixture", fetcher: async () => envelope(output) });
    await expect(assessor.assess(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", status: 502 });
  });
  it("does not expose or accept out-of-Destination sentences in the semantic review", async () => {
    const scoped: QaGenerationInput = { ...input, context: { type: "DESTINATION", destinationId: "synthetic_alpha", name: "Synthetic Alpha" }, evidence: [{ ...source, text: sentence + " Other Place opens at nine." }] };
    const output = assessmentOutput(); output.aspects[0]!.supports[0]!.sentence = "Other Place opens at nine.";
    const fetcher = vi.fn<typeof fetch>(async () => envelope(output));
    await expect(createQaAssessor({ apiKey: () => "offline-fixture", fetcher }).assess(scoped)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toContain("Other Place opens at nine.");
  });
});
