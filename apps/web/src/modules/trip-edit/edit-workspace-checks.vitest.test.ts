import { describe, expect, it } from "vitest";

import type { EditCatalogDestinationMeta } from "./add-visit-helper";
import type { EditCandidate } from "./edit-candidate";
import type { EditPlaceDetail, PreviewLegMetric } from "./trip-edit-service";
import {
  autoFixItinerarySchedule,
  autoShiftDayVisits,
  formatLegMetricLabel,
  mapValidationToWorkspace,
  runInstantClientChecks,
} from "./edit-workspace-checks";
import type { TripValidation } from "../trip-validation/trip-validation";

const placeDetails: Record<string, EditPlaceDetail> = {
  d1: {
    id: "d1",
    name: "Điểm 1",
    area: "Đồng Văn",
    minimumDurationMinutes: 45,
    availability: "AVAILABLE",
  },
  d2: {
    id: "d2",
    name: "Điểm 2",
    area: "Mèo Vạc",
    availability: "UNAVAILABLE",
    external: false,
  },
};

const catalogMeta: Record<string, EditCatalogDestinationMeta> = {
  d1: {
    suggestedDurationMinutes: 60,
    minimumDurationMinutes: 45,
    openingDays: [
      {
        dayOfWeek: "TUESDAY",
        status: "OPEN",
        intervals: [{ opensAt: "08:00", closesAt: "17:00" }],
      },
    ],
  },
};

