import { Unzip, UnzipInflate } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ExtractionWarning, SegmentOrigin } from "../extraction-contract";
import { corrupt, limit, ProcessingError } from "../extraction-errors";
import { EXTRACTION_LIMITS as budgets } from "../extraction-limits";
import { normalizeText } from "../normalize-text";
import { SegmentCollector } from "../segment-collector";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const selected = new Set(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]);
type XmlNode = { [key: string]: XmlNode[] | string | number | Record<string, string> };
const local = (name: string) => name.split(":").pop()!;
const tag = (node: XmlNode) => Object.keys(node).find(key => key !== ":@") ?? "";
const children = (node: XmlNode): XmlNode[] => Array.isArray(node[tag(node)]) ? node[tag(node)] as XmlNode[] : [];
const attr = (node: XmlNode, name: string) => {
  const attributes = node[":@"] as Record<string, string> | undefined;
  const key = Object.keys(attributes ?? {}).find(key => local(key.replace(/^@_/, "")) === name);
  return key ? attributes![key] : undefined;
};
const child = (node: XmlNode, name: string) => children(node).find(node => local(tag(node)) === name);
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function readZip(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) corrupt("DOCX_ZIP_INVALID");
  // Validate central-directory count and termination independently of local headers.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) corrupt("DOCX_ZIP_TRUNCATED");
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) corrupt("DOCX_MULTIDISK_UNSUPPORTED");
  const count = view.getUint16(end + 10, true);
  if (count > budgets.zipEntries) limit("ZIP_ENTRY_LIMIT");
  if (view.getUint32(end + 16, true) + view.getUint32(end + 12, true) !== end) corrupt("DOCX_ZIP_DIRECTORY_INVALID");
  const directory = new Map<string, { size: number; crc: number }>();
  let directoryOffset = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (directoryOffset + 46 > end || view.getUint32(directoryOffset, true) !== 0x02014b50) corrupt("DOCX_ZIP_DIRECTORY_INVALID");
    const nameLength = view.getUint16(directoryOffset + 28, true);
    const recordLength = 46 + nameLength + view.getUint16(directoryOffset + 30, true) + view.getUint16(directoryOffset + 32, true);
    if (directoryOffset + recordLength > end || (view.getUint16(directoryOffset + 8, true) & 1)) corrupt("DOCX_ZIP_DIRECTORY_INVALID");
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(directoryOffset + 46, directoryOffset + 46 + nameLength)); } catch { corrupt("DOCX_ZIP_NAME_INVALID"); }
    if (directory.has(name)) corrupt("DOCX_ZIP_DUPLICATE_ENTRY");
    directory.set(name, { size: view.getUint32(directoryOffset + 24, true), crc: view.getUint32(directoryOffset + 16, true) });
    directoryOffset += recordLength;
  }
  if (directoryOffset !== end) corrupt("DOCX_ZIP_DIRECTORY_INVALID");
  const parts = new Map<string, Uint8Array>();
  const names = new Set<string>();
  let total = 0;
  let entries = 0;
  const unzip = new Unzip(file => {
    if (++entries > budgets.zipEntries) limit("ZIP_ENTRY_LIMIT");
    if (file.name.length > 500 || names.has(file.name) || file.name.includes("\\") || file.name.startsWith("/") || file.name.split("/").includes("..")) corrupt("DOCX_ZIP_PATH_INVALID");
    names.add(file.name);
    if (!directory.has(file.name)) corrupt("DOCX_ZIP_DIRECTORY_INVALID");
    if (!selected.has(file.name)) return;
    if ((file.originalSize ?? 0) > budgets.singleXmlBytes) limit("XML_PART_LIMIT");
    const pieces: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, data, final) => {
      if (error instanceof ProcessingError) throw error;
      if (error) corrupt("DOCX_ZIP_DECOMPRESSION_FAILED");
      size += data.length;
      total += data.length;
      // Count actual emitted bytes; ZIP sizes are not a trusted resource guard.
      if (size > budgets.singleXmlBytes) limit("XML_PART_LIMIT");
      if (total > budgets.selectedXmlBytes) limit("XML_TOTAL_LIMIT");
      pieces.push(data);
      if (final) {
        const all = new Uint8Array(size);
        let offset = 0;
        for (const piece of pieces) { all.set(piece, offset); offset += piece.length; }
        const declared = directory.get(file.name)!;
        if (declared.size !== size || declared.crc !== crc32(all)) corrupt("DOCX_ZIP_CHECKSUM_INVALID");
        parts.set(file.name, all);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.length; offset += 1024) unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    corrupt("DOCX_ZIP_INVALID");
  }
  if (entries !== count) corrupt("DOCX_ZIP_ENTRY_MISMATCH");
  for (const required of ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]) if (!parts.has(required)) corrupt("DOCX_PART_MISSING");
  return { parts, names };
}

