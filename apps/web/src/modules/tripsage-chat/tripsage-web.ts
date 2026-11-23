import "server-only";
import { z } from "zod";
import { readBounded } from "./tripsage-places";

/**
 * Firecrawl v2, the provider tripsage-ai itself uses for both web search and page extraction
 * (`src/ai/tools/server/web-search.ts` and `web-crawl.ts`). Verified against docs.firecrawl.dev on 2026-11-14:
 * `POST https://api.firecrawl.dev/v2/search` (`query` up to 500 chars, `limit`, `sources`, `timeout` ms; results in `data.web[]`
 * with `url`, `title`, `description`) and `POST https://api.firecrawl.dev/v2/scrape` (`url`, `formats`, `onlyMainContent`,
 * `parsers`, `proxy`, `timeout`; `data.markdown` and `data.metadata.url`), both with `Authorization: Bearer <key>`.
 * NOT verified: per-request credit price, rate limits, and Firecrawl's terms on scraping or reusing third-party content.
 * The base URL is a constant on purpose: no environment variable can redirect the key to another host.
 * Everything returned is untrusted web content: it is cleaned, clipped and handed to the model only as data.
 */
export const FIRECRAWL_SEARCH_ENDPOINT = "https://api.firecrawl.dev/v2/search";
export const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
export const WEB_TIMEOUT_MS = 15_000;
export const WEB_MAX_RESPONSE_BYTES = 1024 * 1024;
export const WEB_PAGE_MAX_CHARS = 4_000;
const SEARCH_LIMIT = 5;
const TITLE_MAX = 120;
const SNIPPET_MAX = 300;
/** Marker that wraps every piece of web content. Occurrences inside the content are neutralised so a page cannot close the wrapper. */
export const WEB_DATA_MARKER = "DU_LIEU_WEB_KHONG_TIN_CAY";

export type WebSearchHit = { url: string; title: string; snippet: string };
export type WebSearchOutcome = { status: "RESULTS"; results: WebSearchHit[] } | { status: "NO_RESULTS" } | { status: "UNAVAILABLE" };
export type WebPageOutcome = { status: "PAGE"; url: string; title: string; text: string; truncated: boolean } | { status: "UNAVAILABLE" };
export type WebLookup = {
  search: (query: string, signal?: AbortSignal) => Promise<WebSearchOutcome>;
  scrape: (url: string, signal?: AbortSignal) => Promise<WebPageOutcome>;
};

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".private", ".arpa"];

/**
 * Only public https URLs on the default port, with no credentials, no IP literal (IPv4 in any notation is normalised by the
 * URL parser to dotted form, IPv6 keeps brackets) and no single-label or internal-looking host. Returns the parsed URL or null.
 * This is a string-level guard; fetching is done by Firecrawl, not by this server.
 */
export function isSafePublicHttpsUrl(input: string): URL | null {
  if (typeof input !== "string" || input.length > 2000) return null;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (!host || host.startsWith("[") || host.includes(":")) return null;
  if (/^[\d.]+$/u.test(host) || /^0x/iu.test(host)) return null;
  if (host === "localhost" || BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix))) return null;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9-]{1,63}$/u.test(label))) return null;
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/u.test(labels.at(-1)!)) return null;
  return url;
}

export const domainOf = (url: string): string | null => isSafePublicHttpsUrl(url)?.hostname.toLowerCase() ?? null;

/** Untrusted web text to plain text: no HTML/script/style, no URLs, no control characters, no wrapper marker, clipped. */
export function sanitizeWebText(text: string, max: number): string {
  let out = String(text).normalize("NFC")
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, " ")
    .replace(/<(script|style|iframe|object|embed|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\b(?:javascript|data|vbscript|file|blob):[^\s)]*/giu, " ")
    .replace(/\bhttps?:\/\/[^\s)]*/giu, " ")
    .replace(/[<>]/gu, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/gu, " ")
    .split(WEB_DATA_MARKER).join("DU_LIEU_WEB")
    .replace(/[ \t\f\v]+/gu, " ").replace(/ ?\n ?/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
  if (out.length > max) out = `${out.slice(0, max - 1).trimEnd()}…`;
  return out;
}

const searchHitSchema = z.object({ url: z.string().max(2000), title: z.string().max(2000).nullish(), description: z.string().max(5000).nullish() });
const searchEnvelopeSchema = z.object({ data: z.object({ web: z.array(z.unknown()).max(50).optional() }).optional() });
const scrapeSchema = z.object({ data: z.object({
  markdown: z.string().max(5_000_000),
  metadata: z.object({ title: z.string().nullish(), url: z.string().nullish(), sourceURL: z.string().nullish(), statusCode: z.number().nullish() }).partial().optional(),
}) });

