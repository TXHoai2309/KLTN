import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import "server-only";
import { z } from "zod";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { AppError } from "../../server/http/app-error";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, qaCompletedTurnSchema, qaPublicCitationSchema, qaQuestionSchema, qaReferenceIdSchema } from "./qa-contract";
import { canonicalizeSentence, composeQaPrompt, containsEvidenceInstruction, qaScopedEvidenceSentences, QA_CLARIFICATION_QUESTION, QA_UNANSWERED_ASPECT } from "./qa-prompt";
import type { QaAnswer, QaGenerationInput, QaGenerator } from "./qa-runtime-contract";
import { isQaPublicAnswerSafe, isQaPublicMetadataSafe } from "./qa-public-safety";
import { createQaSynthesisVerifier } from "./qa-synthesis-verification";
import { qaAnswerPresentation, qaMissingAspectNotices } from "./qa-answer-details";
import { qaReviewedSupport } from "./qa-reviewed-support";
import { qaReviewedExcerptAnswer } from "./qa-reviewed-excerpts";
import { qaOrigin, qaStage, type QaStage, type QaFailureCategory } from "./qa-diagnostics";

import { createQaJsonProvider, QA_GENERATION_LIMITS, type QaProviderOptions } from "./qa-json-provider";
export { QA_GENERATION_LIMITS } from "./qa-json-provider";
const modelOutput = z.object({
  status: z.enum(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"]),
  answerParts: z.array(z.object({
    text: z.string().min(1).max(6000),
    mode: z.enum(["SOURCE", "EXPANDED"]).default("SOURCE"),
    citationIds: z.array(qaReferenceIdSchema).default([]),
  }).strict()).max(20),
  unanswered: z.boolean(),
  unansweredAspects: z.array(z.string().min(1).max(500)).optional(),
}).strict();
const outputSchema = {
  type: "object", additionalProperties: false, required: ["status", "answerParts", "unanswered"],
  properties: {
    status: { type: "string", enum: ["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"] },
    answerParts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "citationIds", "mode"],
        properties: {
          text: { type: "string" },
          mode: { type: "string", enum: ["SOURCE", "EXPANDED"] },
          citationIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    unanswered: { type: "boolean" },
    unansweredAspects: { type: "array", items: { type: "string" } },
  },
};
const generationPartSchema = z.object({ text: z.string().min(1).max(6000), supportIds: z.array(z.string().regex(/^s[1-9]\d{0,2}$/u)).min(1).max(20) }).strict();
const generationWireSchema = modelOutput.omit({ answerParts: true }).extend({ facets: z.record(z.string(), z.array(generationPartSchema).max(20)) });
const invalid = (stage: QaStage = "GENERATION_PREFLIGHT", category: QaFailureCategory = "INPUT_LIMIT", issues?: readonly { code: string; path: readonly PropertyKey[] }[]) => qaOrigin(new AppError("AI_INVALID_RESPONSE", "Phản hồi AI không hợp lệ hoặc không có căn cứ.", 502), stage, category, issues);
const unavailable = (stage: QaStage = "GENERATION_PROVIDER") => qaOrigin(new AppError("AI_UNAVAILABLE", "Dịch vụ AI hiện không khả dụng.", 503), stage, "PROVIDER_FAILURE");
export const insufficientQaAnswer = (reason?: "NO_EVIDENCE" | "MISSING_SUPPORT" | "ANSWER_VERIFICATION"): QaAnswer => ({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE, ...(reason ? { reason } : {}) });

export function assertQaEvidenceInput(input: QaGenerationInput): void {
  if ((input.context.type === "DESTINATION" && (!input.context.name.trim() || containsEvidenceInstruction(input.context.name))) || !qaQuestionSchema.safeParse(input.question).success || input.evidence.length > QA_GENERATION_LIMITS.maxEvidence) throw invalid();
  if (input.evidence.some(item => qaScopedEvidenceSentences(item.text, input).some(sentence => [item.documentId, item.generationId, item.contentVersionId, item.chunkId, item.chunkHash]
    .some(id => id.length >= 8 && sentence.includes(id)))) || !isQaPublicMetadataSafe(input.evidence.map(item => qaScopedEvidenceSentences(item.text, input)))) throw invalid("GENERATION_PREFLIGHT", "PRIVATE_MATERIAL");
  if (input.evidence.some(item => containsEvidenceInstruction(item.text))) throw invalid("GENERATION_PREFLIGHT", "EVIDENCE_INSTRUCTION");
  // Unsafe blocks (URLs, paths, secrets) are already removed from every sentence
  // the model can see, so they no longer fail the whole question. Callers drop
  // unusable chunks first (qaUsableEvidence); this stays as a last defence for
  // unsafe citation metadata and for input that has no safe sentence at all.
  if (!isQaPublicMetadataSafe(input.evidence.map(item => item.citation)) ||
      (input.evidence.length > 0 && !input.evidence.some(item => qaScopedEvidenceSentences(item.text, input).length))) throw invalid("GENERATION_PREFLIGHT", "PRIVATE_MATERIAL");
  const rawLength = input.question.length + input.history.slice(-6).reduce((sum, turn) => sum + turn.question.length, 0) + input.evidence.reduce((sum, item) => sum + item.text.length, 0);
  if (rawLength > QA_GENERATION_LIMITS.maxInputUtf16) throw invalid();
}

// Synchronous compatibility entry point: no certificate means exact reviewed
// membership is still mandatory. Runtime synthesis uses the bounded verifier.
export function validateQaGenerationOutput(output: unknown, input: QaGenerationInput): QaAnswer {
  return validateCandidate(output, input, false);
}

// Only the real generator may construct an unverified synthesis candidate.
// Synchronous callers retain the extractive contract and cannot bypass grounding.
function validateCandidate(output: unknown, input: QaGenerationInput, synthesis: boolean): QaAnswer {
  qaStage("GENERATION_OUTPUT_SCHEMA");
  const parsed = modelOutput.safeParse(output);
  if (!parsed.success) throw invalid("GENERATION_OUTPUT_SCHEMA", "SCHEMA", parsed.error.issues);
  const value = parsed.data;
  const factual = value.status === "ANSWERED" || value.status === "PARTIAL";
  if (value.unanswered !== (value.status === "PARTIAL")) throw invalid("GENERATION_OUTCOME", "OUTCOME_CONSISTENCY", [{ code: "custom", path: ["unanswered"] }]);
  if (factual ? value.answerParts.length === 0 : value.answerParts.length !== 0) throw invalid("GENERATION_OUTCOME", "OUTCOME_CONSISTENCY", [{ code: "custom", path: ["answerParts"] }]);
  if (value.status === "INSUFFICIENT_SOURCE") { qaStage("GENERATION_OUTPUT_VALIDATED"); return insufficientQaAnswer(); }
  if (value.status === "CLARIFICATION_REQUIRED") { qaStage("GENERATION_OUTPUT_VALIDATED"); return input.questionPlan ? insufficientQaAnswer("MISSING_SUPPORT") : { status: value.status, answerParts: [], citations: [], clarificationQuestion: QA_CLARIFICATION_QUESTION }; }
  const registry = new Map(input.evidence.map(item => [item.citationId, item]));
  if (registry.size !== input.evidence.length) throw invalid("CITATION_VALIDATION", "DUPLICATE_REGISTRY");
  const used = new Set<string>();
  const parts = value.answerParts.map(part => {
    const text = part.text.normalize("NFC").trim();
    const mode = part.mode ?? "SOURCE";
    if (new Set(part.citationIds).size !== part.citationIds.length) throw invalid("CITATION_VALIDATION", "DUPLICATE_CITATION");
    if (mode === "SOURCE") {
      if (part.citationIds.length === 0) throw invalid("CITATION_VALIDATION", "CITATION_REFERENCE");
      for (const id of part.citationIds) {
        const evidence = registry.get(id);
        if (!evidence || evidence.citation.id !== id) throw invalid("CITATION_VALIDATION", "CITATION_REFERENCE");
        if (containsEvidenceInstruction(evidence.text)) throw invalid("GROUNDING_VALIDATION", "EVIDENCE_INSTRUCTION");
        used.add(id);
      }
    } else {
      if (part.citationIds.length > 0) throw invalid("CITATION_VALIDATION", "CITATION_REFERENCE");
    }
    return { text, mode, citationIds: part.citationIds };
  });
  const citations = [...used].map(id => {
    const result = qaPublicCitationSchema.safeParse(registry.get(id)!.citation);
    if (!result.success) throw invalid("CITATION_VALIDATION", "SCHEMA", result.error.issues);
    return result.data;
  });
  const aspects = value.unansweredAspects && value.unansweredAspects.length > 0
    ? value.unansweredAspects
    : (input.sourceReview ? qaMissingAspectNotices(input.sourceReview, input.questionPlan) : [QA_UNANSWERED_ASPECT]);
  const answer: QaAnswer = value.status === "ANSWERED"
    ? { status: "ANSWERED", answerParts: parts, citations, unansweredAspects: [], knowledgeMode: input.knowledgeMode ?? "SOURCE_ONLY" }
    : { status: "PARTIAL", answerParts: parts, citations, unansweredAspects: aspects, knowledgeMode: input.knowledgeMode ?? "SOURCE_ONLY" };
  if (answer.status === "ANSWERED" || answer.status === "PARTIAL") {
    answer.presentation = qaAnswerPresentation(input.question, parts.length);
  }
  assertQaAnswerGrounding(answer, input);
  const completed = qaCompletedTurnSchema.safeParse({ ...answer, conversationId: "internal", turnId: "internal", turnState: "COMPLETED", context: { type: "GENERAL" }, knowledgeMode: input.knowledgeMode ?? "SOURCE_ONLY" });
  if (!completed.success) throw invalid("RESPONSE_VALIDATION", "SCHEMA", completed.error.issues);
  if (!isQaPublicAnswerSafe(answer, input.evidence)) throw invalid("PUBLIC_SAFETY", "PRIVATE_MATERIAL");
  return answer;
}

export function createQaGenerator(options: QaProviderOptions = {}): QaGenerator {
  const provider = createQaJsonProvider({ ...options, providerPhase: "GENERATION" });
  return {
    async generate(input) {
      qaStage("GENERATION_PREFLIGHT");
      if ((input.context.type === "DESTINATION" && (!input.context.name.trim() || containsEvidenceInstruction(input.context.name))) || !qaQuestionSchema.safeParse(input.question).success || input.evidence.length > QA_GENERATION_LIMITS.maxEvidence) throw invalid();
      if (input.signal?.aborted) throw unavailable();
      if (input.evidence.length === 0 || input.sourceSufficiency?.status === "INSUFFICIENT") {
        if (input.knowledgeMode !== "EXPANDED") {
          qaStage("GENERATION_OUTPUT_VALIDATED");
          return insufficientQaAnswer("NO_EVIDENCE");
        }
      }
      assertQaEvidenceInput(input);
      const messages = composeQaPrompt(input);
      if (countEmbeddingTokens(JSON.stringify(messages)) > QA_GENERATION_LIMITS.maxInputTokens) throw invalid("GENERATION_PREFLIGHT", "TOKEN_LIMIT");
      const availableCitationIds = input.evidence.map(e => e.citationId);
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["status", "answerParts", "unanswered"],
        properties: {
          status: {
            type: "string",
            enum: ["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"],
            description: "Set to 'PARTIAL' if some requested details lack evidence; 'ANSWERED' if all facts are covered; 'INSUFFICIENT_SOURCE' if no evidence supports it.",
          },
          answerParts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "citationIds", "mode"],
              properties: {
                text: { type: "string" },
                mode: { type: "string", enum: ["SOURCE", "EXPANDED"] },
                citationIds: {
                  type: "array",
                  items: { type: "string", ...(availableCitationIds.length ? { enum: availableCitationIds } : {}) },
                },
              },
            },
          },
          unanswered: {
            type: "boolean",
            description: "Must be true if and only if status is 'PARTIAL'. For all other statuses, this must be false.",
          },
        },
      };
      const answer = await provider.request({ messages, name: "grounded_qa", schema, signal: input.signal }, content => {
        return validateCandidate(content, input, true);
      });
      assertQaAnswerGrounding(answer, input);
      qaStage("GENERATION_OUTPUT_VALIDATED");
      return answer;
    }
  };
}
