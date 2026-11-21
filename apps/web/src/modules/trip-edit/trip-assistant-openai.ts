import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import type {
  StructuredLlmClient,
  StructuredLlmCompletionInput,
} from "../preference-extraction/preference-extraction-client";

/** Owner-selected model for every Saved-trip assistant call (2026-11-20). */
export const TRIP_ASSISTANT_MODEL = "gpt-6.1-terra";
/** Terra's default effort, matching the Q&A and planning assistants. */
export const TRIP_ASSISTANT_REASONING_EFFORT = "medium";

/**
 * Provider options for the AI SDK OpenAI Responses model (ADR-40).
 * `forceReasoning: true` is required because `@ai-sdk/openai` 4.0.14 only
 * auto-detects `o1`/`o3`/`o4-mini`/`gpt-5*` as reasoning models; without it
 * `reasoningEffort` and stateless `reasoning.encrypted_content` would be dropped
 * for `gpt-6.1-terra`. `reasoningSummary: null` keeps internal reasoning out of
 * responses per spec Out of Scope.
 */
export const TRIP_ASSISTANT_PROVIDER_OPTIONS = {
  openai: {
    forceReasoning: true,
    reasoningEffort: TRIP_ASSISTANT_REASONING_EFFORT,
    reasoningSummary: null,
    store: false,
  },
} as const;

// Owner chose no budget caps; these only stop a hung socket or a runaway body.
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type TripAssistantOpenAiOptions = {
  apiKey?: () => string | undefined | Promise<string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

async function resolveApiKey(options: TripAssistantOpenAiOptions): Promise<string> {
  let key: string | undefined;
  try {
    key = options.apiKey
      ? await options.apiKey()
      : (await import("../runtime-config/runtime-config-service")
          .then((module) => module.effectiveConfig("OPENAI")))
          .apiKey?.toString();
  } catch {
    throw new PreferenceExtractionError("CREDENTIALS_UNAVAILABLE", false);
  }
  if (!key?.trim()) throw new PreferenceExtractionError("CREDENTIALS_UNAVAILABLE", false);
  return key;
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  options: TripAssistantOpenAiOptions,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw new PreferenceExtractionError("CANCELLED", false);
  const key = await resolveApiKey(options);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await (options.fetcher ?? fetch)(url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      if (timedOut) throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
      if (signal?.aborted) throw new PreferenceExtractionError("CANCELLED", false);
      throw new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PreferenceExtractionError(
        response.status === 429 ? "PROVIDER_RATE_LIMITED" : response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED",
        response.status === 429 || response.status >= 500,
      );
    }
    let text: string;
    try {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
      }
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (error) {
      if (error instanceof PreferenceExtractionError) throw error;
      if (timedOut) throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
      throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Chat Completions structured-output client for the classifier, composer and
 * scenario helpers. Unlike the preference client it reasons (`medium`) and has
 * room for reasoning tokens, so `finish_reason` no longer stops at `length`.
 */
export function createTripAssistantStructuredClient(
  options: TripAssistantOpenAiOptions = {},
): StructuredLlmClient {
  return {
    async complete(input: StructuredLlmCompletionInput) {
      const payload = await postJson(
        "https://api.openai.com/v1/chat/completions",
        {
          model: TRIP_ASSISTANT_MODEL,
          reasoning_effort: TRIP_ASSISTANT_REASONING_EFFORT,
          store: false,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "trip_assistant_output", strict: true, schema: input.jsonSchema },
          },
        },
        options,
        input.signal,
      );
      const choice = (payload as { choices?: { finish_reason?: unknown; message?: { content?: unknown; refusal?: unknown } }[] })
        ?.choices?.[0];
      if (!choice?.message) throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
      if (typeof choice.message.refusal === "string" && choice.message.refusal.length > 0) {
        throw new PreferenceExtractionError("PROVIDER_REFUSAL", false);
      }
      if (choice.finish_reason !== "stop" || typeof choice.message.content !== "string" || !choice.message.content) {
        throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
      }
      return { rawText: choice.message.content, model: TRIP_ASSISTANT_MODEL };
    },
  };
}

/**
 * Socket-timeout and redirect-safe fetch wrapper for the AI SDK OpenAI Responses
 * model. Intentionally imposes no token or budget cap (owner choice, ADR-39/40)
 * and keeps responses streaming without buffering.
 */
export function createTripAssistantFetch(
  base: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return base(input, { ...init, signal, redirect: "error" });
  }) as typeof fetch;
}

/**
 * Resolves the AI SDK OpenAI Responses model (`gpt-6.1-terra`) on the server.
 * The API key is read via `effectiveConfig("OPENAI")` and never logged or sent
 * to the browser.
 */
export async function resolveTripAssistantModel(
  options: TripAssistantOpenAiOptions = {},
): Promise<LanguageModel> {
  const apiKey = await resolveApiKey(options);
  const wrappedFetch = createTripAssistantFetch(
    options.fetcher ?? fetch,
    options.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );
  return createOpenAI({ apiKey, fetch: wrappedFetch }).responses(TRIP_ASSISTANT_MODEL);
}
