import { describe, expect, it, vi } from "vitest";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import { createFirecrawlWeb } from "./tripsage-web";

const EMPTY_PLANNING = {
  candidates: async () => [],
  routes: {
    route: async () => ({
      fromDestinationId: "",
      toDestinationId: "",
      status: "INSUFFICIENT_DATA" as const,
      reason: "NOT_CONFIGURED" as const,
      durationSeconds: null,
      distanceMeters: null,
      provider: null,
    }),
  },
  now: () => new Date("2026-11-23T05:00:00Z"),
};

describe("Point 6 — hide web/infra errors from travelers and log safe Firecrawl reasons", () => {
  it("instructs persona never to say 'tra web', 'tra cứu web', or 'không khả dụng' to travelers", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("mình chưa có thông tin cập nhật");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("nhà xe hoặc đơn vị vận hành");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/KHÔNG nói chuyện hạ tầng/iu);
  });

  it("webSearch unavailable tool output gives natural guidance instead of exposing web-lookup failure", async () => {
    const tools = createTripsageChatTools({
      planning: EMPTY_PLANNING,
      emitItinerary: () => {},
      web: {
        search: async () => ({ status: "UNAVAILABLE" }),
        scrape: async () => ({ status: "UNAVAILABLE" }),
      },
    });

    const out = await tools.webSearch.execute!(
      { query: "giá vé xe khách Hải Phòng Hà Giang" },
      { toolCallId: "w1", messages: [] },
    ) as { ok: boolean; code: string; message: string };

    expect(out.ok).toBe(false);
    expect(out.code).toBe("WEB_UNAVAILABLE");
    expect(out.message).toContain("chưa có thông tin cập nhật");
    expect(out.message).toContain("nhà xe hoặc đơn vị vận hành");
    expect(out.message).not.toContain("Dịch vụ tra cứu web chưa sẵn sàng");
  });

  it("logs safe reason codes (missing_key, http_402) without leaking API key or URL, and tolerates one oversized web hit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "fc-super-secret-do-not-print";
    try {
      const noKey = createFirecrawlWeb({ apiKey: () => "" });
      expect(await noKey.search("test")).toEqual({ status: "UNAVAILABLE" });
      expect(warn).toHaveBeenCalledWith("[tripsage-web] unavailable", "missing_key");

      warn.mockClear();
      const outOfCredits = createFirecrawlWeb({
        apiKey: () => secret,
        fetcher: (async () => new Response(`payment required ${secret}`, { status: 402 })) as typeof fetch,
      });
      expect(await outOfCredits.search("test")).toEqual({ status: "UNAVAILABLE" });
      expect(warn).toHaveBeenCalledWith("[tripsage-web] unavailable", "http_402");
      expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);

      const mixed = createFirecrawlWeb({
        apiKey: () => secret,
        fetcher: (async () =>
          new Response(
            JSON.stringify({
              success: true,
              data: {
                web: [
                  { url: "https://valid.example.vn/ha-giang", title: "Valid", description: "Good snippet" },
                  { url: 12345, title: null, description: "x".repeat(8000) },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )) as typeof fetch,
      });
      const res = await mixed.search("ha giang");
      expect(res.status).toBe("RESULTS");
      if (res.status === "RESULTS") {
        expect(res.results).toHaveLength(1);
        expect(res.results[0]!.url).toBe("https://valid.example.vn/ha-giang");
      }
    } finally {
      warn.mockRestore();
    }
  });
});
