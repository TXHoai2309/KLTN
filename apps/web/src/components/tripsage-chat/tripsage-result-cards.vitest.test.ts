import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { googleFlightsUrl, readTripsageResultTurns, TripsageResultCards } from "./tripsage-result-cards";

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

  it("renders legacy saved FlightsPart, displays USD and escapes provider content", () => {
    const html = render([flights]);
    for (const label of ["100,10 US$", "08:08</time> SGN", "10:09</time> HAN", "20/11/2026", "Bay thẳng", "VN120", "Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.", "Giá tham khảo", "&lt;img src=x&gt;"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toMatch(/<img/u);
    expect(html).not.toContain("(+1 ngày)");
  });

  it("links out to Google Flights for booking, with only airport codes and dates in the query", () => {
    const html = render([{ ...flights, data: { ...flights.data, roundTrip: true, returnDate: "2026-11-23", adults: 2 } }]);
    expect(googleFlightsUrl(flights.data as never)).toBe("https://www.google.com/travel/flights?q=Flights%20from%20SGN%20to%20HAN%20on%202026-11-20&curr=USD&hl=vi");
    expect(html).toContain("Flights%20from%20SGN%20to%20HAN%20on%202026-11-20%20through%202026-11-23");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("https://www.skyscanner.com.vn/transport/flights/sgn/han/261120/261123/?currency=VND&amp;adultsv2=2");
    expect(html).toContain("https://www.traveloka.com/vi-vn/flight/fullsearch?ap=SGN.HAN&amp;dt=20-11-2026.23-11-2026&amp;ps=2.0.0&amp;sc=ECONOMY");
    expect(html).not.toContain("Trang hãng");
    expect(html).toContain("tổng cho 2 người");
    expect(html).toContain("Ứng dụng không đặt chỗ");
  });

  it("shows three offers, folds the rest and marks an overnight arrival", () => {
    const offer = (total: string, arriveAt: string) => ({
      price: { total, currency: "VND" },
      itineraries: [{ connections: 0, segments: [{ from: "DAD", to: "HAN", departAt: "2026-11-20T23:30:00", arriveAt, airline: "Hãng", flight: "VN1" }] }],
    });
    const many = { ...flights, data: { offers: [offer("1000000", "2026-11-21T00:50:00"), offer("2000000", "2026-11-20T23:59:00"), offer("3000000", "2026-11-20T23:59:00"), offer("4000000", "2026-11-20T23:59:00")] } };
    const html = render([many]);
    expect(html).toContain("(+1 ngày)");
    expect(html).toContain("Xem thêm 1 chuyến");
    expect(html.indexOf("4.000.000 ₫")).toBeGreaterThan(html.indexOf("Xem thêm 1 chuyến"));
    expect(html.indexOf("3.000.000 ₫")).toBeLessThan(html.indexOf("Xem thêm 1 chuyến"));
  });

  it("renders SerpApi round-trip FlightsPart with typical price range and return-leg Google Flights note", () => {
    const serpFlights = {
      type: "data-flights",
      id: "flights-2",
      data: {
        roundTrip: true,
        typicalPriceRange: { min: "2000000", max: "3200000", currency: "VND" },
        offers: [{
          price: { total: "2150000", currency: "VND" },
          totalDurationMinutes: 85,
          itineraries: [{
            connections: 0,
            segments: [{
              from: "DAD",
              to: "HAN",
              departAt: "2026-11-20T08:30:00",
              arriveAt: "2026-11-20T09:55:00",
              airline: "Vietnam Airlines",
              flight: "VN162",
            }],
          }],
        }],
      },
    };
    const html = render([serpFlights]);
    for (const label of [
      "Khoảng giá thường gặp: 2.000.000 ₫ – 3.200.000 ₫",
      "2.150.000 ₫",
      "Giá khứ hồi tham khảo",
      "Chiều về: xem chi tiết chiều về trên Google Flights.",
      "https://www.vietnamairlines.com/vn/vi/home",
      "Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("renders legacy saved HotelsPart with unknown distance, no room label and nights while keeping provider URLs as text", () => {
    const html = render([hotels]);
    for (const label of ["1.200.000 ₫", "Chưa kiểm tra bằng bộ kiểm tra lịch trình", "Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.", "Chưa có dữ liệu khoảng cách", "—", "2 đêm", "https://example.test"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toMatch(/· Phòng|Đã kiểm|PASS/u);
    // The provider name is only ever text or an encoded search term, never the link target itself.
    expect(html).toContain('href="https://www.google.com/travel/hotels?q=https%3A%2F%2Fexample.test%20%C4%90i%E1%BB%83m%20%C4%91%E1%BA%BFn&amp;curr=VND&amp;hl=vi"');
    expect(html).toContain("checkin=2026-11-20&amp;checkout=2026-11-22&amp;group_adults=2");
    expect(html).toContain("https://www.agoda.com/vi-vn/search?textToSearch=");
    expect(html).toContain("checkIn=2026-11-20&amp;checkOut=2026-11-22");
    expect(html).toContain("https://www.traveloka.com/vi-vn/hotel");
    expect(html).toContain("Ứng dụng không đặt chỗ");
  });

  it("renders SerpApi lodging card with priced and unpriced groups plus ratings", () => {
    const serpHotels = {
      type: "data-hotels",
      id: "hotels-2",
      data: {
        near: "Phố cổ Đồng Văn",
        nights: 2,
        hotels: [
          {
            name: "Homestay Phố Cổ",
            distanceKm: 0.4,
            room: null,
            rating: 4.7,
            reviews: 88,
            price: { total: "1200000", perNight: "600000", currency: "VND" },
            checkInDate: "2026-11-20",
            checkOutDate: "2026-11-22",
          },
          {
            name: "Nhà nghỉ Hoa Đá",
            distanceKm: 1.2,
            room: null,
            rating: 4.2,
            reviews: 15,
            price: null,
            checkInDate: "2026-11-20",
            checkOutDate: "2026-11-22",
          },
        ],
      },
    };
    const html = render([serpHotels]);
    for (const label of [
      "Chỗ ở tham khảo",
      "Gần Phố cổ Đồng Văn · 2 đêm",
      "Homestay Phố Cổ",
      "0,4 km",
      "Đánh giá 4,7/5 (88)",
      "1.200.000 ₫",
      "600.000 ₫/đêm",
      "Nhà nghỉ Hoa Đá",
      "Chưa có giá online",
      "Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("skips malformed and empty parts and keeps the order of valid cards", () => {
    expect(render([{ ...flights, data: { offers: [] } }, { ...hotels, data: { nights: 1 } }, { ...budget, id: "bad" }])).toBe("");
    const html = render([flights, budget, hotels]);
    expect(html.indexOf("<h3>Vé máy bay")).toBeLessThan(html.indexOf("<h3>Ước tính ngân sách"));
    expect(html.indexOf("<h3>Ước tính ngân sách")).toBeLessThan(html.indexOf("<h3>Chỗ ở"));
  });
});
