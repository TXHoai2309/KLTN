import { streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { resolveTripsageChatModel, tripsageProviderOptions } from "./tripsage-chat-provider";

const KEY = "sk-test-key-do-not-leak";

/** Runs one real SDK call against a fake fetcher and returns the single request the SDK built. */
async function sentRequest(modelId: string) {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: "rejected on purpose" } }), { status: 400 }));
  const model = await resolveTripsageChatModel({ apiKey: () => KEY, model: modelId, fetcher: fetcher as unknown as typeof fetch });
  const result = streamText({ model, prompt: "hi", maxRetries: 0, providerOptions: tripsageProviderOptions(model), onError: () => {} });
  await result.consumeStream({ onError: () => {} });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  return { url: String(url), body: JSON.parse(init.body as string) as Record<string, unknown> };
}

describe("OpenAI request shape used by the planning chat", () => {
  it("talks to the Responses API: gpt-6 models reject function tools on chat completions", async () => {
    const { url, body } = await sentRequest("gpt-6.1-sol");
    expect(url).toMatch(/\/responses$/);
    expect(body).toHaveProperty("input");
    expect(body).not.toHaveProperty("messages");
  });

  it("never stores the exchange, sets no output cap, reasons at medium effort, and returns encrypted reasoning so multi-step tool loops work without stored items", async () => {
    const { body } = await sentRequest("gpt-6.1-sol");
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(body.reasoning).toMatchObject({ effort: "medium" });
    expect(body.include).toContain("reasoning.encrypted_content");
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("does not force reasoning behaviour onto a non-reasoning model id", async () => {
    const { body } = await sentRequest("gpt-4o-mini");
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty("reasoning");
    expect(JSON.stringify(body.include ?? [])).not.toContain("reasoning.encrypted_content");
  });
});
