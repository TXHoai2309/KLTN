import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";
import { getMyTrip, type TripReadDependencies } from "./trip-read-service";

const NOW = new Date("2026-11-20T00:00:00.000Z");
const day = (ms: number) => new Date(NOW.getTime() - ms * 86_400_000);
const kltn = { id: "d1", name: "Cột cờ Lũng Cú", area: "Đồng Văn", category: "Lịch sử", latitude: 23.36, longitude: 105.31, address: null, description: "", visibility: "VISIBLE", deletedAt: null };
const items = [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:ChIJx" }];

function deps(fetchedDaysAgo: number, user = "owner", withExternal = true) {
  const row = {
    id: "t1", userId: "owner", startDate: new Date("2026-12-01T00:00:00.000Z"), durationDays: 1, transport: "CAR", manuallyCompletedAt: null, updatedAt: NOW, journeySnapshot: null,
    user: { name: "Chủ" }, favorites: [], companionPublication: user === "member" ? { id: "p", title: "Nhóm" } : null,
    uncheckedChecks: withExternal ? { revision: "unchecked-save-v1", items } : null, uncheckedConfirmedAt: withExternal ? day(1) : null,
    days: [{ id: "day1", dayIndex: 1, localDate: new Date("2026-12-01T00:00:00.000Z"), _count: { visits: 2 }, visits: [
      { id: "v1", order: 1, startMinute: 480, plannedDurationMinutes: 60, destinationId: "d1", externalPlaceId: null, destination: kltn, externalPlace: null },
      ...(withExternal ? [{ id: "v2", order: 2, startMinute: 600, plannedDurationMinutes: 60, destinationId: null, externalPlaceId: "e1", destination: null,
        externalPlace: { providerPlaceId: "ChIJx", name: "Quán Cà Phê Mèo", latitude: 22.8, longitude: 104.98, fetchedAt: day(fetchedDaysAgo) } }] : []),
    ] }],
  };
  return { user: { findUnique: async () => ({ id: user, role: "TRAVELER" }) }, trip: { findFirst: async () => row } } as unknown as Database;
}
const read = (database: Database, user = "owner") => getMyTrip(new Headers(), "t1", { database, resolveSession: async () => ({ user: { id: user } }) } as unknown as TripReadDependencies, "2026-11-20", NOW);

describe("reading a Trip that has an external place", () => {
  it("owner sees the cached name and coordinates within 30 days, the external marker and the unchecked list", async () => {
    const trip = await read(deps(5));
    const visit = trip.days[0]!.visits[1]!;
    expect(visit.destination).toMatchObject({ id: "ext:google:ChIJx", name: "Quán Cà Phê Mèo", latitude: 22.8, longitude: 104.98, external: true });
    expect(trip.days[0]!.visits[0]!.destination.external).toBeUndefined();
    expect(trip.unchecked).toEqual({ items, confirmedAt: day(1).toISOString() });
  });

  it("after 30 days the cache is empty: generic Vietnamese label, no coordinates", async () => {
    const visit = (await read(deps(31))).days[0]!.visits[1]!;
    expect(visit.destination).toMatchObject({ id: "ext:google:ChIJx", name: "Địa điểm ngoài danh mục", external: true });
    expect(visit.destination.latitude).toBeUndefined();
    expect(visit.destination.longitude).toBeUndefined();
    expect((await read(deps(30))).days[0]!.visits[1]!.destination.name).toBe("Quán Cà Phê Mèo");
  });

  it("a companion member gets the generic label, no coordinates and no unchecked list", async () => {
    const trip = await read(deps(1, "member"), "member");
    expect(trip.days[0]!.visits[1]!.destination).toMatchObject({ name: "Địa điểm ngoài danh mục", external: true });
    expect(trip.days[0]!.visits[1]!.destination.latitude).toBeUndefined();
    expect(trip.unchecked).toBeUndefined();
  });

  it("a Trip without external places is unchanged: no unchecked property", async () => {
    const trip = await read(deps(1, "owner", false));
    expect(trip).not.toHaveProperty("unchecked");
    expect(trip.days[0]!.visits).toHaveLength(1);
  });
});
