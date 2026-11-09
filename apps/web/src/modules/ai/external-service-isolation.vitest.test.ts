import type { Database } from "@KLTN/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listPublicCulture } from "../culture/public-culture-list";
import { listPublicLocations } from "../destination/public-destination-list";
import { getMyTrip, listMyTrips, type TripReadDependencies } from "../trip-read/trip-read-service";
import { validateItinerary } from "../trip-validation/trip-validation";

afterEach(() => vi.unstubAllGlobals());

const reference = new Date("2026-10-15T00:00:00.000Z");
const visit = {
  visitId: "visit-1",
  dayIndex: 1,
  order: 1,
  localDate: "2026-10-20",
  startMinute: 480,
  plannedDurationMinutes: 60,
  minimumDurationMinutes: 30,
  openingDays: [{
    dayOfWeek: "TUESDAY" as const,
    status: "OPEN" as const,
    intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
  }],
};

function publicDatabase() {
  return {
    destination: {
      findMany: async (query: { select: { id?: boolean }; where: { visibility: string } }) => query.select.id
        ? [{
            id: "destination-1",
            name: "Điểm công khai",
            area: "Đồng Văn",
            category: "Thiên nhiên",
            latitude: 23.2,
            longitude: 105.3,
            media: [],
          }]
        : [{ category: "Thiên nhiên", area: "Đồng Văn" }],
    },
    cultureContent: {
      findMany: async () => [{
        id: "culture-1",
        title: "Văn hóa Hà Giang",
        content: "Nội dung đã kiểm duyệt",
        sourceTitle: "Nguồn",
        sourceUrl: "https://example.org/source",
        destinations: [{ destination: { id: "destination-1", name: "Điểm công khai" } }],
      }],
    },
  } as unknown as Pick<Database, "destination" | "cultureContent">;
}

function tripDependencies(): TripReadDependencies {
  const summary = {
    id: "trip-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    manuallyCompletedAt: null,
    favorites: [],
  };
  const database = {
    user: { findUnique: async () => ({ id: "traveler-1", role: "TRAVELER" }) },
    trip: {
      findMany: async () => [{ ...summary, days: [{ _count: { visits: 1 } }] }],
      findFirst: async () => ({
        ...summary,
        days: [{
          id: "day-1",
          dayIndex: 1,
          localDate: new Date("2026-10-20T00:00:00.000Z"),
          _count: { visits: 1 },
          visits: [{
            id: "visit-1",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destination: {
              id: "destination-1",
              name: "Điểm công khai",
              area: "Đồng Văn",
              category: "Thiên nhiên",
              latitude: 23.2,
              longitude: 105.3,
              address: null,
              description: "Mô tả",
              visibility: "VISIBLE",
              deletedAt: null,
            },
          }],
        }],
      }),
    },
  } as unknown as Database;
  return {
    database,
    resolveSession: async () => ({ user: { id: "traveler-1", role: "TRAVELER" } }),
  };
}

describe("US-40 service isolation", () => {
  it("keeps Explore, Culture, My Trips and Trip Detail independent when OpenAI is down", async () => {
    const fetcher = vi.fn(async () => { throw new Error("simulated OpenAI outage"); });
    vi.stubGlobal("fetch", fetcher);
    const database = publicDatabase();
    const trips = tripDependencies();

    const [destinations, culture, tripList, detail] = await Promise.all([
      listPublicLocations({}, database),
      listPublicCulture(1, database),
      listMyTrips(new Headers(), trips, "2026-10-19"),
      getMyTrip(new Headers(), "trip-1", trips, "2026-10-19"),
    ]);

    expect(destinations.items.map((item) => item.id)).toEqual(["destination-1"]);
    expect(culture.items.map((item) => item.id)).toEqual(["culture-1"]);
    expect(tripList.items.map((item) => item.id)).toEqual(["trip-1"]);
    expect(detail.days[0]?.visits[0]?.destination.id).toBe("destination-1");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps database reads available when routing is down and blocks confirmation", async () => {
    const database = publicDatabase();
    const trips = tripDependencies();
    const [destinations, tripList, detail] = await Promise.all([
      listPublicLocations({}, database),
      listMyTrips(new Headers(), trips, "2026-10-19"),
      getMyTrip(new Headers(), "trip-1", trips, "2026-10-19"),
    ]);
    const validation = validateItinerary([
      visit,
      { ...visit, visitId: "visit-2", order: 2, startMinute: 600 },
    ], [{ fromVisitId: "visit-1", toVisitId: "visit-2", route: { kind: "unavailable" } }], reference);

    expect(destinations.items).toHaveLength(1);
    expect(tripList.items).toHaveLength(1);
    expect(detail.id).toBe("trip-1");
    expect(validation.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
    expect(validation.canConfirm).toBe(false);
  });

  it("classifies missing business data separately from AI and routing failures", () => {
    const validation = validateItinerary([{
      ...visit,
      minimumDurationMinutes: null,
      openingDays: [],
    }], [], reference);

    expect(validation.groups.openingHours.status).toBe("INSUFFICIENT_DATA");
    expect(validation.groups.minimumDuration.status).toBe("INSUFFICIENT_DATA");
    expect(validation.groups.travelTime.status).toBe("SATISFIED");
    expect(validation.groups.openingHours.findings[0]?.reasonCode).toBe("OPENING_HOURS_MISSING");
    expect(validation.canConfirm).toBe(false);
  });

  it("does not misclassify a database failure as an AI failure", async () => {
    const database = {
      destination: { findMany: async () => { throw new Error("private database failure"); } },
    } as unknown as Pick<Database, "destination">;

    await expect(listPublicLocations({}, database)).rejects.toThrow("private database failure");
  });
});
