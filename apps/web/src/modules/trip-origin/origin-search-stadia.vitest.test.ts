import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createStadiaOriginSearch } from "./origin-search-stadia";

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const feature = (name: string, where: string, lon: number, lat: number) => ({ geometry: { coordinates: [lon, lat] }, properties: { name, coarse_location: where } });

describe("Stadia origin autocomplete", () => {
  it("maps in-Vietnam features and drops outside ones", async () => {
    const fetcher = vi.fn(() => json({ features: [feature("Hoàng Mai", "Hà Nội, Việt Nam", 105.85, 20.97), feature("Bangkok", "Thailand", 100.5, 13.75)] }));
    const search = createStadiaOriginSearch({ apiKey: async () => "k", fetcher: fetcher as unknown as typeof fetch });
    const out = await search({ query: "hoàng mai" });
    expect(out).toMatchObject({ status: "RESULTS", results: [{ label: "Hoàng Mai, Hà Nội, Việt Nam", latitude: 20.97, longitude: 105.85 }] });
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain("boundary.country=VN");
  });

  it("is unavailable without a key or on provider failure", async () => {
    expect(await createStadiaOriginSearch({ apiKey: async () => undefined })({ query: "hà nội" })).toEqual({ status: "UNAVAILABLE" });
    const failing = createStadiaOriginSearch({ apiKey: async () => "k", fetcher: (() => json({}, 500)) as unknown as typeof fetch });
    expect(await failing({ query: "hà nội" })).toEqual({ status: "UNAVAILABLE" });
  });
});
