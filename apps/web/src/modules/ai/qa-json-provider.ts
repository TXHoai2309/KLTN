import "server-only";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { qaOrigin, qaProviderInvoked, qaProviderMetadata, qaStage, type QaStage, type QaFailureCategory } from "./qa-diagnostics";

export type QaProviderOptions = { apiKey?: () => string | undefined; fetcher?: typeof fetch; model?: string; timeoutMs?: number; maxOutputTokens?: number };
export const QA_GENERATION_LIMITS = { timeoutMs: 25_000, maxInputTokens: 8_000, maxOutputTokens: 2_000, maxResponseBytes: 64 * 1024, maxEvidence: 4, maxInputUtf16: 40_000 } as const;
const invalid = (stage: QaStage, category: QaFailureCategory, issues?: readonly { code: string; path: readonly PropertyKey[] }[]) =>
  qaOrigin(new AppError("AI_INVALID_RESPONSE", "Phản hồi AI không hợp lệ hoặc không có căn cứ.", 502), stage, category, issues);
const unavailable = (stage: QaStage = "GENERATION_PROVIDER") => qaOrigin(new AppError("AI_UNAVAILABLE", "Dịch vụ AI hiện không khả dụng.", 503), stage, "PROVIDER_FAILURE");

async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw invalid("GENERATION_ENVELOPE", "BODY_MISSING");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > QA_GENERATION_LIMITS.maxResponseBytes) { await reader.cancel().catch(() => undefined); throw invalid("GENERATION_ENVELOPE", "BODY_LIMIT"); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}

/** One bounded structured call, no automatic retries. Shared by assessment and
 * answer generation; neither invocation retains provider conversation state. */
export function createQaJsonProvider(options: QaProviderOptions = {}) {
  const model = options.model ?? "gpt-4o-mini";
  const timeoutMs = options.timeoutMs ?? QA_GENERATION_LIMITS.timeoutMs;
  const maxOutputTokens = options.maxOutputTokens ?? QA_GENERATION_LIMITS.maxOutputTokens;
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > QA_GENERATION_LIMITS.timeoutMs || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > QA_GENERATION_LIMITS.maxOutputTokens) throw new Error("Invalid QA generation configuration");
  return { async request<T>(input: { messages: { role: "system" | "user"; content: string }[]; name: string; schema: object; signal?: AbortSignal }, validate: (value: unknown) => T): Promise<T> {
    if (input.signal?.aborted) throw unavailable();
    const messages = input.messages;
    if (JSON.stringify(messages).length > QA_GENERATION_LIMITS.maxInputUtf16 || countEmbeddingTokens(JSON.stringify(messages)) > QA_GENERATION_LIMITS.maxInputTokens) throw invalid("GENERATION_PREFLIGHT", "TOKEN_LIMIT");
    let key: string | undefined;
    try { key = (options.apiKey ?? (() => process.env.OPENAI_API_KEY))(); } catch { throw unavailable("GENERATION_PREFLIGHT"); }
    if (!key) throw unavailable("GENERATION_PREFLIGHT");
    const controller = new AbortController(); const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs); });
    const cancellation = new Promise<never>((_, reject) => { controller.signal.addEventListener("abort", () => reject(unavailable()), { once: true }); });
    const work = async (): Promise<T> => {
      qaStage("GENERATION_PROVIDER"); qaProviderInvoked("generation");
      const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/chat/completions", { method: "POST", redirect: "error", signal: controller.signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages, store: false, max_completion_tokens: maxOutputTokens, response_format: { type: "json_schema", json_schema: { name: input.name, strict: true, schema: input.schema } } }) });
      qaProviderMetadata("generation", response);
      if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw unavailable(); }
      let payload: unknown; qaStage("GENERATION_ENVELOPE");
      try { payload = JSON.parse(await readBounded(response)); } catch (error) { if (error instanceof AppError) throw error; throw invalid("GENERATION_ENVELOPE", "INVALID_JSON"); }
      qaProviderMetadata("generation", response, payload);
      const envelope = z.object({ choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string(), refusal: z.string().nullable().optional() }) })).length(1) }).safeParse(payload);
      if (!envelope.success) throw invalid("GENERATION_ENVELOPE", "ENVELOPE", envelope.error.issues);
      if (envelope.data.choices[0]!.message.refusal) throw invalid("GENERATION_ENVELOPE", "REFUSAL");
      if (countEmbeddingTokens(envelope.data.choices[0]!.message.content) > maxOutputTokens) throw invalid("GENERATION_JSON", "TOKEN_LIMIT");
      let content: unknown; qaStage("GENERATION_JSON");
      try { content = JSON.parse(envelope.data.choices[0]!.message.content); } catch { throw invalid("GENERATION_JSON", "INVALID_JSON"); }
      return validate(content);
    };
    try { return await Promise.race([work(), deadline, cancellation]); }
    catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
    finally { clearTimeout(timer); input.signal?.removeEventListener("abort", abort); }
  } };
}
