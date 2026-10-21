import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

import type { TripDetail, TripSummary } from "@/modules/trip-read/trip-read-service";
import { MyTripsView, TripDetailView } from "./trips-view";
import MyTripsLoading from "./loading";
import MyTripsError from "./error";

const sample = (id: string, status: TripSummary["status"]): TripSummary => ({
  id, status, startDate: "2026-10-10", endDate: "2026-10-11", durationDays: 2, transport: "CAR", isFavorite: false, visitCount: 3, manuallyCompletedAt: null,
});

describe("US-31 Trip views", () => {
  it("renders three status groups and a create action", () => {
    const html = renderToStaticMarkup(createElement(MyTripsView, { items: [sample("one", "UPCOMING"), sample("two", "ONGOING"), sample("three", "COMPLETED")] }));
    for (const label of ["Sắp tới", "Đang diễn ra", "Đã hoàn thành", "Tạo chuyến đi"]) expect(html).toContain(label);
    expect(html).toContain("/trips/one");
    expect(html).toContain("3 điểm dừng");
    expect(html).toContain("/trips/new");
    expect(html).toContain("Đánh dấu đã hoàn thành");
    expect(html).toContain("Xóa chuyến đi");
    expect(html).not.toContain("Đang tải trạng thái yêu thích");
    expect(html).not.toContain("Thêm chuyến đi vào yêu thích");
    expect(html).not.toContain("Bỏ chuyến đi khỏi yêu thích");
  });
  it("distinguishes manual completion from elapsed calendar dates", () => {
    const html = renderToStaticMarkup(createElement(MyTripsView, { items: [{ ...sample("manual", "COMPLETED"), manuallyCompletedAt: "2026-10-20T00:00:00Z" }, sample("calendar", "COMPLETED")] }));
    expect(html).toContain("Bạn đã đánh dấu hoàn thành thủ công.");
    expect(html).toContain("Bỏ đánh dấu hoàn thành");
    expect(html).toContain("Đã hoàn thành theo ngày kế hoạch; chưa đánh dấu thủ công.");
  });
  it("shows a valid empty state", () => {
    const html = renderToStaticMarkup(createElement(MyTripsView, { items: [] }));
    expect(html).toContain("Bạn chưa có chuyến đi nào.");
    expect(html).not.toContain("Lỗi");
  });
  it.each([false, true])("omits Favorite actions for isFavorite=%s on both Trip surfaces", (isFavorite) => {
    const trip: TripDetail = { ...sample("owned", "UPCOMING"), isFavorite, days: [] };
    for (const html of [
      renderToStaticMarkup(createElement(MyTripsView, { items: [trip] })),
      renderToStaticMarkup(createElement(TripDetailView, { trip })),
    ]) {
      expect(html).not.toContain("favorite-button");
      expect(html).not.toContain("Đang tải trạng thái yêu thích");
      expect(html).not.toContain("Thêm chuyến đi vào yêu thích");
      expect(html).not.toContain("Bỏ chuyến đi khỏi yêu thích");
    }
  });
  it("renders ordered itinerary by day with unavailable destination text", () => {
    const trip: TripDetail = { ...sample("one", "ONGOING"), days: [
      { id: "d1", dayIndex: 1, localDate: "2026-10-10", visits: [
        { id: "v1", order: 1, startMinute: 480, plannedDurationMinutes: 90, destination: { id: "a", name: "Cột cờ Lũng Cú", area: "Đồng Văn", visibility: "VISIBLE" } },
        { id: "v2", order: 2, startMinute: 600, plannedDurationMinutes: 60, destination: { id: "b", name: "Điểm cũ", area: "Mèo Vạc", visibility: "HIDDEN" } },
      ] },
      { id: "d2", dayIndex: 2, localDate: "2026-10-11", visits: [] },
    ] };
    const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));
    expect(html.indexOf("Ngày 1")).toBeLessThan(html.indexOf("Ngày 2"));
    expect(html.indexOf("Cột cờ Lũng Cú")).toBeLessThan(html.indexOf("Điểm cũ"));
    expect(html).toContain("08:00");
    expect(html).toContain("08:00 – 09:30 (90 phút)");
    expect(html).toContain("90 phút");
    expect(html).toContain("Không còn công khai");
    expect(html).toContain("Ngày này chưa có điểm dừng");
    expect(html).toContain("Quay lại Chuyến đi của tôi");
    expect(html).not.toContain("Thêm chuyến đi vào yêu thích");
    expect(html).not.toContain("Bỏ chuyến đi khỏi yêu thích");
    expect(html).not.toContain("Đang tải trạng thái yêu thích");
    expect(html).toContain('href="/trips"');
    expect(html).toContain('href="/trips/one/edit"');
    expect(html).not.toContain('href="/destinations/b"');
  });
  it("distinguishes loading from a recoverable technical error", () => {
    const loading = renderToStaticMarkup(createElement(MyTripsLoading));
    const error = renderToStaticMarkup(createElement(MyTripsError, { reset: () => {} }));
    expect(loading).toContain("Đang tải chuyến đi của bạn");
    expect(loading).toContain('aria-busy="true"');
    expect(error).toContain("Không thể tải danh sách chuyến đi");
    expect(error).toContain("Thử lại");
    expect(error).not.toContain("Đang tải chuyến đi của bạn");
  });
});
