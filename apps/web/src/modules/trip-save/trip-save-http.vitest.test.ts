import { describe, expect, it } from "vitest";

import { previewTripValidationResponse, saveTripResponse } from "./trip-save-http";
import type { TripSaveDependencies } from "./trip-save-service";

const unreachable = {} as TripSaveDependencies;
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://example.test/api/trips", {
  method: "POST", body: JSON.stringify(body),
  headers: { origin: "https://example.test", "content-type": "application/json", "Idempotency-Key": "key-1", ...headers },
});

describe("US-30 save HTTP boundary", () => {
  it("keeps the read-only validation preview separate from the save mutation", async () => {
    const response = await previewTripValidationResponse(request({ proposal: {} }), unreachable);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_TRIP_INPUT" } });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("rejects missing confirmation and client-owned flags through the shared FAILED envelope", async () => {
    for (const body of [{ proposal: {} }, { confirm: true, ownerId: "attacker", proposal: {} }, { confirm: true, validatorPassed: true, proposal: {} }]) {
      const response = await saveTripResponse(request(body), unreachable);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ success: false, operationStatus: "FAILED", error: { code: "INVALID_TRIP_INPUT" } });
    }
  });
  it("rejects cross-origin writes and missing idempotency key", async () => {
    expect((await saveTripResponse(request({}, { origin: "https://other.test" }), unreachable)).status).toBe(403);
    expect((await saveTripResponse(request({}, { "Idempotency-Key": "" }), unreachable)).status).toBe(400);
  });
});
