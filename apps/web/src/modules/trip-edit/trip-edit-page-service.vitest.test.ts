import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import { AppError } from "@/server/http/app-error";
import { getTripForEdit, type TripEditPageDependencies } from "./trip-edit-service";

const updatedAt = new Date("2026-10-16T10:00:00.000Z");

function fixture() {
  const tripQueries: unknown[] = [];
  const row = {
    id: "trip-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt,
    days: [{
      id: "day-1",
      dayIndex: 1,
      visits: [{
        id: "visit-1",
        order: 1,
        startMinute: 480,
        plannedDurationMinutes: 60,
        destination: { id: "destination-1", name: "Hẻm Tu Sản", area: "Mèo Vạc", visibility: "VISIBLE" as const },
      }],
    }],
  };
  const database = {
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: {
      findFirst: async (query: unknown) => {
        tripQueries.push(query);
        return row;
      },
    },
  };
  const dependencies: TripEditPageDependencies = {
    database: database as unknown as Database,
    resolveSession: async () => ({ user: { id: "owner-1", role: "TRAVELER" } }),
  };
  return { dependencies, tripQueries };
}

describe("getTripForEdit", () => {
  it("returns a candidate and revision from one owner-scoped Trip snapshot", async () => {
    const test = fixture();

    const result = await getTripForEdit(new Headers(), "trip-1", test.dependencies);

    expect(test.tripQueries).toEqual([{
      where: { id: "trip-1", userId: "owner-1" },
      select: expect.objectContaining({ updatedAt: true, days: expect.any(Object) }),
    }]);
    expect(result.baseRevision).toBe(updatedAt.toISOString());
    expect(result.candidate.days[0]?.visits[0]?.visitId).toBe("visit-1");
    expect(result.destinationLabels["destination-1"]).toBe("Hẻm Tu Sản · Mèo Vạc");
  });

  it("maps a missing or non-owned Trip to the same not-found error", async () => {
    const test = fixture();
    const database = test.dependencies.database as unknown as {
      trip: { findFirst: (query: unknown) => Promise<null> };
    };
    database.trip.findFirst = async () => null;

    await expect(getTripForEdit(new Headers(), "trip-1", test.dependencies)).rejects.toMatchObject({
      status: 404,
      code: "TRIP_NOT_FOUND",
    } satisfies Partial<AppError>);
  });
});
