import { describe, expect, it, vi } from "vitest";
import { evaluateQaSourceSufficiency, qaSourceReviewBinding, type QaSourceReview } from "./qa-source-sufficiency";
import type { QaGenerationInput } from "./qa-runtime-contract";
import { qaRequestSchema } from "./qa-contract";
vi.mock("server-only", () => ({}));

// Fictional server-reviewed facets, NOT claims that this policy infers semantics.
const sentence = "Synthetic Alpha belongs to region Beta.";
function input(): QaGenerationInput {
  return { question: "Which region contains Synthetic Alpha?", context: { type: "GENERAL" }, history: [],
    evidence: [{ citationId: "c1", documentId: "doc_fixture", generationId: "gen_fixture",
      contentVersionId: "rev_fixture", chunkId: "chunk_fixture", chunkHash: "hash_fixture",
      text: sentence, tokenCount: 9, score: 0.8,
      citation: { id: "c1", sourceId: "public_fixture", title: "Fictional source", sourceUrl: null, locators: [] } }] };
}
function review(value: QaGenerationInput): QaSourceReview {
  return { binding: qaSourceReviewBinding(value), exhaustive: true,
    relevance: [{ citationId: "c1", status: "RELATED" }],
    aspects: [{ id: "region", status: "SUPPORTED", supports: [{ citationId: "c1", sentence }] }] };
}
const assess = (value: QaGenerationInput, assessment?: QaSourceReview) =>
  evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input: value, review: assessment });

