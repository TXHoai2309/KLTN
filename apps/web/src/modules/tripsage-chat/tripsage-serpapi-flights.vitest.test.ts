import { asSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createTripsageExtraTools } from "./tripsage-extra-tools";
import type { TripsageFeature } from "./tripsage-features";
import { createSerpApiClient } from "./tripsage-serpapi";
import { createSerpApiFlightLookup, type FlightQuery } from "./tripsage-serpapi-flights";
import { findNearestVietnamAirport, findVietnamAirportByCode, VIETNAM_AIRPORTS } from "./vietnam-airports";

const KEY = "serp-test-flight-key-private";
const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status });

const makeLookup = (fetcher: typeof fetch) =>
  createSerpApiFlightLookup(createSerpApiClient({ apiKeys: () => KEY, fetcher }));

const flightOption = (price: number, opts: { from?: string; to?: string; via?: string; depart?: string; arrive?: string; airline?: string; flightNo?: string; duration?: number } = {}) => {
  const from = opts.from ?? "DAD";
  const to = opts.to ?? "HAN";
  const depart = opts.depart ?? "2028-03-10 08:30";
  const arrive = opts.arrive ?? "2028-03-10 10:00";
  const airline = opts.airline ?? "  Vietnam\n Airlines ";
  const flightNo = opts.flightNo ?? "VN 162";
  const flights = opts.via
    ? [
        { departure_airport: { id: from, time: depart }, arrival_airport: { id: opts.via, time: "2028-03-10 09:30" }, airline, flight_number: flightNo },
        { departure_airport: { id: opts.via, time: "2028-03-10 10:30" }, arrival_airport: { id: to, time: "2028-03-10 12:00" }, airline, flight_number: "VN 200" },
      ]
    : [{ departure_airport: { id: from, time: depart }, arrival_airport: { id: to, time: arrive }, airline, flight_number: flightNo }];
  return {
    flights,
    layovers: opts.via ? [{ id: opts.via, name: "Transit", duration: 60 }] : undefined,
    total_duration: opts.duration ?? (opts.via ? 210 : 90),
    price,
    departure_token: "unused-token-must-not-be-called",
  };
};

describe("Vietnam civil airport selection", () => {
  it("contains static civil airports and selects the nearest airport via haversine", () => {
    expect(VIETNAM_AIRPORTS.length).toBeGreaterThanOrEqual(20);
    expect(findVietnamAirportByCode("DAD")?.name).toContain("Đà Nẵng");
    expect(findVietnamAirportByCode("ZZZ")).toBeNull();

    // Đà Nẵng → DAD
    expect(findNearestVietnamAirport({ latitude: 16.0544, longitude: 108.2022 }).airport.code).toBe("DAD");
    // Hội An → DAD
    expect(findNearestVietnamAirport({ latitude: 15.8801, longitude: 108.3380 }).airport.code).toBe("DAD");
    // TP.HCM → SGN
    expect(findNearestVietnamAirport({ latitude: 10.7769, longitude: 106.7009 }).airport.code).toBe("SGN");
    // Hà Nội → HAN
    expect(findNearestVietnamAirport({ latitude: 21.0285, longitude: 105.8542 }).airport.code).toBe("HAN");
  });
});

describe("SerpApi google_flights lookup", () => {
  const roundTripQuery: FlightQuery = {
    origin: "DAD",
    destination: "HAN",
    departureDate: "2028-03-10",
    returnDate: "2028-03-14",
    adults: 2,
  };

  it("executes a single round-trip request (type=1), ranks 5 cheapest from best_flights + other_flights, and never follows departure_token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      best_flights: [flightOption(2800000), flightOption(2200000, { flightNo: "VJ 504", airline: "VietJet Air" })],
      other_flights: [
        flightOption(3500000),
        flightOption(2500000, { via: "HUI" }),
        flightOption(2100000, { flightNo: "QH 102", airline: "Bamboo Airways" }),
        flightOption(2900000),
        flightOption(2400000),
      ],
      price_insights: { lowest_price: 2100000, typical_price_range: [2000000, 3200000] },
      extra_field: "ignored",
    }));

    const outcome = await makeLookup(fetcher)(roundTripQuery);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get("engine")).toBe("google_flights");
    expect(url.searchParams.get("departure_id")).toBe("DAD");
    expect(url.searchParams.get("arrival_id")).toBe("HAN");
    expect(url.searchParams.get("outbound_date")).toBe("2028-03-10");
    expect(url.searchParams.get("return_date")).toBe("2028-03-14");
    expect(url.searchParams.get("type")).toBe("1");
    expect(url.searchParams.get("adults")).toBe("1"); // one adult priced, then × group
    expect(url.searchParams.get("currency")).toBe("VND");
    expect(url.searchParams.get("gl")).toBe("vn");
    expect(url.searchParams.get("hl")).toBe("vi");
    expect(url.searchParams.get("sort_by")).toBe("2");
    expect(url.searchParams.has("departure_token")).toBe(false);

    expect(outcome.status).toBe("RESULTS");
    if (outcome.status !== "RESULTS") return;
    expect(outcome.roundTrip).toBe(true);
    expect(outcome.typicalPriceRange).toEqual({ min: "4000000", max: "6400000", currency: "VND" });
    expect(outcome.offers).toHaveLength(5);
    expect(outcome.offers.map(o => o.price.total)).toEqual(["4200000", "4400000", "4800000", "5000000", "5600000"]);
    expect(outcome.offers[0]).toMatchObject({
      price: { total: "4200000", currency: "VND" },
      totalDurationMinutes: 90,
      itineraries: [{
        connections: 0,
        segments: [{
          from: "DAD",
          to: "HAN",
          departAt: "2028-03-10T08:30:00",
          arriveAt: "2028-03-10T10:00:00",
          airline: "Bamboo Airways",
          flight: "QH102",
        }],
      }],
    });
    expect(outcome.offers[3]!.itineraries[0]!.connections).toBe(1);
    expect(JSON.stringify(outcome)).not.toContain("departure_token");
  });

  it("handles one-way queries (type=2) and filters nonStop locally", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      best_flights: [flightOption(1100000, { via: "HUI" }), flightOption(1350000)],
    }));

    const outcome = await makeLookup(fetcher)({
      origin: "SGN",
      destination: "HAN",
      departureDate: "2028-03-10",
      adults: 1,
      nonStop: true,
    });

    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get("type")).toBe("2");
    expect(url.searchParams.has("return_date")).toBe(false);
    expect(outcome.status).toBe("RESULTS");
    if (outcome.status !== "RESULTS") return;
    expect(outcome.roundTrip).toBe(false);
    expect(outcome.offers).toHaveLength(1);
    expect(outcome.offers[0]!.price.total).toBe("1350000");
  });

  it("returns NO_RESULTS when no flights are returned or explicit no-results error", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ best_flights: [], other_flights: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "Google Flights hasn't returned any results for this query." }));
    const lookup = makeLookup(fetcher);

    await expect(lookup(roundTripQuery)).resolves.toEqual({ status: "NO_RESULTS" });
    await expect(lookup(roundTripQuery)).resolves.toEqual({ status: "NO_RESULTS" });
  });

  it.each([
    ["missing best_flights and other_flights", { search_metadata: { status: "Success" } }],
    ["invalid price type", { best_flights: [{ ...flightOption(1000000), price: "1tr" }] }],
    ["invalid airport code", { best_flights: [flightOption(1000000, { from: "da-nang" })] }],
    ["invalid departure date/time", { best_flights: [flightOption(1000000, { depart: "2028-02-30 08:00" })] }],
  ] as const)("returns UNAVAILABLE for invalid schema: %s", async (_label, body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    await expect(makeLookup(fetcher)(roundTripQuery)).resolves.toEqual({ status: "UNAVAILABLE" });
  });
});

