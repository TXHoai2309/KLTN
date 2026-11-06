import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/favorite-button", () => ({
  default: () => createElement("button", { type: "button" }, "Favorite"),
}));

import type { TripDetail } from "@/modules/trip-read/trip-read-service";
import { TripDetailView } from "@/app/trips/trips-view";
import type { SavedJourney } from "@/modules/trip-origin/journey-saved-contract";

describe("Saved Journey & Privacy UI (Tickets 06, 08, 09)", () => {
  const sampleSavedJourney: SavedJourney = {
    revision: "journey-save-v1",
    journey: {
      origin: {
        label: "Nhà riêng Cầu Giấy",
        latitude: 21.0333,
        longitude: 105.7955,
        source: "NOMINATIM",
        confirmed: true,
      },
      returnDepartureMinute: null,
    departureMinute: 390, // 06:30
      returnDeadlineMinute: 1140, // 19:00
    },
    plan: {
      policy: "roadside-rest-v1",
      legs: [
        {
          kind: "OUTBOUND",
          day: 1, from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: "dest-1" },
          startMinute: 390,
          endMinute: 660,
          route: {
            status: "VERIFIED", reason: null, provider: "STADIA_MAPS",
            durationSeconds: 14400,
            distanceMeters: 280000,
          },
          restMinutes: 30,
        },
        {
          kind: "RETURN",
          day: 2, from: { kind: "ATTRACTION", destinationId: "dest-2" }, to: { kind: "ORIGIN" },
          startMinute: 840,
          endMinute: 1110,
          route: {
            status: "VERIFIED", reason: null, provider: "STADIA_MAPS",
            durationSeconds: 14400,
            distanceMeters: 280000,
          },
          restMinutes: 30,
        },
      ],
      totals: {
        drivingSeconds: 28800,
        restMinutes: 60,
        distanceMeters: 560000,
      },
    },
  };

  const createTrip = (overrides?: Partial<TripDetail>): TripDetail => ({
    id: "trip-uuid-1",
    status: "UPCOMING",
    role: "HOST",
    startDate: "2026-11-20",
    endDate: "2026-11-21",
    durationDays: 2,
    transport: "CAR",
    isFavorite: false,
    visitCount: 2,
    manuallyCompletedAt: null,
    baseRevision: "2026-11-04T12:00:00.000Z",
    journey: sampleSavedJourney,
    days: [
      {
        id: "d1",
        dayIndex: 1,
        localDate: "2026-11-20",
        visits: [
          {
            id: "v1",
            order: 1,
            startMinute: 660,
            plannedDurationMinutes: 90,
            destination: {
              id: "dest-1",
              name: "Cột cờ Lũng Cú",
              area: "Đồng Văn",
              visibility: "VISIBLE",
              availability: "AVAILABLE",
            },
          },
        ],
      },
      {
        id: "d2",
        dayIndex: 2,
        localDate: "2026-11-21",
        visits: [
          {
            id: "v2",
            order: 1,
            startMinute: 540,
            plannedDurationMinutes: 90,
            destination: {
              id: "dest-2",
              name: "Sông Nho Quế",
              area: "Mèo Vạc",
              visibility: "VISIBLE",
              availability: "AVAILABLE",
            },
          },
        ],
      },
    ],
    ...overrides,
  });

  describe("Ticket 06 — Owner readback & privacy isolation", () => {
    it("renders precise origin coordinates and journey details for owner view", () => {
      const trip = createTrip();
      const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));

      // Owner sees origin overview
      expect(html).toContain("Nhà riêng Cầu Giấy");
      expect(html).toContain("Tọa độ riêng tư");
      expect(html).toContain("21.03330");
      expect(html).toContain("105.79550");
      expect(html).toContain("Khởi hành Ngày 1:");
      expect(html).toContain("06:30");
      expect(html).toContain("Hạn về Ngày 2:");
      expect(html).toContain("19:00");
      expect(html).toContain("Nghỉ ven đường: <strong>+60 phút</strong>");
      expect(html).toContain("560 km");
      expect(html).toContain(
        "* Lịch trình chưa bao gồm thời gian nhận/trả phòng lưu trú (homestay/khách sạn)."
      );

      // Timeline has outbound card on Day 1
      expect(html).toContain("Xuất phát: 06:30");
      expect(html).toContain("Nơi xuất phát hành trình");

      // Timeline has return card on Day 2
      expect(html).toContain("Về đến nơi: 18:30");
      expect(html).toContain("Hạn về: 19:00");
      expect(html).toContain("Điểm kết thúc hành trình");
    });

    it("NEVER renders origin coordinates or private origin data in member view", () => {
      // In member view, the server omits trip.journey entirely
      const memberTrip = createTrip({
        role: "MEMBER",
        journey: undefined,
      });

      const html = renderToStaticMarkup(createElement(TripDetailView, { trip: memberTrip }));

      expect(html).not.toContain("Nhà riêng Cầu Giấy");
      expect(html).not.toContain("21.03330");
      expect(html).not.toContain("105.79550");
      expect(html).not.toContain("data-testid=\"trip-saved-journey-section\"");
      expect(html).not.toContain("Đổi nơi/giờ xuất phát");
      expect(html).not.toContain("Bổ sung nơi xuất phát");

      // Member still sees destination stops normally
      expect(html).toContain("Cột cờ Lũng Cú");
      expect(html).toContain("Sông Nho Quế");
    });
  });

  describe("Ticket 08 — Edit journey before departure", () => {
    it("provides edit journey action for upcoming owner trip with journey", () => {
      const trip = createTrip();
      const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));

      expect(html).toContain("Đổi nơi/giờ xuất phát");
    });

    it("does not show edit journey action for completed trips", () => {
      const trip = createTrip({
        status: "COMPLETED",
        manuallyCompletedAt: "2026-11-22T00:00:00.000Z",
      });
      const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));

      expect(html).not.toContain("Đổi nơi/giờ xuất phát");
    });
  });

  describe("Ticket 09 — Legacy trip opt-in continuity", () => {
    it("renders legacy disclosure and opt-in action for upcoming legacy trip without origin", () => {
      const legacyTrip = createTrip({
        journey: undefined,
      });
      const html = renderToStaticMarkup(createElement(TripDetailView, { trip: legacyTrip }));

      expect(html).toContain("data-testid=\"legacy-trip-disclosure\"");
      expect(html).toContain(
        "Chuyến đi này được lập theo chuẩn cũ chưa có nơi xuất phát và thời gian di chuyển đi/về."
      );
      expect(html).toContain("Bổ sung nơi xuất phát");

      // Ordinary destination visits are displayed uninterrupted
      expect(html).toContain("Cột cờ Lũng Cú");
      expect(html).toContain("Sông Nho Quế");
    });
  });
});
