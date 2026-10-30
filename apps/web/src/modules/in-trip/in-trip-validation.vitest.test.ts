import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Database } from "@KLTN/db";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { createEditCandidate, type EditCandidate } from "../trip-edit/edit-candidate";
import { validateItinerary } from "../trip-validation/trip-validation";
import { previewInTripResponse } from "./in-trip-preview-http";
import { previewInTrip, type InTripPreviewDependencies, type InTripPreviewRequest } from "./in-trip-validation";

const baseRevision = "2026-10-17T00:00:00.000Z";
const now = new Date("2026-10-18T03:00:00.000Z"); // 10:00 in Vietnam

function tripFixture() {
  return {
    id: "trip-1",
    userId: "traveler-1",
    startDate: new Date("2026-10-18T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt: new Date(baseRevision),
    days: [{
      dayIndex: 1,
      localDate: new Date("2026-10-18T00:00:00.000Z"),
      visits: [
        { id: "completed-1", destinationId: "destination-a", order: 1, startMinute: 480, plannedDurationMinutes: 60 },
        { id: "remaining-1", destinationId: "destination-b", order: 2, startMinute: 660, plannedDurationMinutes: 60 },
      ],
    }],
  };
}

function candidate(): EditCandidate {
  return createEditCandidate(tripFixture());
}

function request(overrides: Partial<InTripPreviewRequest> = {}): InTripPreviewRequest {
  return {
    baseRevision,
    candidate: candidate(),
    location: {
      source: "MANUAL", latitude: 22.8, longitude: 104.9,
      accuracyMeters: null, capturedAt: "2026-10-18T02:59:00.000Z",
    },
    ...overrides,
  };
}

function harness(options: {
  trip?: ReturnType<typeof tripFixture> | null;
  eligibleIds?: string[];
  routeSeconds?: number | null;
  at?: Date;
  previewStatus?: "SATISFIED" | "VIOLATION" | "INSUFFICIENT_DATA";
  realPreview?: boolean;
} = {}) {
  const trip = options.trip === undefined ? tripFixture() : options.trip;
  let tripReads = 0;
  let previewCalls = 0;
  let routeCalls = 0;
  let writes = 0;
  const database = {
    trip: {
      findFirst: async (query: unknown) => {
        tripReads += 1;
        assert.deepEqual((query as { where: unknown }).where, { id: "trip-1", userId: "traveler-1" });
        return trip;
      },
      update: async () => { writes += 1; throw new Error("write was attempted"); },
    },
    destination: {
      findMany: async (query: unknown) => {
        const ids = ((query as { where: { id: { in: string[] } } }).where.id.in);
        return (options.eligibleIds ?? ids).map((id) => ({
          id, latitude: 22.9, longitude: 105.0,
          minimumDurationMinutes: 30,
          openingDays: [{ dayOfWeek: "SUNDAY", status: "OPEN", intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] }],
        }));
      },
      findFirst: async () => ({ latitude: 22.9, longitude: 105.0 }),
    },
    $transaction: async () => { writes += 1; throw new Error("transaction was attempted"); },
  } as unknown as Database;
  const dependencies: InTripPreviewDependencies = {
    database,
    now: () => options.at ?? now,
    routeTimeoutMs: 5,
    getRoute: async () => {
      routeCalls += 1;
      return options.routeSeconds === null
        ? new Promise<never>(() => {})
        : { kind: "ok", durationSeconds: options.routeSeconds ?? 600 };
    },
    preview: async (tripId, userId, revision, proposed, _service, timeReference) => {
      previewCalls += 1;
      expect([tripId, userId, revision]).toEqual(["trip-1", "traveler-1", baseRevision]);
      const validation = validateItinerary([], [], timeReference);
      if (options.previewStatus && options.previewStatus !== "SATISFIED") {
        validation.groups.openingHours.status = options.previewStatus;
        validation.groups.openingHours.findings = [{
          group: "openingHours", status: options.previewStatus,
          reasonCode: "FAKE_VALIDATOR_RESULT", message: "Fake Validator result.",
        }];
        validation.canConfirm = false;
      }
      return { baseRevision: revision, candidate: proposed, validation, eligibleForConfirmation: validation.canConfirm };
    },
  };
  if (options.realPreview) delete dependencies.preview;
  return {
    dependencies,
    tripReads: () => tripReads,
    previewCalls: () => previewCalls,
    routeCalls: () => routeCalls,
    writes: () => writes,
  };
}

