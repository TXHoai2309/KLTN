import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { internal } from "varlock";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createOpenAiStructuredClient } from "./openai-structured-client";
import { modelOutputJsonSchema } from "./preference-extraction-contract";

it("injects configured OpenAI credentials and model into the server provider runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kltn-preference-env-"));
  try {
    // Use the real schema with synthetic values; never load developer .env files.
    const schema = await readFile(new URL("../../../.env.schema", import.meta.url), "utf8");
    await writeFile(join(directory, ".env.schema"), schema);
    await writeFile(join(directory, ".env"), [
      "BETTER_AUTH_SECRET=synthetic-test-secret-with-32-characters",
      "BETTER_AUTH_URL=http://localhost:3010",
      "DATABASE_URL=postgresql://test:test@localhost/test",
      "OPENAI_API_KEY=synthetic-openai-key",
      "OPENAI_PREFERENCE_MODEL=synthetic-model",
      "OPENAI_EDITORIAL_MODEL=synthetic-model",
    ].join("\n"));

    const graph = await internal.loadEnvGraph({
      basePath: directory,
      overrideValues: {},
      processEnvOverride: {},
      checkGitIgnored: false,
      skipCache: true,
    });
    await graph.resolveEnvValues();
    const runtime = graph.getResolvedEnvStringObject();
    expect(runtime.OPENAI_API_KEY).toBe("synthetic-openai-key");
    expect(runtime.OPENAI_PREFERENCE_MODEL).toBe("synthetic-model");
    const config = graph.getSerializedGraph().config;
    expect(config.OPENAI_API_KEY?.isSensitive).toBe(true);
    // Both configured model names may equal result.meta.model without being secrets.
    expect(config.OPENAI_PREFERENCE_MODEL?.isSensitive).toBe(false);
    expect(config.OPENAI_EDITORIAL_MODEL?.isSensitive).toBe(false);

    vi.stubEnv("OPENAI_API_KEY", runtime.OPENAI_API_KEY);
    vi.stubEnv("OPENAI_PREFERENCE_MODEL", runtime.OPENAI_PREFERENCE_MODEL);
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "synthetic-model" });
      expect(init?.headers).toMatchObject({ authorization: "Bearer synthetic-openai-key" });
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "{}" } }],
      }));
    });
    await expect(createOpenAiStructuredClient({ fetcher }).complete({
      system: "synthetic system",
      user: "synthetic input",
      jsonSchema: modelOutputJsonSchema,
    })).resolves.toEqual({ rawText: "{}", model: "synthetic-model" });
    expect(fetcher).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllEnvs();
    // Only remove the temporary directory allocated by this test.
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error("Unexpected temp path");
    await rm(directory, { recursive: true, force: true });
  }
});
