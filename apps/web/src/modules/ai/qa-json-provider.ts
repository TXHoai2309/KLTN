import "server-only";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { qaOrigin, qaProviderInvoked, qaProviderMetadata, qaProviderFailure, qaStage, type QaStage, type QaFailureCategory, type QaProviderPhase, type QaProviderFailureReason } from "./qa-diagnostics";
import { qaRemainingProviderMs, QA_REQUEST_DEADLINE, QA_ELIGIBILITY_ABORT } from "./qa-request-budget";

export type QaProviderOptions = { apiKey?: () => string | undefined; fetcher?: typeof fetch; model?: string; timeoutMs?: number; maxOutputTokens?: number; providerPhase?: QaProviderPhase };
// Owner-selected model for reading, assessment, answer composition and verification.
export const QA_DEFAULT_MODEL = "gpt-6.1-sol";
export const QA_ANSWER_MODEL = QA_DEFAULT_MODEL;
export const QA_GENERATION_LIMITS = { timeoutMs: 25_000, maxInputTokens: 8_000, maxOutputTokens: 2_000, maxCompletionTokens: 8_000, maxResponseBytes: 64 * 1024, maxEvidence: 4, maxInputUtf16: 40_000 } as const;
const invalid = (stage: QaStage, category: QaFailureCategory, issues?: readonly { code: string; path: readonly PropertyKey[] }[]) =>
  qaOrigin(new AppError("AI_INVALID_RESPONSE", "Phản hồi AI không hợp lệ hoặc không có căn cứ.", 502), stage, category, issues);
const unavailable = (stage: QaStage = "GENERATION_PROVIDER") => qaOrigin(new AppError("AI_UNAVAILABLE", "Dịch vụ AI hiện không khả dụng.", 503), stage, "PROVIDER_FAILURE");

async function readBounded(response: Response, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw invalid("GENERATION_ENVELOPE", "BODY_MISSING");
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > QA_GENERATION_LIMITS.maxResponseBytes) { await reader.cancel().catch(() => undefined); throw invalid("GENERATION_ENVELOPE", "BODY_LIMIT"); }
      chunks.push(result.value);
    }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  const combined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(combined); }
  catch { throw invalid("GENERATION_ENVELOPE", "INVALID_JSON"); }
}

/** One bounded structured call, no automatic retries. Shared by assessment and
 * answer generation; neither invocation retains provider conversation state. */
