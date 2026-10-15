import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import { listTripsResponse, tripDetailResponse } from "./trip-read-http";
import type { TripReadDependencies } from "./trip-read-service";

const now = new Date("2026-10-09T18:30:00.000Z"); // Oct 10 in Vietnam.

function fixture(owner = "a", withDetail = false) {
  const where: unknown[] = [];
  const deps: TripReadDependencies = {
    resolveSession: async () => ({ user: { id: owner, role: "TRAVELER" } }),
    database: {
      user: { findUnique: async () => ({ id: owner, role: "TRAVELER" }) },
      trip: {
        findMany: async (args: { where: unknown }) => { where.push(args.where); return []; },
        findFirst: async (args: { where: unknown }) => {
          where.push(args.where);
          return withDetail ? { id: "own", startDate: new Date("2026-10-10T00:00:00.000Z"), durationDays: 1, transport: "CAR", days: [] } : null;
        },
      },
    } as unknown as Database,
  };
  return { deps, where };
}

describe("US-31 read HTTP", () => {
  it("returns a private empty list as success and ignores no client identity", async () => {
    const test = fixture();
    const response = await listTripsResponse(new Request("https://example.test/api/trips"), test.deps, now);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ success: true, data: { items: [] } });
    expect(test.where).toEqual([{ userId: "a" }]);
  });
  it("rejects userId query parameters", async () => {
    const test = fixture();
    const response = await listTripsResponse(new Request("https://example.test/api/trips?userId=b"), test.deps, now);
    expect(response.status).toBe(400);
    expect(test.where).toEqual([]);
  });
  it("uses the same 404 for missing and foreign detail", async () => {
    const test = fixture();
    const response = await tripDetailResponse(new Request("https://example.test/api/trips/other"), "other", test.deps, now);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("TRIP_NOT_FOUND");
    expect(test.where).toEqual([{ id: "other", userId: "a" }]);
  });
  it("returns owned detail with a Vietnam-calendar status", async () => {
    const test = fixture("a", true);
    const response = await tripDetailResponse(new Request("https://example.test/api/trips/own"), "own", test.deps, now);
    expect(response.status).toBe(200);
    expect((await response.json()).data.trip).toMatchObject({ id: "own", status: "ONGOING", endDate: "2026-10-10", days: [] });
    expect(test.where).toEqual([{ id: "own", userId: "a" }]);
  });
  it("denies Guest before querying trips", async () => {
    const test = fixture(); test.deps.resolveSession = async () => null;
    const response = await listTripsResponse(new Request("https://example.test/api/trips"), test.deps, now);
    expect(response.status).toBe(401);
    expect(test.where).toEqual([]);
  });
});
