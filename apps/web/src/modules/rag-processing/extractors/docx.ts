import { posix } from "node:path";
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
const isPaginationInstruction = (value: string) => /^(?:PAGE|NUMPAGES|SECTIONPAGES)(?:\s+\\\*\s+(?:MERGEFORMAT|Arabic))?$/i.test(value.trim());
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
    if (!selected.has(file.name) && !/^word\/[^/]+\.xml$/.test(file.name) && !/^word\/_rels\/[^/]+\.xml\.rels$/.test(file.name)) return;
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
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(xml)) corrupt("DOCX_XML_CONTROL_INVALID");
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
  if (["hdr", "ftr", "hyperlink", "fldSimple", "fldChar", "instrText", "document", "body", "styles", "style", "basedOn", "p", "pPr", "pStyle", "outlineLvl", "r", "t", "tab", "br", "cr", "tbl", "tr", "tc"].includes(local(name)) && namespaces[prefix] !== W) corrupt("DOCX_NAMESPACE_INVALID");
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
  let currentPart = "word/document.xml";
  const nodePaths = new WeakMap<XmlNode, string>();
  const mapPaths = (node: XmlNode, path: string) => {
    nodePaths.set(node, path);
    children(node).forEach((nested, index) => mapPaths(nested, `${path}/${local(tag(nested))}[${index}]`));
  };
  mapPaths(document, "document");
  const warn = (region: string, node?: XmlNode) => {
    const location = node ? nodePaths.get(node) : undefined;
    if (!warnings.some(w => w.region === region && w.ooxmlPart === currentPart && w.location === location)) warnings.push({
      code: "UNSUPPORTED_DOCX_REGION", region, ooxmlPart: currentPart, unsupportedElement: region,
      ...(location ? { location } : {}),
    });
  };
  const paginationInstructions = new WeakSet<XmlNode>();
  function inspectComplexFields(root: XmlNode) {
    // Fields may span runs/paragraphs, but never different Word story parts.
    // Validate the complete instruction before exempting any instrText from coverage warnings.
    type Field = { start: XmlNode; instructions: XmlNode[]; fragments: string[]; separated: boolean; invalid: boolean };
    const fields: Field[] = [];
    let simpleDepth = 0;
    const reject = (field: Field) => {
      if (field.instructions.length) for (const node of field.instructions) warn("instrText", node);
      else warn("fldChar", field.start);
    };
    function visit(node: XmlNode) {
      const name = local(tag(node));
      if (["pPr", "rPr", "sdtPr", "sdtEndPr", "customXmlPr", "sectPr", "tblPr", "trPr", "tcPr"].includes(name)) return;
      const field = fields.at(-1);
      if (name === "fldSimple") {
        if (field) field.invalid = true;
        simpleDepth++;
        for (const nested of children(node)) visit(nested);
        simpleDepth--;
        return;
      }
      if (name === "fldChar") {
        const type = attr(node, "fldCharType");
        if (type === "begin") {
          if (field) field.invalid = true; // Nested fields are outside supported pagination.
          fields.push({ start: node, instructions: [], fragments: [], separated: false, invalid: !!field || simpleDepth > 0 });
        } else if (type === "separate" && field && !field.separated) {
          field.separated = true;
        } else if (type === "end" && field) {
          fields.pop();
          if (field.invalid || !isPaginationInstruction(field.fragments.join(""))) reject(field);
          else for (const instruction of field.instructions) paginationInstructions.add(instruction);
        } else {
          if (field) field.invalid = true;
          warn("fldChar", node);
        }
        return;
      }
      if (name === "instrText") {
        if (!field || field.separated) {
          if (field) field.invalid = true;
          warn("instrText", node);
        } else {
          field.instructions.push(node);
          if (children(node).some(n => tag(n) !== "#text")) field.invalid = true;
          field.fragments.push(children(node).map(n => typeof n["#text"] === "string" ? decodeEntities(n["#text"]) : "").join(""));
        }
        return;
      }
      if (field && !field.separated && ["t", "tab", "br", "cr"].includes(name)) field.invalid = true;
      for (const nested of children(node)) visit(nested);
    }
    visit(root);
    for (const field of fields) reject(field); // Unterminated fields remain blocking.
  }
  const auxiliary = new Map<string, "hdr" | "ftr">();
  const linksByPart = new Map<string, Map<string, string>>();
  for (const name of names) {
    if (/^word\/(?:footnotes|endnotes)\.xml$/.test(name)) warn(name);
    if (/^word\/(?:header|footer)[^/]*\.xml$/.test(name)) auxiliary.set(name, name.includes("/header") ? "hdr" : "ftr");
    if (/vbaProject|embeddings\//i.test(name)) warn("embedded-content");
  }
  for (const [partName, bytes] of parts) {
    if (!/^word\/_rels\/[^/]+\.xml\.rels$/.test(partName)) continue;
    const owner = `word/${posix.basename(partName, ".rels")}`;
    const links = new Map<string, string>();
    const root = parseXml(bytes).find(node => local(tag(node)) === "Relationships");
    if (!root) corrupt("DOCX_RELATION_INVALID");
    for (const relation of children(root)) {
      const type = attr(relation, "Type")?.split("/").pop();
      const target = attr(relation, "Target");
      const id = attr(relation, "Id");
      if (type === "hyperlink" && target && id && attr(relation, "TargetMode") === "External") {
        if (links.has(id)) corrupt("DOCX_RELATION_INVALID");
        links.set(id, decodeEntities(target));
      }
      if (type && ["header", "footer"].includes(type)) {
        const resolved = target ? posix.normalize(posix.join("word", target)) : "";
        if (attr(relation, "TargetMode") === "External" || !/^word\/[^/]+\.xml$/.test(resolved) || !parts.has(resolved)) warn(`relationship:${type}`);
        else auxiliary.set(resolved, type === "header" ? "hdr" : "ftr");
      }
      if (type && ["footnotes", "endnotes", "aFChunk"].includes(type)) warn(`relationship:${type}`);
    }
    linksByPart.set(owner, links);
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
    if (["txbxContent", "drawing", "pict", "object", "altChunk", "del", "moveFrom"].includes(name)) { warn(name, node); return ""; }
    if (name === "fldSimple") {
      // Render only the saved result of pagination fields; never evaluate instructions.
      const instruction = decodeEntities(attr(node, "instr") ?? "").trim();
      if (!isPaginationInstruction(instruction)) warn(name, node);
      return children(node).map(textOf).join("");
    }
    if (name === "instrText") {
      if (!paginationInstructions.has(node)) warn(name, node);
      return ""; // Field code is never displayed text, and is never evaluated.
    }
    if (name === "hyperlink") {
      const label = children(node).map(textOf).join("");
      const id = attr(node, "id");
      if (!id) return label; // local bookmark
      const target = linksByPart.get(currentPart)?.get(id);
      if (!target) { warn("hyperlink-target", node); return label; }
      try {
        const url = new URL(target);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || /[\s\u0000-\u001f]/u.test(target)) throw new Error();
      } catch { warn("hyperlink-target", node); return label; }
      return label.includes(target) ? label : `${label}${label ? " " : ""}${target}`;
    }
    if (name === "t") return children(node).map(node => typeof node["#text"] === "string" ? decodeEntities(node["#text"]) : "").join("");
    if (name === "tab") return "\t";
    if (name === "br" || name === "cr") return "\n";
    if (["footnoteReference", "endnoteReference"].includes(name)) warn(name, node);
    if (["sym", "ins", "moveTo"].includes(name)) warn(name, node);
    if (["pPr", "rPr", "sdtPr", "sdtEndPr", "customXmlPr"].includes(name)) return "";
    if (!["p", "r", "t", "tab", "br", "cr", "hyperlink", "sdt", "sdtContent", "smartTag", "customXml", "bookmarkStart", "bookmarkEnd", "proofErr", "fldChar", "lastRenderedPageBreak", "commentRangeStart", "commentRangeEnd", "commentReference", "footnoteReference", "endnoteReference", "instrText", "sym", "ins", "moveTo", "#text"].includes(name)) warn(name || "unknown-inline-region", node);
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
    collector.add(text, { format: "DOCX", blockIndex: position, ...(currentPart !== "word/document.xml" ? { ooxmlPart: currentPart } : {}), ...(section ? { section: { ...section } } : {}), ...(table ? { table } : {}) }, level !== undefined && level < 9 ? "heading" : table ? "table-cell" : "paragraph");
  }
  function walk(node: XmlNode, table?: Extract<SegmentOrigin, { format: "DOCX" }>["table"]) {
    const name = local(tag(node));
    if (name === "p") { paragraph(node, table); return; }
    if (name === "tbl") {
      const index = tableIndex++;
      let row = 0;
      for (const nested of children(node)) if (!["tr", "tblPr", "tblGrid"].includes(local(tag(nested)))) warn(local(tag(nested)), nested);
      for (const tr of children(node).filter(node => local(tag(node)) === "tr")) {
        for (const nested of children(tr)) if (!["tc", "trPr"].includes(local(tag(nested)))) warn(local(tag(nested)), nested);
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
    if (name !== "#text") warn(name || "unknown-body-region", node);
  }
  function readAuxiliary(part: string, expected: "hdr" | "ftr") {
    currentPart = part;
    section = undefined;
    const root = parseXml(parts.get(part)!).find(node => local(tag(node)) === expected);
    if (!root) corrupt("DOCX_AUXILIARY_INVALID");
    checkWordNamespaces(root);
    mapPaths(root, expected);
    inspectComplexFields(root);
    for (const node of children(root)) walk(node);
  }
  // Each stored header/footer is read once, never repeated for every rendered page.
  for (const [part, kind] of auxiliary) if (kind === "hdr") readAuxiliary(part, kind);
  currentPart = "word/document.xml";
  section = undefined;
  inspectComplexFields(body);
  for (const node of children(body)) walk(node);
  for (const [part, kind] of auxiliary) if (kind === "ftr") readAuxiliary(part, kind);
  return { segments: collector.segments, warnings };
}
