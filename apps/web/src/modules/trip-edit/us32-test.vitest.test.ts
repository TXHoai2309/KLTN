import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Database } from "@KLTN/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as validatorModule from "../trip-validation/trip-validation";
import type { TripValidation } from "../trip-validation/trip-validation";
import {
  applyEditResponse,
  previewEditResponse,
  type TripEditApplyHttpDependencies,
  type TripEditPreviewHttpDependencies,
} from "./trip-edit-http";
import { cancelEditApply, createEditApplyState, updateEditApplyCandidate } from "./edit-apply-state";
import type { EditCandidate } from "./edit-candidate";

const tripId = "trip-1";
const ownerId = "traveler-owner";
const baseRevision = "2026-10-15T12:00:00.000Z";
const timeReference = new Date("2026-10-16T10:00:00.000Z");
type ValidatorOutcome = "PASS" | "VIOLATION" | "INSUFFICIENT_DATA";

const savedCandidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{
    dayIndex: 1,
    visits: [
      { visitId: "visit-a", destinationId: "destination-a", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
      { visitId: "visit-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 45, order: 2 },
    ],
  }],
};

const editedCandidate: EditCandidate = {
  ...savedCandidate,
  days: [{
    dayIndex: 1,
    visits: [
      { ...savedCandidate.days[0]!.visits[0]!, startMinute: 510 },
      { ...savedCandidate.days[0]!.visits[1]!, startMinute: 630 },
    ],
  }],
};

let validatorOutcome: ValidatorOutcome = "PASS";
let validatorCallCount = 0;

function fakeValidation(outcome: ValidatorOutcome, now: Date): TripValidation {
  const violation = outcome === "VIOLATION"
    ? [{
        group: "openingHours" as const,
        status: "VIOLATION" as const,
        reasonCode: "TEST_VIOLATION",
        message: "Fake Validator violation for the integration test.",
        affectedVisitId: "visit-a",
      }]
    : [];
  const insufficient = outcome === "INSUFFICIENT_DATA"
    ? [{
        group: "travelTime" as const,
        status: "INSUFFICIENT_DATA" as const,
        reasonCode: "TEST_INSUFFICIENT_DATA",
        message: "Fake Validator has insufficient route data.",
        fromVisitId: "visit-a",
        toVisitId: "visit-b",
      }]
    : [];

  return {
    timeReference: now.toISOString(),
    groups: {
      openingHours: {
        status: outcome === "VIOLATION" ? "VIOLATION" : "SATISFIED",
        findings: violation,
      },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: {
        status: outcome === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "SATISFIED",
        findings: insufficient,
      },
      scheduleConflict: { status: "SATISFIED", findings: [] },
    },
    canConfirm: outcome === "PASS",
  };
}

beforeEach(() => {
  validatorOutcome = "PASS";
  validatorCallCount = 0;
  vi.spyOn(validatorModule, "validateItinerary").mockImplementation((_visits, _routes, now) => {
    validatorCallCount += 1;
    return fakeValidation(validatorOutcome, now);
  });
});

afterEach(() => vi.restoreAllMocks());