describe("Task203 source sufficiency", () => {
  it("rejects client source decisions and review metadata at the existing strict request boundary", () => {
    expect(qaRequestSchema.safeParse({ question: "Q?", sourceSufficiency: { status: "SUFFICIENT" } }).success).toBe(false);
    expect(qaRequestSchema.safeParse({ question: "Q?", review: review(input()) }).success).toBe(false);
  });
  it("classifies completed retrieval without chunks", () => {
    const value = input(); value.evidence = [];
    expect(assess(value)).toEqual({ status: "INSUFFICIENT", reason: "NO_CHUNKS" });
  });
  it("classifies reviewed unrelated chunks even at perfect similarity", () => {
    const value = input(); value.evidence[0]!.score = 1;
    const assessment = review(value);
    assessment.relevance = [{ citationId: "c1", status: "UNRELATED" }];
    assessment.aspects = [{ id: "region", status: "MISSING", supports: [] }];
    expect(assess(value, assessment)).toEqual({ status: "INSUFFICIENT", reason: "UNRELATED" });
  });
  it("distinguishes topic relevance from required evidence", () => {
    const value = input(); value.question = "What are Synthetic Alpha's opening hours?";
    const assessment = review(value);
    assessment.aspects = [{ id: "hours", status: "MISSING", supports: [] }];
    expect(assess(value, assessment)).toEqual({ status: "INSUFFICIENT", reason: "NO_REQUIRED_EVIDENCE" });
  });
  it("requires coverage of each reviewed aspect, not a chunk count", () => {
    const value = input(); value.question += " And opening hours?";
    const assessment = review(value);
    assessment.aspects = [...assessment.aspects, { id: "hours", status: "MISSING", supports: [] }];
    expect(assess(value, assessment)).toEqual({ status: "PARTIAL", reason: "PARTIAL_COVERAGE" });
  });
  it("accepts complete reviewed coverage from one current chunk", () => {
    const value = input();
    expect(assess(value, review(value))).toEqual({ status: "SUFFICIENT", reason: "COMPLETE_COVERAGE" });
  });
  it("never uses an invalid eligibility snapshot", () => {
    const value = input();
    expect(evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "INVALID", input: value, review: review(value) }))
      .toEqual({ status: "UNCERTAIN", reason: "ELIGIBILITY_INVALID" });
  });
  it("excludes evidence outside the resolved Destination Context", () => {
    const value = input(); value.context = { type: "DESTINATION", destinationId: "destination_fixture", name: "Synthetic Gamma" };
    expect(assess(value, review(value))).toEqual({ status: "INSUFFICIENT", reason: "NO_SCOPED_EVIDENCE" });
  });
  it("cannot use history as evidence for a follow-up", () => {
    const value = input();
    value.history = [{ question: "Where is it?", response: { status: "ANSWERED", answerParts: [{ text: sentence }] } }] as never;
    value.question = "And its opening hours?"; value.evidence = [];
    expect(assess(value)).toEqual({ status: "INSUFFICIENT", reason: "NO_CHUNKS" });
  });
  it("isolates technical retrieval failure without source conclusions or details", () => {
    expect(evaluateQaSourceSufficiency({ kind: "FAILED" })).toEqual({ status: "TECHNICAL_FAILURE", reason: "RETRIEVAL_FAILED" });
  });
  it.each(["CONFLICTING", "UNCERTAIN"] as const)("does not certify %s evidence", status => {
    const value = input(); const assessment = review(value);
    assessment.aspects = [{ id: "region", status, supports: [] }];
    expect(assess(value, assessment)).toEqual({ status: "UNCERTAIN", reason: "CONFLICTING_OR_UNCERTAIN" });
  });
  it("does not invent semantic coverage from high scores or many chunks", () => {
    const value = input(); value.evidence[0]!.score = 1;
    expect(assess(value)).toEqual({ status: "UNCERTAIN", reason: "UNASSESSED" });
    value.evidence = Array.from({ length: 4 }, (_, index) => ({ ...value.evidence[0]!, citationId: `c${index + 1}`, citation: { ...value.evidence[0]!.citation, id: `c${index + 1}` } }));
    expect(assess(value).status).toBe("UNCERTAIN");
  });
  it.each(["question", "context", "generation", "revision", "hash", "text"])("invalidates a review when %s changes", field => {
    const value = input(); const assessment = review(value);
    if (field === "question") value.question = "Different question?";
    if (field === "context") value.context = { type: "DESTINATION", destinationId: "d", name: "Synthetic Alpha" };
    if (field === "generation") value.evidence[0]!.generationId = "new_generation";
    if (field === "revision") value.evidence[0]!.contentVersionId = "new_revision";
    if (field === "hash") value.evidence[0]!.chunkHash = "new_hash";
    if (field === "text") value.evidence[0]!.text += " Another statement.";
    expect(assess(value, assessment)).toEqual({ status: "UNCERTAIN", reason: "INVALID_REVIEW" });
  });
  it.each(["unexhaustive", "no-aspects", "duplicate-aspects", "fabricated-sentence", "historical-citation", "missing-relevance"])("fails closed for %s assessment", defect => {
    const value = input(); const assessment = review(value);
    if (defect === "unexhaustive") assessment.exhaustive = false;
    if (defect === "no-aspects") assessment.aspects = [];
    if (defect === "duplicate-aspects") assessment.aspects = [...assessment.aspects, ...assessment.aspects];
    if (defect === "fabricated-sentence") assessment.aspects = [{ id: "region", status: "SUPPORTED", supports: [{ citationId: "c1", sentence: "Invented assertion." }] }];
    if (defect === "historical-citation") assessment.aspects = [{ id: "region", status: "SUPPORTED", supports: [{ citationId: "old", sentence }] }];
    if (defect === "missing-relevance") assessment.relevance = [];
    expect(assess(value, assessment)).toEqual({ status: "UNCERTAIN", reason: "INVALID_REVIEW" });
  });
  it("allows an explicit exclusion threshold without turning similarity into proof", () => {
    const value = input();
    expect(evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input: value }, { minimumSimilarity: 0.9 }).status).toBe("INSUFFICIENT");
    expect(evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input: value }, { minimumSimilarity: 0.7 }).status).toBe("UNCERTAIN");
    expect(() => evaluateQaSourceSufficiency({ kind: "FAILED" }, { minimumSimilarity: NaN })).toThrow();
  });
  it("does not include internal material in a decision", () => {
    const value = input();
    expect(Object.keys(assess(value, review(value)))).toEqual(["status", "reason"]);
  });
});
