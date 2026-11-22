import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/favorite-button", () => ({
  default: ({ targetId, initialIsFavorite }: { targetId: string; initialIsFavorite: boolean }) =>
    createElement("button", { type: "button", "data-trip-heart": targetId, "aria-pressed": initialIsFavorite }, "Yêu thích"),
}));

import type { TripSummary } from "@/modules/trip-read/trip-read-service";
import { MyTripsView, filterTripsBySearch } from "./trips-view";

function makeSummary(index: number, overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: `trip-${index}`,
    startDate: "2030-12-13",
    endDate: "2030-12-16",
    durationDays: 4,
    transport: "MOTORCYCLE",
    status: "UPCOMING",
    manuallyCompletedAt: null,
    isFavorite: false,
    visitCount: 6,
    firstArea: "Quản Bạ",
    lastArea: "Đồng Văn",
    ...overrides,
  };
}

describe("Ticket 13: Compact trip list & data-driven auto-title (slim C15, BR-7, design §4.3)", () => {
  it("renders featured upcoming trip with real first-stop photo, countdown, data title, and compact 72px rows with overflow menu for 12 trips", () => {
    const items: TripSummary[] = Array.from({ length: 12 }, (_, i) =>
      makeSummary(i + 1, {
        status: i < 5 ? "UPCOMING" : i < 7 ? "ONGOING" : "COMPLETED",
        homeCity: i === 0 ? "Đà Nẵng" : null,
        firstStopImage: i === 0 ? { url: "https://cdn.example.com/first-stop.jpg", alt: "Cổng trời Quản Bạ" } : null,
      }),
    );

    const html = renderToStaticMarkup(createElement(MyTripsView, { items }));

    // Data-driven auto-title (never "Chuyến đi 4 ngày")
    expect(html).toContain("Đà Nẵng → Hà Giang, 13–16/12");
    expect(html).toContain("Quản Bạ – Đồng Văn, 13–16/12");
    expect(html).not.toContain(">Chuyến đi 4 ngày<");

    // Featured upcoming card with real first-stop photo & countdown
    expect(html).toContain("my-trips-featured");
    expect(html).toContain("https://cdn.example.com/first-stop.jpg");
    expect(html).toMatch(/còn \d+ ngày/u);

    // Compact rows + overflow menu ("⋯") instead of 36 exposed buttons
    expect(html).toContain("my-trips-row");
    expect(html).toContain("tv-overflow-menu");
    expect(html).not.toContain("Xem chi tiết");

    // Collapsed search behind icon toggle button
    expect(html).toContain("my-trips-search-toggle");
    expect(html).toContain('aria-expanded="false"');

    // Custom companionTitle overrides auto-title
    const customHtml = renderToStaticMarkup(
      createElement(MyTripsView, {
        items: [makeSummary(99, { companionTitle: "Cung Đông Bắc cùng nhóm bạn" })],
      }),
    );
    expect(customHtml).toContain("Cung Đông Bắc cùng nhóm bạn");

    // Search works on auto-generated route titles
    expect(filterTripsBySearch(items, "da nang")).toHaveLength(1);
    expect(filterTripsBySearch(items, "dong van")).toHaveLength(11);
  });
});
