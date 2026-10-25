import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { QA_ERROR_HTTP_STATUS } from "./qa-contract";

export type QaStage = "SYNTHESIS_VERIFICATION" | "SYNTHESIS_REJECTED" | "ASSESSMENT_STARTED" | "ASSESSMENT_VALIDATION" | "REQUEST_ACCEPTED" | "PRINCIPAL_RESOLVED" | "IDEMPOTENCY_ADMISSION" | "IDEMPOTENCY_ADMITTED" | "QUESTION_UNDERSTANDING_STARTED" | "QUESTION_UNDERSTANDING_COMPLETED" | "QUESTION_EMBEDDING_STARTED" | "QUESTION_EMBEDDING_COMPLETED" | "QUESTION_EMBEDDING_VALIDATION" | "RETRIEVAL_STARTED" | "RETRIEVAL_COMPLETED" | "EVIDENCE_ELIGIBILITY_CHECK" | "EVIDENCE_ELIGIBILITY_CHECKED" | "GENERATION_STARTED" | "GENERATION_PREFLIGHT" | "GENERATION_PROVIDER" | "GENERATION_ENVELOPE" | "GENERATION_JSON" | "GENERATION_OUTPUT_SCHEMA" | "GENERATION_OUTCOME" | "GENERATION_COMPLETED" | "GENERATION_OUTPUT_VALIDATED" | "CITATION_VALIDATION" | "GROUNDING_VALIDATION" | "PUBLIC_SAFETY" | "RESPONSE_VALIDATION" | "CITATIONS_VERIFIED" | "PERSISTENCE_STARTED" | "PERSISTENCE_COMPLETED" | "FAILURE_PERSISTENCE" | "HTTP_RESPONSE_VALIDATION";
export type QaFailureCategory = "SCHEMA" | "OUTCOME_CONSISTENCY" | "CITATION_REFERENCE" | "DUPLICATE_CITATION" | "DUPLICATE_REGISTRY" | "UNSUPPORTED_SENTENCE" | "EVIDENCE_INSTRUCTION" | "PRIVATE_MATERIAL" | "INPUT_LIMIT" | "BODY_LIMIT" | "BODY_MISSING" | "INVALID_JSON" | "ENVELOPE" | "REFUSAL" | "TOKEN_LIMIT" | "EMBEDDING_VECTOR" | "PROVIDER_FAILURE" | "ELIGIBILITY" | "CITATION_PROJECTION" | "IDENTITY_MISMATCH" | "PERSISTENCE" | "ADMISSION" | "HTTP_BOUNDARY";
type Issues = readonly { code: string; path: readonly PropertyKey[] }[];
type Origin = { stage: QaStage; category: QaFailureCategory; issues?: Issues };
export type QaRetrievalReason = "NO_APPROVED_SOURCES" | "NO_CANDIDATES" | "ALL_CANDIDATES_FILTERED" | "EVIDENCE_RETRIEVED";
export type QaSynthesisRejection = "GATE_REJECTED" | "UNENTAILED_CLAIM" | "ASPECT_COVERAGE" | "SUPPORT_REFERENCE" | "NUMERIC_FIDELITY" | "CLAIM_PARTITION" | "UNJUSTIFIED_CITATION" | "ASPECT_SUPPORT";
export type QaProviderPhase = "ASSESSMENT" | "GENERATION" | "SYNTHESIS_VERIFICATION" | "QUESTION_UNDERSTANDING";
export type QaProviderFailureReason = "PROVIDER_TIMEOUT" | "REQUEST_DEADLINE" | "REQUEST_ABORT" | "ELIGIBILITY_ABORT" | "NETWORK_ERROR" | "UPSTREAM_HTTP";

