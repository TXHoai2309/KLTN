import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {}, replace() {}, back() {}, prefetch() {} }),
  usePathname: () => "/trips/trip-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/components/favorite-button", () => ({
  default: ({ targetId, initialIsFavorite }: { targetId: string; initialIsFavorite: boolean }) =>
    createElement("button", { type: "button", "data-trip-heart": targetId, "aria-pressed": initialIsFavorite }, "Yêu thích"),
}));

import { TripDetailView } from "./trips-view";
import { isGlobalAssistantVisibleRoute } from "@/components/assistant/global-assistant";
import type { TripDetail } from "@/modules/trip-read/trip-read-service";

function makeDetailedTrip(): TripDetail {
  return {
    id: "trip-t12",
    startDate: "2030-12-13",
    endDate: "2030-12-16",
    durationDays: 4,
    transport: "MOTORCYCLE",
    status: "UPCOMING",
    manuallyCompletedAt: null,
    isFavorite: false,
    visitCount: 3,
    role: "HOST",
    pinnedItems: [
      {
        kind: "ACCESS",
        leg: {
          id: "al-1",
          homeCity: "Đà Nẵng",
          hubName: "TP Hà Giang",
          travelers: 4,
          outbound: [{ mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 85, priceVndPerPerson: 1800000 }],
          return: [{ mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 85, priceVndPerPerson: 1800000 }],
          outboundMinutes: 85,
          returnMinutes: 85,
          totalVnd: 14400000,
        },
      },
    ],
    journey: {
      revision: "journey-save-v1",
      journey: {
        origin: { label: "TP Hà Giang", latitude: 22.82, longitude: 104.98, source: "MANUAL", confirmed: true },
        departureMinute: 420,
        returnDeadlineMinute: 1080,
        returnDepartureMinute: null,
      },
      visitFingerprint: "fp-1",
      plan: {
        policy: "roadside-rest-v1",
        totals: { drivingSeconds: 18000, restMinutes: 30, distanceMeters: 415000 },
        legs: [
          {
            kind: "TRANSFER",
            day: 1,
            from: { kind: "ORIGIN" },
            to: { kind: "ATTRACTION", destinationId: "d1" },
            route: { status: "VERIFIED", reason: null, durationSeconds: 5400, distanceMeters: 132000, provider: "STADIA_MAPS" },
            startMinute: 420,
            endMinute: 510,
            restMinutes: 0,
          },
          {
            kind: "TRANSFER",
            day: 2,
            from: { kind: "ATTRACTION", destinationId: "d1" },
            to: { kind: "ATTRACTION", destinationId: "d2" },
            route: { status: "VERIFIED", reason: null, durationSeconds: 7200, distanceMeters: 183000, provider: "STADIA_MAPS" },
            startMinute: 480,
            endMinute: 600,
            restMinutes: 15,
          },
        ],
      },
    },
    days: [
      {
        id: "day-1",
        dayIndex: 1,
        localDate: "2030-12-13",
        visits: [
          {
            id: "v1",
            order: 1,
            startMinute: 510,
            plannedDurationMinutes: 60,
            destination: {
              id: "d1",
              name: "Cổng trời Quản Bạ",
              area: "Quản Bạ",
              visibility: "VISIBLE",
              availability: "AVAILABLE",
              image: { url: "https://cdn.example.com/quan-ba.jpg", alt: "Cổng trời Quản Bạ" },
            },
          },
        ],
      },
      {
        id: "day-2",
        dayIndex: 2,
        localDate: "2030-12-14",
        visits: [
          {
            id: "v2",
            order: 1,
            startMinute: 600,
            plannedDurationMinutes: 90,
            destination: {
              id: "d2",
              name: "Cột cờ Lũng Cú",
              area: "Đồng Văn",
              visibility: "VISIBLE",
              availability: "AVAILABLE",
            },
          },
        ],
      },
    ],
  };
}

describe("Ticket 12: Trip detail header, RouteStrip, single primary CTA & mobile bar (slim AC-2, design §4.2)", () => {
  it("renders data-driven title, single gray meta line, RouteStrip with day km, single primary CTA 'Hỏi trợ lý', overflow menu, and removes eyebrow/4 stat cards", () => {
    const html = renderToStaticMarkup(createElement(TripDetailView, { trip: makeDetailedTrip(), calendarEnabled: true }));

    // Data-driven title (never "Chuyến đi 4 ngày")
    expect(html).toContain("Đà Nẵng → Hà Giang, 13–16/12");
    expect(html).not.toContain("my-trips-hero-stats-grid");
    expect(html).not.toContain("Hành trình đã lưu</p>");

    // Single gray meta line
    expect(html).toContain("4 người");
    expect(html).toContain("Xe máy");
    expect(html).toContain("3 điểm dừng");
    expect(html).toContain("415 km");

    // Primary CTA default "Hỏi trợ lý" (desktop header + mobile bottombar; desktop hides on <=768px)
    expect(html).toContain("Hỏi trợ lý");
    const desktopPrimary = html.match(/my-trips-desktop-primary/g) ?? [];
    const mobilePrimary = html.match(/my-trips-mobile-primary/g) ?? [];
    expect(desktopPrimary).toHaveLength(1);
    expect(mobilePrimary).toHaveLength(1);

    // RouteStrip with proportional day distances
    expect(html).toContain("tv-route-strip");
    expect(html).toContain("Ngày 1 · 1 điểm · 132 km");
    expect(html).toContain("Ngày 2 · 1 điểm · 183 km");

    // Overflow menu contains calendar & delete / completion actions
    expect(html).toContain("tv-overflow-menu");
    expect(html).toContain("Thêm vào lịch (.ics)");
    expect(html).toContain("Xóa chuyến đi");
    expect(html).toContain("Đánh dấu đã hoàn thành");

    // Existing actions preserved
    expect(html).toContain("Chỉnh sửa hành trình");
    expect(html).toContain("Đổi giờ xuất phát");
    expect(html).toContain("Tìm bạn đồng hành");

    // Mobile topbar, hero image, and sticky bottom bar
    expect(html).toContain("my-trips-mobile-topbar");
    expect(html).toContain("my-trips-mobile-hero");
    expect(html).toContain("https://cdn.example.com/quan-ba.jpg");
    expect(html).toContain("my-trips-mobile-bottombar");
    expect(html).toContain("Bản đồ");
  });

  it("hides the floating global assistant launcher on /trips/[id] (design §4.2)", () => {
    expect(isGlobalAssistantVisibleRoute("/trips/trip-123")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips")).toBe(true);
    expect(isGlobalAssistantVisibleRoute("/destinations/d1")).toBe(true);
  });
});
