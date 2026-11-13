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
        for (const field of ["max_completion_tokens", "max_tokens"] as const) {
          const value = payload[field];
          if (typeof value === "number" && value > TRIPSAGE_CHAT_LIMITS.maxOutputTokens) payload[field] = TRIPSAGE_CHAT_LIMITS.maxOutputTokens;
        }
        if (payload.max_completion_tokens === undefined && payload.max_tokens === undefined) payload.max_completion_tokens = TRIPSAGE_CHAT_LIMITS.maxOutputTokens;
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
  return createOpenAI({ apiKey: key, fetch: createBoundedOpenAiFetch(options.fetcher ?? fetch) }).chat(model);
}
