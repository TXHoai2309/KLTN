import { z } from "zod";
import { canonical, sha256 } from "./content-hash";
import type { ExtractedDocument } from "./extraction-contract";
import type { DocumentChunk } from "./chunk-contract";
import { originalSourceUrl } from "../../lib/original-source-url";

export const ORIGINAL_SOURCE_PARSER = "explicit-section-sources-v1";
const sourceSchema = z.object({ title: z.string().min(1).max(300), url: z.string().max(2000).refine(url => originalSourceUrl(url) === url) }).strict();
export type OriginalSource = z.infer<typeof sourceSchema>;
export const originalSourceBundleSchema = z.object({
  parserVersion: z.literal(ORIGINAL_SOURCE_PARSER), originalBytesHash: z.string().regex(/^[a-f0-9]{64}$/u), normalizedContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  registry: z.record(z.string(), sourceSchema),
  bindings: z.record(z.string(), z.object({ sourceCodes: z.array(z.string()), metadataOnly: z.boolean(), excludedSpans: z.array(z.object({start:z.number().int().nonnegative(),end:z.number().int().positive()}).strict()) }).strict()),
  scopes: z.record(z.string(), z.object({ segmentIds: z.array(z.string()), sourceCodes: z.array(z.string()), ambiguous: z.boolean() }).strict()),
  sectionCount: z.number().int().nonnegative(),
}).strict();
export type OriginalSourceBundle = z.infer<typeof originalSourceBundleSchema>;
export const sourceBundleHash = (bundle: OriginalSourceBundle) => sha256(canonical(bundle));

/** Interpret explicit source declarations only; document instructions are never executed. */
export function deriveOriginalSources(document: ExtractedDocument, chunks: readonly DocumentChunk[]): OriginalSourceBundle {
  const registry: Record<string, OriginalSource> = {};
  const conflicts = new Set<string>();
  const scopes = new Map<string, Set<string>>();
  const ambiguous = new Set<string>();
  const metadata = new Set<string>();
  const inline = new Map<string, string[]>();
  const sectionOf = (segment: ExtractedDocument["segments"][number]) => segment.origin.format === "DOCX" ? segment.origin.section?.id : undefined;
  let bibliography = false;
  for (const segment of document.segments) {
    if (segment.kind === "heading") bibliography = /^(?:DANH MỤC NGUỒN|TÀI LIỆU THAM KHẢO|REFERENCES|SOURCES)$/iu.test(segment.text.trim());
    if (bibliography) metadata.add(segment.id);
    const definition = bibliography ? /^\[(S\d+)\]\s*([\s\S]*?)\s*(https?:\/\/\S+)\s*$/iu.exec(segment.text) : null;
    if (definition) {
      const [,code,rawTitle,rawUrl] = definition;
      const url = originalSourceUrl(rawUrl!);
      if (!url) { conflicts.add(code!); continue; }
      const title = rawTitle!.trim();
      const source = { title: title && title.length <= 300 && !/https?:|file:|[\\/]|\b(?:token|secret)\b/iu.test(title) ? title : new URL(url).hostname, url };
      if (registry[code!] && canonical(registry[code!]) !== canonical(source)) conflicts.add(code!);
      else registry[code!] = source;
    }
    if (!bibliography && /^Nguồn\s*:/iu.test(segment.text)) {
      metadata.add(segment.id);
      const section = sectionOf(segment);
      if (!section) continue;
      const codes = [...segment.text.matchAll(/\[(S\d+)\]/giu)].map(match => match[1]!);
      if (!codes.length) ambiguous.add(section);
      const previous = scopes.get(section);
      if (previous && canonical([...previous].sort()) !== canonical([...new Set(codes)].sort())) ambiguous.add(section);
      const refs = previous ?? new Set<string>();
      codes.forEach(code => refs.add(code)); scopes.set(section,refs);
    } else if (!bibliography && /\sNguồn\s*:/iu.test(segment.text)) {
      const declaration = segment.text.split(/\sNguồn\s*:/iu).at(-1)!;
      inline.set(segment.id, [...declaration.matchAll(/\[(S\d+)\]/giu)].map(match => match[1]!));
    }
  }
  conflicts.forEach(code => delete registry[code]);
  const segments = new Map(document.segments.map(segment => [segment.id,segment]));
  const bindings: OriginalSourceBundle["bindings"] = {};
  for (const chunk of chunks) {
    const content = chunk.refs.map(ref => segments.get(ref.segmentId)).filter(segment => !!segment && !metadata.has(segment.id) && segment.kind !== "heading");
    const sections = new Set(content.map(segment => sectionOf(segment!)));
    const section = sections.size === 1 ? [...sections][0] : undefined;
    const perSegment = content.map(segment => inline.get(segment!.id) ?? (section && !ambiguous.has(section) ? [...(scopes.get(section) ?? [])] : []));
    const codes = perSegment.every(refs => refs.length) ? [...new Set(perSegment.flat())] : [];
    const excludedSpans = chunk.refs.flatMap(ref => {
      const segment = segments.get(ref.segmentId)!;
      const inlineStart = inline.has(segment.id) ? segment.text.search(/\sNguồn\s*:/iu) : -1;
      const from = metadata.has(segment.id) ? ref.segmentStart : Math.max(ref.segmentStart,inlineStart);
      if (!metadata.has(segment.id) && inlineStart < 0 || from >= ref.segmentEnd) return [];
      return [{start:ref.chunkStart + from - ref.segmentStart,end:ref.chunkEnd}];
    }).sort((a,b)=>a.start-b.start);
    bindings[chunk.chunkHash] = { sourceCodes: codes.length && codes.every(code => registry[code]) ? codes : [], metadataOnly: !content.length, excludedSpans };
  }
  const attributionScopes = Object.fromEntries([...scopes].map(([id,codes]) => [id, { segmentIds: document.segments.filter(segment => sectionOf(segment) === id).map(segment => segment.id), sourceCodes: [...codes], ambiguous: ambiguous.has(id) }]));
  for (const [id,codes] of inline) attributionScopes[`segment:${id}`] = {segmentIds:[id],sourceCodes:codes,ambiguous:!codes.length};
  return originalSourceBundleSchema.parse({ parserVersion: ORIGINAL_SOURCE_PARSER, originalBytesHash: document.originalBytesHash, normalizedContentHash: document.normalizedContentHash, registry, bindings, scopes: attributionScopes, sectionCount: scopes.size });
}

/** Only registered metadata spans are omitted; the stored chunk and hash stay intact. */
export function citationEvidenceText(text:string, binding:OriginalSourceBundle["bindings"][string]):string|null {
  let end=0,result="";
  for(const span of binding.excludedSpans){
    if(span.start<end||span.end<=span.start||span.end>text.length)return null;
    result+=text.slice(end,span.start); end=span.end;
  }
  return (result+text.slice(end)).trim();
}

export function readOriginalSourceBundle(value: unknown, hash: string): OriginalSourceBundle | null {
  const parsed = originalSourceBundleSchema.safeParse(value);
  return parsed.success && sourceBundleHash(parsed.data) === hash && Object.values(parsed.data.bindings).every(binding => binding.sourceCodes.every(code => !!parsed.data.registry[code])) ? parsed.data : null;
}
