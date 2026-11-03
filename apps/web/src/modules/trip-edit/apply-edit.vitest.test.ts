import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { applyEdit, type ApplyEditDependencies, type ApplyEditRequest } from "./apply-edit";
import type { EditCandidate } from "./edit-candidate";
import { applyEditResponse, type TripEditApplyHttpDependencies } from "./trip-edit-http";
import { previewInTrip } from "../in-trip/in-trip-validation";

const oldRevision = new Date("2026-10-15T12:00:00.000Z");
const timeReference = new Date("2026-10-16T10:00:00.000Z");
const headers = new Headers();

const candidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{
    dayIndex: 1,
    visits: [{
      visitId: "visit-original",
      destinationId: "destination-1",
      startMinute: 500,
      plannedDurationMinutes: 60,
      order: 1,
    }],
  }],
};

const request = (
  kind: ApplyEditRequest["kind"] = "MANUAL",
  value = candidate,
  mandatoryEndpoint: { destinationId: "destination-1", deadline: "08:30" } | null = null,
): ApplyEditRequest => ({
  baseRevision: oldRevision.toISOString(),
  candidate: value,
  confirmed: true,
  kind,
  ...(kind === "IN_TRIP" ? {
    location: {
      source: "MANUAL" as const,
      latitude: 23.12345,
      longitude: 105.98765,
      accuracyMeters: null,
      capturedAt: "2026-10-20T00:00:00.000Z",
    },
    mandatoryEndpoint,
  } : {}),
});

