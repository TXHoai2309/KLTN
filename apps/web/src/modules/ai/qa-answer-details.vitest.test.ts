import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { qaAnswerPresentation, qaMissingAspectNotices, QA_UNANSWERED_ASPECT } from "./qa-answer-details";
import { qaCompletedTurnSchema, QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";
import type { QaSourceReview } from "./qa-source-sufficiency";
import { createQaAssessor } from "./qa-assessment";
import { createFixtureQaGenerator as createQaGenerator } from "./__fixtures__/qa-generation-wire";
import { createQaGenerator as createRuntimeQaGenerator } from "./qa-generation";
import { QA_SYNTHESIS_GATES } from "./qa-synthesis-verification";
import { fixtureReviewedInput } from "./__fixtures__/qa-reviewed-input";
import type { QaGenerationInput } from "./qa-runtime-contract";
import { composeQaPrompt, qaScopedEvidenceSentences, qaUsableEvidence } from "./qa-prompt";

describe("bounded public answer details", () => {
  it("projects only fixed missing notices, not raw aspect IDs or source text", () => {
    const review = { aspects: [{ id: "private_internal_aspect", kind: "CURRENT_VALIDITY", status: "MISSING", supports: [] }, { id: "other", kind: "CURRENT_VALIDITY", status: "MISSING", supports: [] }, { id: "supported", kind: "ADMISSION", status: "SUPPORTED", supports: [] }] } as unknown as QaSourceReview;
    expect(qaMissingAspectNotices(review)).toEqual(["Chưa xác minh được thông tin trong hồ sơ còn áp dụng tại thời điểm bạn hỏi."]);
    expect(qaMissingAspectNotices({ ...review, aspects: [{ id: "legacy", status: "MISSING", supports: [] }] })).toEqual([QA_UNANSWERED_ASPECT]);
  });
  it.each([["So sánh hai điểm", 2, "TABLE"], ["Những đặc điểm nổi bật?", 3, "LIST"], ["Giới thiệu", 3, "PARAGRAPHS"], ["So sánh", 1, "PARAGRAPHS"]] as const)("chooses a server-owned presentation for %s", (question, count, expected) => {
    expect(qaAnswerPresentation(question, count)).toBe(expected);
  });
  it("keeps old completed history valid and rejects arbitrary presentation/reason fields", () => {
    const old = { conversationId: "conv", turnId: "turn", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "INSUFFICIENT_SOURCE", message: QA_INSUFFICIENT_SOURCE_MESSAGE, answerParts: [], citations: [] };
    expect(qaCompletedTurnSchema.safeParse(old).success).toBe(true);
    expect(qaCompletedTurnSchema.safeParse({ ...old, reason: "ANSWER_VERIFICATION" }).success).toBe(true);
    expect(qaCompletedTurnSchema.safeParse({ ...old, reason: "private debug" }).success).toBe(false);
    expect(qaCompletedTurnSchema.safeParse({ ...old, presentation: "TABLE" }).success).toBe(false);
  });
  const input: QaGenerationInput = { question: "Thông tin?", context: { type: "GENERAL" }, history: [], evidence: [{ citationId: "c1", documentId: "d", generationId: "g", contentVersionId: "v", chunkId: "c", chunkHash: "h", text: "Điểm A có thuộc tính B.", tokenCount: 10, score: .9, citation: { id: "c1", sourceId: "source", title: "Nguồn hư cấu", sourceUrl: null, locators: [] } }] };
  it("resolves the provider's opaque evidence handle server-side", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }], aspects: [{ id: "fact", kind: "OTHER", status: "SUPPORTED", supportIds: ["e1"] }] }) } }] }));
    const assessed = await createQaAssessor({ apiKey: () => "fixture-only", fetcher }).assess(input);
    expect(assessed.review.aspects[0]!.supports).toEqual([{ citationId: "c1", sentence: input.evidence[0]!.text }]);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.response_format.json_schema.schema.properties.aspects.items.properties.supportIds.items.enum).toEqual(["e1"]);
    expect(body.messages[1].content).not.toContain('"documentId"');
  });
  it.each(["e9999", "e0", "invented", "duplicate"])("rejects an invalid or duplicate assessment handle %s", async id => {
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }], aspects: [{ id: "fact", kind: "OTHER", status: "SUPPORTED", supportIds: id === "duplicate" ? ["e1", "e1"] : [id] }] }) } }] });
    await expect(createQaAssessor({ apiKey: () => "fixture-only", fetcher }).assess(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("returns specific PARTIAL notices without a model-written missing claim", async () => {
    const reviewed = fixtureReviewedInput(input, true);
    reviewed.sourceReview = { ...reviewed.sourceReview!, aspects: reviewed.sourceReview!.aspects.map(aspect => aspect.status === "MISSING" ? { ...aspect, kind: "CURRENT_VALIDITY" } : aspect) };
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "PARTIAL", unanswered: true, answerParts: [{ text: input.evidence[0]!.text, citationIds: ["c1"] }] }) } }] });
    const answer = await createQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(reviewed);
    expect(answer).toMatchObject({ status: "PARTIAL", unansweredAspects: ["Chưa xác minh được thông tin trong hồ sơ còn áp dụng tại thời điểm bạn hỏi."] });
  });
  it("excludes complete unsafe reference sentences while retaining a complete qualified fact", async () => {
    const text = "Điểm A không miễn phí theo hồ sơ.\n\nNguồn: https://example.org/reference.";
    const source = { ...input, evidence: [{ ...input.evidence[0]!, text }] };
    expect(qaScopedEvidenceSentences(text, source)).toEqual(["Điểm A không miễn phí theo hồ sơ."]);
    const reviewed = fixtureReviewedInput(source);
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "ANSWERED", unanswered: false, answerParts: [{ text: "Điểm A không miễn phí theo hồ sơ.", citationIds: ["c1"] }] }) } }] }));
    expect((await createQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(reviewed)).status).toBe("ANSWERED");
    expect(JSON.stringify(composeQaPrompt(reviewed))).not.toContain("https://");
    expect(JSON.stringify(composeQaPrompt(reviewed))).toContain("không miễn phí theo hồ sơ");
  });
  it("keeps a qualification that carries a public URL, removing only the URL", () => {
    const text = "Điểm A có giá ghi trong hồ sơ.\n\nGiá không còn áp dụng; xem https://example.org/notice.";
    const source = { ...input, evidence: [{ ...input.evidence[0]!, text }] };
    // The qualification must never be dropped while the positive fact stays.
    expect(qaScopedEvidenceSentences(text, source)).toEqual(["Điểm A có giá ghi trong hồ sơ.", "Giá không còn áp dụng; xem."]);
    expect(JSON.stringify(composeQaPrompt(fixtureReviewedInput(source)))).not.toContain("https://");
  });
  it("drops source-reference lines (S02: URL | S03: URL) but keeps the factual sentences", () => {
    const text = "Hạ Thành là làng du lịch cộng đồng của người Tày.\n\nNguồn: S02: https://baotuyenquang.com.vn/a-1/ | S03: https://nongthon.vietnamtourism.gov.vn/b-2/\n\nhttps://baotuyenquang.com.vn/c-3/\n\nNguồn tham khảo [S04] https://example.org/x.";
    const source = { ...input, evidence: [{ ...input.evidence[0]!, text }] };
    expect(qaScopedEvidenceSentences(text, source)).toEqual(["Hạ Thành là làng du lịch cộng đồng của người Tày."]);
  });
  it("still treats storage links, signed URLs, paths and secrets as private for the whole chunk", () => {
    for (const unsafe of ["Tài liệu: https://bucket.blob.vercel-storage.com/file.pdf", "Xem https://x.org/f?sig=abc", "Tệp rag/admin-1/private.pdf", "Khóa sk-abcdefghijklmnop"]) {
      const text = `Hạ Thành có nhà sàn.\n\n${unsafe}`;
      const source = { ...input, evidence: [{ ...input.evidence[0]!, text }] };
      expect(qaScopedEvidenceSentences(text, source)).toEqual([]);
    }
  });
  it("qaUsableEvidence drops only unusable chunks instead of failing the question", () => {
    const good = { ...input.evidence[0]!, citationId: "c1", text: "Hạ Thành có nhà sàn.\n\nNguồn: S02: https://example.org/a" };
    const onlyUrl = { ...input.evidence[0]!, citationId: "c2", text: "https://example.org/only" };
    const secret = { ...input.evidence[0]!, citationId: "c3", text: "Hạ Thành. Khóa sk-abcdefghijklmnop" };
    expect(qaUsableEvidence([good, onlyUrl, secret], input.context).map(item => item.citationId)).toEqual(["c1"]);
  });
  it("derives public citations from current selected support handles, without exposing handles", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "ANSWERED", unanswered: false, facets: { fixture_aspect: [{ text: input.evidence[0]!.text, supportIds: ["s1"] }] } }) } }] }));
    const answer = await createRuntimeQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(fixtureReviewedInput(input));
    expect(answer).toMatchObject({ status: "ANSWERED", answerParts: [{ text: input.evidence[0]!.text, citationIds: ["c1"] }] });
    expect(JSON.stringify(answer)).not.toContain("supportIds");
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.response_format.json_schema.schema.properties.facets.properties.fixture_aspect.items.properties.supportIds.items.enum).toEqual(["s1"]);
  });
  it.each(["unknown", "duplicate", "legacy-citation"])("rejects a %s runtime generation reference before accepting facts", async mode => {
    const part = mode === "legacy-citation" ? { text: input.evidence[0]!.text, citationIds: ["c1"] } : { text: input.evidence[0]!.text, supportIds: mode === "duplicate" ? ["s1", "s1"] : ["s999"] };
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "ANSWERED", unanswered: false, facets: { fixture_aspect: [part] } }) } }] });
    await expect(createRuntimeQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(fixtureReviewedInput(input))).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("cannot replace the selected support with another valid handle even if the reviewer accepts it", async () => {
    const reviewed = fixtureReviewedInput({ ...input, evidence: [{ ...input.evidence[0]!, text: "Điểm A có thuộc tính B. Điểm A có thuộc tính C." }] });
    const text = "Theo nguồn, thuộc tính được ghi là B.";
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const output = body.response_format.json_schema.name === "grounded_qa"
        ? { status: "ANSWERED", unanswered: false, facets: { fixture_aspect: [{ text, supportIds: ["s1"] }] } }
        : { summary: "Fixture only.", gates: QA_SYNTHESIS_GATES.map(name => ({ name, passed: true })), coveredAspects: ["fixture_aspect"], claims: [{ partIndex: 0, text, entailed: true, supportIds: ["s2"] }] };
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] });
    };
    await expect(createRuntimeQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(reviewed)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  function facetInput() {
    const reviewed = fixtureReviewedInput({ ...input, evidence: [input.evidence[0]!, { ...input.evidence[0]!, citationId: "c2", chunkId: "second", text: "Điểm A có thuộc tính C.", citation: { ...input.evidence[0]!.citation, id: "c2" } }] });
    reviewed.sourceReview = { ...reviewed.sourceReview!, aspects: reviewed.evidence.map((item, index) => ({ id: `facet_${index}`, status: "SUPPORTED" as const, supports: [{ citationId: item.citationId, sentence: item.text }] })) };
    return reviewed;
  }
  it("binds every generated facet to its own support and preserves the reviewed order", async () => {
    const reviewed = facetInput();
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "ANSWERED", unanswered: false, facets: {
      facet_1: [{ text: reviewed.evidence[1]!.text, supportIds: ["s2"] }], facet_0: [{ text: reviewed.evidence[0]!.text, supportIds: ["s1"] }],
    } }) } }] });
    const answer = await createRuntimeQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(reviewed);
    expect(answer.answerParts.map(part => part.citationIds)).toEqual([["c1"], ["c2"]]);
    expect(JSON.stringify(answer)).not.toMatch(/facet_0|supportIds/);
  });
  it.each(["missing", "extra", "empty", "cross-facet", "oversized"])("rejects %s facet output rather than silently losing supported coverage", async mode => {
    const reviewed = facetInput();
    const facets: Record<string, { text: string; supportIds: string[] }[]> = { facet_0: [{ text: reviewed.evidence[0]!.text, supportIds: ["s1"] }], facet_1: [{ text: reviewed.evidence[1]!.text, supportIds: ["s2"] }] };
    if (mode === "missing") delete facets.facet_1;
    if (mode === "extra") facets.extra = [];
    if (mode === "empty") facets.facet_1 = [];
    if (mode === "cross-facet") facets.facet_0![0]!.supportIds = ["s2"];
    if (mode === "oversized") facets.facet_0 = Array(20).fill(facets.facet_0![0]);
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "ANSWERED", unanswered: false, facets }) } }] });
    await expect(createRuntimeQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(reviewed)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
});
