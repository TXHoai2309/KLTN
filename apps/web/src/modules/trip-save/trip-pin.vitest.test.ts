import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TripPinnedSection } from "../../components/trip-pinned/trip-pinned-section";
import { TripsageResultCards, readTripsageResultTurns } from "../../components/tripsage-chat/tripsage-result-cards";
import type { PinControl } from "../../components/tripsage-chat/tripsage-pin-button";
import { costPin, flightPin, hotelPin, mealPin, pinKey } from "./trip-pin-builders";
import { lenientPinnedItemsSchema, MAX_PINNED_ITEMS, pinRequestSchema, readPinnedItems, shareablePins, sharedPinSchema } from "./trip-pin-contract";
import { tripSaveRequestSchema } from "./trip-save-contract";
import type { FlightsPart, HotelsPart } from "../tripsage-chat/tripsage-chat-parts";
import type { CostPart } from "../tripsage-chat/tripsage-cost";

const flights: FlightsPart = {
  roundTrip: true, adults: 2, returnDate: "2026-12-29", lookupDate: "2026-11-22",
  offers: [{ price: { total: "4411124", currency: "VND" }, itineraries: [{ connections: 0, segments: [{ from: "DAD", to: "HAN", departAt: "2026-12-25T07:45:00", arriveAt: "2026-12-25T09:05:00", airline: "Vietnam Airlines", flight: "VN162" }] }] }],
};
const hotels: HotelsPart = {
  near: "Hạ Thành", nights: 2, adults: 2,
  hotels: [{ name: "Royal Hotel Ha Giang", distanceKm: 4.6, rating: 4.4, price: { total: "1200000", perNight: "600000", currency: "VND" }, checkInDate: "2026-12-25", checkOutDate: "2026-12-27" }],
};
const cost: CostPart = {
  currency: "VND", travelers: 2, days: 5, total: 9_000_000, perPersonPerDay: 900_000, budgetCap: null, withinCap: null, overBy: null, priceReferenceDate: "2026-11-21",
  assumptions: ["Ước tính."],
  lines: [
    { category: "transport", label: "Vé máy bay", amount: 4_000_000 },
    { category: "lodging", label: "Lưu trú", amount: 2_000_000, basis: "4 đêm" },
    { category: "food", label: "Ăn uống", amount: 1_500_000 },
    { category: "other", label: "Khác", amount: 500_000 },
  ],
};

describe("pinned items (ADR-47)", () => {
  it("builds valid pins from what the cards show", () => {
    const items = [flightPin(flights, 0, "2026-11-22"), hotelPin(hotels, hotels.hotels[0]!, "2026-11-22"), costPin(cost),
      mealPin({ kind: "MEAL", slotId: "d2-lunch", title: "Bếp Việt", place: { name: "Bếp Việt", placeId: "p1", distanceKm: 5.2 } } as never)];
    expect(items.every(Boolean)).toBe(true);
    expect(lenientPinnedItemsSchema.parse(items)).toHaveLength(4);
    expect(flightPin(flights, 0, "x")).toMatchObject({ kind: "FLIGHT", adults: 2, departDate: "2026-12-25", returnDate: "2026-12-29", lookupDate: "2026-11-22" });
    expect(pinKey(items[0]!)).toBe(pinKey(flightPin(flights, 0, "2026-11-22")!));
  });

  it("drops malformed pins instead of failing and caps the list", () => {
    const good = costPin(cost);
    expect(lenientPinnedItemsSchema.parse([good, { kind: "FLIGHT" }, "x", { kind: "HOTEL", name: 3 }])).toEqual([good]);
    expect(lenientPinnedItemsSchema.safeParse(Array.from({ length: MAX_PINNED_ITEMS + 1 }, () => good)).success).toBe(false);
    expect(pinRequestSchema.safeParse({ items: [good], extra: 1 }).success).toBe(false);
  });

  it("is accepted on the save request and survives a stored row that no longer matches", () => {
    const parsed = lenientPinnedItemsSchema.parse([costPin(cost)]);
    expect(tripSaveRequestSchema.shape.pinnedItems).toBeDefined();
    expect(readPinnedItems([{ payload: parsed[0] }, { payload: { kind: "COST" } }, { payload: null }])).toHaveLength(1);
  });

  it("shares stays, meals and only the lodging and food part of the cost, never flights or fares", () => {
    const shared = shareablePins([flightPin(flights, 0, "2026-11-22")!, hotelPin(hotels, hotels.hotels[0]!, "2026-11-22"), costPin(cost)]);
    expect(shared.map(item => item.kind)).toEqual(["HOTEL", "COST"]);
    const sharedCost = shared[1] as Extract<(typeof shared)[number], { kind: "COST" }>;
    expect(sharedCost.lines.map(line => line.category)).toEqual(["lodging", "food"]);
    expect(sharedCost.subtotal).toBe(3_500_000);
    expect(JSON.stringify(shared)).not.toMatch(/Vé máy bay|DAD|transport|9000000|4000000/u);
    expect(shared.every(item => sharedPinSchema.safeParse(item).success)).toBe(true);
    expect(shareablePins([flightPin(flights, 0, "2026-11-22")!])).toEqual([]);
  });

  it("renders owner pins in full and the shared view without flights", () => {
    const owner = renderToStaticMarkup(createElement(TripPinnedSection, { items: [flightPin(flights, 0, "2026-11-22")!, hotelPin(hotels, hotels.hotels[0]!, "2026-11-22"), costPin(cost)] })).replaceAll(" ", " ");
    for (const text of ["Mục đã ghim", "DAD → HAN", "Royal Hotel Ha Giang", "Booking.com", "9.000.000đ", "Ứng dụng không đặt chỗ"]) expect(owner).toContain(text);
    const shared = renderToStaticMarkup(createElement(TripPinnedSection, { items: shareablePins([flightPin(flights, 0, "2026-11-22")!, costPin(cost)]), shared: true })).replaceAll(" ", " ");
    expect(shared).toContain("lưu trú và ăn uống");
    expect(shared).toContain("3.500.000đ");
    expect(shared).not.toMatch(/DAD|Vé máy bay|9\.000\.000/u);
    expect(renderToStaticMarkup(createElement(TripPinnedSection, { items: [] }))).toBe("");
  });

  it("shows pin buttons on the cards only when the chat supplies a control", () => {
    const part = (type: string, id: string, data: unknown) => ({ type, id, data });
    const { turns } = readTripsageResultTurns([{ id: "m", role: "assistant", parts: [part("data-flights", "flights-1", flights), part("data-hotels", "hotels-1", hotels)] }]);
    const cards = turns.get("m")!;
    const none = renderToStaticMarkup(createElement(TripsageResultCards, { parts: cards }));
    expect(none).not.toContain("Ghim vào chuyến đi");
    const pinned = new Set<string>([pinKey(hotelPin(hotels, hotels.hotels[0]!, new Date().toISOString().slice(0, 10)))]);
    const control: PinControl = { saved: false, isPinned: item => pinned.has(pinKey(item)), toggle: () => undefined };
    const html = renderToStaticMarkup(createElement(TripsageResultCards, { parts: cards, pins: control }));
    expect(html).toContain("Ghim vào chuyến đi");
    expect(html).toContain("Đã ghim, sẽ lưu cùng chuyến");
  });
});
