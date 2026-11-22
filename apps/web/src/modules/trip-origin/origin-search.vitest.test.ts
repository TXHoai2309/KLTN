import type { Database } from "@KLTN/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { originSearchRequestSchema } from "./origin-search-contract";
import { createOriginSearchService } from "./origin-search-service";
import { originSearchConfig, searchNominatim } from "./origin-search-provider";
import { originSearchResponse } from "./origin-search-http";
import { ORIGIN_SEARCH_FIXTURES } from "./origin-search-fixtures";
import type { OriginSearchStore } from "./origin-search-store";

const config = { endpoint: "https://nominatim.example.test/search", contact: "https://example.test/contact" };
const publicRows = [{ display_name: "Hà Nội", lat: "21.028511", lon: "105.804817", secret: "provider-extra" }];
function fixture() {
  const store: OriginSearchStore = { read: vi.fn(async () => null), claim: vi.fn(async () => ({ databaseNow: new Date(0), expiresAt: new Date(3000) })), write: vi.fn(async () => undefined) };
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(publicRows));
  return { store, fetcher, search: createOriginSearchService({ store, config: () => config, fetcher }) };
}
function authorization(role: string | null = "TRAVELER") {
  return { resolveSession: async () => role ? { user: { id: "owner" } } : null, database: { user: { findUnique: async () => ({ id: "owner", role }) } } as unknown as Database };
}
const request = (body: unknown = { query: "Hà Nội" }, extra: Record<string, string> = {}) => new Request("https://example.test/api/trip-origins/search", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
afterEach(() => vi.useRealTimers());

describe("Nominatim explicit-search provider/service", () => {
  it("validates public-place-only payloads and never accepts notes, coordinates, email or phone", () => {
    expect(originSearchRequestSchema.parse({ query: "  Hà Nội " }).query).toBe("Hà Nội");
    for (const payload of [{ query: "" }, { query: "x".repeat(161) }, { query: "owner@example.test" }, { query: "0901 234 567" }, { query: "Hà Nội", notes: "private" }, { query: "Hà Nội", latitude: 21 }]) expect(originSearchRequestSchema.safeParse(payload).success).toBe(false);
  });
  it("requires valid identification/configuration and does not admit/call upstream without it", async () => {
    for (const raw of [{ ...config, contact: "" }, { ...config, contact: "generic" }, { ...config, endpoint: "http://example.test/search" }, { ...config, endpoint: "https://key:secret@example.test/search" }]) expect(originSearchConfig(raw)).toBeNull();
    expect(originSearchConfig(config)).toEqual(config);
    const test = fixture();
    expect(await createOriginSearchService({ store: test.store, config: () => null, fetcher: test.fetcher })({ query: "Hà Nội" })).toEqual({ status: "UNAVAILABLE" });
    expect(test.store.claim).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled();
  });
  it("sends only the explicit query, identifying headers and filter; sanitizes and rechecks polygon coverage", async () => {
    const test = fixture();
    test.fetcher.mockResolvedValueOnce(Response.json([...publicRows, { display_name: "Ngoài Việt Nam", lat: "20", lon: "102" }, { display_name: "invalid", lat: "", lon: "" }]));
    const result = await test.search({ query: " Hà   Nội " });
    expect(result).toEqual(ORIGIN_SEARCH_FIXTURES.results);
    const [url, init] = test.fetcher.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("q")).toBe("Hà Nội");
    expect(new URL(String(url)).searchParams.get("countrycodes")).toBe("vn");
    expect(init).toMatchObject({ redirect: "error", cache: "no-store", headers: { "user-agent": "KLTN-origin/1.0 (https://example.test/contact)" } });
    expect(test.fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("provider-extra");
    expect(test.store.write).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), ORIGIN_SEARCH_FIXTURES.results.results);
  });
  it("serves valid cache without admission/upstream and namespaces endpoint changes", async () => {
    const test = fixture();
    vi.mocked(test.store.read).mockResolvedValue(ORIGIN_SEARCH_FIXTURES.results.results);
    expect(await test.search({ query: "Hà Nội" })).toEqual({ ...ORIGIN_SEARCH_FIXTURES.results, cached: true });
    expect(test.store.claim).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled();
    const first = vi.mocked(test.store.read).mock.calls[0]![0];
    await createOriginSearchService({ store: test.store, config: () => ({ ...config, endpoint: "https://alternative.example.test/search" }) })({ query: "Hà Nội" });
    expect(vi.mocked(test.store.read).mock.calls[1]![0]).not.toBe(first);
  });
  it("caches no-results, filters untrusted cached rows and returns busy without retry", async () => {
    const empty = fixture(); empty.fetcher.mockResolvedValueOnce(Response.json([]));
    expect(await empty.search({ query: "Không có kết quả" })).toEqual(ORIGIN_SEARCH_FIXTURES.noResults);
    expect(empty.store.write).toHaveBeenCalledWith(expect.any(String), []);
    const busy = fixture(); vi.mocked(busy.store.read).mockResolvedValue([{ label: "leak", latitude: 20, longitude: 102, source: "NOMINATIM", confirmed: false }]);
    vi.mocked(busy.store.claim).mockResolvedValue(null);
    expect(await busy.search({ query: "Hà Nội" })).toEqual(ORIGIN_SEARCH_FIXTURES.busy);
    expect(busy.fetcher).not.toHaveBeenCalled();
  });
  it("rejects a delayed admission response rather than starting outside its committed window", async () => {
    const test = fixture(); let clock = 0;
    vi.mocked(test.store.claim).mockImplementation(async () => { clock = 3001; return { databaseNow: new Date(0), expiresAt: new Date(3000) }; });
    expect(await createOriginSearchService({ store: test.store, config: () => config, fetcher: test.fetcher, now: () => clock })({ query: "Hà Nội" })).toEqual(ORIGIN_SEARCH_FIXTURES.unavailable);
    expect(test.fetcher).not.toHaveBeenCalled();
  });
  it("bounds a stalled database without contacting the public provider", async () => {
    vi.useFakeTimers(); const test = fixture();
    vi.mocked(test.store.read).mockImplementation(() => new Promise(() => undefined));
    const pending = test.search({ query: "Hà Nội" });
    await vi.advanceTimersByTimeAsync(1501);
    expect(await pending).toEqual(ORIGIN_SEARCH_FIXTURES.unavailable);
    expect(test.fetcher).not.toHaveBeenCalled(); expect(test.store.claim).not.toHaveBeenCalled();
  });
  it("bounds noncooperative provider timeout, aborts once and never retries or caches failure", async () => {
    vi.useFakeTimers(); const test = fixture();
    test.fetcher.mockImplementation(() => new Promise(() => undefined));
    const pending = test.search({ query: "Hà Nội" });
    await vi.advanceTimersByTimeAsync(3001);
    expect(await pending).toEqual(ORIGIN_SEARCH_FIXTURES.unavailable);
    expect(test.fetcher).toHaveBeenCalledOnce();
    expect(test.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(test.store.write).not.toHaveBeenCalled();
  });
  it("cancels a caller-aborted request without releasing/retrying the reserved admission", async () => {
    const test = fixture();
    test.fetcher.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const pending = test.search({ query: "Hà Nội" }, controller.signal);
    await vi.waitFor(() => expect(test.fetcher).toHaveBeenCalledOnce());
    controller.abort();
    expect(await pending).toEqual(ORIGIN_SEARCH_FIXTURES.unavailable);
    expect(test.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(test.store.claim).toHaveBeenCalledOnce(); expect(test.store.write).not.toHaveBeenCalled();
  });
  it("rejects oversized/malformed/provider errors without leaking their content", async () => {
    for (const response of [new Response("x".repeat(65 * 1024)), new Response("provider-secret", { status: 503 }), Response.json({ error: "provider-secret" }), Response.json([{ display_name: "bad", lat: "NaN", lon: "105" }])]) {
      const result = await searchNominatim("Hà Nội", config, new AbortController().signal, async () => response);
      expect(result === null || Array.isArray(result) && result.length === 0).toBe(true);
    }
    const test = fixture(); test.fetcher.mockRejectedValue(new Error("provider-secret"));
    expect(await test.search({ query: "Hà Nội" })).toEqual(ORIGIN_SEARCH_FIXTURES.unavailable);
  });
});

describe("explicit search HTTP", () => {
  it("authenticates before reading the body or invoking search", async () => {
    const search = vi.fn(); const req = request();
    const response = await originSearchResponse(req, { authorization: authorization(null), search });
    expect(response.status).toBe(401); expect(req.bodyUsed).toBe(false); expect(search).not.toHaveBeenCalled();
  });
  it.each(["TRAVELER", "ADMIN"])("allows %s, returns attribution and never auto-confirms a selection", async role => {
    const response = await originSearchResponse(request(), { authorization: authorization(role), search: async () => ORIGIN_SEARCH_FIXTURES.results });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ data: { revision: "origin-search-v1", attribution: { license: "ODbL-1.0" }, results: [{ confirmed: false }] } });
  });
  it("maps no result, busy and unavailable distinctly without raw exceptions", async () => {
    const noResult = await originSearchResponse(request(), { authorization: authorization(), search: async () => ORIGIN_SEARCH_FIXTURES.noResults });
    expect(await noResult.json()).toMatchObject({ data: { status: "NO_RESULTS", results: [] } });
    const busy = await originSearchResponse(request(), { authorization: authorization(), search: async () => ORIGIN_SEARCH_FIXTURES.busy });
    expect(busy.status).toBe(429); expect(busy.headers.get("Retry-After")).toBe("4");
    const response = await originSearchResponse(request(), { authorization: authorization(), search: async () => { throw new Error("private-query/provider-secret"); } });
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("provider-secret");
  });
  it("rejects invalid origin and private/extra/oversized payloads before calling search", async () => {
    const search = vi.fn(); const deps = { authorization: authorization(), search };
    expect((await originSearchResponse(request({}, { origin: "https://other.test" }), deps)).status).toBe(403);
    for (const payload of [{ query: "someone@example.test" }, { query: "Hà Nội", note: "private" }]) expect((await originSearchResponse(request(payload), deps)).status).toBe(400);
    expect((await originSearchResponse(request({ query: "x".repeat(3000) }), deps)).status).toBe(413);
    expect(search).not.toHaveBeenCalled();
  });
});
