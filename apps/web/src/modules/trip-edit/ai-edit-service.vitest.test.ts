import type { Database } from "@KLTN/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import type { EditIntentModelOutput } from "./edit-intent-contract";
import * as validatorModule from "../trip-validation/trip-validation";
import type { TripValidation } from "../trip-validation/trip-validation";
import {
  createAiEditProposal,
  type AiEditRequest,
  type AiEditServiceDependencies,
} from "./ai-edit-service";

const revision = new Date("2026-10-15T12:00:00.000Z");
const timeReference = new Date("2026-10-16T10:00:00.000Z");

type ValidatorOutcome = "PASS" | "VIOLATION" | "INSUFFICIENT_DATA";

function fakeValidation(outcome: ValidatorOutcome, now: Date): TripValidation {
  const finding = outcome === "VIOLATION"
    ? [{
        group: "scheduleConflict" as const,
        status: "VIOLATION" as const,
        reasonCode: "TEST_VIOLATION",
        message: "Fake Validator violation.",
        visitIds: ["visit-1", "visit-2"] as [string, string],
      }]
    : outcome === "INSUFFICIENT_DATA"
      ? [{
          group: "travelTime" as const,
          status: "INSUFFICIENT_DATA" as const,
          reasonCode: "ROUTE_UNAVAILABLE",
          message: "Thiếu thời gian di chuyển cho chặng này.",
          fromVisitId: "visit-1",
          toVisitId: "visit-2",
        }]
      : [];

  return {
    timeReference: now.toISOString(),
    groups: {
      openingHours: { status: "SATISFIED", findings: [] },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: {
        status: outcome === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "SATISFIED",
        findings: outcome === "INSUFFICIENT_DATA" ? finding : [],
      },
      scheduleConflict: {
        status: outcome === "VIOLATION" ? "VIOLATION" : "SATISFIED",
        findings: outcome === "VIOLATION" ? finding : [],
      },
    },
    canConfirm: outcome === "PASS",
  };
}

afterEach(() => vi.restoreAllMocks());

function output(
  overrides: Partial<EditIntentModelOutput> = {},
): EditIntentModelOutput {
  return {
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1"],
    destinationId: null,
    params: { dayIndex: null, position: null, startTime: "09:00", durationMinutes: null },
    affected: { visitIds: ["visit-1"], dayIndexes: [1] },
    needsClarification: false,
    clarificationReason: null,
    ...overrides,
  };
}

function fixture(modelOutput = output()) {
  let tripExists = true;
  let providerCalls = 0;
  const tripQueries: { where: { id: string; userId: string } }[] = [];
  const trip = {
    id: "trip-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 2,
    transport: "CAR" as const,
    updatedAt: revision,
    days: [
      {
        dayIndex: 1,
        visits: [
          {
            id: "visit-1",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destination: { id: "destination-1", name: "Điểm A", visibility: "VISIBLE" },
          },
          {
            id: "visit-2",
            order: 2,
            startMinute: 660,
            plannedDurationMinutes: 90,
            destination: { id: "destination-2", name: "Điểm B", visibility: "VISIBLE" },
          },
        ],
      },
      { dayIndex: 2, visits: [] },
    ],
  };
  const destinations: {
    id: string;
    name: string;
    suggestedDurationMinutes: number | null;
    latitude: number;
    longitude: number;
    minimumDurationMinutes: number | null;
    openingDays: {
      dayOfWeek: "TUESDAY";
      status: "OPEN";
      intervals: { opensAtMinute: number; closesAtMinute: number }[];
    }[];
  }[] = [
    { id: "destination-1", name: "Điểm A", suggestedDurationMinutes: 60 },
    { id: "destination-2", name: "Điểm B", suggestedDurationMinutes: 90 },
  ].map((destination) => ({
    ...destination,
    latitude: 23,
    longitude: 105,
    minimumDurationMinutes: 30,
    openingDays: [{
      dayOfWeek: "TUESDAY",
      status: "OPEN",
      intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
    }],
  }));
  let routeFailure = false;
  const database = {
    trip: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        tripQueries.push({ where });
        return tripExists && where.id === trip.id && where.userId === trip.userId
          ? structuredClone(trip)
          : null;
      },
    },
    destination: {
      findMany: async ({ where }: { where?: { id?: { in?: string[] } } }) => {
        const requestedIds = where?.id?.in;
        const rows = requestedIds
          ? destinations.filter((destination) => requestedIds.includes(destination.id))
          : destinations;
        return structuredClone(rows);
      },
    },
  };
  const dependencies: AiEditServiceDependencies = {
    database: database as unknown as Database,
    llm: {
      complete: async () => {
        providerCalls += 1;
        return { rawText: JSON.stringify(modelOutput), model: "fake-model" };
      },
    },
    getRoute: async () => {
      if (routeFailure) throw new Error("fake route timeout");
      return { kind: "ok", durationSeconds: 0 };
    },
    createVisitId: () => "visit-new",
  };

  return {
    dependencies,
    trip,
    tripQueries,
    get providerCalls() { return providerCalls; },
    removeTrip: () => { tripExists = false; },
    makeDestinationWithoutSuggestedDuration: () => {
      destinations[0]!.suggestedDurationMinutes = null;
    },
    failProvider: (error: Error) => {
      dependencies.llm = { complete: async () => { throw error; } };
    },
    failRoute: () => { routeFailure = true; },
  };
}

