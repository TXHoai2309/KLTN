import { describe, expect, it, vi } from "vitest";
import { createQaCleanupHandler } from "./qa-cleanup";

const secret = "synthetic-test-cron-secret-32-chars";
describe("QA cleanup authenticated bounded runner", () => {
  it("fails closed for disabled scheduler and missing/weak/incorrect credentials without database access", async () => {
    const cleanup = vi.fn();
    for (const [enabled, configured, actual, status] of [
      [false, secret, secret, 503], [true, undefined, secret, 401], [true, "short", "short", 401],
      [true, secret, "wrong", 401], [true, secret, "x".repeat(2048), 401],
    ] as const) {
      const response = await createQaCleanupHandler({ enabled: () => enabled, secret: () => configured, cleanup })(new Request("https://fixture.invalid/api/internal/qa-cleanup", { headers: { authorization: `Bearer ${actual}` } }));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("returns only batch progress for authenticated scheduler", async () => {
    const cleanup = vi.fn(async () => ({ processed: 25, hasMore: true, lockAcquired: true, lastSuccessfulSweep: "2026-10-11T12:00:00.000Z", eligibleBacklogCount: 25, oldestOverdueItem: "2026-10-10T12:00:00.000Z", failureCount: 1 }));
    const response = await createQaCleanupHandler({ enabled: () => true, secret: () => secret, cleanup })(new Request("https://fixture.invalid/api/internal/qa-cleanup", { headers: { authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual(await cleanup.mock.results[0]!.value);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it("returns accepted progress without overlapping an active run", async () => {
    const cleanup = vi.fn(async () => ({ processed: 0, hasMore: true, lockAcquired: false, lastSuccessfulSweep: null, eligibleBacklogCount: 3, oldestOverdueItem: "2026-10-10T12:00:00.000Z", failureCount: 0 }));
    const response = await createQaCleanupHandler({ enabled: () => true, secret: () => secret, cleanup })(new Request("https://fixture.invalid/api/internal/qa-cleanup", { headers: { authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(202);
  });
  it("reports cleanup failure without disclosing private content", async () => {
    const response = await createQaCleanupHandler({ enabled: () => true, secret: () => secret, cleanup: async () => { throw new Error("private conversation content"); } })(new Request("https://fixture.invalid", { headers: { authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("private");
  });
});
