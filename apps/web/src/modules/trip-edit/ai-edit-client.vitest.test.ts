import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAiTripEdit,
  requestAiTripEdit,
  streamAiTripEdit,
} from "@/lib/trip-edit-client";
import {
  resolveAiStreamOutcome,
  STREAM_INTERRUPTED_NOTICE,
  STREAM_STOPPED_NOTICE,
} from "./ai-stream-outcome";
import type { EditCandidate } from "./edit-candidate";

const revision = "2026-10-16T10:00:00.000Z";
const nextRevision = "2026-10-16T10:00:00.001Z";
const candidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{ dayIndex: 1, visits: [] }],
};
const tripValidation = {
  timeReference: revision,
  groups: {
    openingHours: { status: "SATISFIED" as const, findings: [] },
    minimumDuration: { status: "SATISFIED" as const, findings: [] },
    travelTime: { status: "SATISFIED" as const, findings: [] },
    scheduleConflict: { status: "SATISFIED" as const, findings: [] },
  },
  canConfirm: true,
};
const sampleIntent = {
  intentType: "UNCLEAR" as const,
  targetVisitIds: [],
  destinationId: null,
  params: { dayIndex: null, position: null, startTime: null, durationMinutes: null },
  affected: { visitIds: [], dayIndexes: [] },
  needsClarification: false,
  clarificationReason: null,
};

function sseStreamFromChunks(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AI trip edit client", () => {
  it("sends the prompt and code-owned resolution to the AI endpoint", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: "NEEDS_CLARIFICATION",
            reason: "AMBIGUOUS_TARGET",
            intent: {
              intentType: "CHANGE_TIME",
              targetVisitIds: ["visit-1"],
              destinationId: null,
              params: { dayIndex: null, position: null, startTime: "09:00", durationMinutes: null },
              affected: { visitIds: ["visit-1"], dayIndexes: [1] },
              needsClarification: true,
              clarificationReason: "AMBIGUOUS_TARGET",
            },
            clarification: {
              code: "AMBIGUOUS_TARGET",
              prompt: "Bạn muốn chỉnh sửa lượt ghé nào?",
              choices: [{ label: "Bảo tàng · Ngày 1 · 08:00", resolution: { selectedVisitId: "visit-1" } }],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const outcome = await requestAiTripEdit(
      "trip /1",
      {
        baseRevision: revision,
        message: "Đổi giờ điểm đến này",
        resolution: { selectedVisitId: "visit-1" },
      },
      { fetcher, timeoutMs: 1000 },
    );

    expect(requestedUrl).toBe("/api/trips/trip%20%2F1/edits/ai");
    expect(requestedInit?.method).toBe("POST");
    expect(requestedInit?.cache).toBe("no-store");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      baseRevision: revision,
      message: "Đổi giờ điểm đến này",
      resolution: { selectedVisitId: "visit-1" },
    });
    expect(outcome.kind).toBe("RESULT");
    if (outcome.kind === "RESULT") expect(outcome.result.status).toBe("NEEDS_CLARIFICATION");
  });

  it("uses the AI apply kind and retains the caller's idempotency key", async () => {
    let requestHeaders: Headers | undefined;
    let requestBody: unknown;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          success: true,
          operationStatus: "SUCCESS",
          data: {
            tripId: "trip-1",
            baseRevision: nextRevision,
            kind: "AI",
            candidate,
            validation: tripValidation,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);

    const outcome = await applyAiTripEdit(
      "trip-1",
      {
        baseRevision: revision,
        candidate,
        confirmed: true,
        kind: "AI",
      },
      "ai-confirmation-key",
    );

    expect(requestHeaders?.get("Idempotency-Key")).toBe("ai-confirmation-key");
    expect(requestBody).toEqual({ baseRevision: revision, candidate, confirmed: true, kind: "AI" });
    expect(outcome.status).toBe("SUCCESS");
    if (outcome.status === "SUCCESS") expect(outcome.data.baseRevision).toBe(nextRevision);
  });
});

