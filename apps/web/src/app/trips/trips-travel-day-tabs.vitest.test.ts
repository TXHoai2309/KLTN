import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {}, replace() {}, back() {}, prefetch() {} }),
  usePathname: () => "/trips/trip-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { TripDetailView } from "./trips-view";
import { TripPinnedSection } from "@/components/trip-pinned/trip-pinned-section";
import { readPinnedItems, type PinnedItem } from "@/modules/trip-save/trip-pin-contract";
import type { TripDetail } from "@/modules/trip-read/trip-read-service";

const sampleAccessPin: Extract<PinnedItem, { kind: "ACCESS" }> = {
  kind: "ACCESS",
  leg: {
    id: "al-dn-hg-1",
    homeCity: "Đà Nẵng",
    hubName: "TP Hà Giang",
    travelers: 4,
    outbound: [
      {
        mode: "FLIGHT",
        from: "Đà Nẵng (DAD)",
        to: "Hà Nội (HAN)",
        departTime: "18:00",
        durationMinutes: 85,
        priceVndPerPerson: 1850000,
        priceSource: "GOOGLE_FLIGHTS",
        priceLookupDate: "2026-11-23",
      },
      {
        mode: "SLEEPER_BUS",
        from: "Hà Nội",
        to: "TP Hà Giang",
        departTime: "21:30",
        durationMinutes: 360,
        priceVndPerPerson: 300000,
        priceSource: "ESTIMATE",
      },
    ],
    return: [
      {
        mode: "SLEEPER_BUS",
        from: "TP Hà Giang",
        to: "Hà Nội",
        departTime: "20:00",
        durationMinutes: 360,
        priceVndPerPerson: 300000,
        priceSource: "ESTIMATE",
      },
      {
        mode: "FLIGHT",
        from: "Hà Nội (HAN)",
        to: "Đà Nẵng (DAD)",
        departTime: "07:00",
        durationMinutes: 85,
        priceVndPerPerson: 1850000,
        priceSource: "GOOGLE_FLIGHTS",
        priceLookupDate: "2026-11-23",
      },
    ],
    outboundMinutes: 445,
    returnMinutes: 445,
    totalVnd: 17200000,
  },
};

const sampleHotelPin: Extract<PinnedItem, { kind: "HOTEL" }> = {
  kind: "HOTEL",
  name: "Homestay Phố Cổ",
  near: "Đồng Văn",
  checkInDate: "2026-12-13",
  checkOutDate: "2026-12-14",
  price: null,
};

function makeTrip(pinnedItems?: PinnedItem[]): TripDetail {
  return {
    id: "trip-t07-1",
    startDate: "2026-12-13",
    endDate: "2026-12-15",
    durationDays: 3,
    transport: "MOTORCYCLE",
    status: "UPCOMING",
    manuallyCompletedAt: null,
    isFavorite: false,
    visitCount: 2,
    role: "HOST",
    pinnedItems,
    days: [
      {
        id: "d1",
        dayIndex: 1,
        localDate: "2026-12-13",
        visits: [
          {
            id: "v1",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destination: {
              id: "dest-1",
              name: "Cổng trời Quản Bạ",
              area: "Quản Bạ",
              visibility: "VISIBLE",
              availability: "AVAILABLE",
            },
          },
        ],
      },
      {
        id: "d2",
        dayIndex: 2,
        localDate: "2026-12-14",
        visits: [
          {
            id: "v2",
            order: 1,
            startMinute: 540,
            plannedDurationMinutes: 90,
            destination: {
              id: "dest-2",
              name: "Cột cờ Lũng Cú",
              area: "Đồng Văn",
              visibility: "VISIBLE",
              availability: "AVAILABLE",
            },
          },
        ],
      },
      {
        id: "d3",
        dayIndex: 3,
        localDate: "2026-12-15",
        visits: [],
      },
    ],
  };
}

describe("Ticket 07: Trip detail travel day tabs & ACCESS excluded from pinned section (PARITY AC-4)", () => {
  it("renders Ngày đi DD/MM and Ngày về DD/MM tabs with gray travel dot and outbound/return panels when trip has ACCESS pin", () => {
    const html = renderToStaticMarkup(
      createElement(TripDetailView, { trip: makeTrip([sampleAccessPin, sampleHotelPin]) }),
    );

    expect(html).toContain("Ngày đi 12/12");
    expect(html).toContain("Ngày về 16/12");
    expect(html).toContain("--tv-tab-color:var(--tv-ink-3)");
    expect(html).toContain("Trước ngày 1 · Đà Nẵng → TP Hà Giang");
    expect(html).toContain("Sau ngày cuối · TP Hà Giang → Đà Nẵng");
    // Other pinned items remain in Mục đã ghim
    expect(html).toContain("Mục đã ghim");
    expect(html).toContain("Homestay Phố Cổ");
    // Pinned section does NOT contain the full access leg card
    const pinnedMatch = html.match(/data-testid="trip-pinned-section"[\s\S]*?<\/section>/);
    expect(pinnedMatch?.[0]).toContain("Homestay Phố Cổ");
    expect(pinnedMatch?.[0]).not.toContain("Từ Đà Nẵng tới TP Hà Giang");
    expect(pinnedMatch?.[0]).not.toContain("Chặng tiếp cận");
  });

  it("omits Ngày đi and Ngày về tabs when trip has no ACCESS pin", () => {
    const html = renderToStaticMarkup(createElement(TripDetailView, { trip: makeTrip([sampleHotelPin]) }));

    expect(html).toContain("Ngày 1");
    expect(html).toContain("Ngày 2");
    expect(html).not.toContain("Ngày đi");
    expect(html).not.toContain("Ngày về");
  });

  it("hides TripPinnedSection when ACCESS was the only pin while readPinnedItems still reads ACCESS", () => {
    const readBack = readPinnedItems([{ payload: sampleAccessPin }]);
    expect(readBack).toHaveLength(1);
    expect(readBack[0]?.kind).toBe("ACCESS");

    expect(renderToStaticMarkup(createElement(TripPinnedSection, { items: [sampleAccessPin] }))).toBe("");
  });
});
