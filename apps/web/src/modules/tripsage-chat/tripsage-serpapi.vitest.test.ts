import { describe, expect, it, vi } from "vitest";
import { createSerpApiClient, createSerpApiKeyState, parseSerpApiKeys, SERPAPI_ENDPOINT } from "./tripsage-serpapi";

const KEY_1 = "serp-secret-key-one";
const KEY_2 = "serp-secret-key-two";
const KEY_3 = "serp-secret-key-three";

const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status });

describe("SerpApi shared client and key rotation", () => {
  it("parses comma-separated keys, trims whitespace, drops empties and deduplicates in order", () => {
    expect(parseSerpApiKeys(undefined)).toEqual([]);
    expect(parseSerpApiKeys(" , , ")).toEqual([]);
    expect(parseSerpApiKeys(` ${KEY_1} , , ${KEY_2}, ${KEY_1} ,${KEY_3} `)).toEqual([KEY_1, KEY_2, KEY_3]);
  });

  it("returns UNAVAILABLE without calling fetch when SERPAPI_API_KEYS is missing or blank", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const missing = createSerpApiClient({ apiKeys: () => undefined, fetcher });
    const blank = createSerpApiClient({ apiKeys: () => " ,  , ", fetcher });

    await expect(missing.search({ engine: "google_hotels", q: "Dong Van" })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(blank.search({ engine: "google_flights", departure_id: "DAD" })).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses keys sequentially (no round-robin) and keeps active key on success", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ properties: [] }));
    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher });

    const r1 = await client.search({ engine: "google_hotels", q: "Dong Van" });
    const r2 = await client.search({ engine: "google_hotels", q: "Meo Vac" });

    expect(r1).toEqual({ status: "OK", data: { properties: [] } });
    expect(r2).toEqual({ status: "OK", data: { properties: [] } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url1 = new URL(String(fetcher.mock.calls[0]![0]));
    const url2 = new URL(String(fetcher.mock.calls[1]![0]));
    expect(url1.origin + url1.pathname).toBe(SERPAPI_ENDPOINT);
    expect(url1.searchParams.get("api_key")).toBe(KEY_1);
    expect(url2.searchParams.get("api_key")).toBe(KEY_1);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
  });

  it("rotates from key 1 to key 2 on HTTP 429, succeeds on retry, and keeps key 2 for subsequent calls", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "Too many requests" }, 429))
      .mockResolvedValueOnce(jsonResponse({ best_flights: [{ price: 1500000 }] }, 200))
      .mockResolvedValueOnce(jsonResponse({ best_flights: [{ price: 1600000 }] }, 200));

    const state = createSerpApiKeyState();
    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher, state });

    const first = await client.search({ engine: "google_flights", departure_id: "DAD", arrival_id: "HAN" });
    expect(first).toEqual({ status: "OK", data: { best_flights: [{ price: 1500000 }] } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get("api_key")).toBe(KEY_1);
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get("api_key")).toBe(KEY_2);

    const second = await client.search({ engine: "google_flights", departure_id: "SGN", arrival_id: "HAN" });
    expect(second).toEqual({ status: "OK", data: { best_flights: [{ price: 1600000 }] } });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetcher.mock.calls[2]![0])).searchParams.get("api_key")).toBe(KEY_2);
  });

  it("rotates on 4xx quota exhaustion message from SerpApi", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "Your account has run out of searches." }, 403))
      .mockResolvedValueOnce(jsonResponse({ properties: [{ name: "Homestay A" }] }, 200));

    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher });
    const result = await client.search({ engine: "google_hotels", q: "homestay Dong Van" });

    expect(result).toEqual({ status: "OK", data: { properties: [{ name: "Homestay A" }] } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get("api_key")).toBe(KEY_1);
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get("api_key")).toBe(KEY_2);
  });

  it("returns UNAVAILABLE when all keys return 429 and stops retrying exhausted keys", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "Rate limit exceeded" }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: "Rate limit exceeded" }, 429));

    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher });

    await expect(client.search({ engine: "google_hotels", q: "Dong Van" })).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Subsequent call with the same exhausted key pool does not waste network calls
    await expect(client.search({ engine: "google_hotels", q: "Meo Vac" })).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does NOT rotate key on HTTP 500, broken JSON, or non-quota 401", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "Internal server error" }, 500))
      .mockResolvedValueOnce(new Response("{broken-json", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ error: "Invalid API key" }, 401))
      .mockResolvedValueOnce(jsonResponse({ properties: [] }, 200));

    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher });

    await expect(client.search({ engine: "google_hotels", q: "A" })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(client.search({ engine: "google_hotels", q: "B" })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(client.search({ engine: "google_hotels", q: "C" })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(client.search({ engine: "google_hotels", q: "D" })).resolves.toEqual({ status: "OK", data: { properties: [] } });

    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const call of fetcher.mock.calls) {
      expect(new URL(String(call[0])).searchParams.get("api_key")).toBe(KEY_1);
    }
  });

  it("returns UNAVAILABLE on timeout and aborts the fetch signal without rotating key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher, timeoutMs: 20 });

    const outcome = await client.search({ engine: "google_hotels", q: "Dong Van" });
    expect(outcome).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("returns UNAVAILABLE when response exceeds maxResponseBytes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ pad: "x".repeat(500) }), { status: 200 }));
    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher, maxResponseBytes: 128 });

    await expect(client.search({ engine: "google_hotels", q: "Dong Van" })).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns UNAVAILABLE if response echoes any configured API key", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ properties: [{ name: `Hotel ${KEY_1}` }] }))
      .mockResolvedValueOnce(jsonResponse({ properties: [{ name: `Hotel ${KEY_2}` }] }));
    const client = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher });

    await expect(client.search({ engine: "google_hotels", q: "Dong Van" })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(client.search({ engine: "google_hotels", q: "Meo Vac" })).resolves.toEqual({ status: "UNAVAILABLE" });
  });

  it("suppresses thrown fetch errors without leaking keys or logging URLs", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`failed ${SERPAPI_ENDPOINT}?api_key=${KEY_1}`));
      const client = createSerpApiClient({ apiKeys: () => KEY_1, fetcher });
      const outcome = await client.search({ engine: "google_hotels", q: "Dong Van" });
      expect(outcome).toEqual({ status: "UNAVAILABLE" });
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      // Only a fixed reason code is logged: no URL, key or error text.
      expect(warnSpy.mock.calls).toEqual([["[tripsage-serpapi] unavailable", "timeout-or-network-error"]]);
    } finally {
      consoleSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("shares key rotation state across separate clients using the same key state", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "quota exceeded" }, 429))
      .mockResolvedValueOnce(jsonResponse({ properties: [] }, 200))
      .mockResolvedValueOnce(jsonResponse({ best_flights: [] }, 200));

    const sharedState = createSerpApiKeyState();
    const hotelsClient = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher, state: sharedState });
    const flightsClient = createSerpApiClient({ apiKeys: () => `${KEY_1},${KEY_2}`, fetcher, state: sharedState });

    await expect(hotelsClient.search({ engine: "google_hotels", q: "Dong Van" })).resolves.toEqual({ status: "OK", data: { properties: [] } });
    await expect(flightsClient.search({ engine: "google_flights", departure_id: "DAD" })).resolves.toEqual({ status: "OK", data: { best_flights: [] } });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetcher.mock.calls[2]![0])).searchParams.get("api_key")).toBe(KEY_2);
  });
});