function fixture() {
  let role = "TRAVELER";
  let sessionExists = true;
  let tripExists = true;
  let trip = {
    id: "trip-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR",
    updatedAt: oldRevision,
    days: [{
      id: "day-old",
      tripId: "trip-1",
      dayIndex: 1,
      localDate: new Date("2026-10-20T00:00:00.000Z"),
      visits: [{
        id: "visit-original",
        destinationId: "destination-1",
        startMinute: 480,
        plannedDurationMinutes: 60,
        order: 1,
      }],
    }],
  };
  let destinations = [{
    id: "destination-1",
    visibility: "VISIBLE" as "VISIBLE" | "HIDDEN",
    latitude: 23,
    longitude: 105,
    minimumDurationMinutes: 30 as number | null,
    openingDays: [{
      dayOfWeek: "TUESDAY",
      status: "OPEN" as "OPEN" | "UNKNOWN",
      intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
    }],
  }];
  let failCreateDay = false;
  const records = new Map<string, { requestHash: string; responseJson: string }>();
  let destinationReads = 0;
  let transactionCount = 0;

  const findRecord = (scope: string, key: string) => records.get(JSON.stringify([scope, key])) ?? null;
  const database = {
    user: { findUnique: async () => ({ id: "owner-1", role }) },
    trip: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        tripExists && trip.id === where.id && trip.userId === where.userId ? structuredClone(trip) : null,
    },
    destination: {
      findFirst: async ({ where }: { where: { id: string; visibility: string } }) => {
        const destination = destinations.find((row) => row.id === where.id && row.visibility === where.visibility);
        return destination ? { latitude: destination.latitude, longitude: destination.longitude } : null;
      },
      findMany: async ({ where }: { where: { id: { in: string[] }; visibility: string } }) => {
        destinationReads += 1;
        return structuredClone(destinations.filter((row) =>
          where.id.in.includes(row.id) && row.visibility === where.visibility,
        ));
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) =>
        findRecord(where.scope_key.scope, where.scope_key.key),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      transactionCount += 1;
      const pendingTrip = structuredClone(trip);
      const pendingRecords = new Map(records);
      const tx = {
        user: { findUnique: async () => ({ id: "owner-1", role }) },
        trip: {
          findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
            tripExists && pendingTrip.id === where.id && pendingTrip.userId === where.userId
              ? structuredClone(pendingTrip)
              : null,
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; userId: string; updatedAt: Date };
            data: { updatedAt: Date };
          }) => {
            if (
              pendingTrip.id !== where.id ||
              pendingTrip.userId !== where.userId ||
              pendingTrip.updatedAt.getTime() !== where.updatedAt.getTime()
            ) return { count: 0 };
            pendingTrip.updatedAt = data.updatedAt;
            return { count: 1 };
          },
        },
        $queryRaw: async () => [],
        tripCompanionPublication: { findUnique: async () => null },
        itineraryDay: {
          deleteMany: async () => {
            const count = pendingTrip.days.length;
            pendingTrip.days = [];
            return { count };
          },
          create: async ({ data }: { data: {
            tripId: string;
            dayIndex: number;
            localDate: Date;
            visits: { create: { id: string; destinationId: string; startMinute: number; plannedDurationMinutes: number; order: number }[] };
          } }) => {
            if (failCreateDay) throw new Error("injected failure after CAS");
            const created = {
              id: `day-${pendingTrip.days.length + 1}`,
              ...data,
              visits: structuredClone(data.visits.create),
            };
            pendingTrip.days.push(created);
            return created;
          },
        },
        idempotencyRecord: {
          create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
            const recordKey = JSON.stringify([data.scope, data.key]);
            if (pendingRecords.has(recordKey)) throw new Error("duplicate idempotency key");
            pendingRecords.set(recordKey, { requestHash: data.requestHash, responseJson: data.responseJson });
          },
          update: async ({
            where,
            data,
          }: {
            where: { scope_key: { scope: string; key: string } };
            data: { responseJson: string };
          }) => {
            const recordKey = JSON.stringify([where.scope_key.scope, where.scope_key.key]);
            const record = pendingRecords.get(recordKey)!;
            record.responseJson = data.responseJson;
          },
        },
      };
      const result = await callback(tx);
      trip = pendingTrip;
      records.clear();
      for (const [key, value] of pendingRecords) records.set(key, value);
      return result;
    },
  };

  const dependencies: ApplyEditDependencies = {
    database: database as unknown as Database,
    authorization: {
      database: database as unknown as Pick<Database, "user">,
      resolveSession: async () => sessionExists ? ({ user: { id: "owner-1", role } }) : null,
    },
    getRoute: async () => ({ kind: "ok", durationSeconds: 0 }),
  };

  return {
    dependencies,
    get trip() { return structuredClone(trip); },
    get records() { return [...records.values()]; },
    get destinationReads() { return destinationReads; },
    get transactionCount() { return transactionCount; },
    setRole: (value: string) => { role = value; },
    removeSession: () => { sessionExists = false; },
    removeTrip: () => { tripExists = false; },
    makeViolation: () => { destinations[0]!.minimumDurationMinutes = 90; },
    makeInsufficient: () => { destinations[0]!.openingDays[0]!.status = "UNKNOWN"; },
    failMidway: () => { failCreateDay = true; },
  };
}

