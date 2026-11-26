"use client";

import { useEffect, useRef, useState } from "react";
import { TripsageMarkdown } from "./tripsage-markdown";

/** Maximum wall-clock time (ms) to finish revealing remaining text once the stream completes. */
export const STREAM_FINISH_BUDGET_MS = 280;

/**
 * Pure per-frame advance step for streamed assistant text (Bug E):
 * - While `live` is true: stays briskly caught up behind incoming chunks.
 * - Once `live` is false: guarantees the remaining text finishes within `STREAM_FINISH_BUDGET_MS` (<= 300ms).
 */
export function computeStreamedTextAdvance(input: {
  shown: number;
  target: number;
  live: boolean;
  finishStartShown: number;
  finishElapsedMs: number;
}): number {
  const { shown, target, live, finishStartShown, finishElapsedMs } = input;
  if (shown >= target) return target;
  if (!live) {
    const progress = Math.min(1, Math.max(0, finishElapsedMs) / STREAM_FINISH_BUDGET_MS);
    const planned = Math.ceil(finishStartShown + (target - finishStartShown) * progress);
    return Math.min(target, Math.max(shown + 2, planned));
  }
  const remaining = target - shown;
  return shown + Math.min(remaining, Math.max(4, Math.ceil(remaining / 6)));
}

/** Pure visibility gate so chips, summary cards, and result cards wait until the turn's text finishes revealing. */
export function isAssistantTurnTextDone(input: {
  hasBody: boolean;
  /** True when the turn has non-empty text even if `splitTrailingQuestion` moved all of it into `question` (leaving `hasBody: false`). */
  hasText?: boolean;
  isLatestMessage: boolean;
  live: boolean;
  /** True while the browser is polling to recover the finished answer after a dropped stream ("Đang hoàn tất câu trả lời"). */
  recovering?: boolean;
  wasStreamedLive: boolean;
  finished: boolean;
}): boolean {
  if (input.live) return false;
  if (input.isLatestMessage && input.recovering) return false;
  if (!input.hasBody) {
    // When the entire single-line reply was lifted into `question`, TripsageStreamedText does not mount
    // (and therefore cannot fire `onDone`), so once streaming and recovery have finished it is immediately done.
    if (input.hasText) return true;
    // Bug 8: if a data part (e.g. data-itinerary) arrived before any text during a live turn,
    // keep cards/chips hidden until the turn finishes with text (or explicitly settles via `finished`).
    return !(input.isLatestMessage && input.wasStreamedLive && !input.finished);
  }
  if (!input.isLatestMessage) return true;
  if (!input.wasStreamedLive) return true;
  return input.finished;
}

/**
 * Pure decision helper for post-stream recovery: returns true when `useChat.onFinish` settled without a user stop
 * yet the SSE stream ended prematurely (disconnect, missing `finishReason`, or empty visible reply) while a saved
 * conversation exists on the server so the client can hydrate the persisted reply without requiring F5.
 */
export function shouldRecoverFinishedTurn(input: {
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
  stopRequested: boolean;
  finishReason: string | undefined;
  hasVisibleText: boolean;
  hasConversationId: boolean;
}): boolean {
  if (!input.hasConversationId || input.isAbort || input.stopRequested) return false;
  if (input.isDisconnect) return true;
  if (input.isError) return false;
  return input.finishReason === undefined || !input.hasVisibleText;
}

/**
 * Shows a reply that arrives in bursts as steady typing. A message first mounted while the turn is streaming types in and then
 * finishes within ~280ms once the stream ends; `flushNow` immediately reveals all text (e.g. when the user sends a new message).
 * Reduced-motion users always get the full text.
 */
export function TripsageStreamedText({
  text,
  live,
  flushNow = false,
  onDone,
}: {
  text: string;
  live: boolean;
  flushNow?: boolean;
  onDone?: () => void;
}) {
  const animated = useRef(live && !flushNow);
  const [shown, setShown] = useState(live && !flushNow ? 0 : text.length);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const target = useRef(text.length);
  target.current = text.length;
  const liveRef = useRef(live);
  liveRef.current = live;
  const finishStartRef = useRef<{ time: number; shown: number } | null>(null);
  // Start false so even when text arrives AFTER data parts right as `live` turns false, `onDone` still fires once text is mounted.
  const notified = useRef(false);

  // Immediately flush remaining text when a newer message is sent or the turn is flushed.
  useEffect(() => {
    if (!flushNow) return;
    animated.current = false;
    finishStartRef.current = null;
    if (shownRef.current < text.length) {
      setShown(text.length);
    }
    if (!notified.current) {
      notified.current = true;
      onDone?.();
    }
  }, [flushNow, text.length, onDone]);

  // Mark the exact timestamp when the stream transitions from live -> finished to cap catch-up to <= 280ms.
  // Also install a wall-clock timer fallback so throttled/background tabs where rAF pauses still reveal full text and fire onDone.
  useEffect(() => {
    if (!live && animated.current && !finishStartRef.current) {
      finishStartRef.current = { time: performance.now(), shown: shownRef.current };
    } else if (live) {
      finishStartRef.current = null;
    }
    if (live || flushNow || shownRef.current >= text.length) return;
    const timer = setTimeout(() => {
      animated.current = false;
      finishStartRef.current = null;
      shownRef.current = target.current;
      setShown(target.current);
      if (!notified.current) {
        notified.current = true;
        onDone?.();
      }
    }, STREAM_FINISH_BUDGET_MS + 120);
    return () => clearTimeout(timer);
  }, [live, flushNow, text.length, onDone]);

  useEffect(() => {
    if (!animated.current || flushNow) {
      setShown(text.length);
      return;
    }
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animated.current = false;
      setShown(text.length);
      return;
    }
    let frame = 0;
    const step = (now: number) => {
      if (!animated.current) return;
      if (!liveRef.current && !finishStartRef.current) {
        finishStartRef.current = { time: now, shown: shownRef.current };
      }
      const nextShown = computeStreamedTextAdvance({
        shown: shownRef.current,
        target: target.current,
        live: liveRef.current,
        finishStartShown: finishStartRef.current?.shown ?? shownRef.current,
        finishElapsedMs: finishStartRef.current ? now - finishStartRef.current.time : 0,
      });
      if (nextShown !== shownRef.current) {
        shownRef.current = nextShown;
        setShown(nextShown);
      }
      if (!liveRef.current && nextShown >= target.current) {
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text.length, live, flushNow]);

  useEffect(() => {
    if (!live && shown >= text.length) {
      animated.current = false;
      finishStartRef.current = null;
      if (!notified.current) {
        notified.current = true;
        onDone?.();
      }
    }
  }, [live, shown, text.length, onDone]);

  return <TripsageMarkdown text={shown >= text.length ? text : text.slice(0, shown)} />;
}
