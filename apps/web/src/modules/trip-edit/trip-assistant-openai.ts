import "server-only";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import type {
  StructuredLlmClient,
  StructuredLlmCompletionInput,
} from "../preference-extraction/preference-extraction-client";

/** Owner-selected model for every Saved-trip assistant call (2026-11-20). */
export const TRIP_ASSISTANT_MODEL = "gpt-6.1-terra";
/** Terra's default effort, matching the Q&A and planning assistants. */
export const TRIP_ASSISTANT_REASONING_EFFORT = "medium";

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

export type ResponsesInputItem = Record<string, unknown>;

export type ResponsesFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: true;
};

export type ResponsesRequest = {
  instructions: string;
  input: readonly ResponsesInputItem[];
  tools: readonly ResponsesFunctionTool[];
  textFormat: { name: string; schema: Record<string, unknown> };
  signal?: AbortSignal;
};

export type ResponsesResult = {
  status: string;
  output: ResponsesInputItem[];
};

/** Responses API boundary: GPT-6.1 Terra only exposes tool calling here. */
export interface TripAssistantResponsesClient {
  create(request: ResponsesRequest): Promise<ResponsesResult>;
}

export function createTripAssistantResponsesClient(
  options: TripAssistantOpenAiOptions = {},
): TripAssistantResponsesClient {
  return {
    async create(request) {
      const payload = await postJson(
        "https://api.openai.com/v1/responses",
        {
          model: TRIP_ASSISTANT_MODEL,
          reasoning: { effort: TRIP_ASSISTANT_REASONING_EFFORT },
          // Stateless turns: reasoning items travel back encrypted instead of being stored.
          store: false,
          include: ["reasoning.encrypted_content"],
          instructions: request.instructions,
          input: request.input,
          tools: request.tools,
          parallel_tool_calls: true,
          text: {
            format: { type: "json_schema", name: request.textFormat.name, strict: true, schema: request.textFormat.schema },
          },
        },
        options,
        request.signal,
      );
      const body = payload as { status?: unknown; output?: unknown };
      if (typeof body?.status !== "string" || !Array.isArray(body.output)) {
        throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
      }
      return { status: body.status, output: body.output as ResponsesInputItem[] };
    },
  };
}
