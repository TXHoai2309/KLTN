import "server-only";
import { createHash } from "node:crypto";
import { qaScopedEvidenceSentences } from "./qa-prompt";
import type { QaGenerationInput } from "./qa-runtime-contract";

type SourceInput = Pick<QaGenerationInput, "question" | "context" | "evidence">;
export type QaSourceDecision = {
  status: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT" | "UNCERTAIN" | "TECHNICAL_FAILURE";
  reason: "RETRIEVAL_FAILED" | "ELIGIBILITY_INVALID" | "NO_CHUNKS" | "NO_SCOPED_EVIDENCE" |
    "UNASSESSED" | "INVALID_REVIEW" | "UNRELATED" | "NO_REQUIRED_EVIDENCE" |
    "CONFLICTING_OR_UNCERTAIN" | "PARTIAL_COVERAGE" | "COMPLETE_COVERAGE";
};

/** Internal server assessment, never a request field or a model outcome.
 * The reviewer must establish semantic relevance and enumerate ALL factual
 * aspects of the resolved question. This module checks binding and aggregates
 * that assessment; exact sentence membership alone is not semantic proof. */
export type QaSourceReview = {
  binding: string;
  exhaustive: boolean;
  relevance: readonly { citationId: string; status: "RELATED" | "UNRELATED" | "UNCERTAIN" }[];
  aspects: readonly {
    id: string;
    status: "SUPPORTED" | "MISSING" | "CONFLICTING" | "UNCERTAIN";
    supports: readonly { citationId: string; sentence: string }[];
  }[];
};

/** No history in the binding: old answers/citations can never supply evidence.
 * A resolved follow-up review still binds to this turn's question and sources. */
export function qaSourceReviewBinding(input: SourceInput): string {
  return createHash("sha256").update(JSON.stringify({
    question: input.question.normalize("NFC").trim(), context: input.context,
    evidence: input.evidence.map(item => ({ citationId: item.citationId,
      documentId: item.documentId, generationId: item.generationId,
      contentVersionId: item.contentVersionId, chunkId: item.chunkId,
      chunkHash: item.chunkHash, text: item.text })),
  })).digest("hex");
}

export type QaSourcePolicy = { minimumSimilarity?: number };
type Retrieval = { kind: "FAILED" } | { kind: "COMPLETED"; input: SourceInput; eligibility: "CURRENT" | "INVALID"; review?: QaSourceReview };

/** Pure decision engine. A calibrated similarity cutoff can only exclude
 * candidates; it can NEVER establish relevance or evidence coverage.
 * Without a server semantic review, nonempty candidates remain UNCERTAIN. */
export function evaluateQaSourceSufficiency(retrieval: Retrieval, policy: QaSourcePolicy = {}): QaSourceDecision {
  const minimum = policy.minimumSimilarity;
  if (minimum !== undefined && (!Number.isFinite(minimum) || minimum < -1 || minimum > 1)) {
    throw new Error("Invalid source sufficiency configuration");
  }
  const decision = (status: QaSourceDecision["status"], reason: QaSourceDecision["reason"]): QaSourceDecision => ({ status, reason });
  if (retrieval.kind === "FAILED") return decision("TECHNICAL_FAILURE", "RETRIEVAL_FAILED");
  if (retrieval.eligibility !== "CURRENT") return decision("UNCERTAIN", "ELIGIBILITY_INVALID");
  const { input, review } = retrieval;
  if (!input.evidence.length) return decision("INSUFFICIENT", "NO_CHUNKS");
  // Invalid registry data is not evidence of an unsuccessful search.
  const registry = new Map(input.evidence.map(item => [item.citationId, item]));
  if (registry.size !== input.evidence.length || input.evidence.some(item =>
    item.citation.id !== item.citationId || !Number.isFinite(item.score) || item.score < -1 || item.score > 1)) {
    return decision("UNCERTAIN", "INVALID_REVIEW");
  }
  const sentences = new Map(input.evidence.map(item => [item.citationId,
    minimum !== undefined && item.score < minimum ? [] : qaScopedEvidenceSentences(item.text, input)]));
  if (![...sentences.values()].some(value => value.length)) return decision("INSUFFICIENT", "NO_SCOPED_EVIDENCE");
  if (!review) return decision("UNCERTAIN", "UNASSESSED");
  if (review.binding !== qaSourceReviewBinding(input) || !review.exhaustive || !review.aspects.length ||
    review.aspects.length > 20 || new Set(review.aspects.map(item => item.id)).size !== review.aspects.length ||
    review.aspects.some(item => !item.id.trim() || !["SUPPORTED", "MISSING", "CONFLICTING", "UNCERTAIN"].includes(item.status)) || review.relevance.length !== registry.size ||
    new Set(review.relevance.map(item => item.citationId)).size !== registry.size ||
    review.relevance.some(item => !registry.has(item.citationId) || !["RELATED", "UNRELATED", "UNCERTAIN"].includes(item.status))) return decision("UNCERTAIN", "INVALID_REVIEW");
  const relevance = new Map(review.relevance.map(item => [item.citationId, item.status]));
  for (const aspect of review.aspects) {
    if ((aspect.status === "SUPPORTED") !== (aspect.supports.length > 0) &&
      aspect.status !== "CONFLICTING" && aspect.status !== "UNCERTAIN") return decision("UNCERTAIN", "INVALID_REVIEW");
    if (aspect.supports.some(ref => relevance.get(ref.citationId) !== "RELATED" ||
      !sentences.get(ref.citationId)?.includes(ref.sentence))) return decision("UNCERTAIN", "INVALID_REVIEW");
  }
  if (review.relevance.some(item => item.status === "UNCERTAIN") ||
    review.aspects.some(item => item.status === "CONFLICTING" || item.status === "UNCERTAIN")) {
    return decision("UNCERTAIN", "CONFLICTING_OR_UNCERTAIN");
  }
  if (review.relevance.every(item => item.status === "UNRELATED")) return decision("INSUFFICIENT", "UNRELATED");
  const supported = review.aspects.filter(item => item.status === "SUPPORTED").length;
  if (!supported) return decision("INSUFFICIENT", "NO_REQUIRED_EVIDENCE");
  if (supported < review.aspects.length) return decision("PARTIAL", "PARTIAL_COVERAGE");
  return decision("SUFFICIENT", "COMPLETE_COVERAGE");
}