describe("Ticket 03 workspace checks & auto-shift", () => {
  it("flags 0ms overlap, below-minimum duration, outside opening hours, and UNAVAILABLE catalog stops", () => {
    const candidate: EditCandidate = {
      startDate: "2026-12-01", // Tuesday
      durationDays: 1,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "d1", startMinute: 420, plannedDurationMinutes: 30, order: 1 }, // 07:00 (before 08:00) & 30m < 45m
            { visitId: "v2", destinationId: "d2", startMinute: 430, plannedDurationMinutes: 60, order: 2 }, // overlaps v1 + UNAVAILABLE
          ],
        },
      ],
    };

    const result = runInstantClientChecks(candidate, placeDetails, catalogMeta);
    expect(result.hasAnyInstantViolation).toBe(true);
    expect(result.byVisitId["v1"]?.map((w) => w.code)).toEqual(
      expect.arrayContaining(["BELOW_MINIMUM_DURATION", "OPENING_HOURS"]),
    );
    expect(result.byVisitId["v2"]?.map((w) => w.code)).toEqual(
      expect.arrayContaining(["DESTINATION_UNAVAILABLE", "SCHEDULE_OVERLAP"]),
    );
    expect(result.unavailableVisits).toHaveLength(1);
  });

  it("shifts following visits on the same day using leg duration without spilling into next day", () => {
    const candidate: EditCandidate = {
      startDate: "2026-12-01",
      durationDays: 2,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "d1", startMinute: 600, plannedDurationMinutes: 90, order: 1 }, // ends 750 -> 11:30? no 12:30 (600+90=690=11:30)
            { visitId: "v2", destinationId: "d2", startMinute: 660, plannedDurationMinutes: 60, order: 2 }, // needs >= 690 + 30 = 720
            { visitId: "v3", destinationId: "d1", startMinute: 730, plannedDurationMinutes: 60, order: 3 }, // needs >= 720 + 60 + 15 = 795
          ],
        },
        {
          dayIndex: 2,
          visits: [
            { visitId: "v4", destinationId: "d1", startMinute: 540, plannedDurationMinutes: 60, order: 1 },
          ],
        },
      ],
    };
    const legs: PreviewLegMetric[] = [
      { dayIndex: 1, fromVisitId: "v1", toVisitId: "v2", status: "VERIFIED", durationSeconds: 1800, distanceMeters: 20000 },
    ];

    const shifted = autoShiftDayVisits({ candidate, dayIndex: 1, startFromIndex: 0, legMetrics: legs });
    expect(shifted.overflowDayIndex).toBeNull();
    expect(shifted.candidate.days[0]!.visits.map((v) => v.startMinute)).toEqual([600, 720, 795]);
    expect(shifted.candidate.days[1]!.visits[0]!.startMinute).toBe(540);

    // Overflow near 23:59 never pushes to Day 2
    const lateCandidate: EditCandidate = {
      ...candidate,
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "d1", startMinute: 1380, plannedDurationMinutes: 50, order: 1 }, // 23:00-23:50 -> +15 = 24:05
            { visitId: "v2", destinationId: "d2", startMinute: 1390, plannedDurationMinutes: 30, order: 2 },
          ],
        },
        candidate.days[1]!,
      ],
    };
    const overflow = autoShiftDayVisits({ candidate: lateCandidate, dayIndex: 1, startFromIndex: 0 });
    expect(overflow.overflowDayIndex).toBe(1);
    expect(overflow.overflowMessage).toContain("23:59");
    expect(overflow.candidate.days[0]!.visits).toHaveLength(2);
    expect(overflow.candidate.days[1]!.visits).toHaveLength(1);
  });

  it("maps TripValidation findings onto visit IDs, legs, and jump targets", () => {
    const candidate: EditCandidate = {
      startDate: "2026-12-01",
      durationDays: 1,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "d1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
            { visitId: "v2", destinationId: "d1", startMinute: 545, plannedDurationMinutes: 60, order: 2 },
          ],
        },
      ],
    };
    const validation: TripValidation = {
      timeReference: "2026-11-18T00:00:00.000Z",
      groups: {
        openingHours: {
          status: "VIOLATION",
          findings: [{ group: "openingHours", status: "VIOLATION", reasonCode: "OUTSIDE_OPENING_HOURS", message: "Ngoài giờ mở cửa", affectedVisitId: "v1" }],
        },
        minimumDuration: { status: "SATISFIED", findings: [] },
        travelTime: {
          status: "INSUFFICIENT_DATA",
          findings: [{ group: "travelTime", status: "INSUFFICIENT_DATA", reasonCode: "ROUTE_UNAVAILABLE", message: "Thiếu dữ liệu tuyến", fromVisitId: "v1", toVisitId: "v2" }],
        },
        scheduleConflict: { status: "SATISFIED", findings: [] },
      },
      canConfirm: false,
    };

    const mapped = mapValidationToWorkspace(validation, candidate, placeDetails);
    expect(mapped.byVisitId["v1"]).toHaveLength(1);
    expect(mapped.byLegKey["v1->v2"]).toHaveLength(1);
    expect(mapped.jumpItems.map((j) => j.targetDomId)).toEqual(["visit-card-v1", "leg-v1-v2"]);

    expect(formatLegMetricLabel({ dayIndex: 1, fromVisitId: "v1", toVisitId: "v2", status: "VERIFIED", durationSeconds: 1500, distanceMeters: 12400 })).toBe(
      "Di chuyển 25 phút (12,4 km)",
    );
    expect(formatLegMetricLabel({ dayIndex: 1, fromVisitId: "v1", toVisitId: "v2", status: "INSUFFICIENT_DATA", durationSeconds: null, distanceMeters: null })).toBe(
      "Chưa đủ dữ liệu thời gian di chuyển",
    );
  });

  it("repairs multi-day schedule conflicts in one pass while honoring origin arrival, locked stops, and 23:59 limit", () => {
    const candidate: EditCandidate = {
      startDate: "2026-12-01",
      durationDays: 3,
      transport: "CAR",
      journey: {
        origin: {
          label: "96 Định Công",
          latitude: 20.98,
          longitude: 105.83,
          source: "NOMINATIM",
          confirmed: true,
        },
        departureMinute: 360,
        returnDeadlineMinute: 1320,
        returnDepartureMinute: null,
      },
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "d1", startMinute: 506, plannedDurationMinutes: 90, order: 1 }, // 08:26 < 11:25 arrival
            { visitId: "v2", destinationId: "d1", startMinute: 616, plannedDurationMinutes: 120, order: 2 }, // needs >= 685 + 90 + 25 = 800
          ],
        },
        {
          dayIndex: 2,
          visits: [
            { visitId: "v3", destinationId: "d1", startMinute: 520, plannedDurationMinutes: 60, order: 1 }, // locked
            { visitId: "v4", destinationId: "d1", startMinute: 560, plannedDurationMinutes: 60, order: 2 }, // unlocked -> 520+60+15=595
          ],
        },
        {
          dayIndex: 3,
          visits: [
            { visitId: "v5", destinationId: "d1", startMinute: 1380, plannedDurationMinutes: 50, order: 1 }, // 23:00-23:50
            { visitId: "v6", destinationId: "d1", startMinute: 1390, plannedDurationMinutes: 30, order: 2 }, // overflows -> clamp 1410
          ],
        },
      ],
    };

    const result = autoFixItinerarySchedule({
      candidate,
      journeySummary: {
        outboundDurationSeconds: 19500,
        outboundDistanceMeters: 280000,
        outboundRestMinutes: 0,
        estimatedArrivalAtFirstMinute: 685, // 11:25
        firstVisitStartMinute: 506,
        returnDurationSeconds: null,
        returnDistanceMeters: null,
        returnRestMinutes: 0,
        estimatedReturnArrivalMinute: null,
        returnDeadlineMinute: 1320,
      },
      legMetrics: [
        { dayIndex: 1, fromVisitId: "v1", toVisitId: "v2", status: "VERIFIED", durationSeconds: 1500, distanceMeters: 12000 }, // 25m
      ],
      lockedVisitIds: new Set(["v3"]),
    });

    expect(result.changedVisitIds).toEqual(["v1", "v2", "v4", "v6"]);
    expect(result.overflowDays).toEqual([3]);
    expect(result.candidate.days[0]!.visits.map((v) => v.startMinute)).toEqual([685, 800]);
    expect(result.candidate.days[1]!.visits.map((v) => v.startMinute)).toEqual([520, 595]);
    expect(result.candidate.days[2]!.visits.map((v) => v.startMinute)).toEqual([1380, 1410]);
  });
});
