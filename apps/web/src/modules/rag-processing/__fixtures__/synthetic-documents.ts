// Test-only generators. These are invented text, never verified travel sources.
import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";

export function syntheticDocx(body: string, styles = "", extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
    ...(styles ? { "word/styles.xml": strToU8(`<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`) } : {}),
    ...extra,
  });
}
export const p = (text: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;

function assemblePdf(objects: string[], trailer = "") {
  let content = "%PDF-1.7\n%synthetic\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(content, "latin1")); content += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(content, "latin1");
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(content, "latin1"));
}
const stream = (text: string) => `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`;

// Real PDF object tree/xref, Type0 font and ToUnicode mapping, plus a 1px image.
export function syntheticPdf(pages: { text?: string; image?: boolean }[]) {
  const chars = [...new Set(pages.flatMap(page => [...(page.text ?? "")]))];
  const cmap = chars.map((char, i) => `<${(i + 1).toString(16).padStart(4, "0")}> <${Buffer.from(char, "utf16le").swap16().toString("hex")}>`).join("\n");
  const mappings = chars.map((char, i) => [char, (i + 1).toString(16).padStart(4, "0")] as const);
  const encode = (text: string) => [...text].map(char => mappings.find(([key]) => key === char)![1]).join("");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${8 + i * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type0 /BaseFont /Synthetic /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>",
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Synthetic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 600 >>",
    stream(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Synthetic def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chars.length} beginbfchar\n${cmap}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`),
    "<< /Type /FontDescriptor /FontName /Synthetic /Flags 4 /FontBBox [0 -200 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>",
    "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n\xff\xff\xff\nendstream",
  ];
  pages.forEach((page, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 7 0 R >> >> /Contents ${9 + i * 2} 0 R >>`);
    objects.push(stream(`${page.text ? `BT /F1 12 Tf 40 740 Td <${encode(page.text)}> Tj ET\n` : ""}${page.image ? "q 20 0 0 20 40 40 cm /Im1 Do Q" : ""}`));
  });
  return assemblePdf(objects);
}

const padding = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");
function md5(bytes: Uint8Array) { return createHash("md5").update(bytes).digest(); }
function rc4(key: Uint8Array, data: Uint8Array) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) % 256; [s[i], s[j]] = [s[j], s[i]]; }
  let i = 0; j = 0;
  return Buffer.from(data.map(byte => { i = (i + 1) % 256; j = (j + s[i]) % 256; [s[i], s[j]] = [s[j], s[i]]; return byte ^ s[(s[i] + s[j]) % 256]; }));
}
// Standard PDF R2 encryption with a nonempty user password, not a fake Encrypt marker.
export function encryptedSyntheticPdf() {
  const padded = (password: string) => Buffer.concat([Buffer.from(password), padding]).subarray(0, 32);
  const owner = rc4(md5(padded("fixture-owner")).subarray(0, 5), padded("fixture-user"));
  const id = Buffer.alloc(16, 0x42);
  const permission = Buffer.alloc(4); permission.writeInt32LE(-4);
  const key = md5(Buffer.concat([padded("fixture-user"), owner, permission, id])).subarray(0, 5);
  const user = rc4(key, padding);
  const encryption = `<< /Filter /Standard /V 1 /R 2 /O <${owner.toString("hex")}> /U <${user.toString("hex")}> /P -4 >>`;
  return assemblePdf(["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Count 1 /Kids [3 0 R] >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>", encryption], `/Encrypt 4 0 R /ID [<${id.toString("hex")}> <${id.toString("hex")}>]`);
}
