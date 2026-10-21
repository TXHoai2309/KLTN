import { describe, expect, it, vi } from "vitest";
import { EditorialClientLoadError, loadEditorialState } from "./editorial-client-loader";

const state = {
  available: true,
  reason: null,
  context: {
    id: "destination-1",
    name: "Điểm đến mẫu",
    description: "Mô tả mẫu",
    category: "nature",
    area: "Hà Giang",
    latitude: 23.2,
    longitude: 105.4,
    suggestedDurationMinutes: null,
    openingDays: [],
    media: [],
    sources: [],
  },
  draft: null,
  published: null,
  previousPublished: null,
  draftRevision: 0,
  publishedRevision: 0,
  updatedAt: null,
  publishedAt: null,
  contentChanged: false,
  aiConfigured: false,
};

function fetchResult(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("loadEditorialState", () => {
  it("loads and validates the existing GET envelope and DTO", async () => {
    const fetcher = fetchResult(new Response(JSON.stringify({ success: true, data: state }), { status: 200 }));
    const result = await loadEditorialState("destination-1", new AbortController().signal, fetcher);

    expect(result.context.id).toBe("destination-1");
    expect(fetcher).toHaveBeenCalledWith("/api/admin/destinations/destination-1/editorial", expect.objectContaining({ cache: "no-store" }));
  });

  it("classifies network and timeout failures without exposing raw exception text", async () => {
    const networkFetcher = vi.fn(async () => { throw new Error("secret response and token"); }) as unknown as typeof fetch;
    await expect(loadEditorialState("destination-1", new AbortController().signal, networkFetcher)).rejects.toMatchObject({
      failure: { stage: "DATA_LOAD", code: "NETWORK_ERROR" },
      message: "Editorial data could not be loaded",
    });

    const timeout = Object.assign(new Error("secret timeout details"), { name: "TimeoutError" });
    const timeoutFetcher = vi.fn(async () => { throw timeout; }) as unknown as typeof fetch;
    await expect(loadEditorialState("destination-1", new AbortController().signal, timeoutFetcher)).rejects.toMatchObject({
      failure: { stage: "DATA_LOAD", code: "REQUEST_TIMEOUT" },
    });
  });

  it("returns specific safe categories for authorization and unavailable records", async () => {
    for (const [status, code] of [[401, "ADMIN_SESSION_EXPIRED"], [403, "ACCESS_DENIED"], [404, "NOT_FOUND"], [503, "HTTP_ERROR"]] as const) {
      const fetcher = fetchResult(new Response("not parsed on HTTP failure", { status }));
      await expect(loadEditorialState("destination-1", new AbortController().signal, fetcher)).rejects.toMatchObject({
        failure: { stage: "DATA_LOAD", code, status },
      });
    }
  });

  it("distinguishes malformed JSON, response envelopes and DTOs", async () => {
    const invalidJsonFetcher = fetchResult(new Response("{", { status: 200 }));
    await expect(loadEditorialState("destination-1", new AbortController().signal, invalidJsonFetcher)).rejects.toMatchObject({
      failure: { stage: "DATA_RESPONSE", code: "INVALID_JSON", status: 200 },
    } satisfies Partial<EditorialClientLoadError>);

    const invalidEnvelopeFetcher = fetchResult(new Response(JSON.stringify({ success: false, data: state }), { status: 200 }));
    await expect(loadEditorialState("destination-1", new AbortController().signal, invalidEnvelopeFetcher)).rejects.toMatchObject({
      failure: { stage: "DATA_RESPONSE", code: "INVALID_ENVELOPE" },
    });

    const invalidDtoFetcher = fetchResult(new Response(JSON.stringify({ success: true, data: { context: { description: "private" } } }), { status: 200 }));
    await expect(loadEditorialState("destination-1", new AbortController().signal, invalidDtoFetcher)).rejects.toMatchObject({
      failure: { stage: "DATA_RESPONSE", code: "INVALID_DTO", fieldPath: expect.any(String) },
    });
  });
});
