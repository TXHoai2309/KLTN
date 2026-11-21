import { describe, expect, it, vi } from "vitest";

import {
  createTripAssistantResponsesClient,
  createTripAssistantStructuredClient,
  TRIP_ASSISTANT_MODEL,
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
  it("calls the Responses API statelessly with Terra, medium reasoning, strict tools and a strict final format", async () => {
    const fetcher = jsonFetcher({ status: "completed", output: [] });
    const client = createTripAssistantResponsesClient({ apiKey, fetcher });
    const tool = { type: "function" as const, name: "get_weather", description: "d", strict: true as const, parameters: { type: "object", additionalProperties: false, required: [], properties: {} } };

    const result = await client.create({ instructions: "sys", input: [{ role: "user", content: "hi" }], tools: [tool], textFormat: { name: "final", schema: { type: "object" } } });

    expect(result).toEqual({ status: "completed", output: [] });
    const { url, body } = sentBody(fetcher);
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({
      model: "gpt-6.1-terra",
      reasoning: { effort: "medium" },
      store: false,
      include: ["reasoning.encrypted_content"],
      instructions: "sys",
      tools: [tool],
      text: { format: { type: "json_schema", name: "final", strict: true, schema: { type: "object" } } },
    });
    expect(JSON.stringify(body)).not.toContain("fixture-only-key");
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

  it("refuses to call OpenAI without a server-side key", async () => {
    const fetcher = jsonFetcher({});
    const client = createTripAssistantResponsesClient({ apiKey: () => undefined, fetcher });
    await expect(client.create({ instructions: "", input: [], tools: [], textFormat: { name: "f", schema: {} } }))
      .rejects.toMatchObject({ code: "CREDENTIALS_UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a malformed Responses envelope", async () => {
    const client = createTripAssistantResponsesClient({ apiKey, fetcher: jsonFetcher({ status: "completed" }) });
    await expect(client.create({ instructions: "", input: [], tools: [], textFormat: { name: "f", schema: {} } }))
      .rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
});
