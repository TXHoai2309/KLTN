import { describe, expect, it, vi } from "vitest";
import { createAmadeusHotelLookup } from "./tripsage-amadeus";

const clientId = "fake-amadeus-client-private";
const clientSecret = "fake-amadeus-secret-private";
const accessToken = "fake-amadeus-token-private";
const hotelId = "HG000001";
const query = { latitude: 22.82, longitude: 104.99, checkInDate: "2028-02-29", checkOutDate: "2028-03-01", adults: 2, currency: "VND" };
const response = (body: unknown, status = 200) => Response.json(body, { status });
const token = (value = accessToken) => response({ access_token: value, expires_in: 60 });
const geocode = { data: [{ hotelId, name: "Nhà nghỉ" }] };
const offer = {
  checkInDate: query.checkInDate, checkOutDate: query.checkOutDate,
  price: { total: "1100000.00", currency: "VND" },
  room: { type: "A1K", typeEstimated: { category: "DELUXE" } },
};
const entry = (id = hotelId, available = true) => ({ hotel: { hotelId: id, name: "  Nhà\n nghỉ A  " }, available, offers: [offer] });
const mocks = () => {
  const fetcher = vi.fn<typeof fetch>();
  return { fetcher, deps: { clientId: () => clientId, clientSecret: () => clientSecret, fetcher, tokens: new Map() } };
};

