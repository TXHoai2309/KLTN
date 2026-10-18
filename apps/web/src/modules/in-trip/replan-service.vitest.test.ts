import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import type { Database } from "@KLTN/db";

import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { replanTrip } from "./replan-service";

const updatedAt = new Date("2026-10-17T00:00:00.000Z");

function tripFixture() {
  return {
    id: "trip-1",
    userId: "traveler-1",
    startDate: new Date("2026-10-17T00:00:00.000Z"),
    durationDays: 2,
    transport: "CAR",
    updatedAt,
    days: [
      {
        dayIndex: 1,
        localDate: new Date("2026-10-17T00:00:00.000Z"),
        visits: [
          {
            id: "completed-1",
            destinationId: "destination-a",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destination: { id: "destination-a", name: "Đã qua giờ", visibility: "VISIBLE" },
          },
          {
            id: "remaining-1",
            destinationId: "destination-b",
            order: 2,
            startMinute: 1200,
            plannedDurationMinutes: 60,
            destination: { id: "destination-b", name: "Buổi tối", visibility: "VISIBLE" },
          },
        ],
      },
      {
        dayIndex: 2,
        localDate: new Date("2026-10-18T00:00:00.000Z"),
        visits: [],
      },
    ],
  };
}

function fixture(options: { trip?: ReturnType<typeof tripFixture> | null; output?: unknown } = {}) {
  const trip = options.trip === undefined ? tripFixture() : options.trip;
  let tripQuery: unknown;
  let destinationQueries = 0;
  let providerCalls = 0;
  const writes: string[] = [];
  const database = {
    trip: {
      findFirst: async (query: unknown) => {
        tripQuery = query;
        return trip;
      },
      update: async () => writes.push("trip.update"),
      create: async () => writes.push("trip.create"),
      delete: async () => writes.push("trip.delete"),
    },
    destination: {
      findMany: async () => {
        destinationQueries += 1;
        return [
          {
            id: "destination-new",
            name: "Điểm đến mới",
            latitude: 22.8,
            longitude: 104.9,
            suggestedDurationMinutes: 60,
          },
        ];
      },
    },
  } as unknown as Database;
  const output = options.output ?? {
    operations: [
      {
        operationType: "CHANGE_TIME",
        targetVisitId: "remaining-1",
        destinationId: null,
        params: { dayIndex: null, position: null, startTime: "21:00", durationMinutes: null },
      },
    ],
    mandatoryEndpoint: null,
    needsClarification: false,
    clarificationReason: null,
  };
  const llm = {
    complete: async () => {
      providerCalls += 1;
      return { rawText: JSON.stringify(output), model: "fake-model" };
    },
  } as StructuredLlmClient;
  return {
    trip,
    database,
    llm,
    writes,
    getTripQuery: () => tripQuery,
    destinationQueries: () => destinationQueries,
    providerCalls: () => providerCalls,
    dependencies: {
      database,
      llm,
      now: () => new Date("2026-10-17T10:00:00.000Z"),
      createVisitId: () => "new-visit-id",
    },
  };
}

const request = {
  baseRevision: updatedAt.toISOString(),
  location: {
    source: "MANUAL" as const,
    latitude: 22.8,
    longitude: 104.9,
    accuracyMeters: null,
    capturedAt: "2026-10-17T09:00:00.000Z",
  },
  need: "Đổi giờ buổi tối.",
};

