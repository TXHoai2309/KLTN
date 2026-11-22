import { asSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createTripsageExtraTools } from "./tripsage-extra-tools";
import type { TripsageFeature } from "./tripsage-features";

const features = new Set<TripsageFeature>(["flights", "hotels"]);
const options = { toolCallId: "call", messages: [], context: {} };
const point = { name: "Điểm a", latitude: 22.8, longitude: 105 };
const flightInput = { originAirport: "SGN", departureDate: "2028-02-29", adults: 1 };
const hotelInput = { destinationId: "a", checkInDate: "2028-02-29", checkOutDate: "2028-03-01", adults: 1, currency: "VND", kind: "ANY" as const };
const lookup = () => ({
  flights: vi.fn(async () => ({ status: "NO_RESULTS" } as const)),
  hotels: vi.fn(async () => ({ status: "NO_RESULTS" } as const)),
});

describe("transport and hotel lookups", () => {
  it("reserves at most six hotel area lookups across seven concurrent distinct areas", async () => {
    const providers = lookup();
    const destinationPoint = vi.fn(async (id: string) => ({ ...point, name: `Điểm ${id}` }));
    const { searchHotels } = createTripsageExtraTools({ features, flights: () => providers.flights, hotels: () => providers.hotels, destinationPoint, now: () => new Date("2028-02-28T00:00:00Z") });

    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) => searchHotels!.execute({ ...hotelInput, destinationId: `a${i}` }, options)),
    );
    expect(providers.hotels).toHaveBeenCalledTimes(6);
    expect(results.slice(0, 6)).toEqual(Array.from({ length: 6 }, () => expect.objectContaining({ ok: true })));
    expect(results[6]).toEqual(expect.objectContaining({ ok: false, code: "HOTEL_LIMIT" }));
    expect(providers.hotels).toHaveBeenCalledWith(expect.objectContaining({ nearName: "Điểm a0", latitude: point.latitude, longitude: point.longitude, kind: "ANY" }), undefined);
    const validation = await asSchema(searchHotels!.inputSchema).validate?.({ ...hotelInput, latitude: 0 });
    expect(validation).toMatchObject({ success: false });
  });

  it("reserves at most two flight lookups across three concurrent distinct queries", async () => {
    const providers = lookup();
    const { searchFlights } = createTripsageExtraTools({ features, flights: () => providers.flights, hotels: () => providers.hotels, now: () => new Date("2028-02-28T00:00:00Z") });
    const results = await Promise.all([
      searchFlights!.execute({ ...flightInput, departureDate: "2028-02-29" }, options),
      searchFlights!.execute({ ...flightInput, departureDate: "2028-03-01" }, options),
      searchFlights!.execute({ ...flightInput, departureDate: "2028-03-02" }, options),
    ]);
    expect(providers.flights).toHaveBeenCalledTimes(2);
    expect(results[2]).toMatchObject({ ok: false, code: "FLIGHT_LIMIT" });
  });

  it("reports an unavailable provider before reading candidates or spending a lookup", async () => {
    const destinationPoint = vi.fn(async () => null);
    const { searchFlights, searchHotels } = createTripsageExtraTools({ features, destinationPoint, now: () => new Date("2028-02-28T00:00:00Z") });
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(searchFlights!.execute(flightInput, options)).resolves.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
      await expect(searchHotels!.execute(hotelInput, options)).resolves.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    }
    expect(destinationPoint).not.toHaveBeenCalled();
  });

  it("distinguishes a destination-read failure from an unknown ID without spending a lookup", async () => {
    const providers = lookup();
    const destinationPoint = vi.fn<() => Promise<typeof point | null>>()
      .mockRejectedValueOnce(new Error("private database details"))
      .mockResolvedValueOnce(null)
      .mockResolvedValue(point);
    const { searchHotels } = createTripsageExtraTools({ features, flights: () => providers.flights, hotels: () => providers.hotels, destinationPoint, maxHotelCalls: 1, now: () => new Date("2028-02-28T00:00:00Z") });
    const failure = await searchHotels!.execute(hotelInput, options);
    expect(failure).toMatchObject({ code: "DESTINATION_LOOKUP_UNAVAILABLE", message: expect.stringContaining("tạm thời") });
    expect(JSON.stringify(failure)).not.toContain("private database details");
    await expect(searchHotels!.execute(hotelInput, options)).resolves.toMatchObject({ code: "DESTINATION_NOT_FOUND" });
    expect(providers.hotels).not.toHaveBeenCalled();
    await expect(searchHotels!.execute(hotelInput, options)).resolves.toMatchObject({ ok: true });
    expect(providers.hotels).toHaveBeenCalledTimes(1);
  });
});

describe("lookup dates in Asia/Ho_Chi_Minh", () => {
  function toolsAt(now: string) {
    const providers = lookup();
    return { providers, ...createTripsageExtraTools({ features, flights: () => providers.flights, hotels: () => providers.hotels, destinationPoint: async () => point, now: () => new Date(now) }) };
  }

  it.each(["2028-13-01", "2028-02-30", "2027-02-29"])("returns INVALID_INPUT for impossible date %s", async date => {
    const { searchFlights, searchHotels, providers } = toolsAt("2026-01-01T00:00:00Z");
    await expect(searchFlights!.execute({ ...flightInput, departureDate: date }, options)).resolves.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchFlights!.execute({ ...flightInput, returnDate: date }, options)).resolves.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchHotels!.execute({ ...hotelInput, checkInDate: date }, options)).resolves.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchHotels!.execute({ ...hotelInput, checkOutDate: date }, options)).resolves.toMatchObject({ code: "INVALID_INPUT" });
    expect(providers.flights).not.toHaveBeenCalled();
    expect(providers.hotels).not.toHaveBeenCalled();
  });

  it("accepts leap-day departure and check-in at 16:59:59Z, then rejects both at 17:00:00Z", async () => {
    const beforeMidnight = toolsAt("2028-02-29T16:59:59Z");
    const atMidnight = toolsAt("2028-02-29T17:00:00Z");
    await expect(beforeMidnight.searchFlights!.execute(flightInput, options)).resolves.toMatchObject({ ok: true });
    await expect(beforeMidnight.searchHotels!.execute(hotelInput, options)).resolves.toMatchObject({ ok: true });
    await expect(atMidnight.searchFlights!.execute(flightInput, options)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(atMidnight.searchHotels!.execute(hotelInput, options)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(atMidnight.providers.flights).not.toHaveBeenCalled();
    expect(atMidnight.providers.hotels).not.toHaveBeenCalled();
  });

  it.each([
    ["2028-02-29", false],
    ["2028-03-01", true],
    ["2028-03-14", true],
    ["2028-03-15", false],
  ])("accepts check-out %s only for 1–14 nights from leap day", async (checkOutDate, ok) => {
    const { searchHotels, providers } = toolsAt("2028-02-28T00:00:00Z");
    const result = await searchHotels!.execute({ ...hotelInput, checkOutDate }, options);
    expect(result).toMatchObject(ok ? { ok: true } : { ok: false, code: "INVALID_INPUT" });
    expect(providers.hotels).toHaveBeenCalledTimes(ok ? 1 : 0);
  });
});
