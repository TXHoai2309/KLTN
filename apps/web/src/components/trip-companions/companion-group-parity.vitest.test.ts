import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {}, replace() {}, back() {}, prefetch() {} }),
  usePathname: () => "/trip-companions/group-1/group",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { RouteStrip } from "@/components/trip-timeline/route-strip";
import { CompanionGroupView } from "./companion-group-view";
import { companionGroupFixture } from "@/modules/trip-companions/companion-group-fixtures";
import type { CompanionGroup } from "@/modules/trip-companions/companion-group-contract";
import { shareablePins, type PinnedItem } from "@/modules/trip-save/trip-pin-contract";

describe("Ticket 09: Shared companion page uses DayTimeline full and RouteStrip (PARITY AC-3, AC-5)", () => {
  it("renders RouteStrip with proportional segments and day summary labels", () => {
    const html = renderToStaticMarkup(
      createElement(RouteStrip, {
        days: [
          { dayIndex: 1, stopCount: 4, distanceKm: 132 },
          { dayIndex: 2, stopCount: 3, distanceKm: 98 },
        ],
        activeDayIndex: 1,
        onSelectDay: () => {},
      }),
    );

    expect(html).toContain("tv-route-strip");
    expect(html).toContain("Ngày 1 · 4 điểm · 132 km");
    expect(html).toContain("Ngày 2 · 3 điểm · 98 km");
    expect(html).toContain("var(--tv-day-1)");
    expect(html).toContain("var(--tv-day-2)");
  });

  it("renders DayTimeline full with visit image, order, time, duration and saved nearby/lodging", () => {
    const group: CompanionGroup = {
      ...companionGroupFixture,
      meetingPoint: {
        origin: {
          label: "TP Hà Giang",
          latitude: 22.8233,
          longitude: 104.9836,
          source: "MANUAL",
          confirmed: true,
        },
        plan: null,
      },
      chosenLodgings: [{ nightIndex: 1, name: "Homestay Phố Cổ", placeId: "ChIJ_stay_1" }],
      nearbySuggestions: [
        {
          dayIndex: 1,
          slot: "visit-1",
          kind: "ACTIVITY",
          placeId: "ChIJ_cafe_1",
          name: "Cà phê Cực Bắc",
          distanceKm: 1.2,
        },
        {
          dayIndex: 1,
          slot: "overnight",
          kind: "EVENING",
          placeId: "ChIJ_food_1",
          name: "Lẩu gà đen Phố Cổ",
          distanceKm: 0.6,
        },
      ],
      itinerary: {
        days: [
          {
            dayIndex: 1,
            localDate: "2030-11-15",
            visits: [
              {
                visitId: "v-1",
                order: 1,
                startMinute: 480,
                plannedDurationMinutes: 90,
                destination: {
                  destinationId: "dest-1",
                  name: "Cột cờ Lũng Cú",
                  area: "Đồng Văn",
                  availability: "AVAILABLE",
                  latitude: 23.363,
                  longitude: 105.317,
                  image: {
                    url: "https://cdn.example.com/lung-cu.jpg",
                    alt: "Cột cờ Lũng Cú",
                  },
                },
              },
            ],
          },
          {
            dayIndex: 2,
            localDate: "2030-11-16",
            visits: [
              {
                visitId: "v-2",
                order: 1,
                startMinute: 540,
                plannedDurationMinutes: 60,
                destination: {
                  destinationId: "dest-2",
                  name: "Đèo Mã Pì Lèng",
                  area: "Mèo Vạc",
                  availability: "AVAILABLE",
                  latitude: 23.241,
                  longitude: 105.405,
                },
              },
            ],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(createElement(CompanionGroupView, { group }));

    expect(html).toContain('data-variant="full"');
    expect(html).toContain("https://cdn.example.com/lung-cu.jpg");
    expect(html).toContain("Điểm dừng 1");
    expect(html).toContain("08:00 – 09:30 (90 phút)");
    expect(html).toContain("Cột cờ Lũng Cú");
    expect(html).toContain("tv-route-strip");
    expect(html).toContain("Homestay Phố Cổ");
    expect(html).toContain("Cà phê Cực Bắc");
    expect(html).toContain("Lẩu gà đen Phố Cổ");
    // PARITY AC-5: No travel day tabs and no home city
    expect(html).not.toContain("Ngày đi");
    expect(html).not.toContain("Ngày về");
    expect(html).not.toContain("Đà Nẵng");
    expect(html).not.toContain("TP.HCM");
  });

  it("keeps shareablePins excluding ACCESS pins (ADR-47, PARITY BR-6)", () => {
    const pins: PinnedItem[] = [
      {
        kind: "ACCESS",
        leg: {
          id: "al-test-1",
          homeCity: "Đà Nẵng",
          hubName: "TP Hà Giang",
          travelers: 2,
          outbound: [
            {
              mode: "FLIGHT",
              from: "Đà Nẵng (DAD)",
              to: "Hà Nội (HAN)",
              durationMinutes: 85,
              priceVndPerPerson: 1800000,
              priceSource: "ESTIMATE",
            },
          ],
          return: [
            {
              mode: "FLIGHT",
              from: "Hà Nội (HAN)",
              to: "Đà Nẵng (DAD)",
              durationMinutes: 85,
              priceVndPerPerson: 1800000,
              priceSource: "ESTIMATE",
            },
          ],
          outboundMinutes: 85,
          returnMinutes: 85,
          totalVnd: 7200000,
        },
      },
      {
        kind: "HOTEL",
        name: "Homestay Phố Cổ",
        near: "Đồng Văn",
        checkInDate: "2030-11-15",
        checkOutDate: "2030-11-16",
        price: null,
      },
    ];
    const shared = shareablePins(pins);
    expect(shared.map((p) => p.kind)).toEqual(["HOTEL"]);
    expect(JSON.stringify(shared)).not.toContain("Đà Nẵng");
  });
});
