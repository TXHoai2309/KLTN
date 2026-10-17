import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import type { EditCandidate } from "./edit-candidate";
import { previewEdit, type TripEditServiceDependencies } from "./trip-edit-service";

const reference = new Date("2026-10-16T10:00:00.000Z");
const updatedAt = new Date("2026-10-15T12:00:00.000Z");

const candidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{
    dayIndex: 1,
    visits: [{
      visitId: "visit-1",
      destinationId: "destination-1",
      startMinute: 480,
      plannedDurationMinutes: 60,
      order: 1,
    }],
  }],
};

function fixture() {
  let tripExists = true;
  let destinationVisible = true;
  let minimumDurationMinutes: number | null = 30;
  let openingStatus: "OPEN" | "UNKNOWN" = "OPEN";
  const tripQueries: unknown[] = [];
  const destinationQueries: unknown[] = [];
  const row: {
    id: string;
    visibility: "VISIBLE" | "HIDDEN";
    latitude: number;
    longitude: number;
    minimumDurationMinutes: number | null;
    openingDays: { dayOfWeek: "TUESDAY"; status: "OPEN" | "UNKNOWN"; intervals: { opensAtMinute: number; closesAtMinute: number }[] }[];
  } = {
    id: "destination-1",
    visibility: "VISIBLE" as "VISIBLE" | "HIDDEN",
    latitude: 23,
    longitude: 105,
    minimumDurationMinutes,
    openingDays: [{
      dayOfWeek: "TUESDAY",
      status: openingStatus,
      intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
    }],
  };
  const database = {
    trip: {
      findFirst: async (query: { where: { id: string; userId: string } }) => {
        tripQueries.push(query);
        return tripExists && query.where.id === "trip-1" && query.where.userId === "owner-1"
          ? {
              id: "trip-1",
              userId: "owner-1",
              startDate: new Date("2026-10-20T00:00:00.000Z"),
              durationDays: 1,
              transport: "CAR",
              updatedAt,
            }
          : null;
      },
    },
    destination: {
      findMany: async (query: { where: { id: { in: string[] }; visibility: string } }) => {
        destinationQueries.push(query);
        row.visibility = destinationVisible ? "VISIBLE" : "HIDDEN";
        row.minimumDurationMinutes = minimumDurationMinutes;
        row.openingDays[0]!.status = openingStatus;
        return query.where.id.in.includes(row.id) && row.visibility === query.where.visibility
          ? [structuredClone(row)]
          : [];
      },
    },
  };
  const dependencies: TripEditServiceDependencies = {
    database: database as unknown as Database,
    getRoute: async () => ({ kind: "ok", durationSeconds: 0 }),
  };

  return {
    dependencies,
    tripQueries,
    destinationQueries,
    hideDestination: () => { destinationVisible = false; },
    removeTrip: () => { tripExists = false; },
    makeInsufficient: () => { minimumDurationMinutes = null; openingStatus = "UNKNOWN"; },
  };
}

describe("previewEdit", () => {
  it("reads the Trip by both id and session userId, then returns all four Validator groups", async () => {
    const test = fixture();
    const result = await previewEdit(
      "trip-1",
      "owner-1",
      updatedAt.toISOString(),
      candidate,
      test.dependencies,
      reference,
    );

    expect(test.tripQueries[0]).toMatchObject({ where: { id: "trip-1", userId: "owner-1" } });
    expect(result).toMatchObject({
      baseRevision: updatedAt.toISOString(),
      eligibleForConfirmation: true,
      validation: {
        groups: {
          openingHours: { status: "SATISFIED" },
          minimumDuration: { status: "SATISFIED" },
          travelTime: { status: "SATISFIED" },
          scheduleConflict: { status: "SATISFIED" },
        },
      },
    });
  });

  it("returns the same 404 for a foreign-owned and a missing Trip", async () => {
    const foreign = fixture();
    await expect(previewEdit(
      "trip-1",
      "another-user",
      updatedAt.toISOString(),
      candidate,
      foreign.dependencies,
      reference,
    )).rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });
    expect(foreign.tripQueries[0]).toMatchObject({ where: { id: "trip-1", userId: "another-user" } });
    expect(foreign.destinationQueries).toHaveLength(0);

    const missing = fixture();
    missing.removeTrip();
    await expect(previewEdit(
      "trip-1",
      "owner-1",
      updatedAt.toISOString(),
      candidate,
      missing.dependencies,
      reference,
    )).rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });
    expect(missing.destinationQueries).toHaveLength(0);
  });

  it("rejects a hidden destination through the shared eligibility helper", async () => {
    const test = fixture();
    test.hideDestination();

    await expect(previewEdit(
      "trip-1",
      "owner-1",
      updatedAt.toISOString(),
      candidate,
      test.dependencies,
      reference,
    )).rejects.toMatchObject({ code: "DESTINATION_UNAVAILABLE", status: 422 });
    expect(test.destinationQueries).toHaveLength(1);
  });

  it("returns INSUFFICIENT_DATA without making the candidate confirmable", async () => {
    const test = fixture();
    test.makeInsufficient();

    const result = await previewEdit(
      "trip-1",
      "owner-1",
      updatedAt.toISOString(),
      candidate,
      test.dependencies,
      reference,
    );

    expect(result.validation.groups.openingHours.status).toBe("INSUFFICIENT_DATA");
    expect(result.validation.groups.minimumDuration.status).toBe("INSUFFICIENT_DATA");
    expect(result.validation.canConfirm).toBe(false);
    expect(result.eligibleForConfirmation).toBe(false);
  });

  it("returns revision conflict before reading destination eligibility data", async () => {
    const test = fixture();

    await expect(previewEdit(
      "trip-1",
      "owner-1",
      "2026-10-14T12:00:00.000Z",
      candidate,
      test.dependencies,
      reference,
    )).rejects.toMatchObject({ code: "TRIP_REVISION_CONFLICT", status: 409 });
    expect(test.destinationQueries).toHaveLength(0);
  });
});