describe("searchFlights tool server-side airport selection", () => {
  const features = new Set<TripsageFeature>(["flights"]);
  const options = { toolCallId: "call", messages: [], context: {} };

  it("chooses DAD automatically from confirmed Đà Nẵng or Hội An origin without model passing IATA", async () => {
    const flightLookup = vi.fn(async () => ({ status: "NO_RESULTS" as const }));
    const hoiAnTools = createTripsageExtraTools({
      features,
      flights: () => flightLookup,
      confirmedOrigin: () => ({ label: "Hội An, Quảng Nam", latitude: 15.8801, longitude: 108.3380 }),
      now: () => new Date("2028-02-28T00:00:00Z"),
    });

    const res = await hoiAnTools.searchFlights!.execute({ departureDate: "2028-03-10", returnDate: "2028-03-14", adults: 2 }, options);
    expect(res).toMatchObject({ ok: true, originAirport: "DAD", destinationAirport: "HAN" });
    expect(flightLookup).toHaveBeenCalledWith(expect.objectContaining({ origin: "DAD", destination: "HAN" }), undefined);

    // Rejects arbitrary origin/destination fields from model
    const badOrigin = await asSchema(hoiAnTools.searchFlights!.inputSchema).validate?.({ origin: "SGN", destination: "HAN", departureDate: "2028-03-10" });
    expect(badOrigin).toMatchObject({ success: false });
  });

  it("returns ORIGIN_REQUIRED without calling network when no confirmed origin and no originAirport", async () => {
    const flightLookup = vi.fn(async () => ({ status: "NO_RESULTS" as const }));
    const tools = createTripsageExtraTools({
      features,
      flights: () => flightLookup,
      confirmedOrigin: () => null,
      now: () => new Date("2028-02-28T00:00:00Z"),
    });

    const res = await tools.searchFlights!.execute({ departureDate: "2028-03-10", adults: 1 }, options);
    expect(res).toMatchObject({ ok: false, code: "ORIGIN_REQUIRED" });
    expect(flightLookup).not.toHaveBeenCalled();
  });

  it("does not look up flights when confirmed origin is already nearest to HAN (Hà Nội)", async () => {
    const flightLookup = vi.fn(async () => ({ status: "NO_RESULTS" as const }));
    const tools = createTripsageExtraTools({
      features,
      flights: () => flightLookup,
      confirmedOrigin: () => ({ label: "Hà Nội", latitude: 21.0285, longitude: 105.8542 }),
      now: () => new Date("2028-02-28T00:00:00Z"),
    });

    const res = await tools.searchFlights!.execute({ departureDate: "2028-03-10", adults: 1 }, options);
    expect(res).toMatchObject({ ok: false, code: "ALREADY_NEAR_HAN" });
    expect(flightLookup).not.toHaveBeenCalled();
  });

  it("honors explicit originAirport when user states an airport (e.g. Huế -> HUI)", async () => {
    const flightLookup = vi.fn(async () => ({ status: "NO_RESULTS" as const }));
    const tools = createTripsageExtraTools({
      features,
      flights: () => flightLookup,
      confirmedOrigin: () => null,
      now: () => new Date("2028-02-28T00:00:00Z"),
    });

    const res = await tools.searchFlights!.execute({ originAirport: "HUI", departureDate: "2028-03-10", adults: 1 }, options);
    expect(res).toMatchObject({ ok: true, originAirport: "HUI", destinationAirport: "HAN" });
    expect(flightLookup).toHaveBeenCalledWith(expect.objectContaining({ origin: "HUI", destination: "HAN" }), undefined);
  });
});