export type QaDiagnosticEvent = {
  correlationId: string; stage: QaStage; event: "STAGE" | "FAILURE";
  category?: QaFailureCategory; publicCode?: string;
  embeddingInvoked: boolean; generationInvoked: boolean;
  retrievedChunks: number | null; eligibleChunks: number | null;
  candidateChunks?: number | null;
  candidatesBeforeThreshold?: number | null;
  candidatesAfterThreshold?: number | null;
  topSimilarityScore?: number | null;
  minScore?: number | null;
  contextType?: string | null;
  firstZeroStage?: string | null;
  allowlistCount?: number | null;
  hasDongVanDocument?: boolean | null;
  retrievalReason?: QaRetrievalReason | null;
  provider?: "embedding" | "generation"; httpStatus?: number; requestId?: string;
  finishReason?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number;
  issues?: { code: string; path: (string | number)[] }[];
  synthesisRejection?: QaSynthesisRejection;
  synthesisGate?: string;
  requestedModel?: string;
  actualModel?: string;
  elapsedMs?: number;
  providerElapsedMs?: number;
  providerPhase?: QaProviderPhase;
  providerFailureReason?: QaProviderFailureReason;
  timeoutReason?: "PROVIDER_TIMEOUT" | "REQUEST_DEADLINE" | "REQUEST_ABORT";
  configuredTimeoutMs?: number;
  reasoningEffort?: "high" | "medium" | "none";
  reasoningTokens?: number;
};
type ProviderMetadata = Pick<QaDiagnosticEvent, "provider" | "httpStatus" | "requestId" | "finishReason" | "promptTokens" | "completionTokens" | "totalTokens" | "requestedModel" | "actualModel" | "providerElapsedMs" | "providerPhase" | "providerFailureReason" | "timeoutReason" | "configuredTimeoutMs" | "reasoningEffort" | "reasoningTokens">;
type Context = {
  sink: (event: QaDiagnosticEvent) => void;
  state: Pick<QaDiagnosticEvent, "correlationId" | "stage" | "embeddingInvoked" | "generationInvoked" | "retrievedChunks" | "eligibleChunks" | "candidateChunks" | "candidatesBeforeThreshold" | "candidatesAfterThreshold" | "topSimilarityScore" | "minScore" | "contextType" | "firstZeroStage" | "allowlistCount" | "hasDongVanDocument" | "retrievalReason">;
  metadata: Partial<Record<"embedding" | "generation", ProviderMetadata>>;
  failed: boolean;
  startedAt: number;
  providerStartedAt: Partial<Record<"embedding" | "generation", number>>;
};
const context = new AsyncLocalStorage<Context>();
const origins = new WeakMap<object, Origin>();
const safePath = new Set(["choices", "finish_reason", "message", "content", "refusal", "status", "answerParts", "facets", "supportIds", "text", "citationIds", "unanswered", "citations", "id", "sourceId", "title", "sourceUrl", "locators", "pageNumber", "section", "conversationId", "turnId", "turnState", "context", "type", "unansweredAspects", "clarificationQuestion", "success", "data"]);
const safeIssueCodes = new Set(["invalid_type", "invalid_value", "too_big", "too_small", "invalid_format", "unrecognized_keys", "custom", "invalid_union"]);
function emit(event: QaDiagnosticEvent) { try {
  const active = context.getStore();
  if (active) active.sink({ ...event, elapsedMs: Math.min(1_000_000, Math.max(0, Date.now() - active.startedAt)) });
} catch { /* Diagnostics never change operation semantics. */ } }

