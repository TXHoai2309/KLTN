import type { ExtractedSegment, SegmentOrigin } from "./extraction-contract";
import { EXTRACTION_LIMITS } from "./extraction-limits";
import { limit } from "./extraction-errors";
import { normalizeText } from "./normalize-text";

export class SegmentCollector {
  readonly segments: ExtractedSegment[] = [];
  private units = 0;
  add(raw: string, origin: SegmentOrigin, kind: ExtractedSegment["kind"] = "paragraph") {
    const text = normalizeText(raw);
    if (!text) return;
    this.units += text.length;
    if (this.units > EXTRACTION_LIMITS.textUtf16Units) limit("TEXT_LIMIT");
    if (this.segments.length >= EXTRACTION_LIMITS.segments) limit("SEGMENT_LIMIT");
    const ordinal = this.segments.length;
    this.segments.push({ id: `s${ordinal}`, ordinal, kind, text, origin });
  }
}
