import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }),
  usePathname: () => "/trips/t1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import type { TripDetail } from "@/modules/trip-read/trip-read-service";
import { TripDetailView } from "./trips-view";

const trip: TripDetail = {
  id: "t1",
  startDate: "2026-12-01",
  endDate: "2026-12-02",
  durationDays: 2,
  transport: "MOTORCYCLE",
  status: "UPCOMING",
  manuallyCompletedAt: null,
  isFavorite: false,
  visitCount: 2,
  role: "HOST",
  chosenLodgings: [
    { id: "cl-1", nightIndex: 1, placeId: "ChIJ_lodging_saved_1", name: "HomeStay Minh Đức", latitude: 23.0468, longitude: 104.9885 },
  ],
  days: [
    {
      id: "d1",
      dayIndex: 1,
      localDate: "2026-12-01",
      visits: [
        {
          id: "v1",
          order: 1,
          startMinute: 480,
          plannedDurationMinutes: 60,
          destination: { id: "dest1", name: "Cổng Trời Quản Bạ", area: "Quản Bạ", visibility: "VISIBLE", availability: "AVAILABLE" },
        },
      ],
    },
    {
      id: "d2",
      dayIndex: 2,
      localDate: "2026-12-02",
      visits: [
        {
          id: "v2",
          order: 1,
          startMinute: 480,
          plannedDurationMinutes: 60,
          destination: { id: "dest2", name: "Phố cổ Đồng Văn", area: "Đồng Văn", visibility: "VISIBLE", availability: "AVAILABLE" },
        },
      ],
    },
  ],
};

describe("Ticket 11: saved trip detail page displays chosen lodging per night with Place preview", () => {
  it("renders the saved chosen lodging for night 1 with unchecked/not-a-booking note and 'Xem nhanh' button", () => {
    const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));
    expect(html).toContain("Chỗ nghỉ đã chọn (Đêm 1):");
    expect(html).toContain("HomeStay Minh Đức");
    expect(html).toContain("Chưa kiểm tra · Không phải đặt phòng");
    expect(html).toContain('aria-label="Xem nhanh HomeStay Minh Đức"');
  });
});
