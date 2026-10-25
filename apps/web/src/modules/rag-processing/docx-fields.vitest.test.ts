import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { syntheticDocx, p } from "./__fixtures__/synthetic-documents";
import { extractDocument } from "./extract-document";
import { chunkDocument } from "./chunk-document";

const marker = (type: string) => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;
const instruction = (text: string) => `<w:r><w:instrText xml:space="preserve">${text}</w:instrText></w:r>`;
const field = (code: string, saved = "7") => marker("begin") + instruction(code) + marker("separate") + `<w:r><w:t>${saved}</w:t></w:r>` + marker("end");
function footerDocx(footer: string, body = p("Nội dung tài liệu")) {
  return syntheticDocx(body, "", {
    "word/footer1.xml": strToU8(`<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${footer}</w:ftr>`),
  });
}
async function extracted(bytes: Uint8Array) {
  const result = await extractDocument({ format: "DOCX", bytes });
  if (result.status !== "EXTRACTED") throw new Error(JSON.stringify(result));
  return result.document;
}

describe("DOCX complex pagination fields", () => {
  it.each(["PAGE", "NUMPAGES", "SECTIONPAGES", " page ", "PAGE \\* MERGEFORMAT", "PAGE \\* Arabic"])("keeps the saved %s footer result without a coverage failure", async code => {
    const bytes = footerDocx(`<w:p><w:r><w:t>Trang </w:t></w:r>${field(code)}</w:p>`);
    const document = await extracted(bytes);
    expect(document.warnings).toEqual([]);
    expect(document.segments.map(s => s.text)).toEqual(["Nội dung tài liệu", "Trang 7"]);
    expect(document.segments[1].origin).toMatchObject({ ooxmlPart: "word/footer1.xml" });
    const chunks = chunkDocument(document);
    expect(chunks.status).toBe("CHUNKED");
    if (chunks.status === "CHUNKED") expect(chunks.chunks.some(c => c.text.includes("Trang 7"))).toBe(true);
    expect(await extracted(bytes)).toEqual(document);
  });

  it("joins instruction fragments across runs, wrappers and paragraph boundaries", async () => {
    const bytes = footerDocx(`<w:p>${marker("begin")}${instruction(" NUM")}</w:p><w:p><w:hyperlink>${instruction("PAGES ")}</w:hyperlink><w:sdt><w:sdtContent>${marker("separate")}<w:r><w:t>12</w:t></w:r>${marker("end")}</w:sdtContent></w:sdt></w:p>`);
    const document = await extracted(bytes);
    expect(document.warnings).toEqual([]);
    expect(document.segments.map(s => s.text)).toEqual(["Nội dung tài liệu", "12"]);
  });

  it("retains text around multiple fields without adding instructions or inferred pages", async () => {
    const document = await extracted(footerDocx(`<w:p><w:r><w:t>Trang </w:t></w:r>${field("PAGE", "2")}<w:r><w:t> / </w:t></w:r>${field("NUMPAGES", "9")}</w:p><w:p>${marker("begin")}${instruction("PAGE")}${marker("end")}</w:p>`));
    expect(document.warnings).toEqual([]);
    expect(document.segments.map(s => s.text)).toEqual(["Nội dung tài liệu", "Trang 2 / 9"]);
  });

  it("uses the same field handling in the header and main document", async () => {
    const bytes = syntheticDocx(`<w:p>${field("PAGE", "3")}</w:p>`, "", {
      "word/header1.xml": strToU8(`<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>${field("NUMPAGES", "8")}</w:p></w:hdr>`),
    });
    const document = await extracted(bytes);
    expect(document.warnings).toEqual([]);
    expect(document.segments.map(s => s.text)).toEqual(["8", "3"]);
  });

  it.each(["DDEAUTO private-command", "INCLUDETEXT private-path", "HYPERLINK private-url", "PAGE unsupported-switch"])("keeps unsupported field %s blocking with structural diagnostics only", async code => {
    const document = await extracted(footerDocx(`<w:p>${field(code)}</w:p>`));
    expect(document.warnings).toMatchObject([{ code: "UNSUPPORTED_DOCX_REGION", ooxmlPart: "word/footer1.xml", unsupportedElement: "instrText", location: "ftr/p[0]/r[1]/instrText[0]" }]);
    expect(document.segments.map(s => s.text)).toEqual(["Nội dung tài liệu", "7"]);
    expect(JSON.stringify(document.warnings)).not.toContain(code);
  });

  it.each([
    instruction("PAGE"),
    marker("begin") + instruction("PAGE"),
    marker("separate"),
    marker("end"),
    marker("begin") + marker("end"),
    marker("begin") + instruction("PAGE") + marker("separate") + marker("separate") + marker("end"),
    marker("begin") + instruction("PAGE") + marker("separate") + instruction("NUMPAGES") + marker("end"),
    marker("begin") + instruction("PAGE") + field("NUMPAGES") + marker("end"),
    marker("begin") + instruction("PAGE") + marker("unknown") + marker("end"),
    `<w:fldSimple w:instr="PAGE">${field("NUMPAGES")}</w:fldSimple>`,
    marker("begin") + '<w:r><w:instrText>PAGE<w:unknown>omitted</w:unknown></w:instrText></w:r>' + marker("end"),
  ])("fails closed on malformed or nested field markup (%#)", async markup => {
    const document = await extracted(footerDocx(`<w:p>${markup}</w:p>`));
    expect(document.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_DOCX_REGION", ooxmlPart: "word/footer1.xml" })]));
  });

  it("does not join a body field to footer markers", async () => {
    const document = await extracted(footerDocx(`<w:p>${marker("separate")}<w:r><w:t>7</w:t></w:r>${marker("end")}</w:p>`, p("Body") + `<w:p>${marker("begin")}${instruction("PAGE")}</w:p>`));
    expect(document.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ooxmlPart: "word/document.xml" }),
      expect.objectContaining({ ooxmlPart: "word/footer1.xml" }),
    ]));
  });

  it.each(["instrText", "fldChar"])("rejects a foreign namespace masquerading as %s", async name => {
    const bytes = footerDocx(`<w:p><w:r><x:${name} xmlns:x="urn:foreign">PAGE</x:${name}></w:r></w:p>`);
    expect(await extractDocument({ format: "DOCX", bytes })).toMatchObject({ status: "CORRUPT_DOCUMENT", code: "DOCX_NAMESPACE_INVALID" });
  });
});
