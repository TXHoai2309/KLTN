import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { QA_ERROR_HTTP_STATUS } from "./qa-contract";

export type QaStage = "REQUEST_ACCEPTED" | "PRINCIPAL_RESOLVED" | "IDEMPOTENCY_ADMISSION" | "IDEMPOTENCY_ADMITTED" | "QUESTION_EMBEDDING_STARTED" | "QUESTION_EMBEDDING_COMPLETED" | "QUESTION_EMBEDDING_VALIDATION" | "RETRIEVAL_STARTED" | "RETRIEVAL_COMPLETED" | "EVIDENCE_ELIGIBILITY_CHECK" | "EVIDENCE_ELIGIBILITY_CHECKED" | "GENERATION_STARTED" | "GENERATION_PREFLIGHT" | "GENERATION_PROVIDER" | "GENERATION_ENVELOPE" | "GENERATION_JSON" | "GENERATION_OUTPUT_SCHEMA" | "GENERATION_OUTCOME" | "GENERATION_COMPLETED" | "GENERATION_OUTPUT_VALIDATED" | "CITATION_VALIDATION" | "GROUNDING_VALIDATION" | "PUBLIC_SAFETY" | "RESPONSE_VALIDATION" | "CITATIONS_VERIFIED" | "PERSISTENCE_STARTED" | "PERSISTENCE_COMPLETED" | "FAILURE_PERSISTENCE" | "HTTP_RESPONSE_VALIDATION";
export type QaFailureCategory = "SCHEMA" | "OUTCOME_CONSISTENCY" | "CITATION_REFERENCE" | "DUPLICATE_CITATION" | "DUPLICATE_REGISTRY" | "UNSUPPORTED_SENTENCE" | "EVIDENCE_INSTRUCTION" | "PRIVATE_MATERIAL" | "INPUT_LIMIT" | "BODY_LIMIT" | "BODY_MISSING" | "INVALID_JSON" | "ENVELOPE" | "REFUSAL" | "TOKEN_LIMIT" | "EMBEDDING_VECTOR" | "PROVIDER_FAILURE" | "ELIGIBILITY" | "CITATION_PROJECTION" | "IDENTITY_MISMATCH" | "PERSISTENCE" | "ADMISSION" | "HTTP_BOUNDARY";
type Issues = readonly { code: string; path: readonly PropertyKey[] }[];
type Origin = { stage: QaStage; category: QaFailureCategory; issues?: Issues };
export type QaDiagnosticEvent = {
  correlationId: string; stage: QaStage; event: "STAGE" | "FAILURE";
  category?: QaFailureCategory; publicCode?: string;
  embeddingInvoked: boolean; generationInvoked: boolean;
  retrievedChunks: number | null; eligibleChunks: number | null;
  provider?: "embedding" | "generation"; httpStatus?: number; requestId?: string;
  finishReason?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number;
  issues?: { code: string; path: (string | number)[] }[];
};
type ProviderMetadata = Pick<QaDiagnosticEvent, "provider" | "httpStatus" | "requestId" | "finishReason" | "promptTokens" | "completionTokens" | "totalTokens">;
type Context = { sink: (event: QaDiagnosticEvent) => void; state: Pick<QaDiagnosticEvent, "correlationId" | "stage" | "embeddingInvoked" | "generationInvoked" | "retrievedChunks" | "eligibleChunks">; metadata: Partial<Record<"embedding" | "generation", ProviderMetadata>>; failed: boolean };
const context = new AsyncLocalStorage<Context>();
const origins = new WeakMap<object, Origin>();
const safePath = new Set(["choices", "finish_reason", "message", "content", "refusal", "status", "answerParts", "text", "citationIds", "unanswered", "citations", "id", "sourceId", "title", "sourceUrl", "locators", "pageNumber", "section", "conversationId", "turnId", "turnState", "context", "type", "unansweredAspects", "clarificationQuestion", "success", "data"]);
const safeIssueCodes = new Set(["invalid_type", "invalid_value", "too_big", "too_small", "invalid_format", "unrecognized_keys", "custom", "invalid_union"]);
function emit(event: QaDiagnosticEvent) { try { context.getStore()?.sink(event); } catch { /* Diagnostics never change operation semantics. */ } }

