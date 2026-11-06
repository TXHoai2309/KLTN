import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchOriginNominatim } from "@/lib/trip-origin-search-client";
import { ORIGIN_SEARCH_FIXTURES } from "./origin-search-fixtures";

describe("searchOriginNominatim client transport (Ticket 02)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns search results and OSM attribution on successful search", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          revision: "origin-search-v1",
          status: "RESULTS",
          results: ORIGIN_SEARCH_FIXTURES.results.results,
          cached: false,
          attribution: {
            text: "© OpenStreetMap contributors",
            url: "https://www.openstreetmap.org/copyright",
            license: "ODbL-1.0",
          },
        },
      }),
    });

    const outcome = await searchOriginNominatim("Hà Nội");
    expect(outcome.status).toBe("RESULTS");
    if (outcome.status === "RESULTS") {
      expect(outcome.results.length).toBeGreaterThan(0);
      expect(outcome.results[0]!.source).toBe("NOMINATIM");
      expect(outcome.results[0]!.confirmed).toBe(false);
      expect(outcome.attribution.text).toContain("OpenStreetMap");
    }
  });

  it("rejects private or invalid query before making a network request", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    // Too short
    const shortOutcome = await searchOriginNominatim("a");
    expect(shortOutcome.status).toBe("INVALID_QUERY");

    // Email or private pattern
    const privateOutcome = await searchOriginNominatim("user@example.com");
    expect(privateOutcome.status).toBe("INVALID_QUERY");
    if (privateOutcome.status === "INVALID_QUERY") {
      expect(privateOutcome.message).toContain("công khai");
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles 429 BUSY with retryAfterSeconds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "4" }),
      json: async () => ({
        success: false,
        error: { code: "ORIGIN_SEARCH_BUSY", message: "Đang bận" },
      }),
    });

    const outcome = await searchOriginNominatim("Hà Giang");
    expect(outcome.status).toBe("BUSY");
    if (outcome.status === "BUSY") {
      expect(outcome.retryAfterSeconds).toBe(4);
      expect(outcome.message).toContain("4 giây");
    }
  });

  it("handles 503 UNAVAILABLE with fallback message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: async () => ({
        success: false,
        error: { code: "ORIGIN_SEARCH_UNAVAILABLE", message: "Dịch vụ tạm thời không khả dụng" },
      }),
    });

    const outcome = await searchOriginNominatim("TP Hà Giang");
    expect(outcome.status).toBe("UNAVAILABLE");
    if (outcome.status === "UNAVAILABLE") {
      expect(outcome.message).toContain("thủ công");
    }
  });

  it("does not repeat the manual fallback when the server already provides it", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "Chưa thể tìm nơi xuất phát. Bạn vẫn có thể chọn ghim hoặc nhập tọa độ." } }),
    });

    const outcome = await searchOriginNominatim("Hà Nội");
    expect(outcome.status).toBe("UNAVAILABLE");
    if (outcome.status === "UNAVAILABLE") {
      expect(outcome.message).toBe("Chưa thể tìm nơi xuất phát. Bạn vẫn có thể chọn ghim hoặc nhập tọa độ.");
    }
  });
});

