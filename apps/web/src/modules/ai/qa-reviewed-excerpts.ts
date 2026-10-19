import "server-only";
import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import { qaMissingAspectNotices } from "./qa-answer-details";
import { isQaPublicAnswerSafe } from "./qa-public-safety";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import type { QaAnswer, QaGenerationInput } from "./qa-runtime-contract";
import { containsEvidenceInstruction } from "./qa-prompt";

/** A DIFFERENT answer, using the existing exact reviewed-source contract.
 * Never publish the rejected synthesis, assign it a certificate, silently
 * truncate qualifiers, change coverage, or use prior answers as evidence. */
export function qaReviewedExcerptAnswer(input: QaGenerationInput): QaAnswer | null {
  // An exact quotation is never a fallback for an explicitly current-time
  // question. In particular a recorded price must not become today's price.
  if (/(?:hôm nay|hiện tại|hiện nay|mới nhất|bây giờ|today|right now|latest|current)/iu.test([input.question, ...input.history.slice(-2).map(turn => turn.question)].join("\n"))) return null;
  if (input.evidence.some(item => containsEvidenceInstruction(item.text))) return null;
  const decision = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input, review: input.sourceReview });
  if (decision.status !== "SUFFICIENT" && decision.status !== "PARTIAL") return null;
  const parts = new Map<string, Set<string>>();
  for (const aspect of input.sourceReview!.aspects) if (aspect.status === "SUPPORTED") for (const ref of aspect.supports) {
    const ids = parts.get(ref.sentence) ?? new Set<string>(); ids.add(ref.citationId); parts.set(ref.sentence, ids);
  }
  const answerParts = [...parts].map(([text, ids]) => ({ text, citationIds: [...ids] }));
  if (!answerParts.length || answerParts.length > 20 || answerParts.some(part => part.text.length > 6000) || countEmbeddingTokens(JSON.stringify(answerParts)) > 2000) return null;
  const used = new Set(answerParts.flatMap(part => part.citationIds));
  const citations = input.evidence.filter(item => used.has(item.citationId)).map(item => item.citation);
  const base = { answerParts, citations, answerMode: "SOURCE_EXCERPTS" as const, presentation: "PARAGRAPHS" as const };
  const answer: QaAnswer = decision.status === "PARTIAL" ? { ...base, status: "PARTIAL", unansweredAspects: qaMissingAspectNotices(input.sourceReview, input.questionPlan) } : { ...base, status: "ANSWERED", unansweredAspects: [] };
  if (!isQaPublicAnswerSafe(answer, input.evidence)) return null;
  assertQaAnswerGrounding(answer, input); // Exact membership AND every supported facet.
  return answer;
}
