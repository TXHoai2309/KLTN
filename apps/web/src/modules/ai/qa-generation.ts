import "server-only";
import { z } from "zod";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { AppError } from "../../server/http/app-error";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, qaCompletedTurnSchema, qaPublicCitationSchema, qaQuestionSchema, qaReferenceIdSchema } from "./qa-contract";
import { composeQaPrompt, containsEvidenceInstruction, qaScopedEvidenceSentences, QA_CLARIFICATION_QUESTION, QA_UNANSWERED_ASPECT } from "./qa-prompt";
import type { QaAnswer, QaGenerationInput, QaGenerator } from "./qa-runtime-contract";
import { isQaPublicAnswerSafe, isQaPublicMetadataSafe } from "./qa-public-safety";
import { qaOrigin, qaProviderInvoked, qaProviderMetadata, qaStage, type QaStage, type QaFailureCategory } from "./qa-diagnostics";

export const QA_GENERATION_LIMITS = { timeoutMs: 25_000, maxInputTokens: 8_000, maxOutputTokens: 2_000, maxResponseBytes: 64 * 1024, maxEvidence: 4, maxInputUtf16: 40_000 } as const;
const modelOutput = z.object({
  status: z.enum(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"]),
  answerParts: z.array(z.object({ text: z.string().min(1).max(6000), citationIds: z.array(qaReferenceIdSchema).min(1).max(20) }).strict()).max(20),
  unanswered: z.boolean(),
}).strict();
const outputSchema = {
  type: "object", additionalProperties: false, required: ["status", "answerParts", "unanswered"],
  properties: {
    status: { type: "string", enum: ["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"] },
    answerParts: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "citationIds"], properties: { text: { type: "string" }, citationIds: { type: "array", items: { type: "string" } } } } },
    unanswered: { type: "boolean" },
  },
};
const invalid = (stage: QaStage = "GENERATION_PREFLIGHT", category: QaFailureCategory = "INPUT_LIMIT", issues?: readonly { code: string; path: readonly PropertyKey[] }[]) => qaOrigin(new AppError("AI_INVALID_RESPONSE", "Phản hồi AI không hợp lệ hoặc không có căn cứ.", 502), stage, category, issues);
const unavailable = (stage: QaStage = "GENERATION_PROVIDER") => qaOrigin(new AppError("AI_UNAVAILABLE", "Dịch vụ AI hiện không khả dụng.", 503), stage, "PROVIDER_FAILURE");
export const insufficientQaAnswer = (): QaAnswer => ({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE });

// Conservative extractive gate, not a semantic verifier. Exact source membership
// cannot establish question relevance/coverage, source accuracy, implied claims,
// or detect every instruction. Outcome quality requires representative evaluation.
// Only the backend retriever may supply this registry and approved public metadata.
export function validateQaGenerationOutput(output: unknown, input: QaGenerationInput): QaAnswer {
  qaStage("GENERATION_OUTPUT_SCHEMA");
  const parsed = modelOutput.safeParse(output);
  if (!parsed.success) throw invalid("GENERATION_OUTPUT_SCHEMA", "SCHEMA", parsed.error.issues);
  const value = parsed.data;
  const factual = value.status === "ANSWERED" || value.status === "PARTIAL";
  if (value.unanswered !== (value.status === "PARTIAL")) throw invalid("GENERATION_OUTCOME", "OUTCOME_CONSISTENCY", [{ code: "custom", path: ["unanswered"] }]);
  if (factual ? value.answerParts.length === 0 : value.answerParts.length !== 0) throw invalid("GENERATION_OUTCOME", "OUTCOME_CONSISTENCY", [{ code: "custom", path: ["answerParts"] }]);
  if (value.status === "INSUFFICIENT_SOURCE") { qaStage("GENERATION_OUTPUT_VALIDATED"); return insufficientQaAnswer(); }
  if (value.status === "CLARIFICATION_REQUIRED") { qaStage("GENERATION_OUTPUT_VALIDATED"); return { status: value.status, answerParts: [], citations: [], clarificationQuestion: QA_CLARIFICATION_QUESTION }; }
  const registry = new Map(input.evidence.map(item => [item.citationId, item]));
  if (registry.size !== input.evidence.length) throw invalid("CITATION_VALIDATION", "DUPLICATE_REGISTRY");
  const used = new Set<string>();
  const parts = value.answerParts.map(part => {
    const text = part.text.normalize("NFC").trim();
    if (new Set(part.citationIds).size !== part.citationIds.length) throw invalid("CITATION_VALIDATION", "DUPLICATE_CITATION");
    for (const id of part.citationIds) {
      const evidence = registry.get(id);
      if (!evidence || evidence.citation.id !== id) throw invalid("CITATION_VALIDATION", "CITATION_REFERENCE");
      if (containsEvidenceInstruction(evidence.text)) throw invalid("GROUNDING_VALIDATION", "EVIDENCE_INSTRUCTION");
      if (!qaScopedEvidenceSentences(evidence.text, input).includes(text)) throw invalid("GROUNDING_VALIDATION", "UNSUPPORTED_SENTENCE");
      used.add(id);
    }
    return { text, citationIds: part.citationIds };
  });
  const citations = [...used].map(id => {
    const result = qaPublicCitationSchema.safeParse(registry.get(id)!.citation);
    if (!result.success) throw invalid("CITATION_VALIDATION", "SCHEMA", result.error.issues);
    return result.data;
  });
  const answer: QaAnswer = value.status === "ANSWERED"
    ? { status: "ANSWERED", answerParts: parts, citations, unansweredAspects: [] }
    : { status: "PARTIAL", answerParts: parts, citations, unansweredAspects: [QA_UNANSWERED_ASPECT] };
  const completed = qaCompletedTurnSchema.safeParse({ ...answer, conversationId: "internal", turnId: "internal", turnState: "COMPLETED", context: { type: "GENERAL" } });
  if (!completed.success) throw invalid("RESPONSE_VALIDATION", "SCHEMA", completed.error.issues);
  if (!isQaPublicAnswerSafe(answer, input.evidence)) throw invalid("PUBLIC_SAFETY", "PRIVATE_MATERIAL");
  qaStage("GENERATION_OUTPUT_VALIDATED");
  return answer;
}