function logWebUnavailable(reason: string) {
  console.warn("[tripsage-web] unavailable", reason);
}

/** One request per call: no retry, no redirect, bounded time and size. Errors never leave this function and never carry the key. */
export function createFirecrawlWeb(deps: { apiKey: () => string | undefined | Promise<string | undefined>; fetcher?: typeof fetch; timeoutMs?: number }): WebLookup {
  const timeoutMs = Math.min(deps.timeoutMs ?? WEB_TIMEOUT_MS, WEB_TIMEOUT_MS);
  const post = async (endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown | null> => {
    const key = (await deps.apiKey())?.trim();
    if (!key) {
      logWebUnavailable("missing_key");
      return null;
    }
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const aborted = new Promise<never>((_, reject) => combined.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    try {
      const run = async (): Promise<unknown | null> => {
        const response = await (deps.fetcher ?? fetch)(endpoint, {
          method: "POST", signal: combined, redirect: "error", cache: "no-store",
          headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ ...body, timeout: Math.max(1000, timeoutMs) }),
        });
        if (!response.ok) {
          logWebUnavailable(`http_${response.status}`);
          return null;
        }
        const text = await readBounded(response, WEB_MAX_RESPONSE_BYTES);
        if (text === null) {
          logWebUnavailable("oversized_body");
          return null;
        }
        try {
          return JSON.parse(text);
        } catch {
          logWebUnavailable("invalid_json");
          return null;
        }
      };
      return await Promise.race([run(), aborted]);
    } catch {
      logWebUnavailable(timeout.aborted ? "timeout" : signal?.aborted ? "aborted" : "network_error");
      return null;
    }
  };

  return {
    async search(query, signal) {
      const raw = await post(FIRECRAWL_SEARCH_ENDPOINT, { query, limit: SEARCH_LIMIT, sources: ["web"] }, signal);
      if (raw === null) return { status: "UNAVAILABLE" };
      const envelope = searchEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        logWebUnavailable("invalid_schema");
        return { status: "UNAVAILABLE" };
      }
      const rawItems = envelope.data.data?.web ?? [];
      const validItems = rawItems.flatMap(entry => {
        const parsed = searchHitSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      });
      if (rawItems.length > 0 && validItems.length === 0) {
        logWebUnavailable("invalid_schema");
        return { status: "UNAVAILABLE" };
      }
      const results: WebSearchHit[] = [];
      for (const item of validItems) {
        const url = isSafePublicHttpsUrl(item.url);
        if (!url || results.some(r => r.url === url.href)) continue;
        results.push({ url: url.href, title: sanitizeWebText(item.title ?? "", TITLE_MAX), snippet: sanitizeWebText(item.description ?? "", SNIPPET_MAX) });
        if (results.length >= SEARCH_LIMIT) break;
      }
      return results.length ? { status: "RESULTS", results } : { status: "NO_RESULTS" };
    },
    async scrape(url, signal) {
      const target = isSafePublicHttpsUrl(url);
      if (!target) return { status: "UNAVAILABLE" };
      const raw = await post(FIRECRAWL_SCRAPE_ENDPOINT, { url: target.href, formats: ["markdown"], onlyMainContent: true, parsers: [], proxy: "basic" }, signal);
      if (raw === null) return { status: "UNAVAILABLE" };
      const parsed = scrapeSchema.safeParse(raw);
      if (!parsed.success) {
        logWebUnavailable("invalid_schema");
        return { status: "UNAVAILABLE" };
      }
      const meta = parsed.data.data.metadata;
      if (meta?.statusCode && meta.statusCode >= 400) {
        logWebUnavailable(`page_http_${meta.statusCode}`);
        return { status: "UNAVAILABLE" };
      }
      // Firecrawl reports where the page finally resolved; content from anywhere but a public https URL is discarded.
      const final = isSafePublicHttpsUrl(meta?.url ?? target.href);
      if (!final) {
        logWebUnavailable("unsafe_redirect_url");
        return { status: "UNAVAILABLE" };
      }
      const cleaned = sanitizeWebText(parsed.data.data.markdown, WEB_PAGE_MAX_CHARS + 1);
      const truncated = cleaned.length > WEB_PAGE_MAX_CHARS;
      const text = truncated ? `${cleaned.slice(0, WEB_PAGE_MAX_CHARS - 1).trimEnd()}…` : cleaned;
      if (!text) {
        logWebUnavailable("empty_content");
        return { status: "UNAVAILABLE" };
      }
      return { status: "PAGE", url: final.href, title: sanitizeWebText(meta?.title ?? "", TITLE_MAX), text, truncated };
    },
  };
}