function fixture() {
  type FakeVisit = {
    id: string;
    destinationId: string;
    startMinute: number;
    plannedDurationMinutes: number;
    order: number;
  };
  type FakeDay = {
    id: string;
    tripId: string;
    dayIndex: number;
    localDate: Date;
    visits: FakeVisit[];
  };
  type FakeTrip = {
    id: string;
    userId: string;
    startDate: Date;
    durationDays: number;
    transport: "CAR";
    updatedAt: Date;
    days: FakeDay[];
  };
  type FakeDestination = {
    id: string;
    visibility: "VISIBLE" | "HIDDEN";
    latitude: number;
    longitude: number;
    minimumDurationMinutes: number | null;
    openingDays: {
      dayOfWeek: "TUESDAY";
      status: "OPEN";
      intervals: { opensAtMinute: number; closesAtMinute: number }[];
    }[];
  };

  let actorId = ownerId;
  let actorRole = "TRAVELER";
  let hasSession = true;
  let hasUser = true;
  let trip: FakeTrip = {
    id: tripId,
    userId: ownerId,
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR",
    updatedAt: new Date(baseRevision),
    days: [{
      id: "day-1",
      tripId,
      dayIndex: 1,
      localDate: new Date("2026-10-20T00:00:00.000Z"),
      visits: savedCandidate.days[0]!.visits.map((visit) => ({
        id: visit.visitId,
        destinationId: visit.destinationId,
        startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        order: visit.order,
      })),
    }],
  };
  const destinations: FakeDestination[] = ["destination-a", "destination-b"].map((id) => ({
    id,
    visibility: "VISIBLE",
    latitude: 23.2,
    longitude: 105.1,
    minimumDurationMinutes: 30,
    openingDays: [{
      dayOfWeek: "TUESDAY",
      status: "OPEN",
      intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
    }],
  }));
  destinations.push({
    id: "destination-hidden",
    visibility: "HIDDEN",
    latitude: 23.3,
    longitude: 105.2,
    minimumDurationMinutes: 30,
    openingDays: [{
      dayOfWeek: "TUESDAY",
      status: "OPEN",
      intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
    }],
  });

  const records = new Map<string, { requestHash: string; responseJson: string }>();
  const writes: string[] = [];
  const tripQueries: { id: string; userId: string }[] = [];
  const routeProvider = vi.fn(async () => ({ kind: "ok" as const, durationSeconds: 60 }));

  const recordKey = (scope: string, key: string) => JSON.stringify([scope, key]);
  const lookupTrip = (query: { where: { id: string; userId: string } }, source: FakeTrip) => {
    tripQueries.push(query.where);
    return source.id === query.where.id && source.userId === query.where.userId
      ? structuredClone(source)
      : null;
  };
  const lookupRecord = (scope: string, key: string) => records.get(recordKey(scope, key)) ?? null;

  const database = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        hasUser && where.id === actorId ? { id: actorId, role: actorRole } : null,
    },
    trip: {
      findFirst: async (query: { where: { id: string; userId: string } }) => lookupTrip(query, trip),
    },
    destination: {
      findMany: async (query: { where: { id: { in: string[] }; visibility: string } }) =>
        structuredClone(destinations.filter((destination) =>
          query.where.id.in.includes(destination.id) && destination.visibility === query.where.visibility,
        )),
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) =>
        lookupRecord(where.scope_key.scope, where.scope_key.key),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      const pendingTrip = structuredClone(trip);
      const pendingRecords = new Map(records);
      const transaction = {
        user: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            hasUser && where.id === actorId ? { id: actorId, role: actorRole } : null,
        },
        trip: {
          findFirst: async (query: { where: { id: string; userId: string } }) => lookupTrip(query, pendingTrip),
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; userId: string; updatedAt: Date };
            data: { updatedAt: Date };
          }) => {
            writes.push("trip.updateMany");
            if (
              pendingTrip.id !== where.id ||
              pendingTrip.userId !== where.userId ||
              pendingTrip.updatedAt.getTime() !== where.updatedAt.getTime()
            ) return { count: 0 };
            pendingTrip.updatedAt = data.updatedAt;
            return { count: 1 };
          },
        },
        itineraryDay: {
          deleteMany: async () => {
            writes.push("itineraryDay.deleteMany");
            pendingTrip.days = [];
            return { count: 1 };
          },
          create: async ({ data }: { data: {
            tripId: string;
            dayIndex: number;
            localDate: Date;
            visits: { create: FakeVisit[] };
          } }) => {
            writes.push("itineraryDay.create");
            const created: FakeDay = {
              id: `day-${pendingTrip.days.length + 1}`,
              tripId: data.tripId,
              dayIndex: data.dayIndex,
              localDate: data.localDate,
              visits: structuredClone(data.visits.create),
            };
            pendingTrip.days.push(created);
            return created;
          },
        },
        idempotencyRecord: {
          create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
            writes.push("idempotencyRecord.create");
            pendingRecords.set(recordKey(data.scope, data.key), {
              requestHash: data.requestHash,
              responseJson: data.responseJson,
            });
          },
          update: async ({
            where,
            data,
          }: {
            where: { scope_key: { scope: string; key: string } };
            data: { responseJson: string };
          }) => {
            writes.push("idempotencyRecord.update");
            const record = pendingRecords.get(recordKey(where.scope_key.scope, where.scope_key.key));
            if (!record) throw new Error("idempotency record missing in fake transaction");
            record.responseJson = data.responseJson;
          },
        },
      };

      const result = await callback(transaction);
      trip = pendingTrip;
      records.clear();
      for (const [key, value] of pendingRecords) records.set(key, value);
      return result;
    },
  };

  const authorization = {
    database: database as unknown as Pick<Database, "user">,
    resolveSession: async () => hasSession ? { user: { id: actorId, role: actorRole } } : null,
  };
  const service = {
    database: database as unknown as Database,
    getRoute: routeProvider,
  };
  const previewDependencies: TripEditPreviewHttpDependencies = {
    authorization,
    service,
    now: () => timeReference,
  };
  const applyDependencies: TripEditApplyHttpDependencies = {
    authorization,
    service: { ...service, authorization },
    now: () => timeReference,
  };

  return {
    previewDependencies,
    applyDependencies,
    get trip() { return structuredClone(trip); },
    get writes() { return [...writes]; },
    get tripQueries() { return [...tripQueries]; },
    get records() { return [...records.values()]; },
    routeProvider,
    setValidatorOutcome: (value: ValidatorOutcome) => { validatorOutcome = value; },
    setActor: (id: string, role: string) => {
      actorId = id;
      actorRole = role;
      hasSession = true;
      hasUser = true;
    },
    setGuest: () => { hasSession = false; },
    hideDestination: (id: string) => {
      const destination = destinations.find((row) => row.id === id);
      if (destination) destination.visibility = "HIDDEN";
    },
  };
}

