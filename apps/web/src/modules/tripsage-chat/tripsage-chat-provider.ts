import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { AppError } from "../../server/http/app-error";
import { QA_DEFAULT_MODEL } from "../ai/qa-json-provider";

/** Same bounds philosophy as the QA provider: one bounded upstream call, no stored provider state. */
export const TRIPSAGE_CHAT_LIMITS = { timeoutMs: 60_000, maxOutputTokens: 8_000, maxResponseBytes: 512 * 1024 } as const;

const unavailable = () => new AppError("AI_UNAVAILABLE", "Dịch vụ AI hiện không khả dụng.", 503);

/** Wraps fetch so every OpenAI call is `store:false`, token capped, redirect-free, time-boxed and size-bounded. */
export function createBoundedOpenAiFetch(base: typeof fetch = fetch): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    let body = init?.body;
    if (typeof body === "string") {
      try {
        const payload = JSON.parse(body) as Record<string, unknown>;
        payload.store = false;
        const bounded = (value: unknown) => (typeof value === "number" && value > 0 && value <= TRIPSAGE_CHAT_LIMITS.maxOutputTokens ? value : TRIPSAGE_CHAT_LIMITS.maxOutputTokens);
        if ("input" in payload) {
          // Responses API: the output cap is `max_output_tokens`.
          payload.max_output_tokens = bounded(payload.max_output_tokens);
        } else {
          // Chat completions: the SDK only treats o1/o3/o4-mini/gpt-5* names as reasoning models and sends the legacy
          // `max_tokens` for every other id; newer OpenAI models reject it (HTTP 400). Always send `max_completion_tokens`.
          if (payload.max_tokens !== undefined) {
            if (payload.max_completion_tokens === undefined) payload.max_completion_tokens = payload.max_tokens;
            delete payload.max_tokens;
          }
          payload.max_completion_tokens = bounded(payload.max_completion_tokens);
        }
        body = JSON.stringify(payload);
      } catch { throw unavailable(); }
    }
    const timeout = AbortSignal.timeout(TRIPSAGE_CHAT_LIMITS.timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await base(input, { ...init, body, signal, redirect: "error" });
    if (!response.body) return response;
    let bytes = 0;
    const limited = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > TRIPSAGE_CHAT_LIMITS.maxResponseBytes) { controller.error(unavailable()); return; }
        controller.enqueue(chunk);
      },
    }));
    return new Response(limited, { status: response.status, statusText: response.statusText, headers: response.headers });
  }) as typeof fetch;
}

export type TripsageChatModelOptions = { apiKey?: () => string | undefined | Promise<string | undefined>; model?: string; fetcher?: typeof fetch };

/** Resolves the key from effectiveConfig("OPENAI") on the server; it is never logged or returned. */
export async function resolveTripsageChatModel(options: TripsageChatModelOptions = {}): Promise<LanguageModel> {
  let key: string | undefined; let model: string | undefined;
  try {
    const config = options.apiKey ? null : await import("../runtime-config/runtime-config-service").then(module => module.effectiveConfig("OPENAI"));
    key = await (options.apiKey?.() ?? (config?.apiKey as string | undefined));
    model = options.model ?? (config?.qaModel as string | undefined) ?? QA_DEFAULT_MODEL;
  } catch { throw unavailable(); }
  if (!key || !model || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw unavailable();
  // Responses API, not chat completions: gpt-6 models reject function tools on /v1/chat/completions.
  return createOpenAI({ apiKey: key, fetch: createBoundedOpenAiFetch(options.fetcher ?? fetch) }).responses(model);
}

/**
 * Per-call provider options. Nothing is stored upstream. The gpt-6 family is a reasoning family the SDK cannot
 * recognise by name; forcing it makes the SDK return encrypted reasoning items, which a multi-step tool loop needs
 * when `store` is false. Other model ids are left untouched.
 */
export function tripsageProviderOptions(model: LanguageModel): { openai: { store: false; forceReasoning?: true } } {
  const id = typeof model === "object" && model !== null && "modelId" in model ? String((model as { modelId: unknown }).modelId) : "";
  return { openai: { store: false, ...(/^gpt-6/.test(id) ? { forceReasoning: true as const } : {}) } };
}