export function createQaJsonProvider(options: QaProviderOptions = {}) {
  const model = options.model ?? QA_DEFAULT_MODEL;
  // Preserve this workload's non-reasoning latency/token role. Luna otherwise
  // defaults to medium reasoning, incompatible with the existing temperature.
  const luna = /^gpt-6-luna(?:-|$)/u.test(model);
  const sol61 = /^gpt-6\.1-sol(?:-|$)/u.test(model);
  const timeoutMs = options.timeoutMs ?? QA_GENERATION_LIMITS.timeoutMs;
  const maxOutputTokens = options.maxOutputTokens ?? QA_GENERATION_LIMITS.maxOutputTokens;
  const phase = options.providerPhase ?? "GENERATION";
  // max_completion_tokens also pays for hidden reasoning. With medium reasoning a 2,000 cap is often
  // spent before any JSON is written (finish_reason "length"), so reasoning models get a larger
  // completion budget. The visible JSON stays bounded by maxOutputTokens (checked on the content below).
  const completionCap = sol61 ? Math.max(maxOutputTokens, QA_GENERATION_LIMITS.maxCompletionTokens) : maxOutputTokens;
  const failureStage = phase === "SYNTHESIS_VERIFICATION" ? phase : phase === "ASSESSMENT" ? "ASSESSMENT_STARTED" : "GENERATION_PROVIDER";
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > QA_GENERATION_LIMITS.timeoutMs || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > QA_GENERATION_LIMITS.maxOutputTokens) throw new Error("Invalid QA generation configuration");
  return { async request<T>(input: { messages: { role: "system" | "user"; content: string }[]; name: string; schema: object; signal?: AbortSignal }, validate: (value: unknown) => T): Promise<T> {
    const messages = input.messages;
    // Dynamic schema enums are also provider input (sentence/part handles and
    // fixed answer text). Include them in the existing worst-case input budget.
    const providerInput = JSON.stringify({ messages, schema: input.schema });
    if (providerInput.length > QA_GENERATION_LIMITS.maxInputUtf16 || countEmbeddingTokens(providerInput) > QA_GENERATION_LIMITS.maxInputTokens) throw invalid("GENERATION_PREFLIGHT", "TOKEN_LIMIT");
    let key: string | undefined;
    try { key = (options.apiKey ?? (() => process.env.OPENAI_API_KEY))(); } catch { throw unavailable("GENERATION_PREFLIGHT"); }
    if (!key) throw unavailable("GENERATION_PREFLIGHT");
    const controller = new AbortController();
    let failureReason: QaProviderFailureReason | undefined;
    const fail = (reason: QaProviderFailureReason) => {
      failureReason ??= reason;
      qaProviderFailure(failureReason);
      return unavailable(failureStage);
    };
    const remainingMs = qaRemainingProviderMs();
    const effectiveTimeoutMs = Math.min(timeoutMs, remainingMs);
    qaStage(failureStage);
    qaProviderInvoked("generation", model, { providerPhase: phase, configuredTimeoutMs: effectiveTimeoutMs, ...(sol61 ? { reasoningEffort: "medium" as const } : luna ? { reasoningEffort: "none" as const } : {}) });
    const abortReason = (): QaProviderFailureReason => input.signal?.reason === QA_REQUEST_DEADLINE ? "REQUEST_DEADLINE" : input.signal?.reason === QA_ELIGIBILITY_ABORT ? "ELIGIBILITY_ABORT" : "REQUEST_ABORT";
    const abort = () => { failureReason ??= abortReason(); controller.abort(); };
    if (input.signal?.aborted) throw fail(abortReason());
    if (effectiveTimeoutMs <= 0) throw fail("REQUEST_DEADLINE");
    input.signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { const error = fail(remainingMs <= timeoutMs ? "REQUEST_DEADLINE" : "PROVIDER_TIMEOUT"); controller.abort(); reject(error); }, effectiveTimeoutMs); });
    const cancellation = new Promise<never>((_, reject) => { controller.signal.addEventListener("abort", () => reject(fail(failureReason ?? "REQUEST_ABORT")), { once: true }); });
    const work = async (): Promise<T> => {
      const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/chat/completions", { method: "POST", redirect: "error", signal: controller.signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages, store: false, ...(sol61 ? { reasoning_effort: "medium" } : { temperature: 0, ...(luna ? { reasoning_effort: "none" } : {}) }), max_completion_tokens: completionCap, response_format: { type: "json_schema", json_schema: { name: input.name, strict: true, schema: input.schema } } }) });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => undefined); throw fail(failureReason ?? "REQUEST_ABORT"); }
      qaProviderMetadata("generation", response);
      if (!response.ok) { void response.body?.cancel().catch(() => undefined); throw fail("UPSTREAM_HTTP"); }
      let payload: unknown; qaStage("GENERATION_ENVELOPE");
      // Stream/network errors must not be mislabeled as a JSON/schema failure.
      const raw = await readBounded(response, controller.signal);
      try { payload = JSON.parse(raw); } catch { throw invalid("GENERATION_ENVELOPE", "INVALID_JSON"); }
      qaProviderMetadata("generation", response, payload);
      // Running out of completion budget (reasoning included) is a distinct, diagnosable failure.
      if ((payload as { choices?: { finish_reason?: unknown }[] } | null)?.choices?.[0]?.finish_reason === "length") throw invalid("GENERATION_ENVELOPE", "TOKEN_LIMIT");
      const envelope = z.object({ choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string(), refusal: z.string().nullable().optional() }) })).length(1) }).safeParse(payload);
      if (!envelope.success) throw invalid("GENERATION_ENVELOPE", "ENVELOPE", envelope.error.issues);
      if (envelope.data.choices[0]!.message.refusal) throw invalid("GENERATION_ENVELOPE", "REFUSAL");
      if (countEmbeddingTokens(envelope.data.choices[0]!.message.content) > maxOutputTokens) throw invalid("GENERATION_JSON", "TOKEN_LIMIT");
      let content: unknown; qaStage("GENERATION_JSON");
      try { content = JSON.parse(envelope.data.choices[0]!.message.content); } catch { throw invalid("GENERATION_JSON", "INVALID_JSON"); }
      if (controller.signal.aborted) throw fail(failureReason ?? "REQUEST_ABORT");
      return validate(content);
    };
    try { return await Promise.race([work(), deadline, cancellation]); }
    catch (error) { if (failureReason) throw fail(failureReason); if (error instanceof AppError) throw error; throw fail("NETWORK_ERROR"); }
    finally { clearTimeout(timer); input.signal?.removeEventListener("abort", abort); }
  } };
}
