import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { applyEdit, type ApplyEditDependencies } from "./apply-edit";
import type { EditCandidate } from "./edit-candidate";
import { editCandidateToPlannerDays } from "./edit-map-adapter";
import { assessEditUnchecked, isExternalPlaceId } from "./edit-unchecked";
import { getTripForEdit, previewEdit } from "./trip-edit-service";
import type { TripValidation } from "../trip-validation/trip-validation";

const revision = new Date("2026-11-18T10:00:00.000Z");
const nowWithinCache = new Date("2026-11-20T00:00:00.000Z"); // fetchedAt = 2026-11-10 -> 10 days old (fresh <= 30d)
const nowExpiredCache = new Date("2026-12-20T00:00:00.000Z"); // 40 days old (> 30d)

function mixedFixture() {
  const trip = {
    id: "trip-ext-1",
    userId: "owner-1",
    startDate: new Date("2027-01-10T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt: revision,
    manuallyCompletedAt: null as Date | null,
    journeySnapshot: null,
    uncheckedChecks: {
      revision: "unchecked-save-v1",
      items: [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:ChIJx" }],
    } as unknown,
    uncheckedConfirmedAt: new Date("2026-11-10T00:00:00.000Z") as Date | null,
    days: [
      {
        id: "day-1",
        dayIndex: 1,
        visits: [
          {
            id: "visit-cat",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destinationId: "dest-1",
            destination: {
              id: "dest-1",
              name: "Quản Bạ",
              area: "Hà Giang",
              category: "cảnh quan",
              latitude: 23.06,
              longitude: 105.0,
              suggestedDurationMinutes: 60,
              minimumDurationMinutes: 30,
              isOutdoor: true,
              visibility: "VISIBLE" as const,
              deletedAt: null,
              media: [],
            },
            externalPlace: null,
          },
          {
            id: "visit-ext",
            order: 2,
            startMinute: 660,
            plannedDurationMinutes: 90,
            destinationId: null,
            destination: null,
            externalPlace: {
              id: "ext-row-1",
              providerPlaceId: "ChIJx",
              name: "Quán Cà Phê Ngoài Catalog",
              latitude: 23.1,
              longitude: 105.1,
              fetchedAt: new Date("2026-11-10T00:00:00.000Z"),
            },
          },
        ],
      },
    ],
  };

  const writtenTrips: Record<string, unknown>[] = [];
  const writtenVisits: Record<string, unknown>[] = [];
  const records = new Map<string, { scope: string; key: string; requestHash: string; responseJson: string }>();

  const catalogRows = [
    {
      id: "dest-1",
      latitude: 23.06,
      longitude: 105.0,
      minimumDurationMinutes: 30,
      openingDays: [
        {
          dayOfWeek: "SUNDAY" as const,
          status: "OPEN" as const,
          intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
        },
      ],
    },
  ];

  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "owner-1" }]),
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: {
      findFirst: async () => structuredClone(trip),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writtenTrips.push(data);
        if (data.updatedAt instanceof Date) trip.updatedAt = data.updatedAt;
        if ("uncheckedChecks" in data) trip.uncheckedChecks = data.uncheckedChecks;
        if ("uncheckedConfirmedAt" in data) {
          trip.uncheckedConfirmedAt = (data.uncheckedConfirmedAt as Date | null) ?? null;
        }
        return { count: 1 };
      },
    },
    itineraryDay: {
      deleteMany: async () => ({ count: 1 }),
      create: async ({ data }: { data: { visits: { create: Record<string, unknown>[] } } }) => {
        writtenVisits.push(...data.visits.create);
        return { id: "day-new" };
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) =>
        records.get(`${where.scope_key.scope}:${where.scope_key.key}`) ?? null,
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
        records.set(`${data.scope}:${data.key}`, { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const k = `${where.scope_key.scope}:${where.scope_key.key}`;
        const cur = records.get(k);
        if (cur) cur.responseJson = data.responseJson;
        return cur;
      },
    },
  };

  let routeCalls = 0;
  let forceRouteUnavailable = false;
  const database = {
    user: tx.user,
    trip: { findFirst: tx.trip.findFirst },
    destination: { findMany: async () => structuredClone(catalogRows) },
    idempotencyRecord: tx.idempotencyRecord,
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  };

  const dependencies: ApplyEditDependencies = {
    database: database as unknown as Database,
    authorization: {
      resolveSession: async () => ({ user: { id: "owner-1", role: "TRAVELER" } }),
      database: database as unknown as Database,
    },
    getRoute: async () => {
      routeCalls += 1;
      if (forceRouteUnavailable) return { kind: "unavailable" };
      return { kind: "ok", durationSeconds: 1800, distanceMeters: 15000 };
    },
  };

  return {
    trip,
    dependencies,
    writtenTrips,
    writtenVisits,
    get routeCalls() {
      return routeCalls;
    },
    failRoute: () => {
      forceRouteUnavailable = true;
    },
  };
}

