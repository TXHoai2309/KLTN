import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Database } from "@KLTN/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as validator from "../trip-validation/trip-validation";
import type { TripValidation } from "../trip-validation/trip-validation";
import { applyEditResponse, type TripEditApplyHttpDependencies } from "../trip-edit/trip-edit-http";
import type { EditCandidate } from "../trip-edit/edit-candidate";
import { previewInTripResponse, type InTripPreviewHttpDependencies } from "./in-trip-preview-http";

const tripId = "trip-us37";
const ownerId = "traveler-owner";
const baseRevision = "2026-10-19T00:00:00.000Z";
const initialNow = new Date("2026-10-20T05:00:00.000Z"); // 12:00 Vietnam time
const privateLocation = {
  source: "MANUAL" as const,
  latitude: 22.823456,
  longitude: 104.983654,
  accuracyMeters: null,
  capturedAt: "2026-10-20T04:59:00.000Z",
};

const savedCandidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{
    dayIndex: 1,
    visits: [
      { visitId: "visit-completed", destinationId: "destination-a", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
      { visitId: "visit-remaining", destinationId: "destination-b", startMinute: 900, plannedDurationMinutes: 60, order: 2 },
    ],
  }],
};

const editedCandidate: EditCandidate = {
  ...savedCandidate,
  days: [{
    dayIndex: 1,
    visits: [savedCandidate.days[0]!.visits[0]!, { ...savedCandidate.days[0]!.visits[1]!, startMinute: 960 }],
  }],
};

type CheckOutcome = "PASS" | "VIOLATION" | "INSUFFICIENT_DATA";
let checkOutcome: CheckOutcome = "PASS";

function fakeValidation(outcome: CheckOutcome, now: Date): TripValidation {
  const openingStatus = outcome === "VIOLATION" ? "VIOLATION" : "SATISFIED";
  const travelStatus = outcome === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "SATISFIED";
  return {
    timeReference: now.toISOString(),
    groups: {
      openingHours: {
        status: openingStatus,
        findings: outcome === "VIOLATION" ? [{
          group: "openingHours", status: "VIOLATION", reasonCode: "TEST_CLOSED",
          message: "Fake Validator: điểm đến đang đóng cửa.", affectedVisitId: "visit-remaining",
        }] : [],
      },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: {
        status: travelStatus,
        findings: outcome === "INSUFFICIENT_DATA" ? [{
          group: "travelTime", status: "INSUFFICIENT_DATA", reasonCode: "ROUTE_UNAVAILABLE",
          message: "Fake routing timeout.", fromVisitId: "visit-completed", toVisitId: "visit-remaining",
        }] : [],
      },
      scheduleConflict: { status: "SATISFIED", findings: [] },
    },
    canConfirm: outcome === "PASS",
  };
}

beforeEach(() => {
  checkOutcome = "PASS";
  vi.spyOn(validator, "validateItinerary").mockImplementation((_visits, _routes, now) => fakeValidation(checkOutcome, now));
});

afterEach(() => vi.restoreAllMocks());

