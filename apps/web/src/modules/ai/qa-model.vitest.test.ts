import { describe, expect, it, vi } from "vitest";
import { createQaJsonProvider } from "./qa-json-provider";
import { createQaDiagnostics, type QaDiagnosticEvent } from "./qa-diagnostics";
import { effectiveConfig } from "../runtime-config/runtime-config-service";

vi.mock("server-only", () => ({}));
vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: vi.fn() }));

const request = {
  name: "qa_model_probe", messages: [{ role: "user" as const, content: "Fixture" }],
  schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
};
const response = (model = "gpt-6.1-sol") => Response.json({ model,
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
  usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 },
});

describe("owner-selected QA Sol provider", () => {
  it("uses the current QA model saved in runtime configuration for live requests", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const configured = vi.mocked(effectiveConfig);
    configured.mockResolvedValueOnce({ apiKey: "fixture-only", qaModel: "gpt-6-luna" });
    configured.mockResolvedValueOnce({ apiKey: "fixture-only", qaModel: "gpt-6.1-terra" });
    const provider = createQaJsonProvider({ fetcher });

    await provider.request(request, value => value);
    await provider.request(request, value => value);

    expect(configured).toHaveBeenCalledTimes(2);
    expect(configured).toHaveBeenNthCalledWith(1, "OPENAI");
    expect(configured).toHaveBeenNthCalledWith(2, "OPENAI");
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model)).toEqual(["gpt-6-luna", "gpt-6.1-terra"]);
  });
  it("sends compatible Sol 6.1 reasoning parameters without temperature", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response("gpt-6.1-sol"));
    await createQaJsonProvider({ model: "gpt-6.1-sol", apiKey: () => "fixture-only", fetcher }).request(request, value => value);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "medium", store: false, response_format: { type: "json_schema" } });
    expect(body).not.toHaveProperty("temperature");
  });
  it.each([
    ["gpt-6-luna", "high"],
    ["gpt-6.1-terra", "medium"],
    ["gpt-6-sol", "medium"],
  ])("uses selected QA model %s with compatible reasoning", async (model, effort) => {
    const fetcher = vi.fn<typeof fetch>(async () => response(model));
    await createQaJsonProvider({ model, apiKey: () => "fixture-only", fetcher }).request(request, value => value);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model, reasoning_effort: effort, max_completion_tokens: 8000, response_format: { type: "json_schema" } });
    expect(body).not.toHaveProperty("temperature");
  });

  it("counts dynamic structured-output schema text in the existing input budget", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    await expect(createQaJsonProvider({ apiKey: () => "fixture-only", fetcher }).request({ ...request, schema: { type: "string", enum: ["bounded ".repeat(6000)] } }, value => value)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("measures each provider call separately from cumulative request time", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(500);
    const events: QaDiagnosticEvent[] = [];
    let calls = 0;
    try {
      const provider = createQaJsonProvider({ apiKey: () => "fixture-only", fetcher: async () => {
        clock.mockReturnValue(++calls === 1 ? 700 : 1100);
        return response();
      } });
      await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
        await provider.request(request, value => value);
        await provider.request(request, value => value);
      });
      expect(events).toContainEqual(expect.objectContaining({ elapsedMs: 200, providerElapsedMs: 200, actualModel: "gpt-6.1-sol" }));
      expect(events).toContainEqual(expect.objectContaining({ elapsedMs: 600, providerElapsedMs: 400, actualModel: "gpt-6.1-sol" }));
      expect(JSON.stringify(events)).not.toContain("fixture-only");
    } finally { clock.mockRestore(); }
  });
  it("uses Sol with medium-reasoning structured output and records requested and actual model separately", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response("gpt-6.1-sol-2026-10-01"));
    const events: QaDiagnosticEvent[] = [];
    await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
      expect(await createQaJsonProvider({ apiKey: () => "fixture-only", fetcher }).request(request, value => value)).toEqual({ ok: true });
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "medium", store: false, response_format: { type: "json_schema" } });
    expect(events).toContainEqual(expect.objectContaining({ requestedModel: "gpt-6.1-sol", actualModel: "gpt-6.1-sol-2026-10-01", totalTokens: 35 }));
    expect(JSON.stringify(events)).not.toContain("fixture-only");
  });

  it("reports an actual-model mismatch truthfully without relabelling it as Sol", async () => {
    const events: QaDiagnosticEvent[] = [];
    await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
      await createQaJsonProvider({ apiKey: () => "fixture-only", fetcher: async () => response("gpt-4o-mini") }).request(request, value => value);
    });
    expect(events).toContainEqual(expect.objectContaining({ requestedModel: "gpt-6.1-sol", actualModel: "gpt-4o-mini" }));
  });

  it("does not silently fall back to a different model when Sol is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("fixture", { status: 503 }));
    await expect(createQaJsonProvider({ apiKey: () => "fixture-only", fetcher }).request(request, value => value)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).model).toBe("gpt-6.1-sol");
  });

  it("preserves explicit legacy-model injection without sending Sol-only reasoning parameters", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response("gpt-4o-mini"));
    await createQaJsonProvider({ model: "gpt-4o-mini", apiKey: () => "fixture-only", fetcher }).request(request, value => value);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("gpt-4o-mini");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});
