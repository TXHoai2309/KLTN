import "server-only";
import { assertStrictModelJsonSchema } from "../preference-extraction/preference-extraction-contract";
import type { StructuredLlmClient, StructuredLlmCompletionInput } from "../preference-extraction/preference-extraction-client";
import { EditorialAiError, editorialHttpError, createEditorialAiDiagnostics, type EditorialAiDiagnostics } from "./editorial-ai-diagnostics";
import { editorialRetryAfter } from "./editorial-retry-after";

export const EDITORIAL_OPENAI_LIMITS = { timeoutMs: 25_000, maxOutputTokens: 8192, maxResponseBytes: 96 * 1024 } as const;
type Options = { apiKey?: () => string | undefined; model?: () => string | undefined; fetcher?: typeof fetch; timeoutMs?: number };

async function boundedBody(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new EditorialAiError("INVALID_OUTPUT");
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > EDITORIAL_OPENAI_LIMITS.maxResponseBytes) { cancel(); throw new EditorialAiError("INVALID_OUTPUT"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

export function createEditorialOpenAiClient(options: Options = {}): StructuredLlmClient {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? EDITORIAL_OPENAI_LIMITS.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > EDITORIAL_OPENAI_LIMITS.timeoutMs) throw new EditorialAiError("CONFIGURATION");
  return { async complete(input: StructuredLlmCompletionInput & { editorialDiagnostics?: EditorialAiDiagnostics; attempt?: number }) {
    const diagnostics = input.editorialDiagnostics ?? createEditorialAiDiagnostics();
    const attempt = input.attempt === 2 ? 2 : 1;
    const key = (options.apiKey ?? (() => process.env.OPENAI_API_KEY))()?.trim();
    const model = (options.model ?? (() => process.env.OPENAI_EDITORIAL_MODEL))()?.trim();
    if (!key || model !== "gpt-6-luna") throw new EditorialAiError("CONFIGURATION");
    try { assertStrictModelJsonSchema(input.jsonSchema); } catch { throw new EditorialAiError("INVALID_SCHEMA"); }
    if (input.signal?.aborted) throw new EditorialAiError("CANCELLED");
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectDeadline: (error: EditorialAiError) => void = () => {};
    const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
    const abort = () => { rejectDeadline(new EditorialAiError("CANCELLED")); controller.abort(); };
    input.signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { rejectDeadline(new EditorialAiError("TIMEOUT")); controller.abort(); }, timeoutMs);
    const run = async () => {
      diagnostics.providerStarted(attempt);
      const response = await fetcher("https://api.openai.com/v1/chat/completions", {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
          reasoning_effort: "none", max_completion_tokens: EDITORIAL_OPENAI_LIMITS.maxOutputTokens,
          response_format: { type: "json_schema", json_schema: { name: "destination_editorial_layout", strict: true, schema: input.jsonSchema } }, store: false }),
      });
      const text = response.body ? await boundedBody(response, controller.signal) : "";
      const retryAfter = editorialRetryAfter(response.headers.get("retry-after"));
      let payload: any;
      try { payload = JSON.parse(text); } catch {
        diagnostics.providerResponse(response.status, response.headers.get("x-request-id"), null, attempt);
        if (!response.ok) throw editorialHttpError(response.status, null, retryAfter);
        throw new EditorialAiError("INVALID_OUTPUT", response.status);
      }
      diagnostics.providerResponse(response.status, response.headers.get("x-request-id"), payload, attempt);
      if (!response.ok) throw editorialHttpError(response.status, payload, retryAfter);
      const choice = payload?.choices?.[0];
      if (choice?.finish_reason === "length") throw new EditorialAiError("TOKEN_LIMIT", response.status);
      if (choice?.message?.refusal) throw new EditorialAiError("REFUSAL", response.status);
      if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string" || !choice.message.content.trim()) throw new EditorialAiError("INVALID_OUTPUT", response.status);
      try { JSON.parse(choice.message.content); } catch { throw new EditorialAiError("INVALID_OUTPUT", response.status); }
      return { rawText: choice.message.content as string, model };
    };
    try { return await Promise.race([run(), deadline]); }
    catch (error) { const safe = error instanceof EditorialAiError ? error : new EditorialAiError("NETWORK"); diagnostics.providerFailed(safe, attempt); throw safe; }
    finally { clearTimeout(timer); input.signal?.removeEventListener("abort", abort); controller.abort(); }
  } };
}