describe("streamAiTripEdit (ADR-40 Ticket 03)", () => {
  it("dispatches status, steps, text deltas, correction note in order and returns the final result", async () => {
    const events: string[] = [];
    let acceptHeader: string | null = null;
    const finalPayload = {
      status: "ADVISED" as const,
      intent: sampleIntent,
      advice: "Ngày 1 lịch nhẹ nhàng.",
      aiSummary: "Ngày 1 lịch nhẹ nhàng.",
      validation: tripValidation,
      correctionNote: "Lưu ý: lịch trình hiện vẫn còn 1 điểm chưa đạt kiểm tra tính hợp lệ.",
    };
    const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      acceptHeader = new Headers(init?.headers).get("accept");
      return new Response(
        sseStreamFromChunks([
          { type: "start" },
          { type: "data-status", data: { kind: "start", label: "Đang xem lịch của bạn…" }, transient: true },
          { type: "data-steps", id: "steps", data: { steps: ["Xem lịch", "Xem thời tiết"] } },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Ngày 1 " },
          { type: "text-delta", id: "t1", delta: "lịch nhẹ nhàng." },
          { type: "text-end", id: "t1" },
          {
            type: "data-correction-note",
            id: "correction-note",
            data: { note: finalPayload.correctionNote },
          },
          { type: "data-trip-assistant-result", id: "result", data: finalPayload },
          { type: "finish" },
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
      );
    }) as typeof fetch;

    const outcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: revision, message: "lịch ngày 1 ổn không" },
      {
        fetcher,
        onStatus: (s) => events.push(`status:${s.label}`),
        onSteps: (steps) => events.push(`steps:${steps.join(",")}`),
        onTextDelta: (d) => events.push(`text:${d}`),
        onCorrectionNote: (n) => events.push(`note:${n}`),
      },
    );

    expect(acceptHeader).toBe("text/event-stream");
    expect(events).toEqual([
      "status:Đang xem lịch của bạn…",
      "steps:Xem lịch,Xem thời tiết",
      "text:Ngày 1 ",
      "text:lịch nhẹ nhàng.",
      `note:${finalPayload.correctionNote}`,
    ]);
    expect(outcome).toEqual({ kind: "RESULT", result: finalPayload });
  });

  it("returns INTERRUPTED with partialText when the stream ends before data-trip-assistant-result", async () => {
    const fetcher = (async () =>
      new Response(
        sseStreamFromChunks([
          { type: "start" },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Mình đã dời điểm A " },
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;

    const outcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: revision, message: "dời điểm A" },
      { fetcher },
    );

    expect(outcome).toEqual({ kind: "INTERRUPTED", partialText: "Mình đã dời điểm A " });
  });

  it("returns STOPPED with partialText when aborted via signal", async () => {
    const abortController = new AbortController();
    const encoder = new TextEncoder();
    const fetcher = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text-start", id: "t1" })}\n\n`),
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text-delta", id: "t1", delta: "Đang viết dở" })}\n\n`),
            );
            setTimeout(() => abortController.abort(), 10);
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;

    const outcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: revision, message: "tư vấn lịch" },
      { fetcher, signal: abortController.signal },
    );

    expect(outcome).toEqual({ kind: "STOPPED", partialText: "Đang viết dở" });
  });

  it("maps a 409 JSON conflict response cleanly even when requesting text/event-stream", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "TRIP_REVISION_CONFLICT", message: "Hành trình đã thay đổi." },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    const outcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: revision, message: "đổi giờ" },
      { fetcher },
    );

    expect(outcome).toEqual({
      kind: "FAILED",
      status: 409,
      code: "TRIP_REVISION_CONFLICT",
      message: "Hành trình đã thay đổi.",
    });
  });

  it("times out after inactivity using fake timers, and resets timer on incoming chunks", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const fetcher = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;

    const promise = streamAiTripEdit(
      "trip-1",
      { baseRevision: revision, message: "chạy thử" },
      { fetcher, timeoutMs: 1_000 },
    );

    // Send a chunk at 700ms so inactivity resets; total elapsed 1400ms > 1000ms must NOT time out yet.
    await vi.advanceTimersByTimeAsync(700);
    streamController!.enqueue(
      encoder.encode(`data: ${JSON.stringify({ type: "data-status", data: { kind: "tool", label: "Đang chạy thử…" } })}\n\n`),
    );
    await vi.advanceTimersByTimeAsync(700);
    // Now stay silent past 1000ms -> should resolve TIMEOUT.
    await vi.advanceTimersByTimeAsync(400);

    await expect(promise).resolves.toEqual({ kind: "TIMEOUT" });
  });
});

describe("resolveAiStreamOutcome draft-mutation guard (ADR-40 Ticket 03)", () => {
  it("never mutates the Edit draft on INTERRUPTED, STOPPED, ADVISED, TIMEOUT, or FAILED outcomes", () => {
    const baseCtx = { prompt: "dời điểm A", steps: ["Xem lịch", "Chạy thử 1 phương án"] };

    const interrupted = resolveAiStreamOutcome({ kind: "INTERRUPTED", partialText: "Mình đã dời..." }, baseCtx);
    expect(interrupted).toMatchObject({
      action: "INTERRUPTED",
      mutateDraft: false,
      partialText: "Mình đã dời...",
      notice: STREAM_INTERRUPTED_NOTICE,
    });

    const stopped = resolveAiStreamOutcome({ kind: "STOPPED", partialText: "Mình đã dời..." }, baseCtx);
    expect(stopped).toMatchObject({
      action: "STOPPED",
      mutateDraft: false,
      partialText: "Mình đã dời...",
      notice: STREAM_STOPPED_NOTICE,
    });

    const timeout = resolveAiStreamOutcome({ kind: "TIMEOUT" }, baseCtx);
    expect(timeout.mutateDraft).toBe(false);

    const conflict = resolveAiStreamOutcome(
      { kind: "FAILED", status: 409, code: "TRIP_REVISION_CONFLICT", message: "Conflict" },
      baseCtx,
    );
    expect(conflict).toEqual({ action: "CONFLICT_REBASE", mutateDraft: false });

    const advised = resolveAiStreamOutcome(
      {
        kind: "RESULT",
        result: {
          status: "ADVISED",
          intent: sampleIntent,
          advice: "Lịch ổn.",
          aiSummary: "Lịch ổn.",
          validation: tripValidation,
        },
      },
      baseCtx,
    );
    expect(advised.mutateDraft).toBe(false);

    const proposed = resolveAiStreamOutcome(
      {
        kind: "RESULT",
        result: {
          status: "PROPOSED",
          candidate,
          intent: sampleIntent,
          diff: { added: [], removed: [], updated: [], tripChanges: {} },
          validation: tripValidation,
          aiSummary: "Đã dời điểm A.",
        },
      },
      baseCtx,
    );
    expect(proposed).toMatchObject({
      action: "APPLY_PROPOSED",
      mutateDraft: true,
      summary: "Đã dời điểm A.",
    });
  });
});
