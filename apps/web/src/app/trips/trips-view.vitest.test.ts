import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

import type { TripDetail, TripSummary } from "@/modules/trip-read/trip-read-service";
import { MyTripsView, TripDetailView } from "./trips-view";
import MyTripsLoading from "./loading";
import MyTripsError from "./error";

const sample = (id: string, status: TripSummary["status"]): TripSummary => ({
  id, status, startDate: "2026-10-10", endDate: "2026-10-11", durationDays: 2, transport: "CAR", isFavorite: false,
});

describe("US-31 Trip views", () => {
  it("renders three status groups and a create action", () => {
    const html = renderToStaticMarkup(createElement(MyTripsView, { items: [sample("one", "UPCOMING"), sample("two", "ONGOING"), sample("three", "COMPLETED")] }));
    for (const label of ["Sắp tới", "Đang diễn ra", "Đã hoàn thành", "Tạo chuyến đi"]) expect(html).toContain(label);
    expect(html).toContain("/trips/one");
    expect(html).toContain("/trips/new");
  });
  it("shows a valid empty state", () => {
    const html = renderToStaticMarkup(createElement(MyTripsView, { items: [] }));
    expect(html).toContain("Bạn chưa có chuyến đi đã lưu");
    expect(html).not.toContain("Lỗi");
  });
  it("renders ordered itinerary by day with unavailable destination text", () => {
    const trip: TripDetail = { ...sample("one", "ONGOING"), days: [
      { id: "d1", dayIndex: 1, localDate: "2026-10-10", visits: [
        { id: "v1", order: 1, startMinute: 480, plannedDurationMinutes: 90, destination: { id: "a", name: "Cột cờ Lũng Cú", area: "Đồng Văn", visibility: "VISIBLE", availability: "AVAILABLE" } },
        { id: "v2", order: 2, startMinute: 600, plannedDurationMinutes: 60, destination: { id: "b", name: "Điểm cũ", area: "Mèo Vạc", visibility: "HIDDEN", availability: "UNAVAILABLE" } },
      ] },
      { id: "d2", dayIndex: 2, localDate: "2026-10-11", visits: [] },
    ] };
    const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));
    expect(html.indexOf("Ngày 1")).toBeLessThan(html.indexOf("Ngày 2"));
    expect(html.indexOf("Cột cờ Lũng Cú")).toBeLessThan(html.indexOf("Điểm cũ"));
    expect(html).toContain("08:00");
    expect(html).toContain("90 phút");
    expect(html).toContain("Điểm đến không còn khả dụng công khai");
    expect(html).toContain("Ngày này chưa có điểm dừng");
  });
  it("distinguishes loading from a recoverable technical error", () => {
    const loading = renderToStaticMarkup(createElement(MyTripsLoading));
    const error = renderToStaticMarkup(createElement(MyTripsError, { reset: () => {} }));
    expect(loading).toContain("Đang tải chuyến đi của bạn");
    expect(loading).toContain('aria-busy="true"');
    expect(error).toContain("Không thể tải chuyến đi");
    expect(error).toContain("Thử lại");
    expect(error).not.toContain("Đang tải chuyến đi của bạn");
  });
});
