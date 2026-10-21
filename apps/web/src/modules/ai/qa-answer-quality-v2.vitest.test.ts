import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { validateQaGenerationOutput } from "./qa-generation";
import { createFixtureQaGenerator as createQaGenerator } from "./__fixtures__/qa-generation-wire";
import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { QA_SYNTHESIS_GATES, hasQaSynthesisCertificate } from "./qa-synthesis-verification";
import { qaSourceReviewBinding } from "./qa-source-sufficiency";
import { createQaAssessor, validateQaAssessment } from "./qa-assessment";
import { createQaService } from "./qa-service";
import type { QaGenerationInput, QaEvidence } from "./qa-runtime-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import { composeQaPrompt } from "./qa-prompt";
import { fixtureAssessmentWire } from "./__fixtures__/qa-assessment-wire";

// Owner-supplied facts transcribed as offline regression data. These are NOT
// current publication snapshots, live corpus acceptance or current price proof.
const region = "Cao nguyên đá Đồng Văn";
const facts = {
  unesco: `Danh hiệu: ${region} là Công viên địa chất toàn cầu UNESCO (UNESCO Global Geopark).`,
  heritage: `Tính chất di sản và xếp hạng: Danh hiệu của ${region} là UNESCO Global Geopark, khác với World Heritage và không phải danh hiệu Di sản thế giới UNESCO.`,
  geology: `${region} có địa hình karst đá vôi.`,
  fossils: `${region} có hóa thạch và dấu tích lịch sử địa chất.`,
  common: `Không gian chung ${region}: không thu vé vào cửa chung.`,
  flag: `Cột cờ Lũng Cú | 40.000 đồng/người/lượt theo hồ sơ.`,
  palace: `Khu nhà Vương | 30.000 đồng/người/lượt theo hồ sơ.`,
  boat: `Thuyền lòng hồ Nho Quế | 80.000 đồng khi ghép đoàn; 150.000 đồng khi thuê riêng theo hồ sơ.`,
  location: `Cột cờ Lũng Cú nằm trong không gian ${region}.`,
};
function evidence(text: string, index: number): QaEvidence {
  const id = `c${index + 1}`;
  return { citationId: id, documentId: "fixture_document", generationId: "fixture_generation", contentVersionId: "fixture_version", chunkId: `chunk_${index}`, chunkHash: `hash_${index}`, text, tokenCount: 60, score: .8,
    citation: { id, sourceId: "source_fixture", title: "Hồ sơ kiểm thử", sourceUrl: null, locators: [{ section: "Bảng phí tham quan" }] } };
}
function reviewed(question: string, rows: string[], missing = false): QaGenerationInput {
  const input: QaGenerationInput = { question, history: [], context: { type: "GENERAL" }, evidence: rows.map(evidence) };
  input.sourceReview = { binding: qaSourceReviewBinding(input), exhaustive: true, relevance: input.evidence.map(row => ({ citationId: row.citationId, status: "RELATED" })),
    aspects: [{ id: "requested_facts", status: "SUPPORTED", supports: input.evidence.map(row => ({ citationId: row.citationId, sentence: row.text })) }, ...(missing ? [{ id: "current_validity", status: "MISSING" as const, supports: [] }] : [])] };
  return input;
}
const envelope = (content: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] });
function setup(input: QaGenerationInput, text: string, configure?: (verdict: ReturnType<typeof verdictFor>) => void) {
  const verdict = verdictFor(input, text); configure?.(verdict);
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const name = JSON.parse(String(init?.body)).response_format.json_schema.name;
    return envelope(name === "qa_claim_verification" ? verdict : { status: input.sourceReview!.aspects.some(aspect => aspect.status === "MISSING") ? "PARTIAL" : "ANSWERED", unanswered: input.sourceReview!.aspects.some(aspect => aspect.status === "MISSING"), answerParts: [{ text, citationIds: input.evidence.map(row => row.citationId) }] });
  });
  return { fetcher, generator: createQaGenerator({ apiKey: () => "offline-fixture", fetcher }) };
}
function verdictFor(input: QaGenerationInput, text: string) {
  return { summary: "Offline fixture verdict; not independent evidence.", gates: QA_SYNTHESIS_GATES.map(name => ({ name, passed: true })), coveredAspects: ["requested_facts"],
    claims: [{ partIndex: 0, text, entailed: true, supportIds: input.sourceReview!.aspects[0]!.supports.map((_, index) => `s${index + 1}`) }] };
}