describe("Amadeus hotel lookup", () => {
  it("queries only listed hotels, filters unknown and unavailable entries and maps rooms and distances", async () => {
    const { deps, fetcher } = mocks();
    fetcher.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: [
        { hotelId, distance: { value: 7 } },
        { hotelId: "HG000002", distance: { value: 2, unit: "KM" } },
        { hotelId: "HG000003" },
      ] }))
      .mockResolvedValueOnce(response({ data: [
        entry("HG000099"), entry("HG000002", false), entry(),
        { ...entry("HG000003"), offers: [{ ...offer, room: { typeEstimated: { category: "STANDARD" } } }] },
      ] }));
    const result = await createAmadeusHotelLookup(deps)(query);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [oauth, geocoded, priced] = fetcher.mock.calls;
    expect(String(oauth?.[0])).toBe("https://test.api.amadeus.com/v1/security/oauth2/token");
    expect(Object.fromEntries(new URLSearchParams(String(oauth?.[1]?.body)))).toEqual({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
    expect(new URL(String(geocoded?.[0])).pathname).toBe("/v1/reference-data/locations/hotels/by-geocode");
    const priceUrl = new URL(String(priced?.[0]));
    expect(priceUrl.pathname).toBe("/v3/shopping/hotel-offers");
    expect(new Set(priceUrl.searchParams.get("hotelIds")?.split(","))).toEqual(new Set([hotelId, "HG000002", "HG000003"]));
    expect(priceUrl.searchParams.get("includeClosed")).toBe("false");
    for (const [, init] of [geocoded!, priced!]) {
      expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
    }
    expect(result).toEqual({ status: "RESULTS", offers: [
      { hotelId, name: "Nhà nghỉ A", distanceKm: null, room: "A1K", price: offer.price, checkInDate: query.checkInDate, checkOutDate: query.checkOutDate },
      { hotelId: "HG000003", name: "Nhà nghỉ A", distanceKm: null, room: "STANDARD", price: offer.price, checkInDate: query.checkInDate, checkOutDate: query.checkOutDate },
    ] });
  });

  it("selects at most the 20 nearest known distances and retains only five offers", async () => {
    const { deps, fetcher } = mocks();
    const hotels = Array.from({ length: 22 }, (_, i) => ({ hotelId: `HG${String(i + 1).padStart(6, "0")}`, name: "Nhà nghỉ", distance: { value: 22 - i, unit: "KM" } }));
    fetcher.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: hotels }))
      .mockResolvedValueOnce(response({ data: hotels.map(hotel => entry(hotel.hotelId)) }));
    const result = await createAmadeusHotelLookup(deps)(query);
    const sentIds = new URL(String(fetcher.mock.calls[2]?.[0])).searchParams.get("hotelIds")?.split(",");
    expect(sentIds).toEqual(hotels.slice(2).reverse().map(hotel => hotel.hotelId));
    expect(result.status === "RESULTS" && result.offers.map(hotel => hotel.distanceKm)).toEqual([1, 2, 3, 4, 5]);
  });

  it("ignores sold-out entries even when the provider does not attach offer details", async () => {
    const { deps, fetcher } = mocks();
    fetcher.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response(geocode))
      .mockResolvedValueOnce(response({ data: [{ ...entry(), offers: [{ available: false }, offer] }] }));
    const result = await createAmadeusHotelLookup(deps)(query);
    expect(result).toMatchObject({ status: "RESULTS", offers: [{ hotelId, price: offer.price }] });
  });

  it("uses the cache, evicts expired tokens and refreshes after a 401 on the next lookup only", async () => {
    const { deps, fetcher } = mocks();
    let now = 0;
    fetcher.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(token("new-fake-bearer"))
      .mockResolvedValueOnce(response(geocode))
      .mockResolvedValueOnce(response({ errors: [{ code: 999, detail: clientSecret }] }, 401))
      .mockResolvedValueOnce(token("refreshed-fake-bearer"))
      .mockResolvedValueOnce(response({ data: [] }));
    const lookup = createAmadeusHotelLookup({ ...deps, now: () => now });
    expect(await lookup(query)).toEqual({ status: "NO_RESULTS" });
    expect(await lookup(query)).toEqual({ status: "NO_RESULTS" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    now = 61_000;
    expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(await lookup(query)).toEqual({ status: "NO_RESULTS" });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
    expect(new Headers(fetcher.mock.calls[7]?.[1]?.headers).get("authorization")).toBe("Bearer refreshed-fake-bearer");
  });

  it("distinguishes empty data from missing data in either hotel response", async () => {
    const { deps, fetcher } = mocks();
    fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response(geocode)).mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response(geocode)).mockResolvedValueOnce(response({ data: [] }));
    const lookup = createAmadeusHotelLookup(deps);
    expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
    expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
    expect(await lookup(query)).toEqual({ status: "NO_RESULTS" });
  });

  it("only maps documented HTTP 400 business code 424 from pricing to NO_RESULTS", async () => {
    const { deps, fetcher } = mocks();
    const notFound = { errors: [{ status: 400, code: 424, detail: clientSecret }] };
    fetcher.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(response(geocode)).mockResolvedValueOnce(response(notFound, 400))
      .mockResolvedValueOnce(response(notFound, 400))
      .mockResolvedValueOnce(response(geocode)).mockResolvedValueOnce(response(notFound, 500));
    const lookup = createAmadeusHotelLookup(deps);
    expect(await lookup(query)).toEqual({ status: "NO_RESULTS" });
    expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
    expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
  });

  it.each([
    ["HTTP 403", () => response({ error: clientSecret }, 403)],
    ["HTTP 500", () => response({ error: accessToken }, 500)],
    ["broken JSON", () => new Response("{broken")],
    ["large body", () => new Response("a".repeat(512 * 1024 + 1))],
    ["invalid price", () => response({ data: [{ ...entry(), offers: [{ ...offer, price: { ...offer.price, total: "1e2" } }] }] })],
    ["invalid date", () => response({ data: [{ ...entry(), offers: [{ ...offer, checkOutDate: "2028-02-30" }] }] })],
    ["credential in hotel name", () => response({ data: [{ ...entry(), hotel: { hotelId, name: clientSecret } }] })],
  ] as const)("returns UNAVAILABLE for %s without exposing a secret", async (_case, body) => {
    const { deps, fetcher } = mocks();
    fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(response({ data: [{ hotelId, name: "H" }] })).mockResolvedValueOnce(body());
    expect(await createAmadeusHotelLookup(deps)(query)).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("includes credential resolution in the timeout and prevents a late fetch", async () => {
    const { deps, fetcher } = mocks();
    let release!: (value: string) => void;
    const delayed = new Promise<string>(resolve => { release = resolve; });
    const timer = setTimeout(() => release(clientSecret), 40);
    try {
      const lookup = createAmadeusHotelLookup({ ...deps, clientSecret: () => delayed, timeoutMs: 10 });
      expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
      await delayed;
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timer);
    }
  });

  it("bounds a hanging provider response and suppresses thrown provider errors", async () => {
    const { deps, fetcher } = mocks();
    fetcher.mockImplementationOnce(() => new Promise(() => {})).mockRejectedValueOnce(new Error(clientSecret));
    const lookup = createAmadeusHotelLookup({ ...deps, timeoutMs: 15 });
    expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(await lookup(query)).toEqual({ status: "UNAVAILABLE" });
  });
});