function decodeEntities(value: string): string {
  return value.replace(/&([^;]*);/g, (_, entity: string) => {
    const predefined: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, entity)) return predefined[entity];
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) corrupt("XML_ENTITY_UNSAFE");
    const point = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isSafeInteger(point) || (point < 32 && ![9, 10, 13].includes(point)) || point > 0x10ffff || [0xfffe, 0xffff].includes(point) || (point >= 0xd800 && point <= 0xdfff)) corrupt("XML_ENTITY_UNSAFE");
    return String.fromCodePoint(point);
  });
}

function parseXml(bytes: Uint8Array): XmlNode[] {
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { corrupt("DOCX_XML_ENCODING_INVALID"); }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) corrupt("XML_DTD_UNSAFE");
  // Depth checked BEFORE recursive parsing/validation. Ignore comments/CDATA/PIs.
  let depth = 0;
  for (const token of xml.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
    const value = token[0];
    if (value.startsWith("<!") || value.startsWith("<?")) continue;
    if (value.startsWith("</")) depth--;
    else if (!value.endsWith("/>")) depth++;
    if (depth > budgets.xmlDepth) limit("XML_DEPTH_LIMIT");
    if (depth < 0) corrupt("DOCX_XML_INVALID");
  }
  if (XMLValidator.validate(xml) !== true) corrupt("DOCX_XML_INVALID");
  // Only predefined/numeric entities are allowed. The parser never expands entities.
  const entityText = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/.test(entityText)) corrupt("XML_ENTITY_UNSAFE");
  decodeEntities(entityText);
  return new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, parseTagValue: false, parseAttributeValue: false, processEntities: false }).parse(xml) as XmlNode[];
}

function checkWordNamespaces(node: XmlNode, inherited: Record<string, string> = {}) {
  const namespaces = { ...inherited };
  for (const [key, value] of Object.entries((node[":@"] ?? {}) as Record<string, string>)) {
    if (key === "@_xmlns") namespaces[""] = value;
    else if (key.startsWith("@_xmlns:")) namespaces[key.slice(8)] = value;
  }
  const name = tag(node);
  const prefix = name.includes(":") ? name.split(":")[0] : "";
  if (["document", "body", "styles", "style", "basedOn", "p", "pPr", "pStyle", "outlineLvl", "r", "t", "tab", "br", "cr", "tbl", "tr", "tc"].includes(local(name)) && namespaces[prefix] !== W) corrupt("DOCX_NAMESPACE_INVALID");
  for (const nested of children(node)) checkWordNamespaces(nested, namespaces);
}