function fixture(options: { role?: string; actorId?: string; now?: Date; routeUnavailable?: boolean } = {}) {
  const actorId = options.actorId ?? ownerId;
  const role = options.role ?? "TRAVELER";
  let now = new Date(options.now ?? initialNow);
  let failDayCreate = false;
  let routeUnavailable = options.routeUnavailable ?? false;
  let trip = {
    id: tripId,
    userId: ownerId,
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt: new Date(baseRevision),
    days: [{
      id: "day-1",
      tripId,
      dayIndex: 1,
      localDate: new Date("2026-10-20T00:00:00.000Z"),
      visits: savedCandidate.days[0]!.visits.map(visit => ({
        id: visit.visitId,
        destinationId: visit.destinationId,
        startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        order: visit.order,
      })),
    }],
  };
  const destinations = ["destination-a", "destination-b"].map((id, index) => ({
    id,
    visibility: "VISIBLE" as const,
    latitude: 22.8 + index / 100,
    longitude: 104.9 + index / 100,
    minimumDurationMinutes: 30,
    openingDays: [{
      dayOfWeek: "TUESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
    }],
  }));
  const records = new Map<string, { requestHash: string; responseJson: string }>();
  const writes: string[] = [];
  const routeCalls: unknown[] = [];
  const keyFor = (scope: string, key: string) => JSON.stringify([scope, key]);
  const database = {
    user: { findUnique: async () => ({ id: actorId, role, status: "ACTIVE" }) },
    trip: {
      findFirst: async (query: { where: { id: string; userId: string } }) =>
        trip.id === query.where.id && trip.userId === query.where.userId ? structuredClone(trip) : null,
    },
    destination: {
      findMany: async (query: { where: { id: { in: string[] } } }) =>
        structuredClone(destinations.filter(item => query.where.id.in.includes(item.id))),
      findFirst: async (query: { where: { id: string } }) => {
        const item = destinations.find(destination => destination.id === query.where.id);
        return item ? { latitude: item.latitude, longitude: item.longitude } : null;
      },
    },
    idempotencyRecord: {
      findUnique: async (query: { where: { scope_key: { scope: string; key: string } } }) =>
        records.get(keyFor(query.where.scope_key.scope, query.where.scope_key.key)) ?? null,
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      const pendingTrip = structuredClone(trip);
      const pendingRecords = new Map(records);
      const tx = {
        user: { findUnique: async () => ({ id: actorId, role, status: "ACTIVE" }) },
        trip: {
          findFirst: async (query: { where: { id: string; userId: string } }) =>
            pendingTrip.id === query.where.id && pendingTrip.userId === query.where.userId ? structuredClone(pendingTrip) : null,
          updateMany: async (query: { where: { id: string; userId: string; updatedAt: Date }; data: { updatedAt: Date } }) => {
            writes.push("trip.updateMany");
            if (pendingTrip.id !== query.where.id || pendingTrip.userId !== query.where.userId
              || pendingTrip.updatedAt.getTime() !== query.where.updatedAt.getTime()) return { count: 0 };
            pendingTrip.updatedAt = query.data.updatedAt;
            return { count: 1 };
          },
        },
        $queryRaw: async () => [],
        tripCompanionPublication: { findUnique: async () => null },
        itineraryDay: {
          deleteMany: async () => {
            writes.push("itineraryDay.deleteMany");
            const count = pendingTrip.days.length;
            pendingTrip.days = [];
            return { count };
          },
          create: async (query: { data: { tripId: string; dayIndex: number; localDate: Date; visits: { create: { id: string; destinationId: string; startMinute: number; plannedDurationMinutes: number; order: number }[] } } }) => {
            writes.push("itineraryDay.create");
            if (failDayCreate) throw new Error("injected transaction failure");
            pendingTrip.days.push({
              id: `day-${pendingTrip.days.length + 1}`,
              tripId: query.data.tripId,
              dayIndex: query.data.dayIndex,
              localDate: query.data.localDate,
              visits: structuredClone(query.data.visits.create),
            });
          },
        },
        idempotencyRecord: {
          create: async (query: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
            writes.push("idempotencyRecord.create");
            pendingRecords.set(keyFor(query.data.scope, query.data.key), {
              requestHash: query.data.requestHash,
              responseJson: query.data.responseJson,
            });
          },
          update: async (query: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
            writes.push("idempotencyRecord.update");
            const record = pendingRecords.get(keyFor(query.where.scope_key.scope, query.where.scope_key.key));
            if (record) record.responseJson = query.data.responseJson;
          },
        },
      };
      const result = await callback(tx);
      trip = pendingTrip;
      records.clear();
      for (const [key, value] of pendingRecords) records.set(key, value);
      return result;
    },
  } as unknown as Database;

  const authorization = {
    database: database as Pick<Database, "user">,
    resolveSession: async () => ({ user: { id: actorId, role } }),
  };
  const getRoute = async (input: unknown) => {
    routeCalls.push(input);
    return routeUnavailable ? { kind: "unavailable" as const } : { kind: "ok" as const, durationSeconds: 0 };
  };
  const service = { database, authorization, getRoute, now: () => new Date(now), routeTimeoutMs: 5 };

  return {
    database,
    previewDependencies: { authorization, service } satisfies InTripPreviewHttpDependencies,
    applyDependencies: { authorization, service, now: () => new Date(now) } satisfies TripEditApplyHttpDependencies,
    get trip() { return structuredClone(trip); },
    get writes() { return [...writes]; },
    get records() { return [...records.values()]; },
    get routeCalls() { return [...routeCalls]; },
    setNow(value: Date) { now = new Date(value); },
    setOutcome(value: CheckOutcome) { checkOutcome = value; },
    setRouteUnavailable(value: boolean) { routeUnavailable = value; },
    failNextWrite() { failDayCreate = true; },
    allowWrites() { failDayCreate = false; },
  };
}

