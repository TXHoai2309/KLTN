import { afterEach, expect, it, vi } from "vitest";
import { createQaGenerator } from "./qa-generation";
import { fixtureReviewedInput } from "./__fixtures__/qa-reviewed-input";
import { QA_SYNTHESIS_GATES } from "./qa-synthesis-verification";
import { createQaService } from "./qa-service";
import { fixtureQaAssessment } from "./__fixtures__/qa-reviewed-input";
import { createQaHttpHandlers } from "./qa-http";
import type { QaConversationStore } from "./qa-conversation-store";
import { createQaDiagnostics, type QaDiagnosticEvent } from "./qa-diagnostics";

afterEach(() => vi.useRealTimers());
const sentence = "Dinh thự nằm tại Sà Phìn.";
const input = () => fixtureReviewedInput({ question: "Dinh thự nằm ở đâu?", context: { type: "GENERAL" }, history: [], evidence: [{ citationId: "c1", documentId: "private_doc", generationId: "private_gen", contentVersionId: "private_ver", chunkId: "private_chunk", chunkHash: "hash", text: sentence, tokenCount: 12, score: 0.9, citation: { id: "c1", sourceId: "public_fixture", title: "Synthetic source", sourceUrl: null, locators: [] } }] });
const envelope = (value: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });

it.each([10_500, 12_000])("returns a fully verified paraphrase when verifier needs %i ms after successful generation", async delay => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.response_format.json_schema.name === "grounded_qa") return envelope({ status: "ANSWERED", facets: { fixture_aspect: [{ text: "Vị trí của dinh thự là Sà Phìn.", supportIds: ["s1"] }] }, unanswered: false });
    await new Promise(resolve => setTimeout(resolve, delay));
    return envelope({ summary: "Supported synthetic paraphrase", gates: QA_SYNTHESIS_GATES.map(name => ({ name, passed: true })), coveredAspects: ["fixture_aspect"], claims: { p0: { entailed: true, citationsValid: true } } });
  });
  const result = createQaGenerator({ apiKey: () => "synthetic-key", fetcher }).generate(input());
  const settled = result.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
  await vi.advanceTimersByTimeAsync(delay);
  const outcome = await settled;
  expect(outcome.error).toBeUndefined();
  expect(outcome.value).toMatchObject({ status: "ANSWERED" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(["old-10s-control", "complete", "revoked", "database-unknown", "persistence-deadline", "negative-verdict"])("HTTP service with delayed verifier keeps eligibility and persistence semantics: %s", async mode => {
  vi.useFakeTimers();
  let revoked = false;
  const events: QaDiagnosticEvent[] = [];
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.response_format.json_schema.name === "grounded_qa") return envelope({ status: "ANSWERED", facets: { fixture_aspect: [{ text: "Vị trí của dinh thự là Sà Phìn.", supportIds: ["s1"] }] }, unanswered: false });
    await new Promise(resolve => setTimeout(resolve, 12_000));
    return envelope({ summary: "Synthetic verdict", gates: QA_SYNTHESIS_GATES.map(name => ({ name, passed: mode !== "negative-verdict" })), coveredAspects: ["fixture_aspect"], claims: { p0: { entailed: true, citationsValid: true } } });
  });
  const store = { reserve: vi.fn(async () => ({ kind: "RESERVED", conversationId: "conv", turnId: "turn", fence: 1, history: [], context: { type: "GENERAL" } })), complete: vi.fn(async (_p, _r, data) => { if (mode === "database-unknown") throw new Error("private DB"); if (mode === "persistence-deadline") await new Promise(resolve => setTimeout(resolve, 60_000)); return data; }), fail: vi.fn(async () => {}), history: vi.fn(), delete: vi.fn(), cleanup: vi.fn(), revokeGuest: vi.fn() } as unknown as QaConversationStore;
  const evidence = Array.from({ length: 4 }, (_, index) => ({ ...input().evidence[0]!, citationId: `c${index + 1}`, chunkId: `chunk-${index}`, citation: { ...input().evidence[0]!.citation, id: `c${index + 1}`, sourceId: `public_fixture_${index}` } }));
  const service = createQaService({ store, retriever: { retrieve: async () => evidence, recheck: async () => !revoked }, assessor: { assess: async current => fixtureQaAssessment(current) }, generator: createQaGenerator({ apiKey: () => "fixture", fetcher, ...(mode === "old-10s-control" ? { timeoutMs: 10_000 } : {}) }) });
  const http = createQaHttpHandlers({ enabled: () => true, diagnostics: createQaDiagnostics({ nodeEnv: "production", sink: event => events.push(event) }), resolve: async () => ({ kind: "USER", id: "fixture-actor" }), ask: service.ask, history: service.history, delete: service.delete });
  const pending = http.ask(new Request("http://localhost/api/ai/ask", { method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json", "Idempotency-Key": "fixture-key" }, body: JSON.stringify({ question: input().question }) }));
  if (mode === "revoked") setTimeout(() => { revoked = true; }, 3000);
  await vi.advanceTimersByTimeAsync(mode === "persistence-deadline" ? 58_000 : 12_000);
  const response = await pending; const body = await response.json();
  if (mode === "old-10s-control") { expect(response.status).toBe(503); expect(body.error.code).toBe("AI_UNAVAILABLE"); expect(store.complete).not.toHaveBeenCalled(); expect(store.fail).toHaveBeenCalledTimes(1); expect(events.find(event => event.event === "FAILURE")).toMatchObject({ providerPhase: "SYNTHESIS_VERIFICATION", timeoutReason: "PROVIDER_TIMEOUT", eligibleChunks: 4, providerElapsedMs: 10_000 }); }
  else if (mode === "revoked") { expect(response.status).toBe(502); expect(store.complete).not.toHaveBeenCalled(); }
  else if (mode === "database-unknown" || mode === "persistence-deadline") { expect(response.status).toBe(503); expect(body).toMatchObject({ operationStatus: "UNKNOWN", retryWithSameKey: true }); expect(store.fail).not.toHaveBeenCalled(); if (mode === "persistence-deadline") { await vi.advanceTimersByTimeAsync(14_000); expect(store.complete).toHaveBeenCalledTimes(1); expect(store.fail).not.toHaveBeenCalled(); } }
  else { expect(response.status).toBe(200); expect(body.data.status).toBe(mode === "negative-verdict" ? "INSUFFICIENT_SOURCE" : "ANSWERED"); expect(store.complete).toHaveBeenCalledTimes(1); }
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(events)).not.toMatch(/fixture-actor|fixture-key|private DB|Sà Phìn/);
});