export function extractDocx(bytes: Uint8Array) {
  const { parts, names } = readZip(bytes);
  const types = parseXml(parts.get("[Content_Types].xml")!);
  const relations = parseXml(parts.get("_rels/.rels")!);
  const typeRoot = types.find(node => local(tag(node)) === "Types");
  const relationRoot = relations.find(node => local(tag(node)) === "Relationships");
  if (!typeRoot || !children(typeRoot).some(node => attr(node, "PartName") === "/word/document.xml" && attr(node, "ContentType") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")) corrupt("DOCX_CONTENT_TYPE_INVALID");
  if (!relationRoot || !children(relationRoot).some(node => attr(node, "Type")?.endsWith("/officeDocument") && attr(node, "Target") === "word/document.xml" && attr(node, "TargetMode") !== "External")) corrupt("DOCX_RELATION_INVALID");
  const nodes = parseXml(parts.get("word/document.xml")!);
  const document = nodes.find(node => local(tag(node)) === "document");
  if (!document) corrupt("DOCX_DOCUMENT_INVALID");
  checkWordNamespaces(document);
  const prefix = tag(document).includes(":") ? tag(document).split(":")[0] : "";
  const xmlns = (document[":@"] as Record<string, string> | undefined)?.[prefix ? `@_xmlns:${prefix}` : "@_xmlns"];
  if (xmlns !== W) corrupt("DOCX_NAMESPACE_INVALID");
  const body = child(document, "body");
  if (!body) corrupt("DOCX_BODY_MISSING");
  const warnings: ExtractionWarning[] = [];
  const warn = (region: string) => { if (!warnings.some(w => w.region === region)) warnings.push({ code: "UNSUPPORTED_DOCX_REGION", region }); };
  for (const name of names) {
    if (/^word\/(?:footnotes|endnotes|header[^/]*|footer[^/]*)\.xml$/.test(name)) warn(name);
    if (/vbaProject|embeddings\//i.test(name)) warn("embedded-content");
  }
  if (parts.has("word/_rels/document.xml.rels")) {
    const root = parseXml(parts.get("word/_rels/document.xml.rels")!).find(node => local(tag(node)) === "Relationships");
    if (!root) corrupt("DOCX_RELATION_INVALID");
    for (const relation of children(root)) {
      const type = attr(relation, "Type")?.split("/").pop();
      if (type && ["header", "footer", "footnotes", "endnotes", "aFChunk"].includes(type)) warn(`relationship:${type}`);
    }
  }
  const styles = new Map<string, { basedOn?: string; level?: number }>();
  if (parts.has("word/styles.xml")) {
    const root = parseXml(parts.get("word/styles.xml")!).find(node => local(tag(node)) === "styles");
    if (!root) corrupt("DOCX_STYLES_INVALID");
    checkWordNamespaces(root);
    for (const style of children(root)) {
      if (local(tag(style)) !== "style" || attr(style, "type") !== "paragraph") continue;
      const id = attr(style, "styleId");
      if (!id || styles.has(id)) corrupt("DOCX_STYLE_INVALID");
      const outline = attr(child(child(style, "pPr") ?? {}, "outlineLvl") ?? {}, "val");
      if (outline !== undefined && !/^[0-9]$/.test(outline)) corrupt("DOCX_OUTLINE_INVALID");
      styles.set(id, { basedOn: attr(child(style, "basedOn") ?? {}, "val"), level: outline === undefined ? undefined : Number(outline) });
    }
  }
  function styleLevel(id: string, seen = new Set<string>()): number | undefined {
    if (seen.has(id)) corrupt("DOCX_STYLE_CYCLE");
    if (seen.size >= budgets.xmlDepth) limit("STYLE_DEPTH_LIMIT");
    seen.add(id);
    const style = styles.get(id);
    if (!style) return undefined;
    const inherited = style.basedOn ? styleLevel(style.basedOn, seen) : undefined;
    return style.level ?? inherited;
  }
  // Detect cycles even when the style is not applied to an extracted paragraph.
  for (const id of styles.keys()) styleLevel(id);
  const collector = new SegmentCollector();
  let blockIndex = 0;
  let tableIndex = 0;
  let section: Extract<SegmentOrigin, { format: "DOCX" }>["section"];
  function textOf(node: XmlNode): string {
    const name = local(tag(node));
    if (["txbxContent", "drawing", "pict", "object", "altChunk", "del", "moveFrom"].includes(name)) { warn(name); return ""; }
    if (name === "t") return children(node).map(node => typeof node["#text"] === "string" ? decodeEntities(node["#text"]) : "").join("");
    if (name === "tab") return "\t";
    if (name === "br" || name === "cr") return "\n";
    if (["footnoteReference", "endnoteReference"].includes(name)) warn(name);
    if (["instrText", "sym", "fldSimple", "ins", "moveTo"].includes(name)) warn(name);
    if (["pPr", "rPr"].includes(name)) return "";
    if (!["p", "r", "t", "tab", "br", "cr", "hyperlink", "sdt", "sdtContent", "smartTag", "customXml", "bookmarkStart", "bookmarkEnd", "proofErr", "fldChar", "lastRenderedPageBreak", "commentRangeStart", "commentRangeEnd", "commentReference", "footnoteReference", "endnoteReference", "instrText", "sym", "fldSimple", "ins", "moveTo", "#text"].includes(name)) warn(name || "unknown-inline-region");
    return children(node).map(textOf).join("");
  }
  function paragraph(node: XmlNode, table?: Extract<SegmentOrigin, { format: "DOCX" }>["table"]) {
    const position = blockIndex++;
    const text = normalizeText(textOf(node));
    const properties = child(node, "pPr");
    const direct = attr(child(properties ?? {}, "outlineLvl") ?? {}, "val");
    if (direct !== undefined && !/^[0-9]$/.test(direct)) corrupt("DOCX_OUTLINE_INVALID");
    const style = attr(child(properties ?? {}, "pStyle") ?? {}, "val");
    const level = direct === undefined ? (style ? styleLevel(style) : undefined) : Number(direct);
    if (text && level !== undefined && level < 9) section = { id: `section-${position}`, title: text, level: level + 1 };
    collector.add(text, { format: "DOCX", blockIndex: position, ...(section ? { section: { ...section } } : {}), ...(table ? { table } : {}) }, level !== undefined && level < 9 ? "heading" : table ? "table-cell" : "paragraph");
  }
  function walk(node: XmlNode, table?: Extract<SegmentOrigin, { format: "DOCX" }>["table"]) {
    const name = local(tag(node));
    if (name === "p") { paragraph(node, table); return; }
    if (name === "tbl") {
      const index = tableIndex++;
      let row = 0;
      for (const tr of children(node).filter(node => local(tag(node)) === "tr")) {
        let cell = 0;
        for (const tc of children(tr).filter(node => local(tag(node)) === "tc")) {
          for (const nested of children(tc)) walk(nested, { index, row, cell });
          cell++;
        }
        row++;
      }
      return;
    }
    if (["sectPr", "tcPr", "tblPr", "tblGrid", "trPr", "sdtPr"].includes(name)) return;
    if (["sdt", "sdtContent", "customXml"].includes(name)) { for (const nested of children(node)) walk(nested, table); return; }
    if (name !== "#text") warn(name || "unknown-body-region");
  }
  for (const node of children(body)) walk(node);
  return { segments: collector.segments, warnings };
}
