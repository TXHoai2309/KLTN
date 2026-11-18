import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ key: "fixture-private-key" }));
vi.mock("./runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: fixture.key }) }));

import { availableConfigurableChatModels, preferenceRequestParameters, qaRequestParameters, editorialReasoningEffort } from "./openai-model-catalog";

afterEach(() => { fixture.key = "fixture-private-key"; });
afterAll(() => { vi.doUnmock("./runtime-config-service"); vi.resetModules(); });

describe("OpenAI CMS model choices", () => {
  it("shows only reviewed structured-output models visible to the current API key", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [
      { id: "gpt-6.1-terra" }, { id: "text-embedding-3-small" }, { id: "gpt-6-luna" }, { id: "gpt-6-astra" },
    ] }));
    const result = await availableConfigurableChatModels(fetcher);
    expect(result).toEqual(["gpt-6-luna", "gpt-6.1-terra"]);
    expect(JSON.stringify(result)).not.toContain(fixture.key);
    expect(fetcher).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({
      headers: { authorization: `Bearer ${fixture.key}` }, cache: "no-store", redirect: "error",
    }));
  });

  it("returns no choices without a key and safely reports provider failure", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }));
    fixture.key = "";
    expect(await availableConfigurableChatModels(fetcher)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    fixture.key = "fixture-private-key";
    await expect(availableConfigurableChatModels(fetcher)).rejects.toMatchObject({ code: "OPENAI_MODELS_UNAVAILABLE", status: 503 });
  });

  it("uses compatible parameters for non-reasoning and Sol models", () => {
    expect(preferenceRequestParameters("gpt-6.1-terra", 1200)).toEqual({ reasoning_effort: "none", temperature: 0, max_completion_tokens: 1200 });
    expect(preferenceRequestParameters("gpt-6.1-sol", 1200)).toEqual({ reasoning_effort: "low", max_completion_tokens: 4000 });
    expect(qaRequestParameters("gpt-6.1-terra", 600)).toEqual({ reasoning_effort: "medium", max_completion_tokens: 8000 });
    expect(editorialReasoningEffort("gpt-6-sol")).toBe("high");
  });
});
