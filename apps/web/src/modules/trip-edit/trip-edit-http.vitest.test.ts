import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import type { EditCandidate } from "./edit-candidate";
import type { TripEditPreviewHttpDependencies } from "./trip-edit-http";
import { previewEditResponse } from "./trip-edit-http";

const candidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{ dayIndex: 1, visits: [] }],
};

function fixture() {
  let role = "TRAVELER";
  let sessionExists = true;
  let bodyRead = false;
  let serviceCalls = 0;
  const database = {
    user: { findUnique: async () => ({ id: "actor-1", role }) },
    trip: { findFirst: async () => { serviceCalls += 1; return null; } },
    destination: { findMany: async () => [] },
  };
  const dependencies: TripEditPreviewHttpDependencies = {
    authorization: {
      database: database as unknown as Pick<Database, "user">,
      resolveSession: async () => sessionExists
        ? { user: { id: "actor-1", role } }
        : null,
    },
    service: {
      database: database as unknown as Database,
      getRoute: async () => ({ kind: "unavailable" }),
    },
    now: () => new Date("2026-10-16T10:00:00.000Z"),
    onBodyRead: () => { bodyRead = true; },
  };
  return {
    dependencies,
    setRole: (value: string) => { role = value; },
    removeSession: () => { sessionExists = false; },
    get bodyRead() { return bodyRead; },
    get serviceCalls() { return serviceCalls; },
  };
}

function postRequest(body: string): Request {
  return new Request("https://example.test/api/trips/trip-1/edits/preview", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
    },
    body,
  });
}

describe("previewEditResponse", () => {
  it("authenticates before reading a malformed request body", async () => {
    const test = fixture();
    test.removeSession();

    const response = await previewEditResponse(postRequest("{"), "trip-1", test.dependencies);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHENTICATED");
    expect(test.bodyRead).toBe(false);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("accepts Admin capability and validates the body before calling the service", async () => {
    const test = fixture();
    test.setRole("ADMIN");

    const response = await previewEditResponse(postRequest("{"), "trip-1", test.dependencies);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(test.bodyRead).toBe(true);
    expect(test.serviceCalls).toBe(0);
  });

  it("rejects a strict-schema body and does not call the preview service", async () => {
    const test = fixture();
    const response = await previewEditResponse(
      postRequest(JSON.stringify({
        baseRevision: "2026-10-15T12:00:00.000Z",
        candidate,
        validatorPassed: true,
      })),
      "trip-1",
      test.dependencies,
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(test.bodyRead).toBe(true);
    expect(test.serviceCalls).toBe(0);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("maps a valid strict request into the owned preview service", async () => {
    const test = fixture();
    const response = await previewEditResponse(
      postRequest(JSON.stringify({
        baseRevision: "2026-10-15T12:00:00.000Z",
        candidate,
      })),
      "trip-1",
      test.dependencies,
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("TRIP_NOT_FOUND");
    expect(test.bodyRead).toBe(true);
    expect(test.serviceCalls).toBe(1);
  });
});
