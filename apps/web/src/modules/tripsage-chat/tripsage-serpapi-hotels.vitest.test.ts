import { describe, expect, it, vi } from "vitest";
import { createSerpApiClient } from "./tripsage-serpapi";
import { buildHotelSearchQuery, createSerpApiHotelLookup, type HotelQuery, type LodgingKind } from "./tripsage-serpapi-hotels";

const KEY = "serp-test-hotel-key-private";
const BASE_QUERY: HotelQuery = {
  nearName: "Phố cổ Đồng Văn",
  latitude: 23.2775,
  longitude: 105.3632,
  checkInDate: "2028-03-10",
  checkOutDate: "2028-03-12",
  adults: 2,
  currency: "VND",
  kind: "HOMESTAY",
};

const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status });

const makeLookup = (fetcher: typeof fetch) =>
  createSerpApiHotelLookup(createSerpApiClient({ apiKeys: () => KEY, fetcher }));

describe("SerpApi google_hotels lookup", () => {
  it.each([
    ["HOTEL", "khách sạn gần Phố cổ Đồng Văn, Hà Giang"],
    ["HOMESTAY", "homestay gần Phố cổ Đồng Văn, Hà Giang"],
    ["GUESTHOUSE", "nhà nghỉ gần Phố cổ Đồng Văn, Hà Giang"],
    ["ANY", "chỗ ở gần Phố cổ Đồng Văn, Hà Giang"],
  ] as const)("builds the expected q query for kind=%s and sends documented params without property_types", async (kind: LodgingKind, expectedQ: string) => {
    expect(buildHotelSearchQuery("Phố cổ Đồng Văn", kind)).toBe(expectedQ);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      properties: [{
        name: "Homestay Phố Cổ",
        gps_coordinates: { latitude: 23.278, longitude: 105.364 },
        rate_per_night: { lowest: "500.000 ₫", extracted_lowest: 500000 },
        total_rate: { lowest: "1.000.000 ₫", extracted_lowest: 1000000 },
        overall_rating: 4.6,
        reviews: 82,
        extra_ignored_field: "ignored",
      }],
    }));

    const result = await makeLookup(fetcher)({ ...BASE_QUERY, kind });
    expect(result.status).toBe("RESULTS");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get("engine")).toBe("google_hotels");
    expect(url.searchParams.get("q")).toBe(expectedQ);
    expect(url.searchParams.get("check_in_date")).toBe("2028-03-10");
    expect(url.searchParams.get("check_out_date")).toBe("2028-03-12");
    expect(url.searchParams.get("adults")).toBe("2");
    expect(url.searchParams.get("currency")).toBe("VND");
    expect(url.searchParams.get("gl")).toBe("vn");
    expect(url.searchParams.get("hl")).toBe("vi");
    expect(url.searchParams.has("property_types")).toBe(false);
    expect(url.searchParams.has("latitude")).toBe(false);
    expect(url.searchParams.has("longitude")).toBe(false);
  });

  it("filters out properties without coordinates or beyond 10 km, sorts by distance, and caps at 5 priced + 3 unpriced", async () => {
    // 0.01 deg lat ≈ 1.11 km. 0.15 deg lat ≈ 16.7 km (> 10 km).
    const properties = [
      // Beyond 10 km (should be dropped)
      {
        name: "Resort Xa Tít",
        gps_coordinates: { latitude: 23.43, longitude: 105.3632 },
        rate_per_night: { extracted_lowest: 300000 },
        total_rate: { extracted_lowest: 600000 },
        overall_rating: 4.9,
        reviews: 200,
      },
      // Missing coordinates (should be dropped)
      {
        name: "Nhà nghỉ Thiếu Tọa Độ",
        rate_per_night: { extracted_lowest: 250000 },
        total_rate: { extracted_lowest: 500000 },
      },
      // 6 priced properties within 10 km (only closest 5 kept)
      ...[6, 2, 5, 1, 4, 3].map(idx => ({
        name: `  Khách sạn\n số ${idx}  `,
        gps_coordinates: { latitude: 23.2775 + idx * 0.008, longitude: 105.3632 },
        rate_per_night: { extracted_lowest: idx * 100000 },
        total_rate: { extracted_lowest: idx * 200000 },
        overall_rating: 4.0 + idx * 0.1,
        reviews: idx * 10,
      })),
      // 4 unpriced properties within 10 km (only closest 3 kept)
      ...[4, 1, 3, 2].map(idx => ({
        name: `Nhà nghỉ Bình Dân ${idx}`,
        gps_coordinates: { latitude: 23.2775 + idx * 0.005, longitude: 105.3632 },
        overall_rating: 4.2,
        reviews: 15,
      })),
    ];

    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ properties, serpapi_meta: "ignored" }));
    const outcome = await makeLookup(fetcher)(BASE_QUERY);

    expect(outcome.status).toBe("RESULTS");
    if (outcome.status !== "RESULTS") return;

    const priced = outcome.offers.filter(o => o.price !== null);
    const unpriced = outcome.offers.filter(o => o.price === null);
    expect(priced).toHaveLength(5);
    expect(unpriced).toHaveLength(3);
    expect(outcome.offers).toHaveLength(8);

    // Priced come first, sorted by ascending distance, names cleaned
    expect(priced.map(o => o.name)).toEqual([
      "Khách sạn số 1",
      "Khách sạn số 2",
      "Khách sạn số 3",
      "Khách sạn số 4",
      "Khách sạn số 5",
    ]);
    expect(priced[0]).toMatchObject({
      name: "Khách sạn số 1",
      rating: 4.1,
      reviews: 10,
      price: { total: "200000", perNight: "100000", currency: "VND" },
      checkInDate: "2028-03-10",
      checkOutDate: "2028-03-12",
    });

    // Unpriced come after priced, sorted by ascending distance
    expect(unpriced.map(o => o.name)).toEqual([
      "Nhà nghỉ Bình Dân 1",
      "Nhà nghỉ Bình Dân 2",
      "Nhà nghỉ Bình Dân 3",
    ]);
    expect(unpriced[0]!.price).toBeNull();
    expect(unpriced[0]!.rating).toBe(4.2);

    // Dropped properties never appear
    expect(JSON.stringify(outcome)).not.toContain("Resort Xa Tít");
    expect(JSON.stringify(outcome)).not.toContain("Thiếu Tọa Độ");
    expect(JSON.stringify(outcome)).not.toContain("số 6");
    expect(JSON.stringify(outcome)).not.toContain("Bình Dân 4");
  });

  it("derives total from rate_per_night * nights when total_rate is absent, and handles total_rate without rate_per_night", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      properties: [
        {
          name: "Homestay Chỉ Giá Đêm",
          gps_coordinates: { latitude: 23.278, longitude: 105.364 },
          rate_per_night: { extracted_lowest: 450000 },
        },
        {
          name: "Homestay Chỉ Tổng Giá",
          gps_coordinates: { latitude: 23.279, longitude: 105.364 },
          total_rate: { extracted_lowest: 1100000 },
        },
      ],
    }));

    const outcome = await makeLookup(fetcher)(BASE_QUERY);
    expect(outcome.status).toBe("RESULTS");
    if (outcome.status !== "RESULTS") return;
    expect(outcome.offers[0]!.price).toEqual({ total: "900000", perNight: "450000", currency: "VND" });
    expect(outcome.offers[1]!.price).toEqual({ total: "1100000", perNight: null, currency: "VND" });
  });

  it("returns NO_RESULTS when properties is empty, explicit no-results error, or all items are filtered out", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ properties: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "Google hasn't returned any results for this query." }))
      .mockResolvedValueOnce(jsonResponse({
        properties: [
          { name: "Quá Xa", gps_coordinates: { latitude: 23.5, longitude: 105.5 } },
          { name: "Không Tọa Độ" },
        ],
      }));
    const lookup = makeLookup(fetcher);

    await expect(lookup(BASE_QUERY)).resolves.toEqual({ status: "NO_RESULTS" });
    await expect(lookup(BASE_QUERY)).resolves.toEqual({ status: "NO_RESULTS" });
    await expect(lookup(BASE_QUERY)).resolves.toEqual({ status: "NO_RESULTS" });
  });

  it.each([
    ["missing properties field", { search_metadata: { status: "Success" } }],
    ["non-array properties", { properties: "bad" }],
    ["invalid name type", { properties: [{ name: 123, gps_coordinates: { latitude: 23.27, longitude: 105.36 } }] }],
    ["invalid gps_coordinates type", { properties: [{ name: "A", gps_coordinates: { latitude: "23.27", longitude: 105.36 } }] }],
    ["invalid extracted_lowest type", { properties: [{ name: "A", gps_coordinates: { latitude: 23.27, longitude: 105.36 }, rate_per_night: { extracted_lowest: "500k" } }] }],
    ["invalid overall_rating", { properties: [{ name: "A", gps_coordinates: { latitude: 23.27, longitude: 105.36 }, overall_rating: 9 }] }],
  ] as const)("returns UNAVAILABLE for invalid schema: %s", async (_label, body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    await expect(makeLookup(fetcher)(BASE_QUERY)).resolves.toEqual({ status: "UNAVAILABLE" });
  });
});
