import { Inflate } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { AppError } from "@/server/http/app-error";

// Preserve the upload validator's 1 MiB per required XML part (not extraction budgets).
export const DOCX_UPLOAD_LIMITS = { partBytes: 1024 * 1024, totalBytes: 3 * 1024 * 1024, entries: 2048, xmlDepth: 128 } as const;
const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
const fail = (): never => { throw new AppError("INVALID_RAG_FILE", "Nội dung DOCX không hợp lệ hoặc vượt giới hạn kiểm tra.", 400); };
const decoder = new TextDecoder("utf-8", { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  return c >>> 0;
});
const checksum = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of data) c = (c >>> 8) ^ crcTable[(c ^ b) & 255];
  return (c ^ 0xffffffff) >>> 0;
};

function archiveParts(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number) => { if (p < 0 || p + 2 > bytes.length) fail(); return v.getUint16(p, true); };
  const u32 = (p: number) => { if (p < 0 || p + 4 > bytes.length) fail(); return v.getUint32(p, true); };
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === bytes.length) { end = p; break; }
  }
  if (end < 0 || u16(end + 4) || u16(end + 6)) fail();
  const count = u16(end + 10), start = u32(end + 16);
  if (!count || count > DOCX_UPLOAD_LIMITS.entries || u16(end + 8) !== count || start + u32(end + 12) !== end) fail();
  const names = new Set<string>(), spans: { start: number; end: number }[] = [];
  const parts = new Map<string, Uint8Array>();
  let p = start, total = 0;
  const extras = (offset: number, size: number) => {
    const stop = offset + size;
    while (offset < stop) {
      if (offset + 4 > stop) fail();
      const id = u16(offset), length = u16(offset + 2);
      // ZIP64 and encryption extensions are outside this bounded upload contract.
      if ([1, 0x0017, 0x9901].includes(id) || offset + 4 + length > stop) fail();
      offset += 4 + length;
    }
  };
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(p) !== 0x02014b50) fail();
    const flags = u16(p + 8), method = u16(p + 10), crc = u32(p + 16);
    const compressed = u32(p + 20), size = u32(p + 24), nl = u16(p + 28), el = u16(p + 30), cl = u16(p + 32), local = u32(p + 42);
    if (p + 46 + nl + el + cl > end || u16(p + 34) || flags & ~0x080e || ![0, 8].includes(method) || [compressed, size, local].includes(0xffffffff)) fail();
    if (u16(p + 6) > 20 || method === 0 && (compressed !== size || flags & 6)) fail();
    const rawName = bytes.subarray(p + 46, p + 46 + nl);
    const name = decoder.decode(rawName);
    if (!name || name.length > 500 || /[\\\u0000-\u001f]/.test(name) || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.split("/").some(s => s === ".." || s === ".") || names.has(name)) fail();
    names.add(name);
    extras(p + 46 + nl, el);
    if (local + 30 > start || u32(local) !== 0x04034b50 || u16(local + 4) !== u16(p + 6) || u16(local + 6) !== flags || u16(local + 8) !== method) fail();
    const ln = u16(local + 26), le = u16(local + 28), dataStart = local + 30 + ln + le;
    if (ln !== nl || dataStart > start || !rawName.every((b, n) => bytes[local + 30 + n] === b)) fail();
    extras(local + 30 + ln, le);
    let dataEnd = dataStart + compressed;
    if (dataEnd > start) fail();
    if (flags & 8) {
      for (const [position, expected] of [[14, crc], [18, compressed], [22, size]]) {
        if (u32(local + position!) !== 0 && u32(local + position!) !== expected) fail();
      }
      const descriptor = dataEnd + (u32(dataEnd) === 0x08074b50 ? 4 : 0);
      if (descriptor + 12 > start || u32(descriptor) !== crc || u32(descriptor + 4) !== compressed || u32(descriptor + 8) !== size) fail();
      dataEnd = descriptor + 12;
    } else if (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== size) fail();
    spans.push({ start: local, end: dataEnd });
    if (required.includes(name)) {
      if (size > DOCX_UPLOAD_LIMITS.partBytes) fail();
      const chunks: Uint8Array[] = [];
      let actual = 0, finished = false;
      const emit = (data: Uint8Array, final: boolean) => {
        actual += data.length; total += data.length;
        if (actual > DOCX_UPLOAD_LIMITS.partBytes || total > DOCX_UPLOAD_LIMITS.totalBytes) fail();
        chunks.push(data.slice()); finished = final;
      };
      if (method === 0) emit(bytes.subarray(dataStart, dataStart + compressed), true);
      else {
        const inflater = new Inflate(emit);
        // Never allocate output using untrusted originalSize; bound actual emissions.
        for (let offset = 0; offset < compressed; offset += 128) inflater.push(bytes.subarray(dataStart + offset, dataStart + Math.min(compressed, offset + 128)), offset + 128 >= compressed);
      }
      if (!finished || actual !== size) fail();
      const all = new Uint8Array(actual);
      let offset = 0;
      for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
      if (checksum(all) !== crc) fail();
      parts.set(name, all);
    }
    p += 46 + nl + el + cl;
  }
  if (p !== end) fail();
  spans.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const span of spans) { if (span.start !== cursor) fail(); cursor = span.end; }
  if (cursor !== start || required.some(name => !parts.has(name))) fail();
  return parts;
}