describe("US36 Task289 replan service", () => {
  it("creates a candidate from only verified operations and leaves the persisted Trip unchanged", async () => {
    const f = fixture();
    const original = structuredClone(f.trip);
    const result = await replanTrip("trip-1", "traveler-1", request, f.dependencies);

    assert.equal(result.status, "PROPOSED");
    if (result.status !== "PROPOSED") return;
    expect(result.completedVisitIds).toEqual(["completed-1"]);
    expect(result.candidate.days[0]?.visits).toEqual([
      {
        visitId: "completed-1",
        destinationId: "destination-a",
        startMinute: 480,
        plannedDurationMinutes: 60,
        order: 1,
      },
      {
        visitId: "remaining-1",
        destinationId: "destination-b",
        startMinute: 1260,
        plannedDurationMinutes: 60,
        order: 2,
      },
    ]);
    expect(result.diff.updated.map((visit) => visit.visitId)).toEqual(["remaining-1"]);
    expect(f.trip).toEqual(original);
    expect(f.writes).toEqual([]);
    expect(f.getTripQuery()).toMatchObject({ where: { id: "trip-1", userId: "traveler-1" } });
  });

  it("rejects a verified model operation targeting a completed visit", async () => {
    const f = fixture({
      output: {
        operations: [
          {
            operationType: "REMOVE_VISIT",
            targetVisitId: "completed-1",
            destinationId: null,
            params: { dayIndex: null, position: null, startTime: null, durationMinutes: null },
          },
        ],
        mandatoryEndpoint: null,
        needsClarification: false,
        clarificationReason: null,
      },
    });

    await expect(
      replanTrip("trip-1", "traveler-1", request, f.dependencies),
    ).rejects.toMatchObject({ code: "REPLAN_TOUCHED_COMPLETED", status: 422 });
    expect(f.writes).toEqual([]);
  });

  it("returns ALL_COMPLETED without loading destinations or calling the provider", async () => {
    const f = fixture();
    f.dependencies.now = () => new Date("2026-10-19T00:00:00.000Z");

    await expect(replanTrip("trip-1", "traveler-1", request, f.dependencies)).resolves.toEqual({
      status: "ALL_COMPLETED",
    });
    expect(f.destinationQueries()).toBe(0);
    expect(f.providerCalls()).toBe(0);
  });

  it("returns clarification without a candidate when the AI asks for more detail", async () => {
    const f = fixture({
      output: {
        operations: [],
        mandatoryEndpoint: null,
        needsClarification: true,
        clarificationReason: "MISSING_TIME",
      },
    });
    await expect(replanTrip("trip-1", "traveler-1", request, f.dependencies)).resolves.toEqual({
      status: "NEEDS_CLARIFICATION",
      clarificationReason: "MISSING_TIME",
      clarification: expect.objectContaining({
        code: "MISSING_TIME",
        prompt: expect.stringContaining("trước mấy giờ"),
      }),
    });
  });

  it("does not invent visit time or duration when the mandatory endpoint is absent from the candidate", async () => {
    const f = fixture({
      output: {
        operations: [],
        mandatoryEndpoint: { destinationId: "destination-new", deadline: "18:00" },
        needsClarification: false,
        clarificationReason: null,
      },
    });
    await expect(replanTrip("trip-1", "traveler-1", request, f.dependencies)).rejects.toMatchObject({
      code: "REPLAN_ENDPOINT_NOT_IN_CANDIDATE",
      status: 422,
    });
  });

  it("returns a verified mandatory endpoint alongside the candidate and moves it to the end", async () => {
    const f = fixture({
      output: {
        operations: [
          {
            operationType: "ADD_VISIT",
            targetVisitId: null,
            destinationId: "destination-new",
            params: { dayIndex: 1, position: null, startTime: "18:00", durationMinutes: 60 },
          },
        ],
        mandatoryEndpoint: { destinationId: "destination-new", deadline: "19:00" },
        needsClarification: false,
        clarificationReason: null,
      },
    });
    const result = await replanTrip("trip-1", "traveler-1", request, f.dependencies);

    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") return;
    expect(result.mandatoryEndpoint).toEqual({
      destinationId: "destination-new",
      deadline: "19:00",
    });
    expect(result.candidate.days[0]?.visits.at(-1)).toMatchObject({
      destinationId: "destination-new",
      order: 3,
    });
  });

  it("turns a missing mandatory deadline into code-generated clarification with no candidate", async () => {
    const f = fixture({
      output: {
        operations: [],
        mandatoryEndpoint: { destinationId: "destination-new", deadline: null },
        needsClarification: false,
        clarificationReason: null,
      },
    });
    const result = await replanTrip("trip-1", "traveler-1", request, f.dependencies);

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (result.status !== "NEEDS_CLARIFICATION") return;
    expect(result.clarification).toMatchObject({
      code: "MISSING_TIME",
      prompt: expect.stringContaining("trước mấy giờ"),
    });
    expect("candidate" in result).toBe(false);
  });

  it("turns a missing mandatory destination into a server-choice clarification with no candidate", async () => {
    const f = fixture({
      output: {
        operations: [],
        mandatoryEndpoint: { destinationId: null, deadline: "19:00" },
        needsClarification: false,
        clarificationReason: null,
      },
    });
    const result = await replanTrip("trip-1", "traveler-1", request, f.dependencies);

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (result.status !== "NEEDS_CLARIFICATION") return;
    expect(result.clarification).toMatchObject({
      code: "AMBIGUOUS_DESTINATION",
      choices: [{
        label: "Điểm đến mới",
        resolution: { selectedDestinationId: "destination-new" },
      }],
    });
    expect("candidate" in result).toBe(false);
  });

  it("revalidates a resolution against remaining visits before calling the provider", async () => {
    const f = fixture();
    await expect(
      replanTrip(
        "trip-1",
        "traveler-1",
        { ...request, resolution: { selectedVisitId: "completed-1" } },
        f.dependencies,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(f.providerCalls()).toBe(0);
  });

  it("masks a missing or foreign Trip as 404 using the owner-scoped query", async () => {
    const f = fixture({ trip: null });
    await expect(replanTrip("trip-foreign", "traveler-1", request, f.dependencies)).rejects.toMatchObject({
      code: "TRIP_NOT_FOUND",
      status: 404,
    });
    expect(f.getTripQuery()).toMatchObject({ where: { id: "trip-foreign", userId: "traveler-1" } });
    expect(f.providerCalls()).toBe(0);
  });

  it("rejects a stale baseRevision before reading server time or calling providers", async () => {
    const f = fixture();
    let clockReads = 0;
    f.dependencies.now = () => {
      clockReads += 1;
      return new Date("2026-10-17T10:00:00.000Z");
    };
    await expect(
      replanTrip("trip-1", "traveler-1", { ...request, baseRevision: "2026-10-16T00:00:00.000Z" }, f.dependencies),
    ).rejects.toMatchObject({ code: "TRIP_REVISION_CONFLICT", status: 409 });
    expect(clockReads).toBe(0);
    expect(f.providerCalls()).toBe(0);
  });
});