describe("applyEdit", () => {
  it("revalidates and commits the replacement itinerary with an incremented updatedAt token", async () => {
    const test = fixture();
    const outcome = await applyEdit(
      headers,
      "trip-1",
      "owner-1",
      request(),
      "apply-1",
      test.dependencies,
      timeReference,
    );

    expect(outcome).toMatchObject({
      status: "SUCCESS",
      data: {
        tripId: "trip-1",
        kind: "MANUAL",
        validation: { canConfirm: true },
      },
    });
    expect(test.trip.updatedAt.getTime()).toBeGreaterThan(oldRevision.getTime());
    expect(test.trip.days).toHaveLength(1);
    expect(test.trip.days[0]!.visits).toEqual([{
      id: "visit-original",
      destinationId: "destination-1",
      startMinute: 500,
      plannedDurationMinutes: 60,
      order: 1,
    }]);
    expect(test.records).toHaveLength(1);
  });

  it("rechecks In-trip validation at apply time and keeps location out of idempotency data", async () => {
    const test = fixture();
    const atDeadlineCandidate: EditCandidate = {
      ...candidate,
      days: [{
        dayIndex: 1,
        visits: [{ ...candidate.days[0]!.visits[0]!, startMinute: 510 }],
      }],
    };
    const inTripRequest = request("IN_TRIP", atDeadlineCandidate);
    const serverNow = vi.fn(() => new Date("2026-10-20T01:00:00.000Z"));
    const outcome = await applyEdit(
      headers, "trip-1", "owner-1", inTripRequest, "in-trip-pass", test.dependencies,
      serverNow,
    );
    expect(outcome).toMatchObject({ status: "SUCCESS", data: { kind: "IN_TRIP", validation: { canConfirm: true } } });
    expect(JSON.stringify(test.records)).not.toContain("23.12345");
    expect(JSON.stringify(test.records)).not.toContain("105.98765");
    expect(test.transactionCount).toBe(1);
    expect(serverNow).toHaveBeenCalledOnce();

    const replay = await applyEdit(
      headers,
      "trip-1",
      "owner-1",
      { ...inTripRequest, location: { ...inTripRequest.location!, latitude: 22.45678, longitude: 104.87654 } },
      "in-trip-pass",
      test.dependencies,
      serverNow,
    );
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(test.transactionCount).toBe(1);
    expect(JSON.stringify(test.records)).not.toContain("22.45678");
    expect(JSON.stringify(test.records)).not.toContain("104.87654");
  });

  it("rejects an endpoint deadline just missed before entering the write transaction", async () => {
    const test = fixture();
    await expect(applyEdit(
      headers, "trip-1", "owner-1", request("IN_TRIP", candidate, { destinationId: "destination-1", deadline: "08:30" }),
      "in-trip-late", test.dependencies, new Date("2026-10-20T01:30:01.000Z"),
    )).rejects.toMatchObject({
      code: "IN_TRIP_VALIDATION_CHANGED", status: 422,
      details: { checkedAt: "2026-10-20T01:30:01.000Z", validation: { canConfirm: false } },
    });
    expect(test.transactionCount).toBe(0);
    expect(test.records).toHaveLength(0);
  });

  it("rejects a visit that crossed its scheduled end between preview and apply", async () => {
    const test = fixture();
    const changed = { ...candidate, days: [{
      dayIndex: 1,
      visits: [{ ...candidate.days[0]!.visits[0]!, startMinute: 500 }],
    }] };
    const inTripRequest = request("IN_TRIP", changed, null);
    const preview = await previewInTrip("trip-1", "owner-1", {
      baseRevision: inTripRequest.baseRevision,
      candidate: inTripRequest.candidate,
      location: inTripRequest.location!,
      mandatoryEndpoint: null,
    }, {
      database: test.dependencies.database,
      getRoute: test.dependencies.getRoute,
      now: () => new Date("2026-10-20T00:00:00.000Z"),
    });
    expect(preview.validation.canConfirm).toBe(true);

    await expect(applyEdit(
      headers, "trip-1", "owner-1", inTripRequest, "in-trip-completed", test.dependencies,
      new Date("2026-10-20T02:00:00.000Z"),
    )).rejects.toMatchObject({ code: "COMPLETED_VISIT_CHANGED", status: 422 });
    expect(test.transactionCount).toBe(0);
    expect(test.records).toHaveLength(0);
  });

  it("rejects In-trip apply when the fresh route is unavailable", async () => {
    const test = fixture();
    test.dependencies.getRoute = async () => ({ kind: "unavailable" });
    await expect(applyEdit(
      headers, "trip-1", "owner-1", request("IN_TRIP", candidate, null), "in-trip-timeout", test.dependencies,
      new Date("2026-10-20T00:00:00.000Z"),
    )).rejects.toMatchObject({
      code: "IN_TRIP_VALIDATION_CHANGED", status: 422,
      details: { validation: { canConfirm: false, groups: { travelTime: { status: "INSUFFICIENT_DATA" } } } },
    });
    expect(test.transactionCount).toBe(0);
    expect(test.records).toHaveLength(0);
  });

  it.each([
    ["VIOLATION", (test: ReturnType<typeof fixture>) => test.makeViolation()],
    ["INSUFFICIENT_DATA", (test: ReturnType<typeof fixture>) => test.makeInsufficient()],
  ])("does not write In-trip candidates when fresh validation is %s", async (_status, configure) => {
    const test = fixture();
    configure(test);
    await expect(applyEdit(
      headers,
      "trip-1",
      "owner-1",
      request("IN_TRIP", candidate, null),
      "in-trip-blocked",
      test.dependencies,
      new Date("2026-10-20T00:00:00.000Z"),
    )).rejects.toMatchObject({
      code: "IN_TRIP_VALIDATION_CHANGED",
      status: 422,
      details: {
        checkedAt: "2026-10-20T00:00:00.000Z",
        validation: { canConfirm: false, groups: expect.any(Object) },
      },
    });
    expect(test.transactionCount).toBe(0);
    expect(test.records).toHaveLength(0);
    expect(test.trip.days[0]!.visits[0]!.startMinute).toBe(480);
  });

  it("replays the committed response before stale revision or Validator work", async () => {
    const test = fixture();
    const first = await applyEdit(headers, "trip-1", "owner-1", request(), "same-key", test.dependencies, timeReference);
    const readsAfterCommit = test.destinationReads;
    const replay = await applyEdit(headers, "trip-1", "owner-1", request(), "same-key", test.dependencies, timeReference);

    expect(first.status).toBe("SUCCESS");
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true, data: first.status === "SUCCESS" ? first.data : undefined });
    expect(test.destinationReads).toBe(readsAfterCommit);
    expect(test.transactionCount).toBe(1);
  });

  it("returns 409 when the same key is reused for a different payload", async () => {
    const test = fixture();
    await applyEdit(headers, "trip-1", "owner-1", request("IN_TRIP", candidate, null), "same-key", test.dependencies, timeReference);
    const changed = { ...candidate, days: [{
      dayIndex: 1,
      visits: [{ ...candidate.days[0]!.visits[0]!, startMinute: 510 }],
    }] };
    const outcome = await applyEdit(headers, "trip-1", "owner-1", request("IN_TRIP", changed, null), "same-key", test.dependencies, timeReference);

    expect(outcome).toMatchObject({ status: "FAILED", httpStatus: 409, error: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(test.transactionCount).toBe(1);
  });

  it("rejects a stale baseRevision before validation or write", async () => {
    const test = fixture();
    await expect(applyEdit(
      headers,
      "trip-1",
      "owner-1",
      { ...request("IN_TRIP", candidate, null), baseRevision: "2026-10-14T12:00:00.000Z" },
      "stale",
      test.dependencies,
      timeReference,
    )).rejects.toMatchObject({ code: "TRIP_REVISION_CONFLICT", status: 409 });
    expect(test.destinationReads).toBe(0);
    expect(test.transactionCount).toBe(0);
    expect(test.records).toHaveLength(0);
  });

  it("rejects an empty candidate using the existing trip-save contract", async () => {
    const test = fixture();
    const emptyCandidate: EditCandidate = {
      ...candidate,
      days: [{ dayIndex: 1, visits: [] }],
    };

    await expect(applyEdit(
      headers,
      "trip-1",
      "owner-1",
      request("MANUAL", emptyCandidate),
      "empty",
      test.dependencies,
      timeReference,
    )).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(test.destinationReads).toBe(0);
    expect(test.transactionCount).toBe(0);
    expect(test.trip.days[0]!.visits[0]!.startMinute).toBe(480);
  });

  it.each([
    ["VIOLATION", (test: ReturnType<typeof fixture>) => test.makeViolation()],
    ["INSUFFICIENT_DATA", (test: ReturnType<typeof fixture>) => test.makeInsufficient()],
  ])("does not write when Validator returns %s", async (_status, configure) => {
    const test = fixture();
    configure(test);
    await expect(applyEdit(headers, "trip-1", "owner-1", request(), "blocked", test.dependencies, timeReference))
      .rejects.toMatchObject({
        code: "TRIP_VALIDATION_FAILED",
        status: 422,
        details: { validation: { canConfirm: false, groups: expect.any(Object) } },
      });
    expect(test.trip.updatedAt).toEqual(oldRevision);
    expect(test.trip.days[0]!.visits[0]!.startMinute).toBe(480);
    expect(test.transactionCount).toBe(0);
    expect(test.records).toHaveLength(0);
  });

  it("returns the same 404 for a foreign-owned or missing Trip", async () => {
    const foreign = fixture();
    await expect(applyEdit(headers, "trip-1", "other-user", request(), "foreign", foreign.dependencies, timeReference))
      .rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });

    const missing = fixture();
    missing.removeTrip();
    await expect(applyEdit(headers, "trip-1", "owner-1", request(), "missing", missing.dependencies, timeReference))
      .rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });
  });

  it("returns UNKNOWN and rolls back data and success record after a mid-transaction failure", async () => {
    const test = fixture();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      test.failMidway();
      const outcome = await applyEdit(headers, "trip-1", "owner-1", request("IN_TRIP", candidate, null), "unknown", test.dependencies, new Date("2026-10-20T00:00:00.000Z"));

      expect(outcome).toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
      expect(test.trip.updatedAt).toEqual(oldRevision);
      expect(test.trip.days[0]!.visits[0]!.startMinute).toBe(480);
      expect(test.records).toHaveLength(0);
    } finally {
      log.mockRestore();
    }
  });
});