type Node = { [key: string]: Node[] | string | Record<string, string> };
const key = (node: Node) => Object.keys(node).find(k => k !== ":@") ?? "";
const children = (node: Node) => Array.isArray(node[key(node)]) ? node[key(node)] as Node[] : [];
const attributes = (node: Node) => (node[":@"] ?? {}) as Record<string, string>;
function xmlRoot(bytes: Uint8Array, root: string, namespace: string) {
  const xml = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail();
  let depth = 0;
  for (const match of xml.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
    const token = match[0];
    if (token.startsWith("<!") || token.startsWith("<?")) continue;
    if (token.startsWith("</")) depth--; else if (!token.endsWith("/>")) depth++;
    if (depth < 0 || depth > DOCX_UPLOAD_LIMITS.xmlDepth) fail();
  }
  if (depth || XMLValidator.validate(xml) !== true) fail();
  const plain = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/.test(plain)) fail();
  for (const m of plain.matchAll(/&#(x[0-9a-fA-F]+|[0-9]+);/g)) {
    const n = m[1]!.startsWith("x") ? parseInt(m[1]!.slice(1), 16) : Number(m[1]);
    if (!Number.isSafeInteger(n) || n > 0x10ffff || n < 32 && ![9, 10, 13].includes(n) || n >= 0xd800 && n <= 0xdfff || [0xfffe, 0xffff].includes(n)) fail();
  }
  const nodes = new XMLParser({ preserveOrder: true, ignoreAttributes: false, processEntities: false, parseTagValue: false, parseAttributeValue: false }).parse(xml) as Node[];
  const roots = nodes.filter(n => !key(n).startsWith("?") && key(n) !== "#text");
  if (roots.length !== 1) fail();
  const node = roots[0]!;
  const qualified = key(node), prefix = qualified.includes(":") ? qualified.split(":")[0] : "";
  if (qualified.split(":").pop() !== root || attributes(node)[prefix ? `@_xmlns:${prefix}` : "@_xmlns"] !== namespace) fail();
  const namespaceAttribute = prefix ? `@_xmlns:${prefix}` : "@_xmlns";
  const matchingChildren = (name: string) => children(node).filter(n =>
    key(n) === (prefix ? `${prefix}:${name}` : name) &&
    (!Object.hasOwn(attributes(n), namespaceAttribute) || attributes(n)[namespaceAttribute] === namespace));
  return { node, matchingChildren };
}

export function validateDocxUpload(bytes: Uint8Array): void {
  try {
    const parts = archiveParts(bytes);
    const types = xmlRoot(parts.get(required[0]!)!, "Types", "http://schemas.openxmlformats.org/package/2006/content-types");
    const documentTypes = types.matchingChildren("Override").filter(n => attributes(n)["@_PartName"] === "/word/document.xml");
    if (documentTypes.length !== 1 || attributes(documentTypes[0]!)["@_ContentType"] !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") fail();
    const rels = xmlRoot(parts.get(required[1]!)!, "Relationships", "http://schemas.openxmlformats.org/package/2006/relationships");
    const links = rels.matchingChildren("Relationship");
    const ids = new Set<string>();
    for (const link of links) { const id = attributes(link)["@_Id"]; if (!id || ids.has(id)) fail(); ids.add(id); }
    const office = links.filter(n => attributes(n)["@_Type"] === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument");
    if (office.length !== 1 || !["word/document.xml", "/word/document.xml"].includes(attributes(office[0]!)["@_Target"]!) || ![undefined, "Internal"].includes(attributes(office[0]!)["@_TargetMode"])) fail();
    const document = xmlRoot(parts.get(required[2]!)!, "document", "http://schemas.openxmlformats.org/wordprocessingml/2006/main");
    if (document.matchingChildren("body").length !== 1) fail();
    // Inspect package metadata only. No external fetch, extraction, or embedded execution.
  } catch { fail(); }
}