describe("Ticket 05 ExternalPlace & uncheckedChecks in trip-edit", () => {
  it("loads ExternalPlace respecting the 30-day cache rule and omits expired coordinates from map", async () => {
    const test = mixedFixture();

    const freshPage = await getTripForEdit(new Headers(), "trip-ext-1", {
      ...test.dependencies.authorization,
      database: test.dependencies.database,
      now: () => nowWithinCache,
    });
    expect(freshPage.placeDetails["ext:google:ChIJx"]).toMatchObject({
      name: "Quán Cà Phê Ngoài Catalog",
      latitude: 23.1,
      longitude: 105.1,
      external: true,
    });
    expect(editCandidateToPlannerDays(freshPage.candidate, freshPage.placeDetails)[0]!.stops).toHaveLength(2);

    const expiredPage = await getTripForEdit(new Headers(), "trip-ext-1", {
      ...test.dependencies.authorization,
      database: test.dependencies.database,
      now: () => nowExpiredCache,
    });
    expect(expiredPage.placeDetails["ext:google:ChIJx"]?.name).toBe("Địa điểm ngoài danh mục");
    expect(expiredPage.placeDetails["ext:google:ChIJx"]?.latitude).toBeUndefined();
    expect(expiredPage.placeDetails["ext:google:ChIJx"]?.longitude).toBeUndefined();
    // Expired external stop has only the catalog stop plotted on map (never fabricates or leaks coords)
    expect(editCandidateToPlannerDays(expiredPage.candidate, expiredPage.placeDetails)[0]!.stops).toHaveLength(1);
  });

  it("computes uncheckedItems for kept ExternalPlace stops, avoids routing expired coords, and enforces acknowledgedUnchecked on apply", async () => {
    const test = mixedFixture();
    const candidate: EditCandidate = {
      startDate: "2027-01-10",
      durationDays: 1,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "visit-cat", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
            { visitId: "visit-ext", destinationId: "ext:google:ChIJx", startMinute: 660, plannedDurationMinutes: 100, order: 2 },
          ],
        },
      ],
    };

    const preview = await previewEdit(
      "trip-ext-1",
      "owner-1",
      revision.toISOString(),
      candidate,
      test.dependencies,
      nowWithinCache,
    );
    expect(preview.validation.canConfirm).toBe(false);
    expect(preview.saveEligibility).toBe("NEEDS_UNCHECKED_ACK");
    expect(preview.uncheckedItems).toEqual([
      { check: "MINIMUM_DURATION", reasonCode: "MINIMUM_UNKNOWN", placeId: "ext:google:ChIJx" },
      { check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:ChIJx" },
    ]);

    // Missing acknowledgedUnchecked is rejected 422
    await expect(
      applyEdit(
        new Headers(),
        "trip-ext-1",
        "owner-1",
        { baseRevision: revision.toISOString(), candidate, confirmed: true, kind: "MANUAL" },
        "ext-missing-ack",
        test.dependencies,
        nowWithinCache,
      ),
    ).rejects.toMatchObject({ code: "UNCHECKED_CONFIRMATION_REQUIRED", status: 422 });

    // Apply succeeds atomically with exact acknowledgedUnchecked and writes externalPlaceId
    const saved = await applyEdit(
      new Headers(),
      "trip-ext-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        candidate,
        confirmed: true,
        kind: "MANUAL",
        acknowledgedUnchecked: { confirmed: true, items: preview.uncheckedItems! },
      },
      "ext-ack-ok",
      test.dependencies,
      nowWithinCache,
    );
    expect(saved.status).toBe("SUCCESS");
    expect(test.writtenVisits.find((v) => v.id === "visit-ext")).toMatchObject({
      externalPlaceId: "ext-row-1",
      plannedDurationMinutes: 100,
    });
    expect(test.writtenTrips[0]?.uncheckedChecks).toMatchObject({
      revision: "unchecked-save-v1",
      items: preview.uncheckedItems,
    });

    // Expired >30d preview does NOT call getRoute with stale coords and emits ROUTE_UNKNOWN too
    const callsBeforeExpired = test.routeCalls;
    const expiredPreview = await previewEdit(
      "trip-ext-1",
      "owner-1",
      test.trip.updatedAt.toISOString(),
      candidate,
      test.dependencies,
      nowExpiredCache,
    );
    expect(test.routeCalls).toBe(callsBeforeExpired);
    expect(expiredPreview.uncheckedItems?.some((i) => i.reasonCode === "ROUTE_UNKNOWN")).toBe(true);
  });

  it("clears uncheckedChecks when all ExternalPlace stops are removed and still blocks missing catalog/route data", async () => {
    const test = mixedFixture();
    const onlyCatalogCandidate: EditCandidate = {
      startDate: "2027-01-10",
      durationDays: 1,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "visit-cat", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          ],
        },
      ],
    };

    const preview = await previewEdit(
      "trip-ext-1",
      "owner-1",
      revision.toISOString(),
      onlyCatalogCandidate,
      test.dependencies,
      nowWithinCache,
    );
    expect(preview.saveEligibility).toBe("PASS");
    expect(preview.uncheckedItems).toBeUndefined();

    const applied = await applyEdit(
      new Headers(),
      "trip-ext-1",
      "owner-1",
      { baseRevision: revision.toISOString(), candidate: onlyCatalogCandidate, confirmed: true, kind: "MANUAL" },
      "ext-cleared",
      test.dependencies,
      nowWithinCache,
    );
    expect(applied.status).toBe("SUCCESS");
    expect(test.writtenTrips[0]?.uncheckedConfirmedAt).toBeNull();

    // Missing catalog opening hours / route between catalog destinations stays BLOCKED
    const catalogMissingValidation: TripValidation = {
      timeReference: nowWithinCache.toISOString(),
      groups: {
        openingHours: {
          status: "INSUFFICIENT_DATA",
          findings: [
            { group: "openingHours", status: "INSUFFICIENT_DATA", reasonCode: "OPENING_HOURS_MISSING", message: "Thiếu giờ mở cửa", affectedVisitId: "visit-cat" },
          ],
        },
        minimumDuration: { status: "SATISFIED", findings: [] },
        travelTime: { status: "SATISFIED", findings: [] },
        scheduleConflict: { status: "SATISFIED", findings: [] },
      },
      canConfirm: false,
    };
    expect(isExternalPlaceId("ext:google:123")).toBe(true);
    expect(isExternalPlaceId("dest-1")).toBe(false);
    expect(assessEditUnchecked(catalogMissingValidation, onlyCatalogCandidate)).toEqual({ kind: "BLOCKED" });
  });
});
