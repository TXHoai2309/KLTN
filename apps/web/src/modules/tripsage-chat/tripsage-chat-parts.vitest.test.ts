import { describe, expect, it } from "vitest";
import { budgetPartSchema, flightsPartSchema, hotelsPartSchema, readTripsageResultPart } from "./tripsage-chat-parts";

const budget = {
  currency: "VND", total: 1000, perPersonPerDay: 500, withinCap: null, overBy: null,
  allocations: [{ category: "food", amount: 1000, sharePercent: 100 }],
};
const leg = { from: "SGN", to: "HAN", departAt: "2026-11-20T08:00:00", arriveAt: "2026-11-20T10:00:00", airline: "Vietnam Airlines", flight: "VN120" };
const price = { total: "99.10", currency: "USD" };
const flight = { price, itineraries: [{ connections: 0, segments: [leg] }] };
const hotel = { name: "Nhà nghỉ", distanceKm: null, room: null, checkInDate: "2026-11-20", checkOutDate: "2026-11-21", price };

describe("TripSage result data-part contracts", () => {
  it("accepts validated display data, preserving unknown budget and distance", () => {
    expect(readTripsageResultPart({ type: "data-budget", id: "budget", data: budget })).toMatchObject({ data: budget });
    expect(readTripsageResultPart({ type: "data-flights", id: "flights-1", data: { offers: [flight] } })).toMatchObject({ data: { offers: [flight] } });
    expect(readTripsageResultPart({ type: "data-hotels", id: "hotels-1", data: { near: "Điểm đến", nights: 1, hotels: [hotel] } })).toMatchObject({ data: { hotels: [hotel] } });
  });

  it("rejects unexpected fields even in nested allocation, price and provider rows", () => {
    expect(budgetPartSchema.safeParse({ ...budget, toolNote: "other" }).success).toBe(false);
    expect(budgetPartSchema.safeParse({ ...budget, allocations: [{ ...budget.allocations[0], key: "dummy" }] }).success).toBe(false);
    expect(flightsPartSchema.safeParse({ offers: [{ ...flight, price: { ...price, bearer: "dummy" } }] }).success).toBe(false);
    expect(flightsPartSchema.safeParse({ offers: [{ ...flight, itineraries: [{ connections: 0, segments: [{ ...leg, longitude: 105 }] }] }] }).success).toBe(false);
    expect(hotelsPartSchema.safeParse({ near: "A", nights: 1, hotels: [{ ...hotel, hotelId: "HG000001", latitude: 22 }] }).success).toBe(false);
  });

  it("bounds free text, decimal amounts and the number of offers", () => {
    expect(budgetPartSchema.safeParse({ ...budget, allocations: [{ ...budget.allocations[0], note: "x".repeat(121) }] }).success).toBe(false);
    expect(flightsPartSchema.safeParse({ offers: [{ ...flight, price: { ...price, total: "9".repeat(33) } }] }).success).toBe(false);
    expect(flightsPartSchema.safeParse({ offers: Array(6).fill(flight) }).success).toBe(false);
    expect(hotelsPartSchema.safeParse({ near: "A", nights: 1, hotels: Array(6).fill(hotel) }).success).toBe(false);
    expect(hotelsPartSchema.safeParse({ near: "A", nights: 1, hotels: [{ ...hotel, name: "x".repeat(81) }] }).success).toBe(false);
    expect(hotelsPartSchema.safeParse({ near: "A", nights: 1, hotels: [{ ...hotel, room: "x".repeat(61) }] }).success).toBe(false);
  });

  it("accepts up to 5 priced plus 3 unpriced hotels with ratings and rejects exceeding either cap", () => {
    const priced = { ...hotel, rating: 4.5, reviews: 20, price: { total: "900000", perNight: "450000", currency: "VND" } };
    const unpriced = { ...hotel, rating: 4.1, reviews: 5, price: null };
    expect(hotelsPartSchema.safeParse({
      near: "Đồng Văn",
      nights: 2,
      hotels: [...Array(5).fill(priced), ...Array(3).fill(unpriced)],
    }).success).toBe(true);
    expect(hotelsPartSchema.safeParse({
      near: "Đồng Văn",
      nights: 2,
      hotels: Array(4).fill(unpriced),
    }).success).toBe(false);
  });

  it("accepts roundTrip and typicalPriceRange on FlightsPart while keeping legacy FlightsPart valid", () => {
    expect(flightsPartSchema.safeParse({
      offers: [flight],
      roundTrip: true,
      typicalPriceRange: { min: "2000000", max: "3200000", currency: "VND" },
    }).success).toBe(true);
    expect(flightsPartSchema.safeParse({ offers: [flight] }).success).toBe(true);
  });

  it("drops invalid IDs, empty lists and incoherent comparison values", () => {
    expect(readTripsageResultPart({ type: "data-flights", id: "budget", data: { offers: [flight] } })).toBeNull();
    expect(flightsPartSchema.safeParse({ offers: [] }).success).toBe(false);
    expect(hotelsPartSchema.safeParse({ near: "A", nights: 1, hotels: [] }).success).toBe(false);
    expect(budgetPartSchema.safeParse({ ...budget, withinCap: true, overBy: null }).success).toBe(false);
  });
});
