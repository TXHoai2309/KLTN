import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { qaReviewedExcerptAnswer } from "./qa-reviewed-excerpts";
import { fixtureReviewedInput } from "./__fixtures__/qa-reviewed-input";
import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { hasQaSynthesisCertificate } from "./qa-synthesis-verification";
import type { QaGenerationInput } from "./qa-runtime-contract";
const raw = (): QaGenerationInput => ({ question: "Thông tin ghi trong hồ sơ?", history: [], context: { type: "GENERAL" }, evidence: [{ citationId: "c1", documentId: "doc", generationId: "gen", contentVersionId: "version", chunkId: "chunk", chunkHash: "hash", text: "Điểm A không miễn phí theo hồ sơ. Điều kiện B được ghi riêng.", tokenCount: 20, score: .8, citation: { id: "c1", sourceId: "source", title: "Nguồn hư cấu", sourceUrl: null, locators: [] } }] });
describe("a distinct bounded exact-source answer after eligible synthesis rejection", () => {
  it("retains all reviewed support/qualifications and never claims a synthesis certificate", () => {
    const input = fixtureReviewedInput(raw());
    const answer = qaReviewedExcerptAnswer(input)!;
    expect(answer).toMatchObject({ status: "ANSWERED", answerMode: "SOURCE_EXCERPTS", answerParts: [{ text: "Điểm A không miễn phí theo hồ sơ.", citationIds: ["c1"] }, { text: "Điều kiện B được ghi riêng.", citationIds: ["c1"] }] });
    expect(() => assertQaAnswerGrounding(answer, input)).not.toThrow();
    expect(hasQaSynthesisCertificate(answer, input)).toBe(false);
  });
  it("keeps a genuine missing aspect PARTIAL with its fixed notice", () => {
    const input = fixtureReviewedInput(raw(), true);
    expect(qaReviewedExcerptAnswer(input)).toMatchObject({ status: "PARTIAL", answerMode: "SOURCE_EXCERPTS", unansweredAspects: [expect.any(String)] });
  });
  it.each(["Giá hôm nay?", "Thông tin hiện tại?", "Price today?"])("never substitutes a record quote for explicit current data: %s", question => {
    expect(qaReviewedExcerptAnswer(fixtureReviewedInput({ ...raw(), question }))).toBeNull();
  });
  it("rejects a stale review rather than reusing old source binding", () => {
    const input = fixtureReviewedInput(raw()); input.evidence = [{ ...input.evidence[0]!, chunkHash: "new_hash" }];
    expect(qaReviewedExcerptAnswer(input)).toBeNull();
  });
  it("preserves the current-time requirement inherited through a short subject reply", () => {
    const value = raw(); value.history = [{ question: "Giá vé hôm nay bao nhiêu?", response: { conversationId: "conv", turnId: "old", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "CLARIFICATION_REQUIRED", answerParts: [], citations: [], clarificationQuestion: "Điểm đến nào?" } }];
    expect(qaReviewedExcerptAnswer(fixtureReviewedInput(value))).toBeNull();
  });
  it("declines an oversized result instead of truncating reviewed qualifications", () => {
    const value = raw(); value.evidence = [{ ...value.evidence[0]!, text: Array.from({ length: 21 }, (_, i) => `Điều kiện kiểm thử số ${i}.`).join(" ") }];
    expect(qaReviewedExcerptAnswer(fixtureReviewedInput(value))).toBeNull();
  });
  it("cannot expose private identities even when a fixture reviewer calls them support", () => {
    const value = raw(); value.evidence = [{ ...value.evidence[0]!, documentId: "private_document_identity", text: "Mã riêng là private_document_identity." }];
    expect(qaReviewedExcerptAnswer(fixtureReviewedInput(value))).toBeNull();
  });
});