describe("US23 grounded synthesis V2 (mock semantic verdicts, no paid calls)", () => {
  const cases = [
    ["R01", `${region} được UNESCO công nhận là gì?`, [facts.unesco], `${region} được công nhận là Công viên địa chất toàn cầu UNESCO (UNESCO Global Geopark).`],
    ["R02", `${region} có những đặc điểm địa chất nào nổi bật?`, [facts.geology, facts.fossils], `${region} nổi bật với địa hình karst đá vôi, cùng hóa thạch và dấu tích lịch sử địa chất.`],
    ["R04", `${region} có phải là Di sản thế giới UNESCO không?`, [facts.heritage], `Không. ${region} mang danh hiệu UNESCO Global Geopark; danh hiệu này khác World Heritage (Di sản thế giới UNESCO).`],
    ["R06", `Cột cờ Lũng Cú có nằm trong ${region} không?`, [facts.location], `Có, Cột cờ Lũng Cú nằm trong không gian ${region}.`],
    ["R07", `Giá vé Cột cờ Lũng Cú được ghi trong hồ sơ ${region} là bao nhiêu?`, [facts.flag], "Theo hồ sơ, giá vé Cột cờ Lũng Cú là 40.000 đồng/người/lượt."],
    ["R08", `Nếu đi ${region} thì tất cả các nơi đều miễn phí đúng không?`, [facts.common, facts.flag], `Không. ${region} không thu vé vào cửa chung, nhưng Cột cờ Lũng Cú thu riêng 40.000 đồng/người/lượt theo hồ sơ.`],
  ] as const;
  it.each(cases)("%s accepts coherent non-extractive claims with authentic citations", async (_id, question, rows, text) => {
    const input = reviewed(question, [...rows]); const t = setup(input, text);
    const answer = await t.generator.generate(input);
    expect(answer).toMatchObject({ status: "ANSWERED", answerParts: [{ text, citationIds: input.evidence.map(row => row.citationId) }] });
    expect(answer.citations).toEqual(input.evidence.map(row => row.citation));
    expect(() => assertQaAnswerGrounding(answer, input)).not.toThrow();
    expect(t.fetcher).toHaveBeenCalledTimes(2); // answer + verifier, assessment is fixture-annotated
    for (const call of t.fetcher.mock.calls) {
      expect(JSON.parse(String(call[1]?.body))).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "medium" });
    }
    expect(JSON.stringify(answer)).not.toMatch(/binding|chunkHash|fixture_document/);
  });
  it("R05 uses table rows together, retains conditions and never claims today's prices", async () => {
    const input = reviewed(`Giá vé tham quan toàn bộ ${region} hôm nay chính xác là bao nhiêu?`, [facts.common, facts.flag, facts.palace, facts.boat], true);
    const text = `${region} không thu vé vào cửa chung. Theo hồ sơ, Cột cờ Lũng Cú thu 40.000 đồng/người/lượt, Khu nhà Vương thu 30.000 đồng/người/lượt; thuyền lòng hồ Nho Quế là 80.000 đồng khi ghép đoàn hoặc 150.000 đồng khi thuê riêng. Đây là giá ghi trong hồ sơ, chưa xác minh là giá áp dụng hôm nay.`;
    const answer = await setup(input, text).generator.generate(input);
    expect(answer.status).toBe("PARTIAL"); expect(answer.answerParts[0]!.text).toBe(text);
    expect(answer.citations).toHaveLength(4);
    if (answer.status === "PARTIAL") expect(answer.unansweredAspects).toHaveLength(1);
  });
  it.each(QA_SYNTHESIS_GATES)("never publishes the rejected synthesis after a negative %s verdict", async name => {
    const input = reviewed("Thông tin về điểm đến?", [facts.flag]);
    const t = setup(input, "Giá vé toàn cao nguyên hôm nay là 40.000 đồng.", verdict => { verdict.gates.find(gate => gate.name === name)!.passed = false; });
    const result = await t.generator.generate(input);
    if (["CLAIM_GROUNDING", "CITATION_VALIDITY", "NATURAL_LANGUAGE_QUALITY"].includes(name)) {
      expect(result).toMatchObject({ status: "ANSWERED", answerMode: "SOURCE_EXCERPTS", answerParts: [{ text: facts.flag, citationIds: ["c1"] }] });
      expect(hasQaSynthesisCertificate(result, input)).toBe(false);
      expect(() => assertQaAnswerGrounding(result, input)).not.toThrow();
    } else expect(result).toMatchObject({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [] });
  });
  it.each([
    ["wrong regional scope", "Vé chung toàn cao nguyên là 40.000 đồng.", "ENTITY_SCOPE"],
    ["expired data", "Giá chính xác hôm nay là 40.000 đồng/người/lượt.", "TEMPORAL_VALIDITY"],
    ["unknown validity", "Giá hiện hành là 40.000 đồng/người/lượt.", "TEMPORAL_VALIDITY"],
    ["all free misconception", "Tất cả điểm và dịch vụ đều miễn phí.", "CLAIM_GROUNDING"],
    ["invented package", "Giá trọn gói toàn khu vực là 70.000 đồng.", "NUMERIC_FIDELITY"],
  ] as const)("rejects %s with a valid semantic negative", async (_label, text, gate) => {
    const input = reviewed("Giá vé toàn cao nguyên hôm nay?", [facts.flag, facts.palace]);
    const t = setup(input, text, verdict => { verdict.gates.find(row => row.name === gate)!.passed = false; });
    expect((await t.generator.generate(input)).status).toBe("INSUFFICIENT_SOURCE");
  });
  it("independently rejects invented numeric values even if semantic reviewer incorrectly accepts", async () => {
    const input = reviewed("Giá trong hồ sơ?", [facts.flag]);
    expect((await setup(input, "Theo hồ sơ, Cột cờ Lũng Cú thu 90.000 đồng/người/lượt.").generator.generate(input)).status).toBe("INSUFFICIENT_SOURCE");
  });
  it("accepts an unsupported-claim verdict with no fabricated reference as insufficiency", async () => {
    const input = reviewed("Giá trong hồ sơ?", [facts.flag]);
    const t = setup(input, "Có vé trọn gói miễn phí.", verdict => { verdict.claims[0]!.entailed = false; verdict.claims[0]!.supportIds = []; });
    expect((await t.generator.generate(input)).status).toBe("INSUFFICIENT_SOURCE");
  });
  it("allows equivalent price separators without requiring lexical overlap", async () => {
    const input = reviewed("Giá trong hồ sơ?", [facts.flag]);
    expect((await setup(input, "Theo hồ sơ, Cột cờ Lũng Cú thu 40,000 đồng/người/lượt.").generator.generate(input)).status).toBe("ANSWERED");
  });
  it("binds verifier coverage labels to the actual reviewed aspect IDs in the provider schema", async () => {
    const input = reviewed("tôi muốn tìm hiểu về cao nguyên đá đồng văn", [facts.unesco, facts.geology]);
    input.sourceReview = { ...input.sourceReview!, aspects: [{ ...input.sourceReview!.aspects[0]!, id: "destination_overview" }] };
    const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO với địa hình karst đá vôi.", verdict => {
      verdict.coveredAspects = ["destination_overview"];
    });
    expect((await t.generator.generate(input)).status).toBe("ANSWERED");
    const body = JSON.parse(String(t.fetcher.mock.calls[1]![1]!.body));
    expect(body.response_format.json_schema.schema.properties.coveredAspects.items.enum).toEqual(["destination_overview"]);
    expect(JSON.parse(body.messages[1].content).REQUIRED_ASPECT_IDS).toEqual(["destination_overview"]);
    expect(body.response_format.json_schema.schema.properties.claims.required).toEqual(["p0"]);
    expect(body.response_format.json_schema.schema.properties.claims.properties.p0.required).toEqual(["entailed", "citationsValid"]);
    expect(JSON.parse(body.messages[1].content).SUPPORT_REGISTRY).toEqual([
      { id: "s1", citationId: "c1", sentence: facts.unesco, sourceTitle: "Hồ sơ kiểm thử" },
      { id: "s2", citationId: "c2", sentence: facts.geology, sourceTitle: "Hồ sơ kiểm thử" },
    ]);
  });
  it("does not expose unreviewed candidate sentences as generation support", () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    input.evidence = [{ ...input.evidence[0]!, text: `${facts.unesco}\n${facts.geology}` }, evidence(facts.flag, 1)];
    const payload = JSON.parse(composeQaPrompt(input)[1]!.content);
    expect(payload.CURRENT_EVIDENCE).toEqual([{ citationId: "c1", sourceTitle: "Hồ sơ kiểm thử", sentences: [facts.unesco] }]);
    expect(JSON.stringify(payload)).not.toContain(facts.geology);
    expect(JSON.stringify(payload)).not.toContain(facts.flag);
  });
  it.each(["uncovered text", "invented evidence", "invented citation", "missing facet", "renamed facet", "extra facet", "duplicate gate", "extra citation"])("fails closed on %s", async mode => {
    const input = reviewed("Danh hiệu và địa chất?", [facts.unesco, facts.geology]);
    const t = setup(input, "Công viên địa chất toàn cầu UNESCO có địa hình karst đá vôi.", verdict => {
      if (mode === "uncovered text") verdict.claims[0]!.text = "Chỉ kiểm chứng một phần.";
      if (mode === "invented evidence") verdict.claims[0]!.supportIds[0] = "s999";
      if (mode === "invented citation") verdict.claims[0]!.supportIds[0] = "s998";
      if (mode === "missing facet") verdict.coveredAspects = [];
      if (mode === "renamed facet") verdict.coveredAspects = ["geology_instead_of_exact_id"];
      if (mode === "extra facet") verdict.coveredAspects.push("unreviewed_topic");
      if (mode === "duplicate gate") verdict.gates[1]!.name = verdict.gates[0]!.name;
      if (mode === "extra citation") verdict.claims[0]!.supportIds.pop();
    });
    if (mode === "duplicate gate") await expect(t.generator.generate(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    else expect((await t.generator.generate(input)).status).toBe("INSUFFICIENT_SOURCE");
  });
  it("requires every supported facet in multipart questions", async () => {
    const input = reviewed("Danh hiệu và đặc điểm địa chất?", [facts.unesco, facts.geology]);
    input.sourceReview = { ...input.sourceReview!, aspects: input.evidence.map((row, index) => ({ id: `facet_${index}`, status: "SUPPORTED", supports: [{ citationId: row.citationId, sentence: row.text }] })) };
    const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.", verdict => { verdict.coveredAspects = ["facet_0"]; verdict.gates.find(gate => gate.name === "REQUIRED_FACETS_COVERAGE")!.passed = false; });
    expect((await t.generator.generate(input)).status).toBe("INSUFFICIENT_SOURCE");
  });
  it.each(["duplicate handles", "wrong part index", "legacy prose reference"])("rejects an invalid support-handle verdict: %s", async mode => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.", verdict => {
      if (mode === "duplicate handles") verdict.claims[0]!.supportIds = ["s1", "s1"];
      if (mode === "wrong part index") verdict.claims[0]!.partIndex = 19;
      if (mode === "legacy prose reference") Object.assign(verdict.claims[0]!, { supports: [{ citationId: "c1", sentence: "Invented sentence" }] });
    });
    if (mode === "legacy prose reference") await expect(t.generator.generate(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    else expect((await t.generator.generate(input)).status).toBe("INSUFFICIENT_SOURCE");
  });
  it("cannot attach a genuine support handle from a citation absent from the answer part", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco, facts.geology]);
    const verdict = verdictFor(input, "Đây là Công viên địa chất toàn cầu UNESCO.");
    verdict.claims[0]!.supportIds = ["s2"];
    const fetcher: typeof fetch = async (_url, init) => envelope(JSON.parse(String(init?.body)).response_format.json_schema.name === "qa_claim_verification"
      ? verdict : { status: "ANSWERED", unanswered: false, answerParts: [{ text: verdict.claims[0]!.text, citationIds: ["c1"] }] });
    expect((await createQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(input)).status).toBe("INSUFFICIENT_SOURCE");
  });
  it("constrains each verifier part to handles from its own citations", async () => {
    const input = reviewed("Danh hiệu và địa chất?", [facts.unesco, facts.geology]);
    const parts = [{ text: "Đây là Công viên địa chất toàn cầu UNESCO.", citationIds: ["c1"] }, { text: "Địa hình là karst đá vôi.", citationIds: ["c2"] }];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => envelope(JSON.parse(String(init?.body)).response_format.json_schema.name === "qa_claim_verification"
      ? { summary: "Offline fixture verdict.", gates: QA_SYNTHESIS_GATES.map(name => ({ name, passed: true })), coveredAspects: ["requested_facts"], claims: parts.map((part, partIndex) => ({ partIndex, text: part.text, entailed: true, supportIds: [`s${partIndex + 1}`] })) }
      : { status: "ANSWERED", unanswered: false, answerParts: parts }));
    expect((await createQaGenerator({ apiKey: () => "fixture-only", fetcher }).generate(input)).status).toBe("ANSWERED");
    const body = JSON.parse(String(fetcher.mock.calls[1]![1]!.body));
    expect(body.response_format.json_schema.schema.properties.claims.required).toEqual(["p0", "p1"]);
    expect(body.response_format.json_schema.schema.properties.claims.properties.p0.additionalProperties).toBe(false);
    expect(JSON.parse(body.messages[1].content).answerParts.map((part: { allowedSupportIds: string[] }) => part.allowedSupportIds)).toEqual([["s1"], ["s2"]]);
  });
  it("deduplicates source sentences without forcing repeated answer fragments", async () => {
    const input = reviewed("Danh hiệu UNESCO?", [facts.unesco, facts.unesco]);
    const answer = await setup(input, "Đây là Công viên địa chất toàn cầu UNESCO (UNESCO Global Geopark).").generator.generate(input);
    expect(answer.status).toBe("ANSWERED"); expect(answer.answerParts).toHaveLength(1);
  });
  it("binds certificates to answer, review, question and current evidence", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]); const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.");
    const answer = await t.generator.generate(input);
    expect(() => assertQaAnswerGrounding(answer, { ...input, question: "Giá vé?" })).toThrow();
    expect(() => assertQaAnswerGrounding({ ...answer }, input)).toThrow();
    if (answer.status === "ANSWERED") {
      const presentation = answer.presentation;
      answer.presentation = "TABLE";
      expect(() => assertQaAnswerGrounding(answer, input)).toThrow();
      answer.presentation = presentation;
    }
    answer.answerParts[0]!.text = "Giá vé là 900.000 đồng.";
    expect(() => assertQaAnswerGrounding(answer, input)).toThrow();
  });
  it("keeps private reviewer justification out of the answer and never lets it override a negative gate", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    const positive = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.", verdict => { verdict.summary = "private-review-only"; });
    const answer = await positive.generator.generate(input);
    expect(answer.status).toBe("ANSWERED");
    expect(JSON.stringify(answer)).not.toContain("private-review-only");
    const negative = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.", verdict => {
      verdict.summary = "Everything is supported.";
      verdict.gates.find(gate => gate.name === "CLAIM_GROUNDING")!.passed = false;
    });
    const quoted = await negative.generator.generate(input);
    expect(quoted).toMatchObject({ status: "ANSWERED", answerMode: "SOURCE_EXCERPTS", answerParts: [{ text: facts.unesco }] });
    expect(hasQaSynthesisCertificate(quoted, input)).toBe(false);
    expect(JSON.stringify(quoted)).not.toContain("Everything is supported");
  });
  it("has no synchronous bypass for paraphrases or fabricated citations", () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    expect(() => validateQaGenerationOutput({ status: "ANSWERED", unanswered: false, answerParts: [{ text: "Đây là Công viên địa chất toàn cầu UNESCO.", citationIds: ["c1"] }] }, input)).toThrow();
  });
  it("skips verification for simple exact reviewed answers", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]); const t = setup(input, facts.unesco);
    expect((await t.generator.generate(input)).status).toBe("ANSWERED");
    expect(t.fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains the existing public-safety rejection of URL-bearing DOCX prose", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco + " Nguồn tham khảo https://example.org."]);
    const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.");
    await expect(t.generator.generate(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(t.fetcher).not.toHaveBeenCalled();
  });
  it("preserves malformed verifier output and provider failure as technical errors", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    for (const mode of ["schema", "unavailable", "timeout"] as const) {
      const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
        if (JSON.parse(String(init?.body)).response_format.json_schema.name === "qa_claim_verification") {
          if (mode === "unavailable") return new Response("fixture", { status: 503 });
          if (mode === "timeout") return new Promise<Response>(() => {});
          return envelope({ invalid: true });
        }
        return envelope({ status: "ANSWERED", unanswered: false, answerParts: [{ text: "Đây là Công viên địa chất toàn cầu UNESCO.", citationIds: ["c1"] }] });
      });
      await expect(createQaGenerator({ apiKey: () => "offline", fetcher, timeoutMs: 30 }).generate(input)).rejects.toMatchObject({ code: mode === "schema" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });
  it("uses follow-up questions for intent only, with no old answers in either prompt", async () => {
    const input = reviewed("Còn giá ghi trong hồ sơ của điểm đó?", [facts.flag]);
    input.history = [{ question: "Cột cờ Lũng Cú nằm ở đâu?", response: { conversationId: "conv", turnId: "turn", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này." } }];
    const t = setup(input, "Theo hồ sơ, Cột cờ Lũng Cú thu 40.000 đồng/người/lượt.");
    expect((await t.generator.generate(input)).status).toBe("ANSWERED");
    for (const call of t.fetcher.mock.calls) {
      const body = JSON.parse(String(call[1]?.body));
      const payload = JSON.parse(body.messages[1].content);
      expect(payload.HISTORY_QUESTIONS).toEqual([input.history[0]!.question]);
      expect(JSON.stringify(payload)).not.toContain("Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này.");
    }
  });
  it("assessment prompt makes current intent, table coverage and corpus uncertainty explicit", async () => {
    const input = reviewed("Giá hôm nay?", [facts.flag]);
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => envelope(fixtureAssessmentWire({ intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }], aspects: [{ id: "current_price", status: "MISSING", supports: [] }] }, JSON.parse(String(init?.body)))));
    await createQaAssessor({ apiKey: () => "offline", fetcher }).assess(input);
    const body = String(fetcher.mock.calls[0]![1]!.body);
    expect(JSON.parse(body)).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "medium" });
    expect(body).toContain("requested entity"); expect(body).toContain("registry handles"); expect(body).toContain("entire corpus");
    expect(body).toContain("CLEAR overview intent");
    expect(body).toContain("explicit narrow question");
  });
  it("R05 without common-ticket retrieval coverage never infers a regional price", () => {
    const input = reviewed("Giá toàn cao nguyên hôm nay?", [facts.flag]);
    const assessment = validateQaAssessment({ intent: "CLEAR", exhaustive: true, relevance: [{ citationId: "c1", status: "RELATED" }], aspects: [{ id: "regional_current_price", status: "MISSING", supports: [] }] }, input);
    expect(assessment.review.aspects[0]!.status).toBe("MISSING");
  });
  it("lets verification see an overview row omitted by the first assessment", async () => {
    const input = reviewed("Vé chung hay vé từng điểm?", [facts.flag]);
    input.evidence = [{ ...input.evidence[0]!, text: `${facts.flag}\n${facts.common}` }];
    input.sourceReview = { ...input.sourceReview!, binding: qaSourceReviewBinding(input) };
    const t = setup(input, "Theo hồ sơ, Cột cờ Lũng Cú thu 40.000 đồng/người/lượt.", verdict => {
      verdict.gates.find(gate => gate.name === "REQUIRED_FACETS_COVERAGE")!.passed = false;
    });
    expect((await t.generator.generate(input)).status).toBe("INSUFFICIENT_SOURCE");
    const payload = JSON.parse(JSON.parse(String(t.fetcher.mock.calls[1]![1]!.body)).messages[1].content);
    expect(payload.OTHER_CURRENT_EVIDENCE[0].sentences).toContain(facts.common);
    expect(payload.OTHER_CURRENT_EVIDENCE[0].sentences).not.toContain(facts.flag);
  });
  it.each(["GUEST", "USER"] as const)("persists verified synthesis for %s only after service grounding", async kind => {
    const input = reviewed("Danh hiệu?", [facts.unesco]); const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.");
    const store = { reserve: vi.fn(async () => ({ kind: "RESERVED", conversationId: "conv", turnId: "turn", fence: 1, history: [] })), complete: vi.fn(async (_p, _r, data) => data), fail: vi.fn() } as unknown as QaConversationStore;
    const service = createQaService({ store, retriever: { retrieve: async () => [...input.evidence], recheck: async () => true }, assessor: { assess: async () => ({ intent: "CLEAR", review: input.sourceReview! }) }, generator: t.generator });
    expect((await service.ask({ kind, id: "actor" }, "quality_v2", { question: input.question, context: { type: "GENERAL" } })).data.status).toBe("ANSWERED");
    expect(store.complete).toHaveBeenCalledTimes(1); expect(store.fail).not.toHaveBeenCalled();
  });
  it("allows word-number paraphrases without numeric token false rejection", async () => {
    const input = reviewed("Phạm vi?", ["Điểm đến nằm trong bốn huyện theo hồ sơ."]);
    expect((await setup(input, "Theo hồ sơ, phạm vi gồm 4 huyện.").generator.generate(input)).status).toBe("ANSWERED");
  });
  it("rechecks publication eligibility while the synthesis verifier is pending", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    let verificationStarted = false;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (JSON.parse(String(init?.body)).response_format.json_schema.name === "qa_claim_verification") {
        verificationStarted = true;
        return new Promise<Response>(() => {});
      }
      return envelope({ status: "ANSWERED", unanswered: false, answerParts: [{ text: "Đây là Công viên địa chất toàn cầu UNESCO.", citationIds: ["c1"] }] });
    });
    const store = { reserve: vi.fn(async () => ({ kind: "RESERVED", conversationId: "conv", turnId: "turn", fence: 1, history: [] })), complete: vi.fn(), fail: vi.fn() } as unknown as QaConversationStore;
    const service = createQaService({ store, eligibilityPollMs: 1, retriever: { retrieve: async () => [...input.evidence], recheck: async () => !verificationStarted }, assessor: { assess: async () => ({ intent: "CLEAR", review: input.sourceReview! }) }, generator: createQaGenerator({ apiKey: () => "offline", fetcher }) });
    await expect(service.ask({ kind: "GUEST", id: "actor" }, "revoked_v2", { question: input.question, context: { type: "GENERAL" } })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(verificationStarted).toBe(true); expect(store.complete).not.toHaveBeenCalled(); expect(store.fail).toHaveBeenCalledTimes(1);
  });
});
