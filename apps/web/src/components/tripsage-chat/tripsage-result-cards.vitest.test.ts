import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readTripsageResultTurns, TripsageResultCards } from "./tripsage-result-cards";

const budget = {
  type: "data-budget", id: "budget", data: {
    currency: "VND", total: 1200000, perPersonPerDay: 300000, withinCap: false, overBy: 200000,
    allocations: [{ category: "food", amount: 1200000, sharePercent: 99, note: "Dự tính cho cả nhóm" }],
  },
};
const flights = {
  type: "data-flights", id: "flights-1", data: { offers: [{
    price: { total: "100.10", currency: "USD" },
    itineraries: [{ connections: 0, segments: [{
      from: "SGN", to: "HAN", departAt: "2026-11-20T08:08:00", arriveAt: "2026-11-20T10:09:00",
      airline: "<img src=x> Hãng bay", flight: "VN120",
    }] }],
  }] },
};
const hotels = {
  type: "data-hotels", id: "hotels-1", data: { near: "Điểm đến", nights: 2, hotels: [{
    name: "https://example.test", distanceKm: null, room: null, price: { total: "1200000.00", currency: "VND" },
    checkInDate: "2026-11-20", checkOutDate: "2026-11-22",
  }] },
};
const message = (id: string, parts: unknown[]) => ({ id, role: "assistant", parts });
const render = (inputs: unknown[]) => {
  const { turns } = readTripsageResultTurns([message("m", inputs)]);
  return renderToStaticMarkup(createElement(TripsageResultCards, { parts: turns.get("m") ?? [] })).replaceAll("\u00a0", " ");
};

describe("TripSage result cards", () => {
  it("shows the VND estimate, excess, per-person cost and approximate shares", () => {
    const html = render([budget]);
    for (const label of ["1.200.000 ₫", "300.000 ₫", "Vượt 200.000 ₫", "≈ 99%", "Dự tính cho cả nhóm", "Ứng dụng không đặt chỗ"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toMatch(/PASS|Đã kiểm/u);
  });

  it("handles null separately from within budget and replaces an earlier same-turn budget", () => {
    const within = { ...budget, data: { ...budget.data, withinCap: true, overBy: 0 } };
    expect(render([within])).toContain("Trong ngân sách");
    const missing = { ...budget, data: { ...budget.data, withinCap: null, overBy: null } };
    const html = render([budget, missing]);
    expect(html).toContain("Chưa có ngân sách tối đa để so sánh");
    expect(html).not.toMatch(/Trong ngân sách|Vượt 200/u);
    expect(html.match(/<h3>/gu)).toHaveLength(1);
    expect(readTripsageResultTurns([message("a", [budget]), message("b", [missing])]).latestBudgetMessageId).toBe("b");
  });

  it("renders flight times as supplied, displays USD and escapes provider content", () => {
    const html = render([flights]);
    for (const label of ["100,10 US$", "Đi SGN", "08:08, 20/11/2026", "10:09, 20/11/2026", "0 lần nối chuyến", "VN120", "Duffel", "Giá tham khảo", "&lt;img src=x&gt;"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toMatch(/<img|<a\s/u);
  });

  it("renders an unknown distance, no room label and nights while keeping provider URLs as text", () => {
    const html = render([hotels]);
    for (const label of ["1200000", "Chưa kiểm tra bằng bộ kiểm tra lịch trình", "Amadeus", "Chưa có dữ liệu khoảng cách", "—", "2 đêm", "https://example.test"]) {
      expect(html).toContain(label === "1200000" ? "1.200.000 ₫" : label);
    }
    expect(html).not.toMatch(/<a\s|· Phòng|Đã kiểm|PASS/u);
  });

  it("skips malformed and empty parts and keeps the order of valid cards", () => {
    expect(render([{ ...flights, data: { offers: [] } }, { ...hotels, data: { nights: 1 } }, { ...budget, id: "bad" }])).toBe("");
    const html = render([flights, budget, hotels]);
    expect(html.indexOf("<h3>Vé máy bay")).toBeLessThan(html.indexOf("<h3>Ước tính ngân sách"));
    expect(html.indexOf("<h3>Ước tính ngân sách")).toBeLessThan(html.indexOf("<h3>Khách sạn"));
  });
});
