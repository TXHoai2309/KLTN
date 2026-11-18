import "server-only";

import { AppError } from "@/server/http/app-error";

// Only models whose Chat Completions/strict JSON request shapes are supported
// by the application may be selected. /v1/models has no capability metadata.
export const configurableChatModelIds = [
  "gpt-6-luna",
  "gpt-6.1-terra",
  "gpt-6-sol",
  "gpt-6.1-sol",
] as const;
export type ConfigurableChatModelId = (typeof configurableChatModelIds)[number];

export function isConfigurableChatModel(value: unknown): value is ConfigurableChatModelId {
  return typeof value === "string" && configurableChatModelIds.some(model => model === value);
}

export function preferenceRequestParameters(model: string, outputTokens: number) {
  if (model === "gpt-6.1-sol") {
    return { reasoning_effort: "low" as const, max_completion_tokens: Math.max(outputTokens, 4_000) };
  }
  if (/^gpt-6-luna(?:-|$)/u.test(model) || model === "gpt-6.1-terra" || model === "gpt-6-sol") {
    return { reasoning_effort: "none" as const, temperature: 0, max_completion_tokens: outputTokens };
  }
  // Preserve existing injected/legacy model behavior. CMS writes still use the
  // explicit allowlist and cannot persist an arbitrary identifier.
  return { temperature: 0, max_completion_tokens: outputTokens };
}

export function qaRequestParameters(model: string, outputTokens: number) {
  if (model === "gpt-6-luna") return { reasoning_effort: "high" as const, max_completion_tokens: Math.max(outputTokens, 8_000) };
  if (model === "gpt-6.1-sol" || model === "gpt-6.1-terra" || model === "gpt-6-sol") {
    return { reasoning_effort: "medium" as const, max_completion_tokens: Math.max(outputTokens, 8_000) };
  }
  // Preserve explicit legacy-model injection in offline tests.
  return { temperature: 0, max_completion_tokens: outputTokens };
}

export function editorialReasoningEffort(model: string): "high" {
  if (!isConfigurableChatModel(model)) throw new AppError("CONFIG_MODEL_UNSUPPORTED", "Model biên tập không được hỗ trợ.", 400);
  return "high";
}

export async function availableConfigurableChatModels(fetcher: typeof fetch = fetch): Promise<ConfigurableChatModelId[]> {
  const { effectiveConfig } = await import("./runtime-config-service");
  const key = (await effectiveConfig("OPENAI")).apiKey;
  if (typeof key !== "string" || !key.trim()) return [];
  let response: Response;
  try {
    response = await fetcher("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${key}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 2_000_000) throw Error("model list unavailable");
    const raw = await response.text();
    if (raw.length > 2_000_000) throw Error("model list too large");
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray((data as { data?: unknown }).data)) throw Error("invalid model list");
    const ids = new Set((data as { data: unknown[] }).data.map(item => item && typeof item === "object" ? (item as { id?: unknown }).id : null));
    return configurableChatModelIds.filter(model => ids.has(model));
  } catch {
    throw new AppError("OPENAI_MODELS_UNAVAILABLE", "Chưa lấy được danh sách model từ OpenAI. Hãy thử lại sau.", 503);
  }
}
