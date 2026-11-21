import type { UIMessageChunk } from "ai";

import type { PreviewEditResult } from "./trip-edit-service";

const URL_PATTERN = /https?:\/\/[^\s<>)\]]+/giu;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/giu;
const INTERNAL_ID_PATTERN = /\b(?:ext:[a-z0-9:_-]+|dest-[a-z0-9_-]+|visit-[a-z0-9_-]+|sim-\d+|c[a-z0-9]{20,})\b/giu;
const MAX_PENDING_CHARS = 2048;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildKnownIdsPattern(knownDestinationIds: ReadonlySet<string>): RegExp | null {
  const longIds = [...knownDestinationIds]
    .filter((id) => id.length >= 12)
    .sort((a, b) => b.length - a.length);
  if (longIds.length === 0) return null;
  return new RegExp(longIds.map(escapeRegex).join("|"), "gu");
}

function redactSegment(raw: string, knownIdsPattern: RegExp | null): { text: string; redacted: boolean } {
  let text = raw;
  const before = text;
  text = text.replace(URL_PATTERN, "");
  text = text.replace(HTML_TAG_PATTERN, "");
  text = text.replace(INTERNAL_ID_PATTERN, "");
  if (knownIdsPattern) {
    text = text.replace(knownIdsPattern, "");
  }
  const redacted = text !== before;
  if (redacted) {
    text = text.replace(/\(\s*\)/gu, "").replace(/\[\s*\]/gu, "");
    text = text.replace(/[^\S\n]+([,.;:!?])/gu, "$1");
    text = text.replace(/[^\S\n]{2,}/gu, " ");
  }
  return { text, redacted };
}

/**
 * Strips internal identifiers (visit/dest/ext/sim/cuid/known catalog IDs ≥ 12),
 * URLs, and HTML tags from model prose or tool labels before returning to the browser.
 */
export function redactAssistantText(
  raw: string,
  knownDestinationIds: ReadonlySet<string> = new Set(),
): string {
  const knownIdsPattern = buildKnownIdsPattern(knownDestinationIds);
  const { text } = redactSegment(raw.normalize("NFC"), knownIdsPattern);
  return text.replace(/[^\S\n]{2,}/gu, " ").trim();
}

/**
 * Builds a server-written Correction note when model prose overstates validation
 * status (`FALSE_PASS`) or promises absolute weather safety (`ABSOLUTE_SAFETY`).
 */
export function buildCorrectionNote(
  rejection: "FALSE_PASS" | "ABSOLUTE_SAFETY",
  preview: PreviewEditResult,
): string {
  if (rejection === "ABSOLUTE_SAFETY") {
    return "Lưu ý: thời tiết chỉ là dự báo tham khảo, không thể bảo đảm an toàn tuyệt đối.";
  }
  const groups = preview.validation.groups;
  const allFindings = [
    ...groups.openingHours.findings,
    ...groups.minimumDuration.findings,
    ...groups.travelTime.findings,
    ...groups.scheduleConflict.findings,
  ];
  const violations = allFindings.filter((f) => f.status === "VIOLATION").length;
  const insufficient = allFindings.filter((f) => f.status === "INSUFFICIENT_DATA").length;
  if (violations > 0) {
    return `Lưu ý: lịch trình hiện vẫn còn ${violations} điểm chưa đạt kiểm tra tính hợp lệ.`;
  }
  if (insufficient > 0) {
    return `Lưu ý: lịch trình hiện vẫn còn ${insufficient} mục thiếu dữ liệu kiểm tra nên chưa thể xác nhận đạt yêu cầu.`;
  }
  return "Lưu ý: lịch trình hiện chưa đạt đầy đủ kiểm tra tính hợp lệ.";
}

function findSafeSplitIndex(pending: string): number {
  const lastLt = pending.lastIndexOf("<");
  const lastGt = pending.lastIndexOf(">");
  const searchLimit =
    lastLt > lastGt && pending.length - lastLt < MAX_PENDING_CHARS ? lastLt : pending.length;

  for (let idx = searchLimit - 1; idx >= 0; idx -= 1) {
    if (/\s/u.test(pending[idx]!)) {
      return idx + 1;
    }
  }
  if (pending.length >= MAX_PENDING_CHARS) {
    return Math.max(0, pending.length - 64);
  }
  return 0;
}

/**
 * TransformStream over AI SDK `UIMessageChunk` that redacts internal IDs, URLs
 * and HTML tags from `text-delta` chunks while buffering trailing partial tokens
 * so tokens split across chunk boundaries never leak a single byte.
 */
export function createTextRedactionTransform(
  knownDestinationIds: ReadonlySet<string>,
  options: {
    onFirstTextStart?: () => void;
    onCleanText?: (delta: string) => void;
  } = {},
): TransformStream<UIMessageChunk, UIMessageChunk> {
  const knownIdsPattern = buildKnownIdsPattern(knownDestinationIds);
  let pending = "";
  let activeTextId: string | null = null;
  let announcedWriting = false;
  let hasEmittedAnyText = false;
  let hasEmittedInBlock = false;
  let lastEndedWithHorizontalSpace = false;

  const emitClean = (
    raw: string,
    id: string,
    controller: TransformStreamDefaultController<UIMessageChunk>,
  ) => {
    const { text, redacted } = redactSegment(raw, knownIdsPattern);
    let clean = text;
    if (lastEndedWithHorizontalSpace) {
      clean = clean.replace(/^[^\S\n]+/u, "");
    } else if (redacted && !hasEmittedInBlock) {
      clean = clean.replace(/^[^\S\n]+/u, "");
    }
    if (!clean) return;
    if (!hasEmittedInBlock && hasEmittedAnyText && !clean.startsWith("\n")) {
      clean = `\n\n${clean}`;
    }
    lastEndedWithHorizontalSpace = /[^\S\n]$/u.test(clean);
    hasEmittedInBlock = true;
    hasEmittedAnyText = true;
    options.onCleanText?.(clean);
    controller.enqueue({ type: "text-delta", id, delta: clean });
  };

  const flushPending = (controller: TransformStreamDefaultController<UIMessageChunk>) => {
    if (!pending || !activeTextId) {
      pending = "";
      return;
    }
    const tail = pending;
    pending = "";
    emitClean(tail, activeTextId, controller);
  };

  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "text-start") {
        if (!announcedWriting) {
          announcedWriting = true;
          options.onFirstTextStart?.();
        }
        pending = "";
        activeTextId = chunk.id;
        hasEmittedInBlock = false;
        lastEndedWithHorizontalSpace = false;
        controller.enqueue(chunk);
        return;
      }

      if (chunk.type === "text-delta") {
        activeTextId = chunk.id;
        pending += chunk.delta;
        const splitAt = findSafeSplitIndex(pending);
        if (splitAt > 0) {
          const safe = pending.slice(0, splitAt);
          pending = pending.slice(splitAt);
          emitClean(safe, chunk.id, controller);
        }
        return;
      }

      if (chunk.type === "text-end") {
        flushPending(controller);
        activeTextId = null;
        controller.enqueue(chunk);
        return;
      }

      // Drop tool calls/outputs, internal reasoning, sources, and inner lifecycle
      // markers; the outer stream emits server-written progress, steps, correction
      // notes, and the verified final result.
    },
    flush(controller) {
      flushPending(controller);
    },
  });
}