function previewRequest(candidate: EditCandidate = editedCandidate, revision = baseRevision): Request {
  return new Request(`https://example.test/api/trips/${tripId}/edits/preview`, {
    method: "POST",
    headers: { origin: "https://example.test", "content-type": "application/json" },
    body: JSON.stringify({ baseRevision: revision, candidate }),
  });
}

function applyRequest(
  key: string,
  candidate: EditCandidate = editedCandidate,
  revision = baseRevision,
): Request {
  return new Request(`https://example.test/api/trips/${tripId}/edits/apply`, {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ baseRevision: revision, candidate, confirmed: true, kind: "MANUAL" }),
  });
}

describe("US-32 combined edit, cancel, and apply acceptance", () => {
  it("previews a valid edit as PASS, then applies it and advances the revision", async () => {
    const test = fixture();
    const preview = await previewEditResponse(
      previewRequest(),
      tripId,
      test.previewDependencies,
    );
    const previewBody = await preview.json();

    expect(preview.status).toBe(200);
    expect(previewBody.data.validation.canConfirm).toBe(true);
    const previewGroups = previewBody.data.validation.groups as Record<string, { status: string }>;
    expect(Object.values(previewGroups).every((group) => group.status === "SATISFIED")).toBe(true);

    const applied = await applyEditResponse(applyRequest("edit-pass-key"), tripId, test.applyDependencies);
    const appliedBody = await applied.json();

    expect(applied.status).toBe(200);
    expect(appliedBody.operationStatus).toBe("SUCCESS");
    expect(appliedBody.data.candidate).toEqual(editedCandidate);
    expect(Date.parse(appliedBody.data.baseRevision)).toBeGreaterThan(Date.parse(baseRevision));
    expect(test.trip.updatedAt.toISOString()).toBe(appliedBody.data.baseRevision);
    expect(test.trip.days[0]!.visits.map((visit) => visit.startMinute)).toEqual([510, 630]);
    expect(test.writes).toContain("trip.updateMany");
    expect(test.routeProvider).toHaveBeenCalled();
    expect(validatorCallCount).toBe(2);
  });

  it.each(["VIOLATION", "INSUFFICIENT_DATA"] as const)(
    "does not issue any database write when the fake Validator returns %s",
    async (outcome) => {
      const test = fixture();
      test.setValidatorOutcome(outcome);

      const response = await applyEditResponse(applyRequest(`blocked-${outcome}`), tripId, test.applyDependencies);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.operationStatus).toBe("FAILED");
      expect(body.error.code).toBe("TRIP_VALIDATION_FAILED");
      expect(test.writes).toEqual([]);
      expect(test.trip.updatedAt.toISOString()).toBe(baseRevision);
      expect(test.trip.days[0]!.visits[0]!.startMinute).toBe(480);
      expect(validatorCallCount).toBe(1);
    },
  );

  it("cancels by dropping only local candidate state and creates no write request", async () => {
    const test = fixture();
    const dirty = updateEditApplyCandidate(createEditApplyState(baseRevision, savedCandidate), editedCandidate);
    const cancelled = cancelEditApply(dirty);
    const clientSource = await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../app/trips/[id]/edit/edit-trip-client.tsx"),
      "utf8",
    );
    const cancelHandler = clientSource.match(/function discardAndLeave\(\) \{([\s\S]*?)\n  \}/)?.[1];

    expect(cancelled.candidate).toEqual(savedCandidate);
    expect(cancelled.pending).toBeNull();
    expect(cancelHandler).toContain("cancelEditApply");
    expect(cancelHandler).not.toMatch(/applyTripEdit|sendIdempotentMutation|fetch\(/);
    expect(test.writes).toEqual([]);
    expect(test.records).toEqual([]);
  });

  it.each([
    ["Guest", (test: ReturnType<typeof fixture>) => test.setGuest(), 401, "UNAUTHENTICATED"],
    ["Admin", (test: ReturnType<typeof fixture>) => test.setActor("admin-user", "ADMIN"), 403, "FORBIDDEN"],
  ] as const)("rejects %s from the protected preview endpoint", async (_role, configure, status, code) => {
    const test = fixture();
    configure(test);
    const response = await previewEditResponse(previewRequest(), tripId, test.previewDependencies);
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(validatorCallCount).toBe(0);
    expect(test.writes).toEqual([]);
  });

  it("returns the same 404 for a Trip owned by another account", async () => {
    const test = fixture();
    test.setActor("traveler-other", "TRAVELER");

    const response = await previewEditResponse(previewRequest(), tripId, test.previewDependencies);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("TRIP_NOT_FOUND");
    expect(test.tripQueries[0]).toEqual({ id: tripId, userId: "traveler-other" });
    expect(validatorCallCount).toBe(0);
  });

  it("rejects a stale revision with 409 before Validator or writes", async () => {
    const test = fixture();
    const response = await previewEditResponse(
      previewRequest(editedCandidate, "2026-10-14T12:00:00.000Z"),
      tripId,
      test.previewDependencies,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("TRIP_REVISION_CONFLICT");
    expect(validatorCallCount).toBe(0);
    expect(test.writes).toEqual([]);
  });

  it("rejects a newly added destination that is hidden", async () => {
    const test = fixture();
    const hiddenDestinationCandidate: EditCandidate = {
      ...editedCandidate,
      days: [{
        dayIndex: 1,
        visits: [
          ...editedCandidate.days[0]!.visits,
          {
            visitId: "visit-hidden",
            destinationId: "destination-hidden",
            startMinute: 720,
            plannedDurationMinutes: 30,
            order: 3,
          },
        ],
      }],
    };
    test.hideDestination("destination-hidden");

    const response = await previewEditResponse(
      previewRequest(hiddenDestinationCandidate),
      tripId,
      test.previewDependencies,
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("DESTINATION_UNAVAILABLE");
    expect(validatorCallCount).toBe(0);
    expect(test.writes).toEqual([]);
  });

  it("replays the prior success for the same key and returns 409 when its payload changes", async () => {
    const test = fixture();
    const first = await applyEditResponse(applyRequest("replay-key"), tripId, test.applyDependencies);
    const firstBody = await first.json();
    const writesAfterSuccess = test.writes;

    const replay = await applyEditResponse(applyRequest("replay-key"), tripId, test.applyDependencies);
    const replayBody = await replay.json();
    const differentCandidate: EditCandidate = {
      ...editedCandidate,
      days: [{
        dayIndex: 1,
        visits: [
          { ...editedCandidate.days[0]!.visits[0]!, startMinute: 520 },
          editedCandidate.days[0]!.visits[1]!,
        ],
      }],
    };
    const reused = await applyEditResponse(
      applyRequest("replay-key", differentCandidate),
      tripId,
      test.applyDependencies,
    );
    const reusedBody = await reused.json();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(replayBody.data).toEqual(firstBody.data);
    expect(reused.status).toBe(409);
    expect(reusedBody.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(test.writes).toEqual(writesAfterSuccess);
    expect(test.records).toHaveLength(1);
    expect(validatorCallCount).toBe(1);
  });

  it("source-audits preview route imports to ensure it does not import a write function", async () => {
    const routePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../app/api/trips/[id]/edits/preview/route.ts",
    );
    const routeSource = await readFile(routePath, "utf8");
    const imports = routeSource.split("\n").filter((line) => /^import\s/.test(line)).join("\n");

    expect(imports).toContain("previewEditResponse");
    expect(imports).not.toMatch(/\b(?:applyEdit|applyEditResponse|executeIdempotentWrite|preflightIdempotentReplay|persistCandidate|updateMany|deleteMany)\b/);
  });
});
