import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }), usePathname: () => "/trips/t1", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
import type { TripDetail } from "@/modules/trip-read/trip-read-service";
import { TripDetailView } from "./trips-view";

const trip: TripDetail = {
  id: "t1", startDate: "2026-12-01", endDate: "2026-12-01", durationDays: 1, transport: "CAR", status: "UPCOMING", manuallyCompletedAt: null, isFavorite: false, visitCount: 1, role: "HOST",
  unchecked: { items: [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:ChIJx" }], confirmedAt: "2026-11-14T03:00:00.000Z" },
  days: [{ id: "d", dayIndex: 1, localDate: "2026-12-01", visits: [{ id: "v", order: 1, startMinute: 480, plannedDurationMinutes: 60,
    destination: { id: "ext:google:ChIJx", name: "Địa điểm ngoài danh mục", area: "Ngoài danh mục", visibility: "VISIBLE", availability: "AVAILABLE", external: true } }] }],
};

describe("Trip page with unchecked items", () => {
  it("shows the Chưa kiểm banner, labels the external stop and renders no destination link for it", () => {
    const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));
    expect(html).toContain("Chưa kiểm");
    expect(html).toContain("Giờ mở cửa: chưa có giờ mở cửa");
    expect(html).toContain("ngoài danh mục (chưa kiểm)");
    expect(html).not.toContain("/destinations/ext:");
  });
});
