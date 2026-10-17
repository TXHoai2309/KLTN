import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { deriveTripStatus } from "./trip-status";
import { getMyTrip, listMyTrips, type TripReadDependencies } from "./trip-read-service";

const headers = new Headers();
const dates = ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"];

describe("US-31 calendar status", () => {
  it.each([
    [dates[0], "UPCOMING"], [dates[1], "ONGOING"], [dates[2], "ONGOING"],
    [dates[3], "ONGOING"], [dates[4], "COMPLETED"],
  ] as const)("returns %s as %s for a 3-day trip", (reference, expected) => {
    expect(deriveTripStatus("2026-10-10", 3, reference)).toEqual({ status: expected, endDate: "2026-10-12" });
  });
  it("keeps a one-day trip ongoing on its start/end date", () => {
    expect(deriveTripStatus("2026-10-10", 1, "2026-10-10")).toEqual({ status: "ONGOING", endDate: "2026-10-10" });
    expect(deriveTripStatus("2026-10-10", 1, "2026-10-11").status).toBe("COMPLETED");
  });
  it("uses the Vietnam calendar at the UTC day boundary", () => {
    expect(vietnamDateOf(new Date("2026-10-09T16:59:00.000Z"))).toBe("2026-10-09");
    expect(vietnamDateOf(new Date("2026-10-09T17:00:00.000Z"))).toBe("2026-10-10");
  });
});

const trip = (id: string, userId: string) => ({ id, userId, startDate: new Date("2026-10-10T00:00:00.000Z"), durationDays: 2, transport: "CAR" as const });

function fixture() {
  const rows = [trip("mine", "a"), trip("other", "b")];
  let favoriteOwner = "a";
  let session: { user: { id: string; role: string } } | null = { user: { id: "a", role: "TRAVELER" } };
  let persistedRole = "TRAVELER";
  const calls: { list?: unknown; detail?: unknown } = {};
  const database = {
    user: { findUnique: async () => ({ id: "a", role: persistedRole }) },
    trip: {
      findMany: async (args: { where: { userId: string }; select: Record<string, unknown> }) => {
        calls.list = args;
        return rows.filter(row => row.userId === args.where.userId).map(row => ({ ...row, favorites: favoriteOwner === args.where.userId ? [{ id: "favorite" }] : [] }));
      },
      findFirst: async (args: { where: { id: string; userId: string } }) => {
        calls.detail = args;
        const row = rows.find(item => item.id === args.where.id && item.userId === args.where.userId);
        return row && { ...row, favorites: favoriteOwner === args.where.userId ? [{ id: "favorite" }] : [], days: [
          { id: "day-2", dayIndex: 2, localDate: new Date("2026-10-11T00:00:00.000Z"), visits: [
            { id: "visit-2", order: 2, startMinute: 600, plannedDurationMinutes: 60, destination: { id: "d2", name: "B", area: "Đồng Văn", visibility: "VISIBLE" } },
            { id: "visit-1", order: 1, startMinute: 480, plannedDurationMinutes: 90, destination: { id: "d1", name: "A", area: "Mèo Vạc", visibility: "HIDDEN" } },
          ] },
          { id: "day-1", dayIndex: 1, localDate: new Date("2026-10-10T00:00:00.000Z"), visits: [] },
        ] };
      },
    },
  };
  const dependencies: TripReadDependencies = { database: database as unknown as Database, resolveSession: async () => session };
  return { dependencies, calls, setFavoriteOwner: (owner: string) => { favoriteOwner = owner; }, setSession: (value: typeof session) => { session = value; }, setRole: (value: string) => { persistedRole = value; } };
}

describe("US-31 owned Trip reads", () => {
  it("US-34 includes only the actor's Favorite state in list and detail without per-trip reads", async () => {
    const test = fixture();
    expect((await listMyTrips(headers, test.dependencies, "2026-10-10")).items[0]).toHaveProperty("isFavorite", true);
    expect(await getMyTrip(headers, "mine", test.dependencies, "2026-10-10")).toHaveProperty("isFavorite", true);
    for (const query of [test.calls.list, test.calls.detail]) {
      expect(query).toMatchObject({ select: { favorites: { where: { userId: "a" }, select: { id: true } } } });
    }
    test.setFavoriteOwner("b");
    expect((await listMyTrips(headers, test.dependencies, "2026-10-10")).items[0]).toHaveProperty("isFavorite", false);
    expect(await getMyTrip(headers, "mine", test.dependencies, "2026-10-10")).toHaveProperty("isFavorite", false);
  });
  it("lists only current Traveler trips and omits visits", async () => {
    const test = fixture();
    const result = await listMyTrips(headers, test.dependencies, "2026-10-09");
    expect(result.items.map(item => item.id)).toEqual(["mine"]);
    expect(result.items[0]).toMatchObject({ startDate: "2026-10-10", endDate: "2026-10-11", transport: "CAR", status: "UPCOMING" });
    expect(test.calls.list).toMatchObject({ where: { userId: "a" } });
    expect((test.calls.list as { select: Record<string, unknown> }).select).not.toHaveProperty("days");
  });
  it("reads own detail and orders days and visits", async () => {
    const test = fixture();
    const result = await getMyTrip(headers, "mine", test.dependencies, "2026-10-10");
    expect(test.calls.detail).toMatchObject({ where: { id: "mine", userId: "a" } });
    expect(result.days.map(day => day.dayIndex)).toEqual([1, 2]);
    expect(result.days[1].visits.map(visit => visit.order)).toEqual([1, 2]);
    expect(result.days[1].visits[0].destination).toMatchObject({ name: "A", visibility: "HIDDEN" });
  });
  it("returns identical 404 for another owner's and missing Trip", async () => {
    const test = fixture();
    await expect(getMyTrip(headers, "other", test.dependencies, "2026-10-10")).rejects.toMatchObject({ status: 404, code: "TRIP_NOT_FOUND" });
    await expect(getMyTrip(headers, "missing", test.dependencies, "2026-10-10")).rejects.toMatchObject({ status: 404, code: "TRIP_NOT_FOUND" });
  });
  it("denies Guest and lets Admin read only owned Trips", async () => {
    const test = fixture(); test.setSession(null);
    await expect(listMyTrips(headers, test.dependencies, "2026-10-10")).rejects.toMatchObject({ status: 401 });
    test.setSession({ user: { id: "a", role: "ADMIN" } }); test.setRole("ADMIN");
    expect((await listMyTrips(headers, test.dependencies, "2026-10-10")).items.map(item => item.id)).toEqual(["mine"]);
    expect(await getMyTrip(headers, "mine", test.dependencies, "2026-10-10")).toHaveProperty("id", "mine");
    for (const id of ["other", "missing"]) {
      await expect(getMyTrip(headers, id, test.dependencies, "2026-10-10")).rejects.toMatchObject({ status: 404, code: "TRIP_NOT_FOUND" });
    }
  });
});
