import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditCandidate } from "@/modules/trip-edit/edit-candidate";
import { evaluateEditJourney, mergeJourneyValidation } from "@/modules/trip-edit/edit-journey-server";
import type { PreviewEditResult } from "@/modules/trip-edit/trip-edit-service";
import { applyTripEdit, previewTripEdit, streamAiTripEdit } from "./trip-edit-client";

const candidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{ dayIndex: 1, visits: [] }],
};

const preview: PreviewEditResult = {
  baseRevision: "2026-10-16T10:00:00.000Z",
  candidate,
  validation: {
    timeReference: "2026-10-16T10:00:00.000Z",
    groups: {
      openingHours: { status: "SATISFIED", findings: [] },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: { status: "SATISFIED", findings: [] },
      scheduleConflict: { status: "SATISFIED", findings: [] },
    },
    canConfirm: true,
  },
  eligibleForConfirmation: true,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("previewTripEdit", () => {
  it.each(["GOOGLE_MAPS", "STADIA_MAPS"] as const)("accepts authoritative route provenance from %s", async (provider) => {
    const result: PreviewEditResult = {
      ...preview,
      legs: [{ dayIndex: 1, fromVisitId: "a", toVisitId: "b", status: "VERIFIED",
        durationSeconds: 600, distanceMeters: 3000, provider }],
    };
    const fetcher = (async () => Response.json({ success: true, data: result })) as typeof fetch;
    expect(await previewTripEdit("trip-1", { baseRevision: preview.baseRevision, candidate }, { fetcher }))
      .toEqual({ kind: "PREVIEWED", result });
  });

  it("posts the revision and candidate to the preview route using a fake fetch", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({ success: true, data: preview }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const outcome = await previewTripEdit("trip /1", {
      baseRevision: preview.baseRevision,
      candidate,
    }, { fetcher, timeoutMs: 1000 });

    expect(requestedUrl).toBe("/api/trips/trip%20%2F1/edits/preview");
    expect(requestedInit?.method).toBe("POST");
    expect(requestedInit?.cache).toBe("no-store");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      baseRevision: preview.baseRevision,
      candidate,
    });
    expect(outcome).toEqual({ kind: "PREVIEWED", result: preview });
  });

  it("returns a network error without throwing when fetch rejects", async () => {
    const fetcher = (async () => { throw new TypeError("offline"); }) as typeof fetch;
    await expect(previewTripEdit("trip-1", {
      baseRevision: preview.baseRevision,
      candidate,
    }, { fetcher })).resolves.toEqual({ kind: "NETWORK_ERROR" });
  });

  it("aborts and reports a timeout when the fake fetch does not finish", async () => {
    vi.useFakeTimers();
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as typeof fetch;

    const pending = previewTripEdit("trip-1", {
      baseRevision: preview.baseRevision,
      candidate,
    }, { fetcher, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual({ kind: "TIMEOUT" });
  });
});

describe("applyTripEdit", () => {
  it("retries an UNKNOWN write with the same idempotency key and exact payload", async () => {
    const applyResult = {
      tripId: "trip-1",
      baseRevision: "2026-10-16T10:00:00.001Z",
      kind: "MANUAL",
      candidate,
      validation: preview.validation,
    };
    const requests: Array<{ url: string; key: string | null; body: string | null }> = [];
    let attempt = 0;
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        key: headers.get("Idempotency-Key"),
        body: typeof init?.body === "string" ? init.body : null,
      });
      attempt += 1;
      if (attempt === 1) throw new TypeError("connection lost after dispatch");
      return new Response(JSON.stringify({
        success: true,
        operationStatus: "SUCCESS",
        data: applyResult,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch);

    const input = {
      baseRevision: preview.baseRevision,
      candidate,
      confirmed: true as const,
      kind: "MANUAL" as const,
    };
    const first = await applyTripEdit("trip-1", input, "confirmation-key");
    const retry = await applyTripEdit("trip-1", input, "confirmation-key");

    expect(first.status).toBe("UNKNOWN");
    expect(retry.status).toBe("SUCCESS");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(requests[0]?.url).toBe("/api/trips/trip-1/edits/apply");
    expect(requests[0]?.key).toBe("confirmation-key");
    expect(JSON.parse(requests[0]!.body!)).toEqual(input);
  });
});

function createSseResponse(chunks: readonly unknown[]): Response {
  const encoder = new TextEncoder();
  const payload = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const sampleIntent = {
  intentType: "CHANGE_TIME" as const,
  targetVisitIds: [],
  destinationId: null,
  params: { dayIndex: null, position: null, startTime: null, durationMinutes: null },
  affected: { visitIds: [], dayIndexes: [] },
  needsClarification: false,
  clarificationReason: null,
};

const emptyDiff = {
  added: [],
  removed: [],
  updated: [],
  tripChanges: {},
};

const lateReturnValidation = {
  ...preview.validation,
  advisories: [
    {
      reasonCode: "RETURN_DEADLINE_MISSED",
      message: "Dự kiến về tới nơi khoảng 19:18, muộn hơn khung 18:00.",
    },
  ],
};

describe("streamAiTripEdit (D1 / B8)", () => {
  it("accepts ADVISED stream result and suggestion cards containing validation.advisories", async () => {
    const advisedPayload = {
      status: "ADVISED" as const,
      intent: sampleIntent,
      advice: "Bạn có thể chọn một trong các phương án để ngày cuối về sớm hơn.",
      validation: lateReturnValidation,
      aiSummary: "Đã đề xuất phương án rút ngắn chặng về.",
      saveEligibility: "PASS" as const,
      suggestions: [
        {
          id: "opt-1",
          title: "Khởi hành sớm hơn lúc 06:00",
          summary: "Về Hà Nội khoảng 17:48.",
          diffSummaryLines: ["Dời giờ khởi hành ngày cuối sang 06:00"],
          candidate,
          diff: emptyDiff,
          validation: lateReturnValidation,
          changedVisitIds: { added: [], updated: [], shifted: [], removedCount: 0 },
          saveEligibility: "PASS" as const,
        },
      ],
    };

    const fetcher = (async () =>
      createSseResponse([
        { type: "text-delta", id: "t1", delta: "Gợi ý phương án..." },
        { type: "data-trip-assistant-result", data: advisedPayload },
        { type: "finish" },
      ])) as typeof fetch;

    const outcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: preview.baseRevision, message: "Ngày cuối đỡ vất hơn được không?" },
      { fetcher },
    );

    expect(outcome.kind).toBe("RESULT");
    if (outcome.kind === "RESULT") {
      expect(outcome.result.status).toBe("ADVISED");
      if (outcome.result.status === "ADVISED") {
        expect(outcome.result.validation.advisories).toEqual(lateReturnValidation.advisories);
        expect(outcome.result.suggestions).toHaveLength(1);
        expect(outcome.result.suggestions?.[0]?.validation.advisories).toEqual(lateReturnValidation.advisories);
      }
    }
  });

  it("accepts PROPOSED stream result containing validation.advisories", async () => {
    const proposedPayload = {
      status: "PROPOSED" as const,
      candidate,
      intent: sampleIntent,
      diff: emptyDiff,
      validation: lateReturnValidation,
      aiSummary: "Đã cập nhật bản nháp.",
      saveEligibility: "PASS" as const,
    };

    const fetcher = (async () =>
      createSseResponse([
        { type: "data-trip-assistant-result", data: proposedPayload },
        { type: "finish" },
      ])) as typeof fetch;

    const outcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: preview.baseRevision, message: "Chuyển lịch sớm hơn" },
      { fetcher },
    );

    expect(outcome.kind).toBe("RESULT");
    if (outcome.kind === "RESULT" && outcome.result.status === "PROPOSED") {
      expect(outcome.result.validation.advisories).toEqual(lateReturnValidation.advisories);
    }
  });

  it("returns FAILED/AI_INVALID_RESPONSE (not INTERRUPTED) and warns field paths when result schema fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = (async () =>
      createSseResponse([
        { type: "text-delta", id: "t1", delta: "Lời tư vấn đã hiện đủ" },
        {
          type: "data-trip-assistant-result",
          data: {
            status: "ADVISED",
            intent: sampleIntent,
            advice: "Nội dung tư vấn",
            validation: { ...preview.validation, unexpectedField: "secret-should-not-log" },
            aiSummary: "Tóm tắt",
          },
        },
        { type: "finish" },
      ])) as typeof fetch;

    const outcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: preview.baseRevision, message: "Thử lại" },
      { fetcher },
    );

    expect(outcome).toEqual({
      kind: "FAILED",
      status: 502,
      code: "AI_INVALID_RESPONSE",
      message: "Phản hồi không hợp lệ, hãy thử lại.",
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = String(warnSpy.mock.calls[0]?.join(" "));
    expect(logged).toContain("validation");
    expect(logged).not.toContain("secret-should-not-log");
    warnSpy.mockRestore();
  });

  it("contract: accepts real edit-journey-server output for a late-return trip with overnightStays", async () => {
    const lateCandidate: EditCandidate = {
      startDate: "2026-12-20",
      durationDays: 2,
      transport: "MOTORCYCLE",
      days: [
        {
          dayIndex: 1,
          visits: [
            {
              visitId: "v-1",
              destinationId: "dest-meo-vac",
              startMinute: 780,
              plannedDurationMinutes: 90,
              order: 1,
            },
          ],
        },
        { dayIndex: 2, visits: [] },
      ],
      journey: {
        origin: {
          label: "Hà Nội",
          latitude: 21.0285,
          longitude: 105.8542,
          source: "MANUAL",
          confirmed: true,
        },
        departureMinute: 420,
        returnDeadlineMinute: 1080,
        returnDepartureMinute: 450,
      },
    };

    const destinations = new Map([
      [
        "dest-meo-vac",
        {
          id: "dest-meo-vac",
          latitude: 23.22,
          longitude: 105.41,
          minimumDurationMinutes: 60,
          openingDays: [],
        },
      ],
    ]);

    const evaluated = await evaluateEditJourney({
      candidate: lateCandidate,
      existingJourneySnapshot: null,
      tripStartDate: new Date("2026-12-20T00:00:00.000Z"),
      manuallyCompletedAt: null,
      destinations,
      legs: [],
      getRoute: async ({ origin, destination }) => {
        const isReturn = origin.latitude > 22.5 && destination.latitude < 22;
        return {
          kind: "ok",
          durationSeconds: isReturn ? 12 * 3600 : 5 * 3600,
          distanceMeters: isReturn ? 420_000 : 280_000,
          provider: "STADIA_MAPS",
        };
      },
      timeReference: new Date("2026-11-26T04:00:00.000Z"),
    });

    const mergedValidation = mergeJourneyValidation(
      preview.validation,
      evaluated.extraFindings,
      evaluated.advisories,
    );

    expect(mergedValidation.advisories?.some((a) => a.reasonCode === "RETURN_DEADLINE_MISSED")).toBe(true);
    expect(evaluated.journeySummary?.estimatedReturnArrivalMinute).toBeGreaterThan(1080);
    expect(evaluated.nextJourneySnapshot?.plan?.legs.some((leg) => leg.kind === "RETURN")).toBe(true);

    const previewResult: PreviewEditResult = {
      baseRevision: preview.baseRevision,
      candidate: lateCandidate,
      validation: mergedValidation,
      eligibleForConfirmation: true,
      journeySummary: evaluated.journeySummary,
      saveEligibility: "PASS",
    };

    const previewFetcher = (async () =>
      Response.json({ success: true, data: previewResult })) as typeof fetch;
    const previewOutcome = await previewTripEdit(
      "trip-1",
      { baseRevision: preview.baseRevision, candidate: lateCandidate },
      { fetcher: previewFetcher },
    );
    expect(previewOutcome).toEqual({ kind: "PREVIEWED", result: previewResult });

    const streamFetcher = (async () =>
      createSseResponse([
        {
          type: "data-trip-assistant-result",
          data: {
            status: "ADVISED",
            intent: sampleIntent,
            advice: "Ngày cuối về muộn, bạn có thể xuất phát sớm hơn.",
            validation: mergedValidation,
            aiSummary: "Đề xuất rút ngắn ngày về.",
            saveEligibility: "PASS",
            suggestions: [
              {
                id: "s-1",
                title: "Xuất phát 06:00 ngày cuối",
                summary: "Giảm mệt mỏi khi chạy về.",
                diffSummaryLines: ["Đổi giờ về sang 06:00"],
                candidate: lateCandidate,
                diff: emptyDiff,
                validation: mergedValidation,
                changedVisitIds: { added: [], updated: [], shifted: [], removedCount: 0 },
                journeySummary: evaluated.journeySummary,
                saveEligibility: "PASS",
              },
            ],
          },
        },
        { type: "finish" },
      ])) as typeof fetch;
    const streamOutcome = await streamAiTripEdit(
      "trip-1",
      { baseRevision: preview.baseRevision, message: "Ngày cuối vất quá" },
      { fetcher: streamFetcher },
    );
    expect(streamOutcome.kind).toBe("RESULT");
  });
});