function auth(role: "TRAVELER" | "ADMIN" | null): AuthorizationDependencies {
  return {
    database: {
      user: { findUnique: async ({ where }: { where: { id: string } }) =>
        role === null ? null : { id: where.id, role } },
    } as unknown as Database,
    resolveSession: async () => role === null ? null : { user: { id: "traveler-1", role } },
  };
}

function post(body: unknown): Request {
  return new Request("https://app.example/api/trips/trip-1/in-trip/preview", {
    method: "POST",
    headers: { origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function payload(response: Response): Promise<{ success: boolean; data?: unknown; error?: { code: string } }> {
  return response.json();
}

describe("US-37 Task 293 In-trip preview", () => {
  it("returns four groups, server checkedAt and server-classified completed IDs without writes", async () => {
    const f = harness();
    const result = await previewInTrip("trip-1", "traveler-1", request(), f.dependencies);
    expect(result.completedVisitIds).toEqual(["completed-1"]);
    expect(result.checkedAt).toBe(now.toISOString());
    expect(Object.keys(result.validation.groups)).toEqual([
      "openingHours", "minimumDuration", "travelTime", "scheduleConflict",
    ]);
    expect(result.validation.canConfirm).toBe(true);
    expect(f.previewCalls()).toBe(1);
    expect(f.routeCalls()).toBe(1);
    expect(f.writes()).toBe(0);
  });

  it("runs the real US-32 previewEdit and four-group Validator with fake database and route", async () => {
    const f = harness({ realPreview: true });
    const result = await previewInTrip("trip-1", "traveler-1", request(), f.dependencies);
    expect(result.validation.canConfirm).toBe(true);
    expect(Object.values(result.validation.groups).map((group) => group.status))
      .toEqual(["SATISFIED", "SATISFIED", "SATISFIED", "SATISFIED"]);
    expect(f.tripReads()).toBe(2);
    expect(f.routeCalls()).toBe(2); // origin-to-first-remaining and the shared adjacent leg
    expect(f.writes()).toBe(0);
  });

  it("preserves VIOLATION and INSUFFICIENT_DATA from the shared Validator", async () => {
    for (const status of ["VIOLATION", "INSUFFICIENT_DATA"] as const) {
      const f = harness({ previewStatus: status });
      const result = await previewInTrip("trip-1", "traveler-1", request(), f.dependencies);
      expect(result.validation.groups.openingHours.status).toBe(status);
      expect(result.validation.canConfirm).toBe(false);
      expect(f.writes()).toBe(0);
    }
  });

  it("maps a routing timeout to INSUFFICIENT_DATA, never PASS", async () => {
    const f = harness({ routeSeconds: null });
    const result = await previewInTrip("trip-1", "traveler-1", request(), f.dependencies);
    expect(result.validation.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
    expect(result.validation.canConfirm).toBe(false);
    expect(f.previewCalls()).toBe(1);
  });

  it("rejects a changed completed visit before route lookup or Validator", async () => {
    const f = harness();
    const changed = candidate();
    changed.days[0]!.visits[0]!.startMinute = 481;
    await expect(previewInTrip("trip-1", "traveler-1", request({ candidate: changed }), f.dependencies))
      .rejects.toMatchObject({ code: "COMPLETED_VISIT_CHANGED", status: 422 });
    expect(f.routeCalls()).toBe(0);
    expect(f.previewCalls()).toBe(0);
  });

  it("rejects hidden destinations and an endpoint that is not the final remaining visit", async () => {
    const hidden = harness({ eligibleIds: ["destination-a"] });
    await expect(previewInTrip("trip-1", "traveler-1", request(), hidden.dependencies))
      .rejects.toMatchObject({ code: "DESTINATION_UNAVAILABLE", status: 422 });
    expect(hidden.previewCalls()).toBe(0);

    const wrongEndpoint = harness();
    await expect(previewInTrip("trip-1", "traveler-1", request({
      mandatoryEndpoint: { destinationId: "destination-a", deadline: "11:30" },
    }), wrongEndpoint.dependencies)).rejects.toMatchObject({ code: "MANDATORY_ENDPOINT_MISMATCH" });
    expect(wrongEndpoint.previewCalls()).toBe(0);
  });

  it("rejects an expired endpoint deadline in the Validator result", async () => {
    const f = harness();
    const result = await previewInTrip("trip-1", "traveler-1", request({
      mandatoryEndpoint: { destinationId: "destination-b", deadline: "09:00" },
    }), f.dependencies);
    expect(result.validation.groups.travelTime.status).toBe("VIOLATION");
    expect(result.validation.canConfirm).toBe(false);
  });

  it("returns owner-masked 404 and revision 409 before routing", async () => {
    const absent = harness({ trip: null });
    await expect(previewInTrip("trip-1", "traveler-1", request(), absent.dependencies))
      .rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });
    expect(absent.routeCalls()).toBe(0);

    const stale = harness();
    await expect(previewInTrip("trip-1", "traveler-1", request({
      baseRevision: "2026-10-16T00:00:00.000Z",
    }), stale.dependencies)).rejects.toMatchObject({ code: "TRIP_REVISION_CONFLICT", status: 409 });
    expect(stale.routeCalls()).toBe(0);
  });

  it("rejects a mismatched candidate and a trip with no remaining visit", async () => {
    const mismatched = harness();
    const changed = candidate();
    changed.startDate = "2026-10-19";
    await expect(previewInTrip("trip-1", "traveler-1", request({ candidate: changed }), mismatched.dependencies))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(mismatched.routeCalls()).toBe(0);

    const completed = harness({ at: new Date("2026-10-19T00:00:00.000Z") });
    await expect(previewInTrip("trip-1", "traveler-1", request(), completed.dependencies))
      .rejects.toMatchObject({ code: "ALL_COMPLETED", status: 422 });
    expect(completed.previewCalls()).toBe(0);
    expect(completed.routeCalls()).toBe(0);
  });

  it("authenticates guests before reading body and refuses a client-provided now", async () => {
    for (const [role, status, code] of [[null, 401, "UNAUTHENTICATED"]] as const) {
      let bodyReads = 0;
      const f = harness();
      const response = await previewInTripResponse(post({ invalid: true }), "trip-1", {
        authorization: auth(role), service: f.dependencies, onBodyRead: () => { bodyReads += 1; },
      });
      expect(response.status).toBe(status);
      expect((await payload(response)).error?.code).toBe(code);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(bodyReads).toBe(0);
      expect(f.tripReads()).toBe(0);
    }

    let adminBodyReads = 0;
    const admin = harness();
    const adminResponse = await previewInTripResponse(post({ invalid: true }), "trip-1", {
      authorization: auth("ADMIN"), service: admin.dependencies, onBodyRead: () => { adminBodyReads += 1; },
    });
    expect(adminResponse.status).toBe(400);
    expect(adminBodyReads).toBe(1);
    expect(admin.tripReads()).toBe(0);

    const f = harness();
    const response = await previewInTripResponse(post({
      ...request(), now: "2026-10-19T00:00:00.000Z",
    }), "trip-1", { authorization: auth("TRAVELER"), service: f.dependencies });
    expect(response.status).toBe(400);
    expect((await payload(response)).error?.code).toBe("VALIDATION_ERROR");
    expect(f.tripReads()).toBe(0);
  });

  it("keeps the preview route and service free of write-path imports and location logging", async () => {
    const sources = await Promise.all([
      "../../app/api/trips/[id]/in-trip/preview/route.ts",
      "./in-trip-preview-http.ts",
      "./in-trip-validation.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
    const source = sources.join("\n");
    expect(source).not.toMatch(/apply-edit|applyEdit|executeIdempotentWrite|\$transaction/u);
    expect(source).not.toMatch(/database\.(?:create|update|delete|upsert)/u);
    expect(source).not.toMatch(/console\.(?:log|info|warn|error)|localStorage|sessionStorage|document\.cookie/u);
  });
});