describe("applyEditResponse authorization and request parsing", () => {
  function httpRequest(body: string, withKey = true): Request {
    return new Request("https://example.test/api/trips/trip-1/edits/apply", {
      method: "POST",
      headers: {
        origin: "https://example.test",
        "content-type": "application/json",
        ...(withKey ? { "Idempotency-Key": "http-key" } : {}),
      },
      body,
    });
  }

  function httpDependencies(test: ReturnType<typeof fixture>) {
    let bodyRead = false;
    const dependencies: TripEditApplyHttpDependencies = {
      authorization: test.dependencies.authorization,
      service: test.dependencies,
      now: () => timeReference,
      onBodyRead: () => { bodyRead = true; },
    };
    return { dependencies, bodyWasRead: () => bodyRead };
  }

  it.each([
    ["Guest", (test: ReturnType<typeof fixture>) => test.removeSession(), 401, "UNAUTHENTICATED"],
    ["Unsupported role", (test: ReturnType<typeof fixture>) => test.setRole("UNSUPPORTED"), 403, "FORBIDDEN"],
  ] as const)("rejects %s before reading the body", async (_role, configure, status, code) => {
    const test = fixture();
    configure(test);
    const http = httpDependencies(test);
    const response = await applyEditResponse(httpRequest("{"), "trip-1", http.dependencies);
    const payload = await response.json();

    expect(response.status).toBe(status);
    expect(payload.error.code).toBe(code);
    expect(payload.operationStatus).toBe("FAILED");
    expect(http.bodyWasRead()).toBe(false);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires confirmed=true and Idempotency-Key before calling apply", async () => {
    const test = fixture();
    const http = httpDependencies(test);
    const invalid = await applyEditResponse(
      httpRequest(JSON.stringify({ ...request("IN_TRIP", candidate, null), confirmed: false })),
      "trip-1",
      http.dependencies,
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
    expect(test.transactionCount).toBe(0);

    const missingKey = await applyEditResponse(
      httpRequest(JSON.stringify(request()), false),
      "trip-1",
      http.dependencies,
    );
    expect(missingKey.status).toBe(400);
    expect((await missingKey.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(test.transactionCount).toBe(0);
  });

  it("rejects a client clock and applies confirmed In-trip input through the private shared route", async () => {
    const test = fixture();
    const http = httpDependencies(test);
    const requestWithClock = { ...request("IN_TRIP", candidate, null), now: "2000-01-01T00:00:00.000Z" };
    const invalid = await applyEditResponse(
      httpRequest(JSON.stringify(requestWithClock)),
      "trip-1",
      http.dependencies,
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
    expect(test.transactionCount).toBe(0);

    const applied = await applyEditResponse(
      httpRequest(JSON.stringify(request("IN_TRIP", candidate, null))),
      "trip-1",
      http.dependencies,
    );
    expect(applied.status).toBe(200);
    expect(applied.headers.get("cache-control")).toBe("private, no-store");
    expect(await applied.json()).toMatchObject({ operationStatus: "SUCCESS", data: { kind: "IN_TRIP" } });
    expect(test.transactionCount).toBe(1);
  });
});
