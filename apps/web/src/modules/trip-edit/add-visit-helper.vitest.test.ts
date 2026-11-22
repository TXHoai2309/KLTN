import { describe, expect, it } from "vitest";

import {
  computeSmartVisitTiming,
  createClientVisitId,
  FALLBACK_VISIT_DURATION_MINUTES,
  filterDrawerDestinations,
  formatOpeningSummaryForDate,
  openingDayFromMinuteIntervals,
  resolveDefaultDurationMinutes,
  weekdayForLocalDate,
  type EditCatalogDestinationMeta,
} from "./add-visit-helper";
import type { PublicLocation } from "../destination/public-destination-query";

const fullWeekOpenMeta: EditCatalogDestinationMeta = {
  suggestedDurationMinutes: 90,
  minimumDurationMinutes: 45,
  isOutdoor: true,
  openingDays: [
    openingDayFromMinuteIntervals({
      dayOfWeek: "TUESDAY",
      status: "OPEN",
      intervals: [{ opensAtMinute: 450, closesAtMinute: 1050 }], // 07:30 - 17:30
    }),
    openingDayFromMinuteIntervals({
      dayOfWeek: "WEDNESDAY",
      status: "OPEN",
      intervals: [{ opensAtMinute: 540, closesAtMinute: 1020 }], // 09:00 - 17:00
    }),
    openingDayFromMinuteIntervals({
      dayOfWeek: "THURSDAY",
      status: "CLOSED",
      intervals: [],
    }),
  ],
};

describe("Ticket 02 add-visit helper", () => {
  it("computes weekday and formats opening hours for target calendar date", () => {
    expect(weekdayForLocalDate("2026-12-01")).toBe("TUESDAY");
    expect(weekdayForLocalDate("2026-12-03")).toBe("THURSDAY");

    expect(formatOpeningSummaryForDate(fullWeekOpenMeta.openingDays, "2026-12-01")).toEqual({
      status: "OPEN",
      label: "Mở cửa 07:30–17:30",
    });
    expect(formatOpeningSummaryForDate(fullWeekOpenMeta.openingDays, "2026-12-03")).toEqual({
      status: "CLOSED",
      label: "Đóng cửa vào ngày này",
    });
    expect(formatOpeningSummaryForDate(fullWeekOpenMeta.openingDays, "2026-12-04")).toEqual({
      status: "UNKNOWN",
      label: "Chưa có dữ liệu giờ mở cửa",
    });
  });

  it("defaults empty day to 08:00 or snaps to opening time when venue opens later", () => {
    const tuesdayTiming = computeSmartVisitTiming({
      dayVisits: [],
      localDate: "2026-12-01",
      meta: fullWeekOpenMeta,
    });
    expect(tuesdayTiming).toEqual({
      startMinute: 480,
      startTime: "08:00",
      durationMinutes: 90,
      usedSuggestedDuration: true,
      adjustedForOpening: false,
    });

    // Wednesday opens at 09:00 (540 > 480), so it snaps start time to 09:00
    const wednesdayTiming = computeSmartVisitTiming({
      dayVisits: [],
      localDate: "2026-12-02",
      meta: fullWeekOpenMeta,
    });
    expect(wednesdayTiming).toEqual({
      startMinute: 540,
      startTime: "09:00",
      durationMinutes: 90,
      usedSuggestedDuration: true,
      adjustedForOpening: true,
    });
  });

  it("sequences after previous visit end + 15m buffer and respects duration fallback", () => {
    const timing = computeSmartVisitTiming({
      dayVisits: [
        { startMinute: 480, plannedDurationMinutes: 60 },
        { startMinute: 600, plannedDurationMinutes: 90 }, // ends 11:30 (690)
      ],
      localDate: "2026-12-01",
      meta: null,
    });
    expect(timing).toEqual({
      startMinute: 705, // 11:45
      startTime: "11:45",
      durationMinutes: FALLBACK_VISIT_DURATION_MINUTES,
      usedSuggestedDuration: false,
      adjustedForOpening: false,
    });

    expect(resolveDefaultDurationMinutes({ suggestedDurationMinutes: null, minimumDurationMinutes: 75 })).toEqual({
      durationMinutes: 75,
      usedSuggestedDuration: false,
    });
  });

  it("filters destinations by owner favorite IDs only when toggle enabled", () => {
    const sample: PublicLocation[] = [
      { id: "d1", name: "Lũng Cú", area: "Đồng Văn", category: "Văn hóa", latitude: 23.36, longitude: 105.31, image: null },
      { id: "d2", name: "Mã Pí Lèng", area: "Mèo Vạc", category: "Cảnh quan", latitude: 23.25, longitude: 105.41, image: null },
    ];
    const favorites = new Set(["d2"]);
    expect(filterDrawerDestinations(sample, false, favorites)).toHaveLength(2);
    expect(filterDrawerDestinations(sample, true, favorites).map((item) => item.id)).toEqual(["d2"]);
  });

  it("generates safe non-empty client visit IDs", () => {
    const id = createClientVisitId("dest_123");
    expect(id).toMatch(/^visit-dest_123-[a-zA-Z0-9-]+$/);
  });
});
