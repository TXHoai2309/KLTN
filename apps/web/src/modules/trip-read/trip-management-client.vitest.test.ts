import { describe, it, expect, vi, afterEach } from "vitest";
import { changeTrip, applyTripChange } from "./trip-management-client";
const item = { id: "a", status: "ONGOING", manuallyCompletedAt: null } as any;
afterEach(() => vi.unstubAllGlobals());
describe("Trip management confirmed UI data", () => {
 it("FAILED and UNKNOWN keep list and groups unchanged", () => {
  const items = [item];
  expect(applyTripChange(items, { status: "FAILED", error: { code: "FAIL", message: "Lỗi" } })).toBe(items);
  expect(applyTripChange(items, { status: "UNKNOWN", error: { code: "UNKNOWN", message: "Chưa rõ" }, retryWithSameKey: true })).toBe(items);
 });
 it("SUCCESS removes only deleted trip or moves confirmed completion group", () => {
  expect(applyTripChange([item, { ...item, id: "b" }], { status: "SUCCESS", data: { tripId: "a", deleted: true } }).map(t => t.id)).toEqual(["b"]);
  const result = applyTripChange([item], { status: "SUCCESS", data: { tripId: "a", status: "COMPLETED", endDate: "2026-10-22", manuallyCompletedAt: "2026-10-20T04:00:00Z" } });
  expect(result.filter(t => t.status === "COMPLETED")).toHaveLength(1); expect(result.filter(t => t.status === "ONGOING")).toHaveLength(0);
 });
 it("reconciliation repeats same method/payload/key; malformed SUCCESS stays UNKNOWN", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ success: true, operationStatus: "SUCCESS", data: {} })).mockResolvedValueOnce(Response.json({ success: true, operationStatus: "SUCCESS", data: { tripId: "a", deleted: true } }));
  vi.stubGlobal("fetch", fetcher);
  expect(await changeTrip("a", "delete", "same-key")).toMatchObject({ status: "UNKNOWN" });
  expect(await changeTrip("a", "delete", "same-key")).toMatchObject({ status: "SUCCESS" });
  expect(fetcher.mock.calls[0][0]).toBe("/api/trips/a"); expect(fetcher.mock.calls[0][1].method).toBe("DELETE");
  expect(fetcher.mock.calls[0][1].headers.get("Idempotency-Key")).toBe("same-key"); expect(fetcher.mock.calls[1][1].headers.get("Idempotency-Key")).toBe("same-key");
 });
 it("completion requests explicit bool and rejects mismatched response identity", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, operationStatus: "SUCCESS", data: { tripId: "other", status: "COMPLETED", manuallyCompletedAt: "2026-10-20T04:00:00Z", endDate: "2026-10-22" } })); vi.stubGlobal("fetch", fetcher);
  expect(await changeTrip("a", true, "key")).toMatchObject({ status: "UNKNOWN" });
  expect(fetcher.mock.calls[0][0]).toBe("/api/trips/a/completion"); expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ completed: true });
 });
});