/** Temporary diagnostics: local development only; no public response fields. */
export function createQaDiagnostics(options: { nodeEnv?: string; vercelEnv?: string; sink?: (event: QaDiagnosticEvent) => void }) {
  const enabled = options.nodeEnv === "development" && (!options.vercelEnv || options.vercelEnv === "development");
  return { run<T>(work: () => Promise<T>): Promise<T> {
    if (!enabled) return work();
    return context.run({ sink: options.sink ?? (event => console.info("US21_QA_DIAGNOSTIC", JSON.stringify(event))), failed: false, metadata: {},
      state: { correlationId: randomUUID(), stage: "REQUEST_ACCEPTED", embeddingInvoked: false, generationInvoked: false, retrievedChunks: null, eligibleChunks: null } }, work);
  } };
}
export type QaDiagnostics = ReturnType<typeof createQaDiagnostics>;
export function qaStage(stage: QaStage, counts?: { retrievedChunks?: number; eligibleChunks?: number }) {
  const active = context.getStore(); if (!active) return;
  active.state.stage = stage;
  for (const key of ["retrievedChunks", "eligibleChunks"] as const) {
    const count = counts?.[key]; if (Number.isInteger(count) && count! >= 0 && count! <= 20) active.state[key] = count!;
  }
  emit({ ...active.state, event: "STAGE" });
}
export function qaProviderInvoked(provider: "embedding" | "generation") {
  const active = context.getStore(); if (!active) return;
  active.state[provider === "embedding" ? "embeddingInvoked" : "generationInvoked"] = true;
  emit({ ...active.state, event: "STAGE", provider });
}
/** Project a fixed numeric/enum subset; never copy arbitrary provider properties. */
export function qaProviderMetadata(provider: "embedding" | "generation", response?: Response, payload?: unknown) {
  const active = context.getStore(); if (!active) return;
  const event: QaDiagnosticEvent = { ...active.state, event: "STAGE", provider };
  if (response) {
    event.httpStatus = response.status;
    const id = response.headers.get("x-request-id");
    if (id && /^req_[a-zA-Z0-9_-]{1,100}$/.test(id)) event.requestId = id;
  }
  if (payload && typeof payload === "object") {
    const p = payload as { choices?: { finish_reason?: unknown }[]; usage?: Record<string, unknown> };
    const reason = Array.isArray(p.choices) ? p.choices[0]?.finish_reason : undefined;
    if (typeof reason === "string" && ["stop", "length", "content_filter", "tool_calls", "function_call"].includes(reason)) event.finishReason = reason;
    for (const [key, target] of [["prompt_tokens", "promptTokens"], ["completion_tokens", "completionTokens"], ["total_tokens", "totalTokens"]] as const) {
      const value = p.usage?.[key]; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) event[target] = value;
    }
  }
  const { httpStatus, requestId, finishReason, promptTokens, completionTokens, totalTokens } = event;
  active.metadata[provider] = { provider, httpStatus, requestId, finishReason, promptTokens, completionTokens, totalTokens };
  emit(event);
}
export function qaOrigin<T>(error: T, stage: QaStage, category: QaFailureCategory, issues?: Issues): T {
  if (context.getStore() && error && typeof error === "object") origins.set(error, { stage, category, issues });
  return error;
}
export function qaReportFailure(error: unknown, publicCode: string) {
  const active = context.getStore(); if (!active || active.failed) return;
  active.failed = true;
  const origin = error && typeof error === "object" ? origins.get(error) : undefined;
  const issues = origin?.issues?.slice(0, 8).map(issue => ({
    code: safeIssueCodes.has(issue.code) ? issue.code : "OTHER",
    path: issue.path.slice(0, 8).map(part => typeof part === "number" && Number.isInteger(part) && part >= 0 && part <= 100 ? part : typeof part === "string" && safePath.has(part) ? part : "FIELD"),
  }));
  const metadata = active.metadata[active.state.generationInvoked ? "generation" : "embedding"];
  emit({ ...active.state, ...metadata, stage: origin?.stage ?? active.state.stage, event: "FAILURE", category: origin?.category ?? "HTTP_BOUNDARY",
    publicCode: publicCode in QA_ERROR_HTTP_STATUS ? publicCode : "INTERNAL_SERVER_ERROR", ...(issues?.length ? { issues } : {}) });
}
