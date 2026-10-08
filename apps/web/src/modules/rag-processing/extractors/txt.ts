import { ProcessingError } from "../extraction-errors";
import { SegmentCollector } from "../segment-collector";

export function extractTxt(bytes: Uint8Array) {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ProcessingError("INVALID_ENCODING", "TXT_UTF8_REQUIRED"); }
  if (/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text)) throw new ProcessingError("CORRUPT_DOCUMENT", "TXT_CONTROL_CHARACTER");
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const collector = new SegmentCollector();
  let start = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i !== lines.length && lines[i].trim()) continue;
    if (i > start) collector.add(lines.slice(start, i).join("\n"), { format: "TXT", lineStart: start + 1, lineEnd: i });
    start = i + 1;
  }
  return { segments: collector.segments, warnings: [] };
}