const request = { baseRevision: revision.toISOString(), message: "Đổi giờ điểm A" };

function createProposal(
  tripId: string,
  userId: string,
  editRequest: AiEditRequest,
  dependencies: AiEditServiceDependencies,
) {
  return createAiEditProposal(tripId, userId, editRequest, dependencies, timeReference);
}

function mockValidator(outcome: ValidatorOutcome) {
  const validation = fakeValidation(outcome, timeReference);
  const validate = vi.spyOn(validatorModule, "validateItinerary").mockReturnValue(validation);
  return { validation, validate };
}

function proposedCandidate(result: Awaited<ReturnType<typeof createAiEditProposal>>) {
  expect(result.status).toBe("PROPOSED");
  if (result.status !== "PROPOSED") throw new Error("Expected a proposal");
  return result.candidate;
}

describe("createAiEditProposal", () => {
  it("adds a visible destination on a cloned candidate and uses its server suggested duration", async () => {
    const test = fixture(output({
      intentType: "ADD_VISIT",
      targetVisitIds: [],
      destinationId: "destination-2",
      params: { dayIndex: 1, position: null, startTime: "14:00", durationMinutes: null },
      affected: { visitIds: [], dayIndexes: [1] },
    }));

    const result = await createProposal("trip-1", "owner-1", request, test.dependencies);

    const candidate = proposedCandidate(result);
    expect(candidate.days[0]!.visits).toEqual([
      { visitId: "visit-1", destinationId: "destination-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
      { visitId: "visit-2", destinationId: "destination-2", startMinute: 660, plannedDurationMinutes: 90, order: 2 },
      {
        visitId: "visit-new",
        destinationId: "destination-2",
        startMinute: 840,
        plannedDurationMinutes: 90,
        order: 3,
      },
    ]);
    expect(result.status === "PROPOSED" && result.intent.affected).toEqual({
      visitIds: ["visit-new"],
      dayIndexes: [1],
    });
    expect(test.trip.days[0]!.visits).toHaveLength(2);
  });

  it("applies each remaining intent with the US-32 candidate helpers", async () => {
    const cases: {
      name: string;
      model: EditIntentModelOutput;
      expected: (result: Awaited<ReturnType<typeof createAiEditProposal>>) => void;
    }[] = [
      {
        name: "remove",
        model: output({ intentType: "REMOVE_VISIT", params: { dayIndex: null, position: null, startTime: null, durationMinutes: null } }),
        expected: (result) => {
          expect(proposedCandidate(result).days[0]!.visits.map((visit) => [visit.visitId, visit.order]))
            .toEqual([["visit-2", 1]]);
        },
      },
      {
        name: "move",
        model: output({
          intentType: "MOVE_VISIT",
          params: { dayIndex: 2, position: 1, startTime: null, durationMinutes: null },
          affected: { visitIds: ["visit-1"], dayIndexes: [1, 2] },
        }),
        expected: (result) => {
          const candidate = proposedCandidate(result);
          expect(candidate.days[0]!.visits.map((visit) => visit.visitId)).toEqual(["visit-2"]);
          expect(candidate.days[1]!.visits.map((visit) => [visit.visitId, visit.order]))
            .toEqual([["visit-1", 1]]);
        },
      },
      {
        name: "change time",
        model: output({ params: { dayIndex: null, position: null, startTime: "09:00", durationMinutes: null } }),
        expected: (result) => {
          expect(proposedCandidate(result).days[0]!.visits[0]!.startMinute).toBe(540);
        },
      },
      {
        name: "change duration",
        model: output({
          intentType: "CHANGE_DURATION",
          params: { dayIndex: null, position: null, startTime: null, durationMinutes: 120 },
        }),
        expected: (result) => {
          expect(proposedCandidate(result).days[0]!.visits[0]!.plannedDurationMinutes).toBe(120);
        },
      },
      {
        name: "replace",
        model: output({
          intentType: "REPLACE_VISIT",
          destinationId: "destination-2",
          params: { dayIndex: null, position: null, startTime: null, durationMinutes: null },
        }),
        expected: (result) => {
          expect(proposedCandidate(result).days[0]!.visits[0]).toMatchObject({
            visitId: "visit-1",
            destinationId: "destination-2",
            startMinute: 480,
            plannedDurationMinutes: 60,
          });
        },
      },
    ];

    for (const testCase of cases) {
      const test = fixture(testCase.model);
      const result = await createProposal("trip-1", "owner-1", request, test.dependencies);
      testCase.expected(result);
      expect(test.trip.days[0]!.visits[0]!.startMinute).toBe(480);
      expect(test.trip.days[0]!.visits).toHaveLength(2);
    }
  });

  it("uses an owner-scoped Trip read and returns the same 404 for foreign and missing Trips", async () => {
    const foreign = fixture();
    await expect(createProposal("trip-1", "another-user", request, foreign.dependencies))
      .rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });
    expect(foreign.tripQueries[0]).toMatchObject({ where: { id: "trip-1", userId: "another-user" } });
    expect(foreign.providerCalls).toBe(0);

    const missing = fixture();
    missing.removeTrip();
    await expect(createProposal("trip-1", "owner-1", request, missing.dependencies))
      .rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });
    expect(missing.providerCalls).toBe(0);
  });

  it("rejects a stale revision before reading destinations or calling the provider", async () => {
    const test = fixture();
    await expect(createProposal(
      "trip-1",
      "owner-1",
      { ...request, baseRevision: "2026-10-14T12:00:00.000Z" },
      test.dependencies,
    )).rejects.toMatchObject({ code: "TRIP_REVISION_CONFLICT", status: 409 });
    expect(test.providerCalls).toBe(0);
  });

  it("asks for clarification instead of guessing when a new destination has no suggested duration", async () => {
    const test = fixture(output({
      intentType: "ADD_VISIT",
      targetVisitIds: [],
      destinationId: "destination-1",
      params: { dayIndex: 1, position: null, startTime: "14:00", durationMinutes: null },
      affected: { visitIds: [], dayIndexes: [1] },
    }));
    test.makeDestinationWithoutSuggestedDuration();

    const result = await createProposal("trip-1", "owner-1", request, test.dependencies);

    expect(result).toMatchObject({ status: "NEEDS_CLARIFICATION", reason: "MISSING_TIME" });
    expect(test.trip.days[0]!.visits).toHaveLength(2);
  });

  it("returns model clarification without producing a candidate", async () => {
    const test = fixture(output({
      intentType: "UNCLEAR",
      targetVisitIds: [],
      params: { dayIndex: null, position: null, startTime: null, durationMinutes: null },
      affected: { visitIds: [], dayIndexes: [] },
      needsClarification: true,
      clarificationReason: "MISSING_TARGET",
    }));

    const result = await createProposal("trip-1", "owner-1", request, test.dependencies);

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "MISSING_TARGET",
      clarification: {
        code: "MISSING_TARGET",
        prompt: "Bạn muốn chỉnh sửa điểm đến nào trong hành trình?",
      },
    });
    expect(result).not.toHaveProperty("candidate");
  });

  it("returns server-built ambiguous-target choices and applies a verified selection on a fresh request", async () => {
    const test = fixture(output({
      intentType: "CHANGE_TIME",
      targetVisitIds: ["visit-1", "visit-2"],
      params: { dayIndex: null, position: null, startTime: "09:00", durationMinutes: null },
      affected: { visitIds: ["visit-1", "visit-2"], dayIndexes: [1] },
    }));
    const clarificationResult = await createProposal(
      "trip-1",
      "owner-1",
      request,
      test.dependencies,
    );
    expect(clarificationResult).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      clarification: {
        code: "AMBIGUOUS_TARGET",
        choices: [
          { label: "Điểm A · Ngày 1 · 08:00", resolution: { selectedVisitId: "visit-1" } },
          { label: "Điểm B · Ngày 1 · 11:00", resolution: { selectedVisitId: "visit-2" } },
        ],
      },
    });
    expect(clarificationResult).not.toHaveProperty("candidate");

    const resolved = await createProposal(
      "trip-1",
      "owner-1",
      { ...request, resolution: { selectedVisitId: "visit-2" } },
      test.dependencies,
    );
    const candidate = proposedCandidate(resolved);
    expect(candidate.days[0]!.visits.map((visit) => [visit.visitId, visit.startMinute]))
      .toEqual([["visit-1", 480], ["visit-2", 540]]);
  });

  it("accepts a destination resolution only when it is in the server's eligible set", async () => {
    const test = fixture(output({
      intentType: "ADD_VISIT",
      targetVisitIds: [],
      destinationId: null,
      params: { dayIndex: 1, position: null, startTime: "14:00", durationMinutes: 60 },
      affected: { visitIds: [], dayIndexes: [1] },
    }));

    const resolved = await createProposal(
      "trip-1",
      "owner-1",
      { ...request, resolution: { selectedDestinationId: "destination-2" } },
      test.dependencies,
    );
    expect(proposedCandidate(resolved).days[0]!.visits.at(-1)).toMatchObject({
      destinationId: "destination-2",
      startMinute: 840,
      plannedDurationMinutes: 60,
    });
  });

  it.each([
    ["visit outside the owned Trip", output({
      intentType: "CHANGE_TIME",
      targetVisitIds: ["visit-1", "visit-2"],
    }), { selectedVisitId: "foreign-visit" }],
    ["destination outside the eligible set", output({
      intentType: "ADD_VISIT",
      targetVisitIds: [],
      destinationId: null,
      params: { dayIndex: 1, position: null, startTime: "14:00", durationMinutes: 60 },
      affected: { visitIds: [], dayIndexes: [1] },
    }), { selectedDestinationId: "hidden-destination" }],
  ] as const)("rejects resolution for %s", async (_case, model, resolution) => {
    const test = fixture(model);
    await expect(createProposal(
      "trip-1",
      "owner-1",
      { ...request, resolution },
      test.dependencies,
    )).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(test.providerCalls).toBe(0);
  });

  it.each(["PASS", "VIOLATION", "INSUFFICIENT_DATA"] as const)(
    "returns the shared Validator's %s result with the candidate",
    async (outcome) => {
      const test = fixture();
      const validator = mockValidator(outcome);

      const result = await createProposal("trip-1", "owner-1", request, test.dependencies);

      expect(result.status).toBe("PROPOSED");
      expect(proposedCandidate(result).days[0]!.visits[0]).toMatchObject({
        visitId: "visit-1",
        startMinute: 540,
      });
      if (result.status === "PROPOSED") expect(result.validation).toEqual(validator.validation);
      expect(validator.validate).toHaveBeenCalledTimes(1);
      if (result.status === "PROPOSED") {
        expect(result.validation.canConfirm).toBe(outcome === "PASS");
      }
    },
  );

  it("rejects model-supplied validation instead of allowing AI to assert PASS", async () => {
    const modelWithClaimedPass = {
      ...output(),
      validation: { canConfirm: true },
    } as unknown as EditIntentModelOutput;
    const test = fixture(modelWithClaimedPass);
    const validator = vi.spyOn(validatorModule, "validateItinerary");

    await expect(createProposal("trip-1", "owner-1", request, test.dependencies))
      .rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });

    expect(validator).not.toHaveBeenCalled();
  });

  it("keeps the candidate and returns INSUFFICIENT_DATA when route validation times out", async () => {
    const test = fixture();
    test.failRoute();

    const result = await createProposal("trip-1", "owner-1", request, test.dependencies);

    expect(result.status).toBe("PROPOSED");
    expect(proposedCandidate(result).days[0]!.visits[0]).toMatchObject({
      visitId: "visit-1",
      startMinute: 540,
    });
    if (result.status === "PROPOSED") {
      expect(result.validation.canConfirm).toBe(false);
      expect(result.validation.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
    }
  });

  it("preserves typed provider failures for the HTTP adapter", async () => {
    const test = fixture();
    test.failProvider(new PreferenceExtractionError("PROVIDER_TIMEOUT", true));

    await expect(createProposal("trip-1", "owner-1", request, test.dependencies))
      .rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });
});
