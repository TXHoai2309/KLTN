import { fixtureQaAssessment } from "./__fixtures__/qa-reviewed-input";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Database } from "@KLTN/db";
import { createQaDiagnostics, qaOrigin, qaProviderMetadata, qaReportFailure, qaRejectSynthesis, qaStage, type QaDiagnosticEvent } from "./qa-diagnostics";
import { createQaHttpHandlers } from "./qa-http";
import { createQaService } from "./qa-service";
import { createQaRetriever } from "./qa-retrieval";
import { createQaGenerator } from "./qa-generation";
import type { QaConversationStore } from "./qa-conversation-store";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { AppError } from "../../server/http/app-error";
import { qaCompletedResponseSchema } from "./qa-contract";
import { QA_CLARIFICATION_QUESTION, QA_UNANSWERED_ASPECT } from "./qa-prompt";

const text = "Fixture confirmation code is QA-SAOTIM-21.";
const row = { documentId: "private-document", generationId: "private-generation", contentVersionId: "private-version", chunkId: "private-chunk", chunkHash: "a".repeat(64), text, tokenCount: countEmbeddingTokens(text), score: 0.8, sourceTitle: "TEST SYNTHETIC", fileType: "TXT", locators: [] };
const answered = { status: "ANSWERED", answerParts: [{ text, citationIds: ["c1"] }], unanswered: false };
type Mode = "empty" | "valid" | "unavailable" | "malformed" | "schema" | "outcome" | "citation" | "grounding" | "persistence" | "embedding" | "eligibility";
async function exercise(mode: Mode, provider?: { output?: unknown; content?: string; finishReason?: string }) {
  const events: QaDiagnosticEvent[] = [];
  const fetcher = vi.fn<typeof fetch>(async url => {
    if (url === "https://api.openai.com/v1/embeddings") return Response.json({ data: [{ index: 0, embedding: mode === "embedding" ? [0] : Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0) }] }, { headers: { "x-request-id": "req_embedding_fixture" } });
    if (url !== "https://api.openai.com/v1/chat/completions") throw new Error("Unexpected offline endpoint");
    if (mode === "unavailable") return new Response("secret provider error", { status: 503 });
    const content = mode === "malformed" ? "{" : JSON.stringify(mode === "schema" ? { ...answered, "private-arbitrary-key": "secret" } : mode === "outcome" ? { ...answered, unanswered: true } : mode === "citation" ? { ...answered, answerParts: [{ text, citationIds: ["fake"] }] } : mode === "grounding" ? { ...answered, answerParts: [{ text: "Unsupported private answer", citationIds: ["c1"] }] } : answered);
    return Response.json({ choices: [{ finish_reason: provider?.finishReason ?? "stop", message: { content: provider?.content ?? (provider?.output === undefined ? content : JSON.stringify(provider.output)) } }], usage: { prompt_tokens: 42, completion_tokens: 10, total_tokens: 52 }, arbitrary: "secret-provider-value" }, { headers: { "x-request-id": "req_generation_fixture" } });
  });
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("OPENAI_API_KEY", "offline-fixture-credential");
  const database = { $queryRaw: vi.fn(async () => mode === "empty" ? [] : [row]) } as unknown as Database;
  const store = { reserve: vi.fn(async () => ({ kind: "RESERVED" as const, conversationId: "conv", turnId: "turn", fence: 1, history: [] })), complete: vi.fn(async (_p, _r, data) => { if (mode === "persistence") throw new Error("private SQL credential"); return data; }), fail: vi.fn(async () => {}), history: vi.fn(), delete: vi.fn(), revokeGuest: vi.fn(), cleanup: vi.fn() } satisfies QaConversationStore;
  const retriever = createQaRetriever(database, { publicSourceIds: new Set([row.documentId]) });
  if (mode === "eligibility") retriever.recheck = async () => false;
  const service = createQaService({ store, retriever, assessor: { assess: async input => fixtureQaAssessment(input, (provider?.output as { status?: string } | undefined)?.status === "PARTIAL") }, generator: createQaGenerator({ apiKey: () => "secret-credential", fetcher }) });
  const http = createQaHttpHandlers({ diagnostics: createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }), enabled: () => true, resolve: async () => ({ kind: "USER", id: "private-user" }), ask: service.ask, history: service.history, delete: service.delete });
  const response = await http.ask(new Request("http://localhost:3001/api/ai/ask", { method: "POST", headers: { origin: "http://localhost:3001", "content-type": "application/json", "Idempotency-Key": "private-key", cookie: "private-cookie" }, body: JSON.stringify({ question: "private-question", context: { type: "GENERAL" } }) }));
  return { events, response, body: await response.json(), fetcher, store };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("development QA stage diagnostics with offline providers", () => {
  it.each(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"] as const)("maps valid provider %s through the real HTTP/service/adapter path", async status => {
    const factual = status === "ANSWERED" || status === "PARTIAL";
    const t = await exercise("valid", { output: { status, answerParts: factual ? answered.answerParts : [], unanswered: status === "PARTIAL" } });
    expect(t.response.status).toBe(200);
    expect(qaCompletedResponseSchema.safeParse(t.body).success).toBe(true);
    expect(t.body.data.status).toBe(status);
    expect(t.store.complete).toHaveBeenCalledTimes(1); expect(t.store.fail).not.toHaveBeenCalled();
    if (factual) {
      expect(t.body.data.answerParts).toEqual(answered.answerParts);
      expect(t.body.data.citations[0]).toMatchObject({ id: "c1", title: row.sourceTitle });
      expect(t.body.data.unansweredAspects).toEqual(status === "PARTIAL" ? [QA_UNANSWERED_ASPECT] : []);
    } else {
      expect(t.body.data.answerParts).toEqual([]); expect(t.body.data.citations).toEqual([]);
      if (status === "CLARIFICATION_REQUIRED") expect(t.body.data.clarificationQuestion).toBe(QA_CLARIFICATION_QUESTION);
    }
    const call = t.fetcher.mock.calls.find(([url]) => url === "https://api.openai.com/v1/chat/completions")!;
    const sent = JSON.parse(call[1]!.body as string);
    expect(sent.store).toBe(false);
    expect(sent.response_format.json_schema).toMatchObject({ strict: true, schema: { required: ["status", "answerParts", "unanswered"], additionalProperties: false } });
    expect(sent.messages[0].content).toContain("unanswered=true only for PARTIAL");
    expect(sent.messages[0].content).toContain("Empty parts for insufficiency/clarification");
    expect(JSON.stringify(t.events)).not.toContain(text);
  });
  it.each(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"] as const)("rejects contradictory unanswered for %s at the historical stage", async status => {
    const factual = status === "ANSWERED" || status === "PARTIAL";
    const t = await exercise("valid", { output: { status, answerParts: factual ? answered.answerParts : [], unanswered: status !== "PARTIAL" } });
    expect(t.response.status).toBe(502);
    expect(t.body).toMatchObject({ operationStatus: "FAILED", error: { code: "AI_INVALID_RESPONSE" } });
    expect(t.events.at(-1)).toMatchObject({ stage: "GENERATION_OUTCOME", category: "OUTCOME_CONSISTENCY", issues: [{ code: "custom", path: ["unanswered"] }] });
    expect(t.store.complete).not.toHaveBeenCalled(); expect(t.store.fail).toHaveBeenCalledTimes(1);
  });
  it.each(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"] as const)("rejects contradictory parts for %s at the historical stage", async status => {
    const factual = status === "ANSWERED" || status === "PARTIAL";
    const t = await exercise("valid", { output: { status, answerParts: factual ? [] : answered.answerParts, unanswered: status === "PARTIAL" } });
    expect(t.response.status).toBe(502);
    expect(t.events.at(-1)).toMatchObject({ stage: "GENERATION_OUTCOME", category: "OUTCOME_CONSISTENCY", issues: [{ code: "custom", path: ["answerParts"] }] });
    expect(t.store.complete).not.toHaveBeenCalled(); expect(t.store.fail).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{ output: answered, finishReason: "length" }, "GENERATION_ENVELOPE", "ENVELOPE"],
    [{ content: "{", finishReason: "stop" }, "GENERATION_JSON", "INVALID_JSON"],
  ])("rejects truncation/malformed output before outcome validation %#", async (provider, stage, category) => {
    const t = await exercise("valid", provider);
    expect(t.response.status).toBe(502);
    expect(t.events.at(-1)).toMatchObject({ stage, category });
    expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("empty evidence completes INSUFFICIENT_SOURCE without generation dispatch", async () => {
    const t = await exercise("empty");
    expect(t.response.status).toBe(200); expect(t.body.data.status).toBe("INSUFFICIENT_SOURCE");
    expect(t.fetcher).toHaveBeenCalledTimes(1);
    expect(t.events.at(-1)).toMatchObject({ embeddingInvoked: true, generationInvoked: false, retrievedChunks: 0, eligibleChunks: 0 });
    expect(t.events.some(e => e.stage === "PERSISTENCE_COMPLETED")).toBe(true);
  });
  it("records actual order, provider metadata and persistence only after acknowledgement", async () => {
    const t = await exercise("valid");
    expect(t.response.status).toBe(200); expect(t.body.data.status).toBe("ANSWERED");
    const stages = t.events.map(e => e.stage);
    const ordered = ["REQUEST_ACCEPTED", "PRINCIPAL_RESOLVED", "IDEMPOTENCY_ADMITTED", "QUESTION_EMBEDDING_STARTED", "QUESTION_EMBEDDING_COMPLETED", "RETRIEVAL_COMPLETED", "EVIDENCE_ELIGIBILITY_CHECKED", "GENERATION_STARTED", "GENERATION_OUTPUT_VALIDATED", "GENERATION_COMPLETED", "CITATIONS_VERIFIED", "PERSISTENCE_COMPLETED"];
    expect(ordered.map(stage => stages.indexOf(stage as never))).toEqual([...ordered.map(stage => stages.indexOf(stage as never))].sort((a, b) => a - b));
    expect(ordered.every(stage => stages.includes(stage as never))).toBe(true);
    expect(t.events).toContainEqual(expect.objectContaining({ provider: "generation", httpStatus: 200, requestId: "req_generation_fixture", finishReason: "stop", promptTokens: 42, completionTokens: 10, totalTokens: 52 }));
    expect(new Set(t.events.map(e => e.correlationId)).size).toBe(1);
    expect(t.events[0]!.correlationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(t.events)).not.toMatch(/private-|secret-|Fixture confirmation|QA-SAOTIM|Unsupported private|cookie|Authorization/);
  });
  it.each([
    ["unavailable", "GENERATION_PROVIDER", "PROVIDER_FAILURE", "AI_UNAVAILABLE", 503],
    ["malformed", "GENERATION_JSON", "INVALID_JSON", "AI_INVALID_RESPONSE", 502],
    ["schema", "GENERATION_OUTPUT_SCHEMA", "SCHEMA", "AI_INVALID_RESPONSE", 502],
    ["outcome", "GENERATION_OUTCOME", "OUTCOME_CONSISTENCY", "AI_INVALID_RESPONSE", 502],
    ["citation", "CITATION_VALIDATION", "CITATION_REFERENCE", "AI_INVALID_RESPONSE", 502],
    ["grounding", "SYNTHESIS_VERIFICATION", "SCHEMA", "AI_INVALID_RESPONSE", 502],
    ["persistence", "PERSISTENCE_STARTED", "PERSISTENCE", "OPERATION_STATUS_UNKNOWN", 503],
    ["embedding", "QUESTION_EMBEDDING_VALIDATION", "EMBEDDING_VECTOR", "AI_INVALID_RESPONSE", 502],
    ["eligibility", "EVIDENCE_ELIGIBILITY_CHECK", "ELIGIBILITY", "AI_INVALID_RESPONSE", 502],
  ] as const)("classifies %s without exposing values or changing public codes", async (mode, stage, category, code, status) => {
    const t = await exercise(mode);
    expect(t.response.status).toBe(status); expect(t.body.error.code).toBe(code);
    const failures = t.events.filter(e => e.event === "FAILURE");
    expect(failures).toHaveLength(1); expect(failures[0]).toMatchObject({ stage, category, publicCode: code });
    if (["embedding", "eligibility"].includes(mode)) expect(failures[0]!.generationInvoked).toBe(false);
    expect(JSON.stringify(t.events)).not.toMatch(/private-|secret-|Unsupported private|Fixture confirmation|QA-SAOTIM/);
  });
  it.each([["production", undefined], ["production", "preview"], ["development", "production"], ["development", "preview"]])("does not emit for NODE_ENV=%s VERCEL_ENV=%s", async (nodeEnv, vercelEnv) => {
    const sink = vi.fn();
    await createQaDiagnostics({ nodeEnv, vercelEnv, sink }).run(async () => { qaStage("REQUEST_ACCEPTED"); qaReportFailure(new Error("secret"), "AI_INVALID_RESPONSE"); });
    expect(sink).not.toHaveBeenCalled();
  });
  it("projects validation paths and provider metadata, rejects arbitrary values", async () => {
    const events: QaDiagnosticEvent[] = [];
    await createQaDiagnostics({ nodeEnv: "development", sink: e => events.push(e) }).run(async () => {
      qaProviderMetadata("generation", Response.json({}, { headers: { "x-request-id": "https://private.invalid/?token=secret" } }), { choices: [{ finish_reason: "secret" }], usage: { total_tokens: "secret", prompt_tokens: -1 }, raw: "secret" });
      const error = qaOrigin(new AppError("AI_INVALID_RESPONSE", "secret", 502), "GENERATION_OUTPUT_SCHEMA", "SCHEMA", [{ code: "secret", path: ["answerParts", 0, "secret-key"] }]);
      qaReportFailure(error, "AI_INVALID_RESPONSE");
    });
    expect(events.at(-1)!.issues).toEqual([{ code: "OTHER", path: ["answerParts", 0, "FIELD"] }]);
    expect(JSON.stringify(events)).not.toMatch(/secret|private|https/);
  });
  it("records synthesis rejection causes without emitting arbitrary gate/source text", async () => {
    const events: QaDiagnosticEvent[] = [];
    await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
      expect(qaRejectSynthesis("ASPECT_COVERAGE")).toBe(false);
      qaRejectSynthesis("GATE_REJECTED", "CLAIM_GROUNDING");
      qaRejectSynthesis("GATE_REJECTED", "private-source-text");
    });
    expect(events[0]).toMatchObject({ stage: "SYNTHESIS_REJECTED", synthesisRejection: "ASPECT_COVERAGE" });
    expect(events[1]).toMatchObject({ synthesisRejection: "GATE_REJECTED", synthesisGate: "CLAIM_GROUNDING" });
    expect(events[2]).not.toHaveProperty("synthesisGate");
    expect(JSON.stringify(events)).not.toContain("private-source-text");
    await expect(createQaDiagnostics({ nodeEnv: "development", sink: () => { throw new Error("sink unavailable"); } }).run(async () => qaRejectSynthesis("SUPPORT_REFERENCE"))).resolves.toBe(false);
  });
  it("keeps correlation state isolated for concurrent requests and ignores sink failures", async () => {
    const events: QaDiagnosticEvent[] = [];
    const diagnostics = createQaDiagnostics({ nodeEnv: "development", sink: e => events.push(e) });
    await Promise.all([0, 1].map(count => diagnostics.run(async () => { qaStage("RETRIEVAL_COMPLETED", { retrievedChunks: count }); await Promise.resolve(); qaStage("GENERATION_STARTED"); })));
    const ids = [...new Set(events.map(e => e.correlationId))]; expect(ids).toHaveLength(2);
    for (const id of ids) expect(new Set(events.filter(e => e.correlationId === id).map(e => e.retrievedChunks)).size).toBe(1);
    await expect(createQaDiagnostics({ nodeEnv: "development", sink: () => { throw Error("secret"); } }).run(async () => { qaStage("REQUEST_ACCEPTED"); return 1; })).resolves.toBe(1);
  });
});
