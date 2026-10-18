import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditCandidate } from "@/modules/trip-edit/edit-candidate";
import type { PreviewEditResult } from "@/modules/trip-edit/trip-edit-service";
import { applyTripEdit, previewTripEdit } from "./trip-edit-client";

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
