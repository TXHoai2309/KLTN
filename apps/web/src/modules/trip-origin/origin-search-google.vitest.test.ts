import { afterEach, expect, it, vi } from "vitest";
import { createConfiguredOriginSearch } from "./origin-search-configured";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("finds a Vietnam origin outside Hà Giang and preserves Google provenance for confirmation", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  const requests: { url: string; body: unknown }[] = [];
  const search = createConfiguredOriginSearch({ googleApiKey: () => "private-fixture-key", stadiaApiKey: async () => { throw new Error("inactive provider"); }, fetcher: async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ places: [{ id: "hanoi", displayName: { text: "Bến xe Mỹ Đình" }, location: { latitude: 21.028, longitude: 105.778 } }] });
  } });
  expect(await search({ query: "Mỹ Đình" })).toMatchObject({ status: "RESULTS", results: [{ label: "Bến xe Mỹ Đình", latitude: 21.028, longitude: 105.778, source: "GOOGLE_PLACES", confirmed: false }], cached: false });
  expect(requests).toEqual([{ url: "https://places.googleapis.com/v1/places:searchText", body: { textQuery: "Mỹ Đình", languageCode: "vi", regionCode: "VN", pageSize: 5 } }]);
});

it.each([401, 429, 500])("keeps Google HTTP %s unavailable without calling Stadia", async status => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  const fetcher = vi.fn<typeof fetch>(async () => new Response("private provider failure", { status }));
  const search = createConfiguredOriginSearch({ googleApiKey: () => "private-fixture-key", stadiaApiKey: async () => { throw new Error("inactive provider"); }, fetcher });
  expect(await search({ query: "Hà Nội" })).toMatchObject({ status: "UNAVAILABLE" });
  expect(fetcher).toHaveBeenCalledOnce();
});

it("bounds even an uncooperative Google call at four seconds", async () => {
  vi.useFakeTimers(); vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  const search = createConfiguredOriginSearch({ googleApiKey: () => "fixture", stadiaApiKey: async () => undefined, fetcher: () => new Promise(() => {}) });
  const pending = search({ query: "Hà Nội" });
  await vi.advanceTimersByTimeAsync(4000);
  expect(await pending).toMatchObject({ status: "UNAVAILABLE" });
});

it("returns no results for places outside Vietnam and retains Stadia provenance when off", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  const google = createConfiguredOriginSearch({ googleApiKey: () => "fixture", stadiaApiKey: async () => undefined, fetcher: async () => Response.json({ places: [{ displayName: { text: "Bangkok" }, location: { latitude: 13.75, longitude: 100.5 } }] }) });
  expect(await google({ query: "Bangkok" })).toMatchObject({ status: "NO_RESULTS", results: [] });
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "STADIA");
  const stadia = createConfiguredOriginSearch({ googleApiKey: () => { throw new Error("inactive provider"); }, stadiaApiKey: async () => "fixture", fetcher: async () => Response.json({ features: [{ geometry: { coordinates: [105.8, 21] }, properties: { name: "Hà Nội" } }] }) });
  expect(await stadia({ query: "Hà Nội" })).toMatchObject({ status: "RESULTS", results: [{ source: "STADIA", confirmed: false }] });
});
