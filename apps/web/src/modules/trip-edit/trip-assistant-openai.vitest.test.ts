import { describe, expect, it, vi } from "vitest";

import {
  createTripAssistantFetch,
  createTripAssistantStructuredClient,
  resolveTripAssistantModel,
  TRIP_ASSISTANT_MODEL,
  TRIP_ASSISTANT_PROVIDER_OPTIONS,
} from "./trip-assistant-openai";

const apiKey = () => "fixture-only-key";

function jsonFetcher(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

function sentBody(fetcher: ReturnType<typeof jsonFetcher>) {
  const [url, init] = fetcher.mock.calls[0]!;
  return { url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
}

describe("Saved-trip assistant OpenAI clients", () => {
  it("resolves the AI SDK OpenAI Responses model on Terra without token caps", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    const model = await resolveTripAssistantModel({ apiKey, fetcher });

    expect(model).toMatchObject({
      modelId: TRIP_ASSISTANT_MODEL,
      provider: "openai.responses",
    });
    expect(TRIP_ASSISTANT_PROVIDER_OPTIONS.openai).toMatchObject({
      forceReasoning: true,
      reasoningEffort: "medium",
      store: false,
    });

    const wrapped = createTripAssistantFetch(fetcher, 5_000);
    await wrapped("https://api.openai.com/v1/responses", {
      method: "POST",
      body: JSON.stringify({ model: TRIP_ASSISTANT_MODEL }),
    });
    const [, init] = fetcher.mock.calls[0]!;
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeDefined();
    expect(String(init?.body)).not.toContain("max_completion_tokens");
    expect(String(init?.body)).not.toContain("max_output_tokens");
  });

  it("refuses to resolve the AI SDK model without a server-side key", async () => {
    const fetcher = jsonFetcher({});
    await expect(resolveTripAssistantModel({ apiKey: () => undefined, fetcher })).rejects.toMatchObject({
      code: "CREDENTIALS_UNAVAILABLE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses Terra with medium reasoning for structured Chat Completions and returns the JSON text", async () => {
    const fetcher = jsonFetcher({ choices: [{ finish_reason: "stop", message: { content: "{\"advice\":\"ok\"}" } }] });
    const client = createTripAssistantStructuredClient({ apiKey, fetcher });

    const completion = await client.complete({ system: "s", user: "u", jsonSchema: { type: "object" } });

    expect(completion).toEqual({ rawText: "{\"advice\":\"ok\"}", model: TRIP_ASSISTANT_MODEL });
    const { url, body } = sentBody(fetcher);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(body).toMatchObject({ model: "gpt-6.1-terra", reasoning_effort: "medium", store: false });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_completion_tokens");
  });

  it.each([
    ["a truncated completion", jsonFetcher({ choices: [{ finish_reason: "length", message: { content: "{" } }] }), "INVALID_PROVIDER_RESPONSE"],
    ["a refusal", jsonFetcher({ choices: [{ finish_reason: "stop", message: { content: "", refusal: "no" } }] }), "PROVIDER_REFUSAL"],
    ["rate limiting", jsonFetcher({}, 429), "PROVIDER_RATE_LIMITED"],
    ["an upstream outage", jsonFetcher({}, 503), "PROVIDER_UNAVAILABLE"],
  ])("maps %s to a typed provider error", async (_label, fetcher, code) => {
    const client = createTripAssistantStructuredClient({ apiKey, fetcher });
    await expect(client.complete({ system: "s", user: "u", jsonSchema: {} })).rejects.toMatchObject({ code });
  });
});
