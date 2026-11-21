import "server-only";
import { createHash } from "node:crypto";
import { readBounded } from "./tripsage-places";
import { echoesCredential, withLookupDeadline } from "./tripsage-provider-response";

/**
 * Shared server-only SerpApi client (`GET https://serpapi.com/search.json`).
 * Supports sequential key rotation across comma-separated `SERPAPI_API_KEYS`
 * on HTTP 429 or SerpApi quota-exhaustion responses.
 *
 * NOT verified live: real credentials, live JSON payloads, quota error text, or coverage in Vietnam.
 */
export const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_BYTES = 16 * 1024;

const QUOTA_EXHAUSTED_PATTERN =
  /run out of searches|out of searches|quota|rate limit|too many requests|search limit|credits? (?:exhausted|exceeded|depleted)|exceeded.*limit|plan.*limit/iu;

export type SerpApiKeyState = {
  signature: string;
  index: number;
};

export function createSerpApiKeyState(): SerpApiKeyState {
  return { signature: "", index: 0 };
}

/** Process-scoped key position shared by hotels and flights lookups (in-memory only, no DB). */
export const sharedSerpApiKeyState: SerpApiKeyState = createSerpApiKeyState();

export type SerpApiOutcome =
  | { status: "OK"; data: Record<string, unknown> }
  | { status: "UNAVAILABLE" };

export type SerpApiClient = {
  search: (params: Record<string, string | undefined>, signal?: AbortSignal) => Promise<SerpApiOutcome>;
};

export function parseSerpApiKeys(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      keys.push(trimmed);
    }
  }
  return keys;
}

function keyListSignature(keys: readonly string[]): string {
  return createHash("sha256").update(keys.join("\0")).digest("hex");
}

function isQuotaExhaustedMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return QUOTA_EXHAUSTED_PATTERN.test(text);
}

export function createSerpApiClient(deps: {
  apiKeys: () => string | undefined | Promise<string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  state?: SerpApiKeyState;
}): SerpApiClient {
  const fetcher = deps.fetcher ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = deps.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const state = deps.state ?? createSerpApiKeyState();

  return {
    async search(params, outer) {
      const result = await withLookupDeadline<SerpApiOutcome>(timeoutMs, outer, async signal => {
        const rawKeys = await deps.apiKeys();
        signal.throwIfAborted();
        const keys = parseSerpApiKeys(rawKeys);
        if (!keys.length) return { status: "UNAVAILABLE" };

        const signature = keyListSignature(keys);
        if (state.signature !== signature) {
          state.signature = signature;
          state.index = 0;
        }
        if (state.index >= keys.length) return { status: "UNAVAILABLE" };

        const startIndex = state.index;
        for (let i = startIndex; i < keys.length; i += 1) {
          signal.throwIfAborted();
          const key = keys[i]!;
          const url = new URL(SERPAPI_ENDPOINT);
          for (const [paramKey, paramValue] of Object.entries(params)) {
            if (paramKey === "api_key" || paramValue === undefined) continue;
            url.searchParams.set(paramKey, paramValue);
          }
          url.searchParams.set("api_key", key);

          // Never log the request URL or error objects: the URL carries `api_key`.
          const response = await fetcher(url.toString(), {
            method: "GET",
            signal,
            redirect: "error",
            cache: "no-store",
            headers: { accept: "application/json" },
          });

          if (response.status === 429) {
            if (state.index === i) state.index = i + 1;
            continue;
          }

          if (!response.ok) {
            if (response.status >= 400 && response.status < 500) {
              const errorText = await readBounded(response, MAX_ERROR_BYTES);
              if (isQuotaExhaustedMessage(errorText)) {
                if (state.index === i) state.index = i + 1;
                continue;
              }
            }
            return { status: "UNAVAILABLE" };
          }

          const text = await readBounded(response, maxResponseBytes);
          if (text === null) return { status: "UNAVAILABLE" };

          const parsed = JSON.parse(text) as unknown;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { status: "UNAVAILABLE" };
          }

          const record = parsed as Record<string, unknown>;
          if (typeof record.error === "string" && isQuotaExhaustedMessage(record.error)) {
            if (state.index === i) state.index = i + 1;
            continue;
          }

          if (echoesCredential(record, keys)) {
            return { status: "UNAVAILABLE" };
          }

          return { status: "OK", data: record };
        }

        return { status: "UNAVAILABLE" };
      });

      return result ?? { status: "UNAVAILABLE" };
    },
  };
}
