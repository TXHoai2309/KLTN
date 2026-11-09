import "server-only";

import {
  assertStrictModelJsonSchema,
  modelOutputJsonSchema,
} from "./preference-extraction-contract";
import {
  PreferenceExtractionError,
  type PreferenceExtractionErrorCode,
} from "./preference-extraction-errors";
import type {
  StructuredLlmClient,
  StructuredLlmCompletionInput,
} from "./preference-extraction-client";

export const PREFERENCE_OPENAI_LIMITS = {
  requestTimeoutMs: 15_000,
  maxOutputTokens: 1_200,
  maxResponseBytes: 256 * 1024,
  maxRetryDelayMs: 5_000,
  maxRetries: 1,
} as const;

export type OpenAiStructuredClientOptions = {
  apiKey?: () => string | undefined;
  model?: () => string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxResponseBytes?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

type OpenAiResponsePayload = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      refusal?: unknown;
    };
  }>;
};

function retryAfterMs(
  value: string | null,
  now: number,
  maximum: number,
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{1,6}$/u.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, maximum);
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(0, parsed - now), maximum);
}

async function readBounded(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);

  const onAbort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", onAbort, { once: true });
  const cancelled = new Promise<never>((_resolve, reject) => {
    const rejectCancelled = () => reject(new Error("provider request cancelled"));
    signal.addEventListener("abort", rejectCancelled, { once: true });
    if (signal.aborted) rejectCancelled();
  });

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), cancelled]);
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* An aborted read still owns the lock briefly. */ }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function waitForRetry(
  delayMs: number,
  remainingMs: number,
  signal: AbortSignal | undefined,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  if (signal?.aborted) throw new PreferenceExtractionError("CANCELLED", false);
  if (remainingMs <= 0) throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
  if (delayMs <= 0) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new PreferenceExtractionError("CANCELLED", false)));
    const timer = setTimeout(
      () => finish(() => reject(new PreferenceExtractionError("PROVIDER_TIMEOUT", true))),
      remainingMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => sleep(delayMs))
      .then(
        () => finish(resolve),
        () => finish(() => reject(new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true))),
      );
  });
}

function parseCompletion(responseText: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }

  if (!payload || typeof payload !== "object") {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }
  const completion = payload as OpenAiResponsePayload;
  const choice = completion.choices?.[0];
  if (!choice || !choice.message) {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }

  if (typeof choice.message.refusal === "string" && choice.message.refusal.length > 0) {
    throw new PreferenceExtractionError("PROVIDER_REFUSAL", false);
  }
  if (typeof choice.finish_reason !== "string") {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }
  if (choice.finish_reason !== "stop") {
    throw new PreferenceExtractionError("PROVIDER_REFUSAL", false);
  }
  if (typeof choice.message.content !== "string" || choice.message.content.length === 0) {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }
  return choice.message.content;
}

function isRetryableTransportError(error: PreferenceExtractionError): boolean {
  return error.code === "PROVIDER_UNAVAILABLE" || error.code === "PROVIDER_RATE_LIMITED";
}

function safeProviderErrorCode(error: unknown): PreferenceExtractionErrorCode {
  return error instanceof PreferenceExtractionError
    ? error.code
    : "PROVIDER_UNAVAILABLE";
}