function previewRequest(candidate: EditCandidate = editedCandidate, extras: Record<string, unknown> = {}) {
  return new Request(`https://app.test/api/trips/${tripId}/in-trip/preview`, {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({ baseRevision, candidate, location: privateLocation, mandatoryEndpoint: null, ...extras }),
  });
}

function applyRequest(key: string, candidate: EditCandidate = editedCandidate, extras: Record<string, unknown> = {}) {
  return new Request(`https://app.test/api/trips/${tripId}/edits/apply`, {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      baseRevision, candidate, confirmed: true, kind: "IN_TRIP", location: privateLocation,
      mandatoryEndpoint: null, ...extras,
    }),
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe("US-37 Task 297 in-trip validate and apply acceptance", () => {
  it.each(["VIOLATION", "INSUFFICIENT_DATA"] as const)("blocks a confirmed %s candidate with no database writes", async outcome => {
    const test = fixture();
    test.setOutcome(outcome);
    const preview = await previewInTripResponse(previewRequest(), tripId, test.previewDependencies);
    const previewBody = await responseBody(preview);
    expect(preview.status).toBe(200);
    expect(previewBody.data.validation.canConfirm).toBe(false);

    const apply = await applyEditResponse(applyRequest(`blocked-${outcome}`), tripId, test.applyDependencies);
    const body = await responseBody(apply);
    expect(apply.status).toBe(422);
    expect(body.operationStatus).toBe("FAILED");
    expect(body.error.details.validation.canConfirm).toBe(false);
    expect(test.writes).toEqual([]);
    expect(test.trip.updatedAt.toISOString()).toBe(baseRevision);
  });

  it("keeps routing timeout as INSUFFICIENT_DATA at both preview and confirmation", async () => {
    const test = fixture();
    test.setRouteUnavailable(true); // fake provider timeout/unavailable, never calls Stadia
    const preview = await previewInTripResponse(previewRequest(), tripId, test.previewDependencies);
    expect((await responseBody(preview)).data.validation.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
    const apply = await applyEditResponse(applyRequest("route-timeout"), tripId, test.applyDependencies);
    const body = await responseBody(apply);
    expect(apply.status).toBe(422);
    expect(body.error.details.validation.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
    expect(body.error.details.checkedAt).toBe(initialNow.toISOString());
    expect(test.writes).toEqual([]);
  });

  it("returns fresh validation when a once-valid proposal becomes invalid at confirmation", async () => {
    const test = fixture();
    const preview = await previewInTripResponse(previewRequest(), tripId, test.previewDependencies);
    expect((await responseBody(preview)).data.validation.canConfirm).toBe(true);
    test.setOutcome("VIOLATION");
    test.setNow(new Date("2026-10-20T05:05:00.000Z"));
    const apply = await applyEditResponse(applyRequest("fresh-violation"), tripId, test.applyDependencies);
    const body = await responseBody(apply);
    expect(apply.status).toBe(422);
    expect(body.error.details.checkedAt).toBe("2026-10-20T05:05:00.000Z");
    expect(body.error.details.validation.groups.openingHours.status).toBe("VIOLATION");
    expect(test.writes).toEqual([]);
  });

  it("returns fresh validation when a mandatory endpoint deadline expires after preview", async () => {
    const test = fixture();
    const endpointCandidate: EditCandidate = {
      ...savedCandidate,
      days: [{ dayIndex: 1, visits: [savedCandidate.days[0]!.visits[0]!, {
        ...savedCandidate.days[0]!.visits[1]!, startMinute: 810,
      }] }],
    };
    const mandatoryEndpoint = { destinationId: "destination-b", deadline: "14:00" };
    const preview = await previewInTripResponse(previewRequest(endpointCandidate, { mandatoryEndpoint }), tripId, test.previewDependencies);
    expect((await responseBody(preview)).data.validation.canConfirm).toBe(true);

    test.setNow(new Date("2026-10-20T07:01:00.000Z")); // 14:01 Vietnam, deadline just passed
    const apply = await applyEditResponse(applyRequest("expired-endpoint", endpointCandidate, { mandatoryEndpoint }), tripId, test.applyDependencies);
    const body = await responseBody(apply);
    expect(apply.status).toBe(422);
    expect(body.error.code).toBe("IN_TRIP_VALIDATION_CHANGED");
    expect(body.error.details.checkedAt).toBe("2026-10-20T07:01:00.000Z");
    expect(body.error.details.validation.canConfirm).toBe(false);
    expect(body.error.details.validation.groups.travelTime.status).toBe("VIOLATION");
    expect(test.writes).toEqual([]);
  });

  it("does not apply a candidate that edits a visit after its scheduled end has passed", async () => {
    const test = fixture();
    expect((await previewInTripResponse(previewRequest(), tripId, test.previewDependencies)).status).toBe(200);
    test.setNow(new Date("2026-10-20T09:01:00.000Z")); // 16:01 Vietnam; original remaining visit ended at 16:00
    const apply = await applyEditResponse(applyRequest("crossed-end"), tripId, test.applyDependencies);
    const body = await responseBody(apply);
    expect(apply.status).toBe(422);
    expect(body.error.code).toBe("COMPLETED_VISIT_CHANGED");
    expect(test.writes).toEqual([]);
    expect(test.trip.days[0]!.visits[1]!.startMinute).toBe(900);
  });

  it.each([
    ["changed", (candidate: EditCandidate) => ({ ...candidate, days: [{
      dayIndex: 1,
      visits: [{ ...candidate.days[0]!.visits[0]!, startMinute: 481 }, candidate.days[0]!.visits[1]!],
    }] })],
    ["removed", (candidate: EditCandidate) => ({ ...candidate, days: [{
      dayIndex: 1, visits: [{ ...candidate.days[0]!.visits[1]!, order: 1 }],
    }] })],
    ["moved", (candidate: EditCandidate) => ({ ...candidate, durationDays: 2, days: [
      { dayIndex: 1, visits: [{ ...candidate.days[0]!.visits[1]!, order: 1 }] },
      { dayIndex: 2, visits: [candidate.days[0]!.visits[0]!] },
    ] })],
  ])("rejects a completed visit that is %s", async (_case, mutate) => {
    const test = fixture();
    const changed = mutate(editedCandidate);
    const apply = await applyEditResponse(applyRequest(`completed-${_case}`, changed), tripId, test.applyDependencies);
    expect(apply.status).toBe(422);
    expect((await responseBody(apply)).error.code).toBe("COMPLETED_VISIT_CHANGED");
    expect(test.writes).toEqual([]);
  });

  it("ignores client-provided time and completed IDs in strict preview and apply bodies", async () => {
    const test = fixture();
    const preview = await previewInTripResponse(previewRequest(editedCandidate, {
      now: "2000-01-01T00:00:00.000Z", completedVisitIds: ["visit-remaining"],
    }), tripId, test.previewDependencies);
    expect(preview.status).toBe(400);
    expect(test.routeCalls).toHaveLength(0);

    const apply = await applyEditResponse(applyRequest("client-clock", editedCandidate, {
      now: "2000-01-01T00:00:00.000Z", completedVisitIds: [],
    }), tripId, test.applyDependencies);
    expect(apply.status).toBe(400);
    expect(test.writes).toEqual([]);
  });

  it("commits a valid confirmed proposal and reports SUCCESS only after the fake transaction commits", async () => {
    const test = fixture();
    const preview = await previewInTripResponse(previewRequest(), tripId, test.previewDependencies);
    expect((await responseBody(preview)).data.validation.canConfirm).toBe(true);
    expect(test.writes).toEqual([]);
    const apply = await applyEditResponse(applyRequest("successful-confirmation"), tripId, test.applyDependencies);
    const body = await responseBody(apply);
    expect(apply.status).toBe(200);
    expect(body.operationStatus).toBe("SUCCESS");
    expect(body.data.baseRevision).not.toBe(baseRevision);
    expect(test.trip.updatedAt.toISOString()).toBe(body.data.baseRevision);
    expect(test.trip.days[0]!.visits.map(visit => visit.startMinute)).toEqual([480, 960]);
    expect(test.writes).toContain("itineraryDay.create");
    expect(test.records).toHaveLength(1);
  });

  it("rejects an unconfirmed apply body before any write", async () => {
    const test = fixture();
    const response = await applyEditResponse(applyRequest("not-confirmed", editedCandidate, { confirmed: false }), tripId, test.applyDependencies);
    expect(response.status).toBe(400);
    expect(test.writes).toEqual([]);
    expect(test.records).toHaveLength(0);
  });

  it("replays a committed key, conflicts on changed payload, and protects a second tab revision", async () => {
    const test = fixture();
    const first = await applyEditResponse(applyRequest("replay-key"), tripId, test.applyDependencies);
    const firstBody = await responseBody(first);
    const writesAfterFirst = test.writes;
    const replay = await applyEditResponse(applyRequest("replay-key"), tripId, test.applyDependencies);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await responseBody(replay)).toEqual(firstBody);
    expect(test.writes).toEqual(writesAfterFirst);

    const changed = { ...editedCandidate, days: [{
      dayIndex: 1, visits: [savedCandidate.days[0]!.visits[0]!, { ...editedCandidate.days[0]!.visits[1]!, startMinute: 990 }],
    }] };
    const reused = await applyEditResponse(applyRequest("replay-key", changed), tripId, test.applyDependencies);
    expect(reused.status).toBe(409);
    expect((await responseBody(reused)).error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const secondTab = await applyEditResponse(applyRequest("second-tab", editedCandidate), tripId, test.applyDependencies);
    expect(secondTab.status).toBe(409);
    expect((await responseBody(secondTab)).error.code).toBe("TRIP_REVISION_CONFLICT");
  });

  it("retries UNKNOWN with the same key and commits only one success", async () => {
    const test = fixture();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    test.failNextWrite();
    const first = await applyEditResponse(applyRequest("unknown-retry"), tripId, test.applyDependencies);
    expect(first.status).toBe(503);
    expect((await responseBody(first)).operationStatus).toBe("UNKNOWN");
    expect(test.trip.updatedAt.toISOString()).toBe(baseRevision);
    expect(test.records).toHaveLength(0);

    test.allowWrites();
    const retry = await applyEditResponse(applyRequest("unknown-retry"), tripId, test.applyDependencies);
    expect(retry.status).toBe(200);
    expect((await responseBody(retry)).operationStatus).toBe("SUCCESS");
    expect(test.records).toHaveLength(1);
    errorLog.mockRestore();
  });

  it("keeps location out of URLs, idempotency records and logs", async () => {
    const test = fixture();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const preview = await previewInTripResponse(previewRequest(), tripId, test.previewDependencies);
    const apply = await applyEditResponse(applyRequest("privacy"), tripId, test.applyDependencies);
    expect(new URL(previewRequest().url).search).toBe("");
    expect(new URL(applyRequest("privacy").url).search).toBe("");
    expect(JSON.stringify(test.records)).not.toContain(String(privateLocation.latitude));
    expect(JSON.stringify(test.records)).not.toContain(String(privateLocation.longitude));
    expect(errorLog).not.toHaveBeenCalled();
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(apply.headers.get("cache-control")).toBe("private, no-store");
    errorLog.mockRestore();
  });

  it("returns Guest 401 and masks another owner's Trip as 404; Admin follows accepted RBAC V2", async () => {
    const guest = fixture();
    const guestAuthorization = {
      ...guest.previewDependencies.authorization,
      resolveSession: async () => null,
    };
    const deniedPreview = await previewInTripResponse(previewRequest(), tripId, {
      ...guest.previewDependencies, authorization: guestAuthorization,
    });
    expect(deniedPreview.status).toBe(401);

    const foreign = fixture({ actorId: "another-traveler" });
    const deniedApply = await applyEditResponse(applyRequest("foreign"), tripId, foreign.applyDependencies);
    expect(deniedApply.status).toBe(404);
    expect((await responseBody(deniedApply)).error.code).toBe("TRIP_NOT_FOUND");

    const adminOwner = fixture({ role: "ADMIN", actorId: ownerId });
    const adminPreview = await previewInTripResponse(previewRequest(), tripId, adminOwner.previewDependencies);
    expect(adminPreview.status).toBe(200);
  });

  it("source-audits that preview is read-only and the apply route delegates to applyEdit", async () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const [previewRoute, previewService, applyRoute, applyService] = await Promise.all([
      readFile(resolve(root, "src/app/api/trips/[id]/in-trip/preview/route.ts"), "utf8"),
      readFile(resolve(root, "src/modules/in-trip/in-trip-preview-http.ts"), "utf8"),
      readFile(resolve(root, "src/app/api/trips/[id]/edits/apply/route.ts"), "utf8"),
      readFile(resolve(root, "src/modules/trip-edit/apply-edit.ts"), "utf8"),
    ]);
    const previewImports = `${previewRoute}\n${previewService}`.split("\n").filter(line => /^import\s/u.test(line)).join("\n");
    expect(previewImports).not.toMatch(/applyEdit|executeIdempotentWrite|persistCandidate/u);
    expect(applyRoute).toContain("applyEditResponse");
    expect(applyService).toContain('confirmed: z.literal(true)');
    expect(applyService).toContain('operation: "trip:apply-edit"');
    expect(applyService).toContain("executeIdempotentWrite");
  });
});
