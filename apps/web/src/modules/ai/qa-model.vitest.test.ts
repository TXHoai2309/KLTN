import { describe, expect, it, vi } from "vitest";
import { createQaJsonProvider } from "./qa-json-provider";
import { createQaDiagnostics, type QaDiagnosticEvent } from "./qa-diagnostics";

vi.mock("server-only", () => ({}));

const request = {
  name: "qa_model_probe", messages: [{ role: "user" as const, content: "Fixture" }],
  schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
};
const response = (model = "gpt-6-luna") => Response.json({ model,
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
  usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 },
});

describe("owner-selected QA Luna provider", () => {
  it("uses Luna with non-reasoning structured output and records requested and actual model separately", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response("gpt-6-luna-2026-10-01"));
    const events: QaDiagnosticEvent[] = [];
    await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
      expect(await createQaJsonProvider({ apiKey: () => "fixture-only", fetcher }).request(request, value => value)).toEqual({ ok: true });
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ model: "gpt-6-luna", reasoning_effort: "none", temperature: 0, store: false, response_format: { type: "json_schema" } });
    expect(events).toContainEqual(expect.objectContaining({ requestedModel: "gpt-6-luna", actualModel: "gpt-6-luna-2026-10-01", totalTokens: 35 }));
    expect(JSON.stringify(events)).not.toContain("fixture-only");
  });

  it("reports an actual-model mismatch truthfully without relabelling it as Luna", async () => {
    const events: QaDiagnosticEvent[] = [];
    await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
      await createQaJsonProvider({ apiKey: () => "fixture-only", fetcher: async () => response("gpt-4o-mini") }).request(request, value => value);
    });
    expect(events).toContainEqual(expect.objectContaining({ requestedModel: "gpt-6-luna", actualModel: "gpt-4o-mini" }));
  });

  it("does not silently fall back to a different model when Luna is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("fixture", { status: 503 }));
    await expect(createQaJsonProvider({ apiKey: () => "fixture-only", fetcher }).request(request, value => value)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).model).toBe("gpt-6-luna");
  });

  it("preserves explicit legacy-model injection without sending Luna-only reasoning parameters", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response("gpt-4o-mini"));
    await createQaJsonProvider({ model: "gpt-4o-mini", apiKey: () => "fixture-only", fetcher }).request(request, value => value);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("gpt-4o-mini");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});