function validateNumberOption(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

export function createOpenAiStructuredClient(
  options: OpenAiStructuredClientOptions = {},
): StructuredLlmClient {
  const getKey = options.apiKey ?? (() => process.env.OPENAI_API_KEY);
  const getModel = options.model ?? (() => process.env.OPENAI_PREFERENCE_MODEL);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? PREFERENCE_OPENAI_LIMITS.requestTimeoutMs;
  const maxOutputTokens = options.maxOutputTokens ?? PREFERENCE_OPENAI_LIMITS.maxOutputTokens;
  const maxResponseBytes = options.maxResponseBytes ?? PREFERENCE_OPENAI_LIMITS.maxResponseBytes;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => Date.now());

  if (!validateNumberOption(timeoutMs, 1, PREFERENCE_OPENAI_LIMITS.requestTimeoutMs)) {
    throw new PreferenceExtractionError("PROVIDER_REJECTED", false);
  }
  if (!validateNumberOption(maxOutputTokens, 1, PREFERENCE_OPENAI_LIMITS.maxOutputTokens)) {
    throw new PreferenceExtractionError("PROVIDER_REJECTED", false);
  }
  if (!validateNumberOption(maxResponseBytes, 1, PREFERENCE_OPENAI_LIMITS.maxResponseBytes)) {
    throw new PreferenceExtractionError("PROVIDER_REJECTED", false);
  }

  return {
    async complete(input: StructuredLlmCompletionInput) {
      let key: string | undefined;
      let model: string | undefined;
      try {
        key = getKey();
      } catch {
        throw new PreferenceExtractionError("CREDENTIALS_UNAVAILABLE", false);
      }
      try {
        model = getModel();
      } catch {
        throw new PreferenceExtractionError("MODEL_UNAVAILABLE", false);
      }
      if (!key?.trim()) throw new PreferenceExtractionError("CREDENTIALS_UNAVAILABLE", false);
      if (!model?.trim()) throw new PreferenceExtractionError("MODEL_UNAVAILABLE", false);

      try {
        assertStrictModelJsonSchema(input.jsonSchema);
      } catch {
        throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
      }
      if (input.signal?.aborted) throw new PreferenceExtractionError("CANCELLED", false);

      const deadlineAt = Date.now() + timeoutMs;
      let attempt = 0;
      while (true) {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
        const controller = new AbortController();
        let timedOut = false;
        const onAbort = () => controller.abort();
        input.signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, remainingMs);

        try {
          let response: Response;
          try {
            response = await fetcher("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
              },
              redirect: "error",
              signal: controller.signal,
              body: JSON.stringify({
                model,
                // GPT-6 Luna defaults to reasoning, where temperature is unsupported.
                // Use its documented non-reasoning mode for bounded extraction.
                ...(/^gpt-6-luna(?:-|$)/u.test(model) ? { reasoning_effort: "none" } : {}),
                messages: [
                  { role: "system", content: input.system },
                  { role: "user", content: input.user },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "trip_preference_extraction",
                    strict: true,
                    schema: input.jsonSchema,
                  },
                },
                temperature: 0,
                max_completion_tokens: maxOutputTokens,
                store: false,
              }),
            });
          } catch {
            if (input.signal?.aborted) throw new PreferenceExtractionError("CANCELLED", false);
            if (timedOut) throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
            throw new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true);
          }

          if (timedOut) throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
          if (!response.ok) {
            const delay = retryAfterMs(
              response.headers.get("retry-after"),
              now(),
              PREFERENCE_OPENAI_LIMITS.maxRetryDelayMs,
            );
            await response.body?.cancel().catch(() => undefined);
            if (response.status === 429) {
              throw new PreferenceExtractionError("PROVIDER_RATE_LIMITED", true, {
                retryAfterMs: delay,
                providerStatus: response.status,
              });
            }
            if (response.status === 408 || response.status >= 500) {
              throw new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true, {
                retryAfterMs: delay,
                providerStatus: response.status,
              });
            }
            throw new PreferenceExtractionError("PROVIDER_REJECTED", false, {
              providerStatus: response.status,
            });
          }

          let responseText: string;
          try {
            responseText = await readBounded(response, maxResponseBytes, controller.signal);
          } catch (error) {
            if (error instanceof PreferenceExtractionError) throw error;
            if (input.signal?.aborted) throw new PreferenceExtractionError("CANCELLED", false);
            if (timedOut) throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
            throw new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true);
          }
          if (input.signal?.aborted) throw new PreferenceExtractionError("CANCELLED", false);
          if (timedOut || controller.signal.aborted) {
            throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true);
          }
          return { rawText: parseCompletion(responseText), model };
        } catch (error) {
          const normalized =
            error instanceof PreferenceExtractionError
              ? error
              : new PreferenceExtractionError(safeProviderErrorCode(error), true);
          if (
            attempt < PREFERENCE_OPENAI_LIMITS.maxRetries &&
            isRetryableTransportError(normalized)
          ) {
            attempt += 1;
            await waitForRetry(
              normalized.retryAfterMs ?? 0,
              deadlineAt - Date.now(),
              input.signal,
              sleep,
            );
            continue;
          }
          throw normalized;
        } finally {
          clearTimeout(timer);
          input.signal?.removeEventListener("abort", onAbort);
        }
      }
    },
  };
}

export const createOpenAIStructuredClient = createOpenAiStructuredClient;

export type { StructuredLlmClient } from "./preference-extraction-client";
