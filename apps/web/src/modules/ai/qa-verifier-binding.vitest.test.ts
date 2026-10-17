import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createQaSynthesisVerifier, hasQaSynthesisCertificate, QA_SYNTHESIS_GATES } from "./qa-synthesis-verification";
import { fixtureReviewedInput } from "./__fixtures__/qa-reviewed-input";
import type { QaAnswer, QaGenerationInput } from "./qa-runtime-contract";
const input = () => fixtureReviewedInput({ question: "Thuộc tính?", history: [], context: { type: "GENERAL" }, evidence: [{ citationId: "c1", documentId: "doc", generationId: "gen", contentVersionId: "version", chunkId: "chunk", chunkHash: "hash", text: "Điểm A có thuộc tính B.", tokenCount: 10, score: .9, citation: { id: "c1", sourceId: "source", title: "Nguồn hư cấu", sourceUrl: null, locators: [] } }] } satisfies QaGenerationInput);
const answer = (): QaAnswer => ({ status: "ANSWERED", answerParts: [{ text: "Theo nguồn, Điểm A có thuộc tính B.", citationIds: ["c1"] }], citations: [input().evidence[0]!.citation], unansweredAspects: [] });
function fixture(claims: unknown) {
  return { summary: "Offline fixture only.", gates: QA_SYNTHESIS_GATES.map(name => ({ name, passed: true })), coveredAspects: ["fixture_aspect"], claims };
}
describe("fixed complete-part verification without regenerated prose or references", () => {
  it("binds positive verdicts to the unchanged server text and selected sources", async () => {
    const current = input(), candidate = answer();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fixture({ p0: { entailed: true, citationsValid: true } })) } }] }));
    expect(await createQaSynthesisVerifier({ apiKey: () => "fixture-only", fetcher }).verify(candidate, current, [["s1"]], ["fixture_aspect"])).toBe(true);
    expect(hasQaSynthesisCertificate(candidate, current)).toBe(true);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.response_format.json_schema.schema.properties.claims.required).toEqual(["p0"]);
    expect(body.response_format.json_schema.schema.properties.claims.properties.p0.required).toEqual(["entailed", "citationsValid"]);
    expect(JSON.parse(body.messages[1].content).answerParts[0]).toMatchObject({ partId: "p0", text: candidate.answerParts[0]!.text, allowedSupportIds: ["s1"] });
    candidate.answerParts[0]!.text += " Nội dung chưa xác minh.";
    expect(hasQaSynthesisCertificate(candidate, current)).toBe(false);
  });
  it.each(["entailed", "citation"] as const)("rejects negative %s even when all global gates pass", async field => {
    const candidate = answer(), current = input();
    const verdict = { entailed: true, citationsValid: true }; if (field === "entailed") verdict.entailed = false; else verdict.citationsValid = false;
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fixture({ p0: verdict })) } }] });
    expect(await createQaSynthesisVerifier({ apiKey: () => "fixture-only", fetcher }).verify(candidate, current, [["s1"]])).toBe(false);
    expect(hasQaSynthesisCertificate(candidate, current)).toBe(false);
  });
  it.each([{}, { p1: { entailed: true, citationsValid: true } }, { p0: { entailed: true, citationsValid: true, supportIds: ["s2"] } }, { p0: { entailed: true, citationsValid: true }, p1: { entailed: true, citationsValid: true } }])("rejects an omitted, substituted or extra part/reference %#", async claims => {
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fixture(claims)) } }] });
    await expect(createQaSynthesisVerifier({ apiKey: () => "fixture-only", fetcher }).verify(answer(), input(), [["s1"]])).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("keeps every reviewed source and word fixed while binding the final result", async () => {
    const current = input();
    current.evidence = [...current.evidence, { ...current.evidence[0]!, citationId: "c2", citation: { ...current.evidence[0]!.citation, id: "c2" } }];
    const reviewed = fixtureReviewedInput(current), candidate = answer();
    candidate.answerParts[0]!.citationIds = ["c1", "c2"]; candidate.citations = reviewed.evidence.map(item => item.citation);
    const originalText = candidate.answerParts[0]!.text;
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fixture({ p0: { entailed: true, citationsValid: true } })) } }] });
    expect(await createQaSynthesisVerifier({ apiKey: () => "fixture-only", fetcher }).verify(candidate, reviewed, [["s1", "s2"]])).toBe(true);
    expect(candidate.answerParts).toEqual([{ text: originalText, citationIds: ["c1", "c2"] }]);
    expect(candidate.citations.map(citation => citation.id)).toEqual(["c1", "c2"]);
    expect(hasQaSynthesisCertificate(candidate, reviewed)).toBe(true);
  });
  it("never overrides a negative gate to certify the rejected synthesis", async () => {
    const current = input(), candidate = answer();
    const output = fixture({ p0: { entailed: true, citationsValid: true } });
    output.gates.find(gate => gate.name === "CITATION_VALIDITY")!.passed = false;
    const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] });
    expect(await createQaSynthesisVerifier({ apiKey: () => "fixture-only", fetcher }).verify(candidate, current, [["s1"]])).toBe(false);
    expect(hasQaSynthesisCertificate(candidate, current)).toBe(false);
  });
});
