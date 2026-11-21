import type { Database } from "@KLTN/db";
import { afterEach, expect, it, vi } from "vitest";
import { getMyTrip } from "./trip-read-service";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("reads stored Google transfer evidence after switching to Stadia without routing or exposing a member's origin", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "STADIA");
  const network = vi.fn(() => { throw new Error("read must not route"); }); vi.stubGlobal("fetch", network);
  let owner = true;
  const destination = (id: string) => ({ id, name: id, area: "Hà Giang", category: "TEST", latitude: 23, longitude: 105, visibility: "VISIBLE", deletedAt: null });
  const days = [{ id: "day", dayIndex: 1, localDate: new Date("2030-11-15"), _count: { visits: 2 }, visits: [
    { id: "v1", order: 1, startMinute: 480, plannedDurationMinutes: 60, destination: destination("a") },
    { id: "v2", order: 2, startMinute: 600, plannedDurationMinutes: 60, destination: destination("b") },
  ] }];
  const route = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 10000, provider: "GOOGLE_MAPS", geometry: { type: "LineString", coordinates: [[105, 23], [105.1, 23.1]] } };
  const row = { id: "trip", userId: "owner", startDate: new Date("2030-11-15"), durationDays: 1, transport: "CAR", manuallyCompletedAt: null, favorites: [], days,
    journeySnapshot: { revision: "journey-save-v1", journey: COMPLETE_JOURNEY_FIXTURE, visitFingerprint: '[[1,[["a",1,480,60],["b",2,600,60]]]]', plan: { policy: "roadside-rest-v1", legs: [{ kind: "TRANSFER", day: 1, from: { kind: "ATTRACTION", destinationId: "a" }, to: { kind: "ATTRACTION", destinationId: "b" }, route, startMinute: 540, endMinute: 600, restMinutes: 0 }], totals: { drivingSeconds: 3600, distanceMeters: 10000, restMinutes: 0 } } },
  };
  const database = { user: { findUnique: async () => ({ id: owner ? "owner" : "member", role: "TRAVELER" }) }, trip: { findFirst: async () => structuredClone(row) } } as unknown as Database;
  const deps = { database, resolveSession: async () => ({ user: { id: owner ? "owner" : "member" } }) };
  const before = JSON.stringify(row);
  const read = () => getMyTrip(new Headers(), "trip", deps, "2030-11-15");
  expect((await read()).days[0]!.visits[1]!.inbound).toMatchObject({ provider: "GOOGLE_MAPS", durationSeconds: 3600, fromDestinationId: "a", toDestinationId: "b" });
  owner = false;
  expect(await read()).not.toHaveProperty("journey");
  expect((await read()).days[0]!.visits[1]!.inbound).toMatchObject({ provider: "GOOGLE_MAPS" });
  expect(network).not.toHaveBeenCalled(); expect(JSON.stringify(row)).toBe(before);
});