async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw invalid("GENERATION_ENVELOPE", "BODY_MISSING");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > QA_GENERATION_LIMITS.maxResponseBytes) { await reader.cancel().catch(() => undefined); throw invalid("GENERATION_ENVELOPE", "BODY_LIMIT"); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}

export function createQaGenerator(options: { apiKey?: () => string | undefined; fetcher?: typeof fetch; model?: string; timeoutMs?: number; maxOutputTokens?: number } = {}): QaGenerator {
  const model = options.model ?? "gpt-4o-mini";
  const timeoutMs = options.timeoutMs ?? QA_GENERATION_LIMITS.timeoutMs;
  const maxOutputTokens = options.maxOutputTokens ?? QA_GENERATION_LIMITS.maxOutputTokens;
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > QA_GENERATION_LIMITS.timeoutMs || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > QA_GENERATION_LIMITS.maxOutputTokens) throw new Error("Invalid QA generation configuration");
  return { async generate(input) {
    qaStage("GENERATION_PREFLIGHT");
    if ((input.context.type === "DESTINATION" && (!input.context.name.trim() || containsEvidenceInstruction(input.context.name))) || !qaQuestionSchema.safeParse(input.question).success || input.evidence.length > QA_GENERATION_LIMITS.maxEvidence) throw invalid();
    if (input.signal?.aborted) throw unavailable();
    if (input.evidence.length === 0) { qaStage("GENERATION_OUTPUT_VALIDATED"); return insufficientQaAnswer(); }
    const hasInternalEvidenceIdentifier = input.evidence.some(item => [item.documentId, item.generationId, item.contentVersionId, item.chunkId, item.chunkHash]
      .some(id => id.length >= 8 && item.text.includes(id)));
    if (hasInternalEvidenceIdentifier || !isQaPublicMetadataSafe(input.evidence.map(item => item.text))) throw invalid("GENERATION_PREFLIGHT", "PRIVATE_MATERIAL");
    if (input.evidence.some(item => containsEvidenceInstruction(item.text))) throw invalid("GENERATION_PREFLIGHT", "EVIDENCE_INSTRUCTION");
    // Bound allocation/tokenizer work before composition. Token counts below use
    // the existing cl100k estimator; provider max_completion_tokens is authoritative.
    const rawLength = input.question.length + input.history.slice(-6).reduce((sum, turn) => sum + turn.question.length, 0) + input.evidence.reduce((sum, item) => sum + item.text.length, 0);
    if (rawLength > QA_GENERATION_LIMITS.maxInputUtf16) throw invalid();
    const messages = composeQaPrompt(input);
    if (countEmbeddingTokens(JSON.stringify(messages)) > QA_GENERATION_LIMITS.maxInputTokens) throw invalid("GENERATION_PREFLIGHT", "TOKEN_LIMIT");
    let key: string | undefined;
    try { key = (options.apiKey ?? (() => process.env.OPENAI_API_KEY))(); } catch { throw unavailable("GENERATION_PREFLIGHT"); }
    if (!key) throw unavailable("GENERATION_PREFLIGHT");
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Promise race bounds even an injected transport that ignores AbortSignal.
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs); });
    const cancellation = new Promise<never>((_, reject) => { controller.signal.addEventListener("abort", () => reject(unavailable()), { once: true }); });
    const work = async (): Promise<QaAnswer> => {
      qaStage("GENERATION_PROVIDER");
      qaProviderInvoked("generation");
      const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/chat/completions", { method: "POST", redirect: "error", signal: controller.signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages, store: false, max_completion_tokens: maxOutputTokens, response_format: { type: "json_schema", json_schema: { name: "grounded_qa", strict: true, schema: outputSchema } } }) });
      qaProviderMetadata("generation", response);
      if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw unavailable(); }
      let payload: unknown;
      qaStage("GENERATION_ENVELOPE");
      try { payload = JSON.parse(await readBounded(response)); } catch (error) { if (error instanceof AppError) throw error; throw invalid("GENERATION_ENVELOPE", "INVALID_JSON"); }
      qaProviderMetadata("generation", response, payload);
      const envelope = z.object({ choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string(), refusal: z.string().nullable().optional() }) })).length(1) }).safeParse(payload);
      if (!envelope.success) throw invalid("GENERATION_ENVELOPE", "ENVELOPE", envelope.error.issues);
      if (envelope.data.choices[0]!.message.refusal) throw invalid("GENERATION_ENVELOPE", "REFUSAL");
      if (countEmbeddingTokens(envelope.data.choices[0]!.message.content) > maxOutputTokens) throw invalid("GENERATION_JSON", "TOKEN_LIMIT");
      let content: unknown;
      qaStage("GENERATION_JSON");
      try { content = JSON.parse(envelope.data.choices[0]!.message.content); } catch { throw invalid("GENERATION_JSON", "INVALID_JSON"); }
      return validateQaGenerationOutput(content, input);
    };
    try { return await Promise.race([work(), deadline, cancellation]); }
    catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
    finally { clearTimeout(timer); input.signal?.removeEventListener("abort", abort); }
  } };
}