/** Fixed enum/numeric telemetry in every runtime; no prompts or response text. */
export function createQaDiagnostics(options: { nodeEnv?: string; vercelEnv?: string; sink?: (event: QaDiagnosticEvent) => void }) {
  const enabled = options.nodeEnv === "development" || options.nodeEnv === "production";
  return { run<T>(work: () => Promise<T>): Promise<T> {
    if (!enabled) return work();
    return context.run({
      sink: options.sink ?? (event => {
        console.info("US21_QA_DIAGNOSTIC", JSON.stringify(event));
      }),
      failed: false,
      startedAt: Date.now(),
      providerStartedAt: {},
      metadata: {},
      state: {
        correlationId: randomUUID(),
        stage: "REQUEST_ACCEPTED",
        embeddingInvoked: false,
        generationInvoked: false,
        retrievedChunks: null,
        eligibleChunks: null,
        candidateChunks: null,
        candidatesBeforeThreshold: null,
        candidatesAfterThreshold: null,
        topSimilarityScore: null,
        minScore: null,
        contextType: null,
        firstZeroStage: null,
        allowlistCount: null,
        hasDongVanDocument: null,
        retrievalReason: null,
      },
    }, work);
  } };
}
export type QaDiagnostics = ReturnType<typeof createQaDiagnostics>;
/** Safe rejection metadata only: never log claim/source text or model payloads. */
export function qaRejectSynthesis(reason: QaSynthesisRejection, gate?: string): false {
  const active = context.getStore();
  if (active) {
    active.state.stage = "SYNTHESIS_REJECTED";
    const allowedGates = ["ANSWER_RELEVANCE", "REQUIRED_FACETS_COVERAGE", "ENTITY_SCOPE", "TEMPORAL_VALIDITY", "NUMERIC_FIDELITY", "CLAIM_GROUNDING", "CITATION_VALIDITY", "NATURAL_LANGUAGE_QUALITY"];
    emit({ ...active.state, event: "STAGE", synthesisRejection: reason, ...(gate && allowedGates.includes(gate) ? { synthesisGate: gate } : {}) });
  }
  return false;
}
export function qaStage(
  stage: QaStage,
  counts?: {
    retrievedChunks?: number;
    eligibleChunks?: number;
    candidateChunks?: number;
    candidatesBeforeThreshold?: number;
    candidatesAfterThreshold?: number;
    topSimilarityScore?: number | null;
    minScore?: number | null;
    contextType?: string;
    firstZeroStage?: string;
    allowlistCount?: number;
    hasDongVanDocument?: boolean;
    retrievalReason?: QaRetrievalReason;
  }
) {
  const active = context.getStore(); if (!active) return;
  active.state.stage = stage;
  for (const key of ["retrievedChunks", "eligibleChunks", "candidateChunks", "candidatesBeforeThreshold", "candidatesAfterThreshold", "allowlistCount"] as const) {
    const count = counts?.[key]; if (Number.isInteger(count) && count! >= 0 && count! <= 1000) active.state[key] = count!;
  }
  if (typeof counts?.hasDongVanDocument === "boolean") active.state.hasDongVanDocument = counts.hasDongVanDocument;
  if (typeof counts?.topSimilarityScore === "number" && Number.isFinite(counts.topSimilarityScore)) {
    active.state.topSimilarityScore = Math.round(counts.topSimilarityScore * 10000) / 10000;
  } else if (counts?.topSimilarityScore === null) {
    active.state.topSimilarityScore = null;
  }
  if (typeof counts?.minScore === "number" && Number.isFinite(counts.minScore)) {
    active.state.minScore = counts.minScore;
  }
  if (counts?.contextType) active.state.contextType = counts.contextType;
  if (counts?.firstZeroStage) active.state.firstZeroStage = counts.firstZeroStage;
  if (counts?.retrievalReason) active.state.retrievalReason = counts.retrievalReason;
  emit({ ...active.state, event: "STAGE" });
}
// Model metadata is diagnostic only. Never copy arbitrary provider strings.
const safeModel = (value: unknown): value is string => typeof value === "string" && value.length <= 100 && /^(?:gpt-\d|text-embedding-\d)[a-zA-Z0-9._-]*$/u.test(value);
export function qaProviderInvoked(provider: "embedding" | "generation", requestedModel?: string, details?: Pick<ProviderMetadata, "providerPhase" | "configuredTimeoutMs" | "reasoningEffort">) {
  const active = context.getStore(); if (!active) return;
  active.state[provider === "embedding" ? "embeddingInvoked" : "generationInvoked"] = true;
  const metadata = { provider, ...(safeModel(requestedModel) ? { requestedModel } : {}), ...details };
  // Reset actual-model/usage data from the previous call of the same provider.
  active.metadata[provider] = metadata;
  active.providerStartedAt[provider] = Date.now();
  emit({ ...active.state, event: "STAGE", ...metadata });
}
/** Project a fixed numeric/enum subset; never copy arbitrary provider properties. */
export function qaProviderMetadata(provider: "embedding" | "generation", response?: Response, payload?: unknown) {
  const active = context.getStore(); if (!active) return;
  const event: QaDiagnosticEvent = { ...active.state, ...active.metadata[provider], event: "STAGE", provider };
  const started = active.providerStartedAt[provider];
  if (started !== undefined) event.providerElapsedMs = Math.min(1_000_000, Math.max(0, Date.now() - started));
  if (response) {
    event.httpStatus = response.status;
    const id = response.headers.get("x-request-id");
    if (id && /^req_[a-zA-Z0-9_-]{1,100}$/.test(id)) event.requestId = id;
  }
  if (payload && typeof payload === "object") {
    const p = payload as { model?: unknown; choices?: { finish_reason?: unknown }[]; usage?: Record<string, unknown> };
    if (safeModel(p.model)) event.actualModel = p.model;
    const reason = Array.isArray(p.choices) ? p.choices[0]?.finish_reason : undefined;
    if (typeof reason === "string" && ["stop", "length", "content_filter", "tool_calls", "function_call"].includes(reason)) event.finishReason = reason;
    for (const [key, target] of [["prompt_tokens", "promptTokens"], ["completion_tokens", "completionTokens"], ["total_tokens", "totalTokens"]] as const) {
      const value = p.usage?.[key]; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) event[target] = value;
    }
    const reasoning = (p.usage?.completion_tokens_details as { reasoning_tokens?: unknown } | undefined)?.reasoning_tokens;
    if (typeof reasoning === "number" && Number.isSafeInteger(reasoning) && reasoning >= 0 && reasoning <= 1_000_000) event.reasoningTokens = reasoning;
  }
  const { httpStatus, requestId, finishReason, promptTokens, completionTokens, totalTokens, requestedModel, actualModel, providerElapsedMs, providerPhase, configuredTimeoutMs, reasoningEffort, reasoningTokens } = event;
  active.metadata[provider] = { provider, httpStatus, requestId, finishReason, promptTokens, completionTokens, totalTokens, requestedModel, actualModel, providerElapsedMs, providerPhase, configuredTimeoutMs, reasoningEffort, reasoningTokens };
  emit(event);
}
export function qaProviderFailure(reason: QaProviderFailureReason) {
  const active = context.getStore(); if (!active) return;
  const metadata = active.metadata.generation;
  if (!metadata) return;
  metadata.providerFailureReason = reason;
  if (reason === "PROVIDER_TIMEOUT" || reason === "REQUEST_DEADLINE" || reason === "REQUEST_ABORT") metadata.timeoutReason = reason;
  const started = active.providerStartedAt.generation;
  if (started !== undefined) metadata.providerElapsedMs = Math.min(1_000_000, Math.max(0, Date.now() - started));
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
