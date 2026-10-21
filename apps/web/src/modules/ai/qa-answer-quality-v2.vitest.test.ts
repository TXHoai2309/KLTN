import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { validateQaGenerationOutput } from "./qa-generation";
import { createFixtureQaGenerator as createQaGenerator } from "./__fixtures__/qa-generation-wire";
import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { QA_SYNTHESIS_GATES, hasQaSynthesisCertificate } from "./qa-synthesis-verification";
import { qaSourceReviewBinding } from "./qa-source-sufficiency";
import { createQaAssessor, validateQaAssessment } from "./qa-assessment";
import { createQaService } from "./qa-service";
import type { QaGenerationInput, QaEvidence, QaAnswer } from "./qa-runtime-contract";
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
function setup(input: QaGenerationInput, text: string) {
  const isPartial = input.sourceReview?.aspects.some(aspect => aspect.status === "MISSING");
  const fetcher = vi.fn<typeof fetch>(async () => {
    return envelope({
      status: isPartial ? "PARTIAL" : "ANSWERED",
      unanswered: isPartial,
      answerParts: [{ text, citationIds: input.evidence.map(row => row.citationId) }],
    });
  });
  return { fetcher, generator: createQaGenerator({ apiKey: () => "offline-fixture", fetcher }) };
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
    // In simplified 2-call flow (Ticket 03), generator calls provider once
    expect(t.fetcher).toHaveBeenCalledTimes(1);
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
  it.each([
    ["wrong regional scope", "Vé chung toàn cao nguyên là 40.000 đồng."],
    ["expired data", "Giá chính xác hôm nay là 40.000 đồng/người/lượt."],
    ["unknown validity", "Giá hiện hành là 40.000 đồng/người/lượt."],
    ["all free misconception", "Tất cả điểm và dịch vụ đều miễn phí."],
    ["invented package", "Giá trọn gói toàn khu vực là 70.000 đồng."],
  ] as const)("returns INSUFFICIENT_SOURCE when generator yields insufficient for %s", async (_label, _text) => {
    const input = reviewed("Giá vé toàn cao nguyên hôm nay?", [facts.flag, facts.palace]);
    const fetcher = vi.fn<typeof fetch>(async () => envelope({ status: "INSUFFICIENT_SOURCE", unanswered: false, answerParts: [] }));
    const result = await createQaGenerator({ apiKey: () => "offline", fetcher }).generate(input);
    expect(result.status).toBe("INSUFFICIENT_SOURCE");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("allows equivalent price separators without requiring lexical overlap", async () => {
    const input = reviewed("Giá trong hồ sơ?", [facts.flag]);
    expect((await setup(input, "Theo hồ sơ, Cột cờ Lũng Cú thu 40,000 đồng/người/lượt.").generator.generate(input)).status).toBe("ANSWERED");
  });
  it("binds generator prompt to current evidence and schema with valid citation IDs", async () => {
    const input = reviewed("tôi muốn tìm hiểu về cao nguyên đá đồng văn", [facts.unesco, facts.geology]);
    const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO với địa hình karst đá vôi.");
    const answer = await t.generator.generate(input);
    expect(answer.status).toBe("ANSWERED");
    expect(t.fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(t.fetcher.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "medium" });
    const payload = JSON.parse(body.messages[1].content);
    expect(payload.CURRENT_EVIDENCE).toHaveLength(2);
    expect(payload.CURRENT_EVIDENCE.map((e: { citationId: string }) => e.citationId)).toEqual(["c1", "c2"]);
  });
  it("exposes eligible retrieved evidence in generation prompt", () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    input.evidence = [{ ...input.evidence[0]!, text: `${facts.unesco}\n${facts.geology}` }, evidence(facts.flag, 1)];
    const payload = JSON.parse(composeQaPrompt(input)[1]!.content);
    expect(payload.CURRENT_EVIDENCE).toHaveLength(2);
    expect(payload.CURRENT_EVIDENCE[0].sentences).toContain(facts.unesco);
    expect(payload.CURRENT_EVIDENCE[0].sentences).toContain(facts.geology);
    expect(payload.CURRENT_EVIDENCE[1].sentences).toContain(facts.flag);
  });
  it.each([
    ["fabricated citation", [{ text: "Công viên địa chất.", citationIds: ["c999"] }]],
    ["duplicate citation in part", [{ text: "Công viên địa chất.", citationIds: ["c1", "c1"] }]],
  ] as const)("fails closed on invalid generation output: %s", async (_label, parts) => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    const fetcher = vi.fn<typeof fetch>(async () => envelope({ status: "ANSWERED", unanswered: false, answerParts: parts }));
    await expect(createQaGenerator({ apiKey: () => "offline", fetcher }).generate(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("answers multipart questions naturally without requiring facet partitioning", async () => {
    const input = reviewed("Danh hiệu và đặc điểm địa chất?", [facts.unesco, facts.geology]);
    const naturalText = "Cao nguyên đá Đồng Văn là Công viên địa chất toàn cầu UNESCO với đặc trưng địa hình karst đá vôi độc đáo.";
    const t = setup(input, naturalText);
    const answer = await t.generator.generate(input);
    expect(answer.status).toBe("ANSWERED");
    expect(answer.answerParts[0]!.text).toBe(naturalText);
    expect(() => assertQaAnswerGrounding(answer, input)).not.toThrow();
  });
  it("assertQaAnswerGrounding rejects fabricated citation IDs or empty text", () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    const validAnswer: QaAnswer = { status: "ANSWERED", answerParts: [{ text: "Đây là UNESCO Geopark.", citationIds: ["c1"] }], citations: [input.evidence[0]!.citation], unansweredAspects: [] };
    expect(() => assertQaAnswerGrounding(validAnswer, input)).not.toThrow();

    // Fabricated citation ID
    expect(() => assertQaAnswerGrounding({ ...validAnswer, answerParts: [{ text: "Đây là UNESCO Geopark.", citationIds: ["c999"] }] }, input)).toThrow();

    // Empty text
    expect(() => assertQaAnswerGrounding({ ...validAnswer, answerParts: [{ text: "   ", citationIds: ["c1"] }] }, input)).toThrow();

    // Empty answerParts
    expect(() => assertQaAnswerGrounding({ ...validAnswer, answerParts: [] }, input)).toThrow();
  });
  it("deduplicates source sentences without forcing repeated answer fragments", async () => {
    const input = reviewed("Danh hiệu UNESCO?", [facts.unesco, facts.unesco]);
    const answer = await setup(input, "Đây là Công viên địa chất toàn cầu UNESCO (UNESCO Global Geopark).").generator.generate(input);
    expect(answer.status).toBe("ANSWERED"); expect(answer.answerParts).toHaveLength(1);
  });
  it("assertQaAnswerGrounding rejects out-of-scope competitor sentences in DESTINATION context", () => {
    const input: QaGenerationInput = {
      question: "Giới thiệu điểm đến?",
      history: [],
      context: { type: "DESTINATION", destinationId: "d1", name: "Cột cờ Lũng Cú" },
      evidence: [
        evidence("Cột cờ Lũng Cú là điểm cực Bắc thiêng liêng của Tổ quốc. Khu nhà Vương nằm tại thung lũng Sà Phìn.", 0),
      ],
    };
    // Answer citing competitor text from unscoped sentence
    const competitorAnswer: QaAnswer = {
      status: "ANSWERED",
      answerParts: [{ text: "Khu nhà Vương nằm tại thung lũng Sà Phìn.", citationIds: ["c1"] }],
      citations: [input.evidence[0]!.citation],
      unansweredAspects: [],
    };
    expect(() => assertQaAnswerGrounding(competitorAnswer, input)).toThrow();
  });
  it("has no synchronous bypass for fabricated citations", () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    expect(() => validateQaGenerationOutput({ status: "ANSWERED", unanswered: false, answerParts: [{ text: "Đây là Công viên địa chất toàn cầu UNESCO.", citationIds: ["c999_fabricated"] }] }, input)).toThrow();
  });
  it("generates simple grounded answers in a single call", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]); const t = setup(input, facts.unesco);
    expect((await t.generator.generate(input)).status).toBe("ANSWERED");
    expect(t.fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains the existing public-safety rejection of auth-bearing signed URLs or secrets in evidence", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco + " https://blob.vercel-storage.com/export.docx?token=private_token_123"]);
    const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.");
    await expect(t.generator.generate(input)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(t.fetcher).not.toHaveBeenCalled();
  });
  it("preserves malformed generator output and provider failure as technical errors", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    for (const mode of ["schema", "unavailable", "timeout"] as const) {
      const fetcher = vi.fn<typeof fetch>(async () => {
        if (mode === "unavailable") return new Response("fixture", { status: 503 });
        if (mode === "timeout") return new Promise<Response>(() => {});
        return envelope({ invalid: true });
      });
      await expect(createQaGenerator({ apiKey: () => "offline", fetcher, timeoutMs: 30 }).generate(input)).rejects.toMatchObject({ code: mode === "schema" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE" });
      expect(fetcher).toHaveBeenCalledTimes(1);
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
  it("rechecks publication eligibility before service turn completion", async () => {
    const input = reviewed("Danh hiệu?", [facts.unesco]);
    const t = setup(input, "Đây là Công viên địa chất toàn cầu UNESCO.");
    const store = { reserve: vi.fn(async () => ({ kind: "RESERVED", conversationId: "conv", turnId: "turn", fence: 1, history: [] })), complete: vi.fn(), fail: vi.fn() } as unknown as QaConversationStore;
    const service = createQaService({ store, retriever: { retrieve: async () => [...input.evidence], recheck: async () => false }, generator: t.generator });
    await expect(service.ask({ kind: "GUEST", id: "actor" }, "revoked_v2", { question: input.question, context: { type: "GENERAL" } })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
});
