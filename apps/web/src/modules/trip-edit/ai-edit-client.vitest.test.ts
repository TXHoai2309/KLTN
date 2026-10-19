import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAiTripEdit,
  requestAiTripEdit,
} from "@/lib/trip-edit-client";
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
    openingHours: { status: "SATISFIED", findings: [] },
    minimumDuration: { status: "SATISFIED", findings: [] },
    travelTime: { status: "SATISFIED", findings: [] },
    scheduleConflict: { status: "SATISFIED", findings: [] },
  },
  canConfirm: true,
};

afterEach(() => vi.unstubAllGlobals());

describe("AI trip edit client", () => {
  it("sends the prompt and code-owned resolution to the AI endpoint", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({
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
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const outcome = await requestAiTripEdit("trip /1", {
      baseRevision: revision,
      message: "Đổi giờ điểm đến này",
      resolution: { selectedVisitId: "visit-1" },
    }, { fetcher, timeoutMs: 1000 });

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
      return new Response(JSON.stringify({
        success: true,
        operationStatus: "SUCCESS",
        data: {
          tripId: "trip-1",
          baseRevision: nextRevision,
          kind: "AI",
          candidate,
          validation: tripValidation,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetcher);

    const outcome = await applyAiTripEdit("trip-1", {
      baseRevision: revision,
      candidate,
      confirmed: true,
      kind: "AI",
    }, "ai-confirmation-key");

    expect(requestHeaders?.get("Idempotency-Key")).toBe("ai-confirmation-key");
    expect(requestBody).toEqual({ baseRevision: revision, candidate, confirmed: true, kind: "AI" });
    expect(outcome.status).toBe("SUCCESS");
    if (outcome.status === "SUCCESS") expect(outcome.data.baseRevision).toBe(nextRevision);
  });
});
