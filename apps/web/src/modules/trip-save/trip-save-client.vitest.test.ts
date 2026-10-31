import { describe, expect, it } from "vitest";

import { validateItinerary } from "../trip-validation/trip-validation";
import { requestTripValidation, submitTripSave } from "./trip-save-client";

const proposal = { startDate: "2026-10-20", durationDays: 1, transport: "CAR" as const, days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }] };
const validation = validateItinerary([], [], new Date("2026-10-15T00:00:00.000Z"));
const fakeFetch = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("US-30 client save outcomes", () => {
  it("requests a read-only four-group preview and distinguishes technical failure", async () => {
    let sent: RequestInit | undefined;
    const ok = await requestTripValidation(proposal, undefined, async (_url, init) => {
      sent = init;
      return new Response(JSON.stringify({ success: true, data: { validation } }), { status: 200 });
    });
    expect(ok).toMatchObject({ ok: true, validation: { canConfirm: true } });
    expect(JSON.parse(sent?.body as string)).toEqual({ proposal });
    expect((await requestTripValidation(proposal, undefined, async () => { throw new Error("network"); })).ok).toBe(false);
  });
  it("only claims saved after a valid SUCCESS response", async () => {
    expect(await submitTripSave(proposal, "stable-key", undefined, fakeFetch({ success: true, operationStatus: "SUCCESS", data: { tripId: "trip-1", validation } }))).toMatchObject({ status: "SUCCESS", tripId: "trip-1" });
    expect((await submitTripSave(proposal, "stable-key", undefined, fakeFetch({ success: true, operationStatus: "SUCCESS", data: {} }))).status).toBe("UNKNOWN");
  });
  it("keeps FAILED and UNKNOWN distinct from success", async () => {
    expect(await submitTripSave(proposal, "stable-key", undefined, fakeFetch({ success: false, operationStatus: "FAILED", error: { code: "TRIP_VALIDATION_FAILED", message: "Chưa hợp lệ", details: { validation: { ...validation, canConfirm: false } } } }, 422))).toMatchObject({ status: "FAILED", validation: { canConfirm: false } });
    expect((await submitTripSave(proposal, "stable-key", undefined, fakeFetch({ success: false, operationStatus: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Unknown" } }, 503))).status).toBe("UNKNOWN");
    expect(await submitTripSave(proposal, "stable-key", undefined, async () => { throw new Error("lost response"); })).toEqual({
      status: "UNKNOWN",
      message: "Chưa xác định được kết quả lưu. Yêu cầu có thể đã được xử lý. Hãy kiểm tra lại trước khi tiếp tục để tránh lưu trùng.",
    });
  });
  it("sends explicit confirmation, the same proposal and supplied idempotency key", async () => {
    let sent: RequestInit | undefined;
    await submitTripSave(proposal, "stable-key", undefined, async (_url, init) => {
      sent = init;
      return new Response(JSON.stringify({ success: false, operationStatus: "FAILED", error: { code: "X", message: "X" } }), { status: 400 });
    });
    expect((sent?.headers as Record<string, string>)["Idempotency-Key"]).toBe("stable-key");
    expect(JSON.parse(sent?.body as string)).toEqual({ confirm: true, proposal });
  });
});
