import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  computeStreamedTextAdvance,
  isAssistantTurnTextDone,
  STREAM_FINISH_BUDGET_MS,
  TripsageStreamedText,
} from "./tripsage-streamed-text";

describe("Bug E: streamed text catch-up budget and chip/card gating", () => {
  it("completes remaining streamed text within 300ms once live stream ends", () => {
    expect(STREAM_FINISH_BUDGET_MS).toBeLessThanOrEqual(300);

    // Even with 1,200 remaining chars after stream finishes, it must hit 100% by STREAM_FINISH_BUDGET_MS
    const mid = computeStreamedTextAdvance({
      shown: 100,
      target: 1300,
      live: false,
      finishStartShown: 100,
      finishElapsedMs: STREAM_FINISH_BUDGET_MS / 2,
    });
    expect(mid).toBeGreaterThanOrEqual(700);

    const end = computeStreamedTextAdvance({
      shown: mid,
      target: 1300,
      live: false,
      finishStartShown: 100,
      finishElapsedMs: STREAM_FINISH_BUDGET_MS,
    });
    expect(end).toBe(1300);
  });

  it("keeps chips and cards gated until a live-streamed turn finishes typing, while showing history/flushed turns immediately", () => {
    // Still streaming on network -> hidden
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: true,
        live: true,
        wasStreamedLive: true,
        finished: false,
      }),
    ).toBe(false);

    // Network stream ended (live=false), typewriter STILL catching up (finished=false) -> STILL hidden (Bug E regression!)
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: true,
        live: false,
        wasStreamedLive: true,
        finished: false,
      }),
    ).toBe(false);

    // Typewriter finished (onDone called) -> visible
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: true,
        live: false,
        wasStreamedLive: true,
        finished: true,
      }),
    ).toBe(true);

    // User sent a new message -> previous assistant turn is no longer latest -> immediately done
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: false,
        live: false,
        wasStreamedLive: true,
        finished: false,
      }),
    ).toBe(true);

    // Loaded from conversation history (never streamed live) -> immediately visible
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: true,
        live: false,
        wasStreamedLive: false,
        finished: false,
      }),
    ).toBe(true);
  });

  it("renders full text immediately when flushNow=true even if live was true", () => {
    const html = renderToStaticMarkup(
      createElement(TripsageStreamedText, {
        text: "Bạn cần ra điểm tập kết trước rồi mới thuê xe máy.",
        live: true,
        flushNow: true,
      }),
    );
    expect(html).toContain("Bạn cần ra điểm tập kết trước rồi mới thuê xe máy.");
  });

  it("Bug 8: keeps summary card, chips, and access leg gated when data parts arrive before text or while recovering ('Đang hoàn tất câu trả lời')", () => {
    // Stage 1: data-itinerary arrived first during streaming, text body not received yet
    expect(
      isAssistantTurnTextDone({
        hasBody: false,
        isLatestMessage: true,
        live: true,
        recovering: false,
        wasStreamedLive: true,
        finished: false,
      }),
    ).toBe(false);

    // Stage 2: stream disconnected and browser is polling recovery ("Đang hoàn tất câu trả lời"), still no text
    expect(
      isAssistantTurnTextDone({
        hasBody: false,
        isLatestMessage: true,
        live: false,
        recovering: true,
        wasStreamedLive: true,
        finished: false,
      }),
    ).toBe(false);

    // Stage 3: data part arrived during live stream, live flipped false before text arrived / settled -> still gated
    expect(
      isAssistantTurnTextDone({
        hasBody: false,
        isLatestMessage: true,
        live: false,
        recovering: false,
        wasStreamedLive: true,
        finished: false,
      }),
    ).toBe(false);

    // Stage 4: text arrives after data part, typewriter hasn't finished yet -> still gated
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: true,
        live: false,
        recovering: false,
        wasStreamedLive: true,
        finished: false,
      }),
    ).toBe(false);

    // Stage 5: text finishes revealing (onDone fires) -> summary card, chips, and access leg appear
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: true,
        live: false,
        recovering: false,
        wasStreamedLive: true,
        finished: true,
      }),
    ).toBe(true);

    // Stage 5b: recovery replaces the message with saved DB message (wasStreamedLive=false, recovering=false) -> visible
    expect(
      isAssistantTurnTextDone({
        hasBody: true,
        isLatestMessage: true,
        live: false,
        recovering: false,
        wasStreamedLive: false,
        finished: false,
      }),
    ).toBe(true);
  });
});
