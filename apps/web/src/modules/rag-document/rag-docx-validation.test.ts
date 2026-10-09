import test from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { validateRagFile, ragMime, declaredRagFileType, MAX_RAG_FILE_BYTES } from "./rag-file";
import { DOCX_UPLOAD_LIMITS } from "./rag-docx-validation";

function parts() {
  return {
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Kiểm tra tiếng Việt</w:t></w:r></w:p></w:body></w:document>'),
  };
}
function entries(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: { central: number; local: number; name: string }[] = [];
  for (let p = 0; p < bytes.length - 46; p++) if (v.getUint32(p, true) === 0x02014b50) found.push({ central: p, local: v.getUint32(p + 42, true), name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + v.getUint16(p + 28, true))) });
  return found;
}
const check = (bytes: Uint8Array) => validateRagFile("test.docx", ragMime.DOCX, bytes);
test("normal Office package is accepted, including stored ZIP and Unicode", () => {
  for (const level of [0, 6] as const) {
    const data = zipSync(parts(), { level });
    assert.equal(entries(data).length, 3);
    assert.equal(check(data), "DOCX");
  }
});
test("actual XML expansion exceeding limit rejects forged local and central sizes", () => {
  const p = parts();
  p["word/document.xml"] = strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+"x".repeat(DOCX_UPLOAD_LIMITS.partBytes + 1)+"</w:body></w:document>");
  const bytes = zipSync(p), v = new DataView(bytes.buffer);
  const e = entries(bytes).find(e => e.name === "word/document.xml")!;
  assert.ok(p["word/document.xml"].length > DOCX_UPLOAD_LIMITS.partBytes);
  assert.ok(bytes.length < 10000);
  v.setUint32(e.central + 24, 512, true); v.setUint32(e.local + 22, 512, true);
  assert.throws(() => check(bytes), { code: "INVALID_RAG_FILE" });
});
test("CRC mismatch and mismatching local metadata fail", () => {
  for (const both of [false, true]) {
    const bytes = zipSync(parts()), v = new DataView(bytes.buffer), e = entries(bytes)[2]!;
    v.setUint32(e.central + 16, 1, true);
    if (both) v.setUint32(e.local + 14, 1, true);
    assert.throws(() => check(bytes));
  }
  const stored = zipSync({ ...parts(), "unused.bin": new Uint8Array(8) }, { level: 0 });
  const e = entries(stored).find(e => e.name === "unused.bin")!, v = new DataView(stored.buffer);
  v.setUint32(e.central + 24, 4, true); v.setUint32(e.local + 22, 4, true);
  assert.throws(() => check(stored));
});
test("duplicate ZIP names fail even if local names agree", () => {
  const p = { ...parts(), "word/documenx.xml": parts()["word/document.xml"] };
  const bytes = zipSync(p), e = entries(bytes).find(e => e.name === "word/documenx.xml")!;
  bytes.set(strToU8("word/document.xml"), e.central + 46); bytes.set(strToU8("word/document.xml"), e.local + 30);
  assert.throws(() => check(bytes));
});
test("unsafe ZIP paths, encryption and unsupported compression fail", () => {
  for (const name of ["../outside.xml", "/absolute.xml", "word/../outside.xml", "C:/outside.xml", "word\\outside.xml"]) assert.throws(() => check(zipSync({ ...parts(), [name]: strToU8("unused") })));
  for (const [offset, value] of [[8, 1], [10, 99]]) {
    const bytes = zipSync(parts()), e = entries(bytes)[0]!, v = new DataView(bytes.buffer);
    v.setUint16(e.central + offset!, value!, true); assert.throws(() => check(bytes));
  }
});
test("missing required part and truncated directory fail", () => {
  const p = parts(); delete (p as Partial<typeof p>)["_rels/.rels"];
  assert.throws(() => check(zipSync(p)));
  const bytes = zipSync(parts()); assert.throws(() => check(bytes.subarray(0, bytes.length - 5)));
});
test("corrupt XML, DTD, custom entities and unverified relationships fail", () => {
  for (const xml of ['<w:document><broken></w:document>', '<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///secret">]><x/>', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>&leak;</w:body></w:document>']) {
    const p = parts(); p["word/document.xml"] = strToU8(xml); assert.throws(() => check(zipSync(p)));
  }
  for (const replacement of ['TargetMode="External" Target="word/document.xml"', 'Target="other.xml"']) {
    const p = parts(); p["_rels/.rels"] = strToU8(new TextDecoder().decode(p["_rels/.rels"]).replace('Target="word/document.xml"', replacement)); assert.throws(() => check(zipSync(p)));
  }
  const wrongNamespace = parts();
  wrongNamespace["word/document.xml"] = strToU8(new TextDecoder().decode(wrongNamespace["word/document.xml"]).replace("<w:body>", '<w:body xmlns:w="">'));
  assert.throws(() => check(zipSync(wrongNamespace)));
});
test("20 MiB inclusive upload boundary is enforced independently of inner XML", () => {
  assert.equal(declaredRagFileType("test.docx", ragMime.DOCX, MAX_RAG_FILE_BYTES), "DOCX");
  assert.throws(() => declaredRagFileType("test.docx", ragMime.DOCX, MAX_RAG_FILE_BYTES + 1));
  const p = parts(), empty = zipSync({ ...p, "unused.bin": new Uint8Array(0) }, { level: 0 });
  const exact = zipSync({ ...p, "unused.bin": new Uint8Array(MAX_RAG_FILE_BYTES - empty.length) }, { level: 0 });
  assert.equal(exact.length, MAX_RAG_FILE_BYTES); assert.equal(check(exact), "DOCX");
  assert.throws(() => check(new Uint8Array(MAX_RAG_FILE_BYTES + 1)));
});
