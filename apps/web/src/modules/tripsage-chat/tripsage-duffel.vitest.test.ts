import { describe, expect, it, vi } from "vitest";
import { createDuffelFlightLookup } from "./tripsage-duffel";

const key = "fake-duffel-token-private";
const query = { origin: "SGN", destination: "HAN", departureDate: "2028-02-29", returnDate: "2028-03-02", adults: 2 };
const segment = (from: string, to: string, date: string, flight: string) => ({
  origin: { iata_code: from }, destination: { iata_code: to },
  departing_at: `${date}T08:30:00`, arriving_at: `${date}T10:30:00`,
  operating_carrier: { name: "  Hãng\n bay  ", iata_code: "VN" },
  marketing_carrier: { iata_code: "VN" }, marketing_carrier_flight_number: flight,
});
const offer = (total_amount: string) => ({
  total_amount, total_currency: "USD",
  slices: [
    { segments: [segment("SGN", "HAN", "2028-02-29", "120")] },
    { segments: [segment("HAN", "DAD", "2028-03-02", "100"), segment("DAD", "SGN", "2028-03-02", "130")] },
  ],
});
const payload = (offers: unknown[]) => ({ data: { offers, client_key: key, id: "not-exposed" } });
const response = (body: unknown, status = 200) => Response.json(body, { status });
const lookup = (fetcher: typeof fetch, timeoutMs?: number) => createDuffelFlightLookup({ accessToken: () => key, fetcher, timeoutMs });

describe("Duffel flight lookup", () => {
  it("makes one documented v2 offer request and returns the five cheapest offers numerically", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload(["100", "90", "21", "7.05", "200", "10"].map(offer))));
    const result = await lookup(fetcher)(query);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    const endpoint = new URL(String(url));
    expect(endpoint.origin + endpoint.pathname).toBe("https://api.duffel.com/air/offer_requests");
    expect(endpoint.searchParams.get("return_offers")).toBe("true");
    expect(Number(endpoint.searchParams.get("supplier_timeout"))).toBeLessThan(8_000);
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${key}`);
    expect(headers.get("duffel-version")).toBe("v2");
    expect(JSON.parse(String(init?.body))).toEqual({ data: {
      slices: [
        { origin: "SGN", destination: "HAN", departure_date: "2028-02-29" },
        { origin: "HAN", destination: "SGN", departure_date: "2028-03-02" },
      ],
      cabin_class: "economy", passengers: [{ type: "adult" }, { type: "adult" }], max_connections: 1,
    } });
    expect(result.status).toBe("RESULTS");
    if (result.status !== "RESULTS") return;
    expect(result.offers.map(item => item.price.total)).toEqual(["7.05", "10", "21", "90", "100"]);
    expect(result.offers[0]).toMatchObject({
      price: { total: "7.05", currency: "USD" },
      itineraries: [
        { connections: 0, segments: [{ from: "SGN", to: "HAN", departAt: "2028-02-29T08:30:00", arriveAt: "2028-02-29T10:30:00", airline: "Hãng bay", flight: "VN120" }] },
        { connections: 1, segments: [{ from: "HAN", to: "DAD" }, { from: "DAD", to: "SGN" }] },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("not-exposed");
  });

  it("does not fetch without a credential", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createDuffelFlightLookup({ accessToken: () => " ", fetcher })(query)).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("compares decimal amounts even when two values round to the same JavaScript number", async () => {
    const amounts = ["100.12345678901234567", "100.12345678901234566"];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload(amounts.map(offer))));
    const result = await lookup(fetcher)(query);
    expect(result.status === "RESULTS" && result.offers.map(item => item.price.total)).toEqual(amounts.toReversed());
  });

  it("returns NO_RESULTS for an explicit empty offers array", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload([])));
    await expect(lookup(fetcher)({ ...query, returnDate: undefined, nonStop: true })).resolves.toEqual({ status: "NO_RESULTS" });
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).data;
    expect(request.max_connections).toBe(0);
    expect(request.slices).toHaveLength(1);
  });

  it.each([
    ["401", () => response({ error: key }, 401)],
    ["500", () => response({ error: key }, 500)],
    ["broken JSON", () => new Response("{broken")],
    ["missing offers", () => response({ data: {} })],
    ["large body", () => new Response("a".repeat(2 * 1024 * 1024 + 1))],
    ["non-decimal price", () => response(payload([offer("1e2")]))],
    ["mixed currencies", () => response(payload([offer("10"), { ...offer("20"), total_currency: "VND" }]))],
    ["invalid date", () => response(payload([{ ...offer("10"), slices: [{ segments: [segment("SGN", "HAN", "2028-02-30", "1")] }] }]))],
    ["invalid IATA", () => response(payload([{ ...offer("10"), slices: [{ segments: [segment("sgn", "HAN", "2028-02-29", "1")] }] }]))],
    ["credential in a projected name", () => {
      const leg = segment("SGN", "HAN", "2028-02-29", "1");
      leg.operating_carrier.name = key;
      return response(payload([{ ...offer("10"), slices: [{ segments: [leg] }] }]));
    }],
  ] as const)("returns UNAVAILABLE for %s and never exposes the credential", async (_case, body) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => body());
    const outcome = await lookup(fetcher)(query);
    expect(outcome).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds a hanging fetch and suppresses thrown provider errors", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockRejectedValueOnce(new Error(key));
    await expect(lookup(fetcher, 15)(query)).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await expect(lookup(fetcher)(query)).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
