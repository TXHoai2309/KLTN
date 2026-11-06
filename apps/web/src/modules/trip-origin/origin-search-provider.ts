import "server-only";
import { z } from "zod";
import { vietnamCoverageAt } from "./vietnam-coverage";
import type { OriginSearchResult } from "./origin-search-contract";

const row = z.object({ display_name: z.string().min(1).max(2000), lat: z.string().max(32), lon: z.string().max(32) });
const responseSchema = z.array(row).max(10);
export type OriginSearchConfig = { endpoint: string; contact: string };

export function originSearchConfig(raw = { endpoint: process.env.NOMINATIM_SEARCH_ENDPOINT ?? "https://nominatim.openstreetmap.org/search", contact: process.env.NOMINATIM_CONTACT ?? "" }): OriginSearchConfig | null {
  try {
    const endpoint = new URL(raw.endpoint);
    const contact = raw.contact.trim();
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || !contact || contact.length > 200 || /[\r\n()]/u.test(contact)) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact) && !/^https:\/\/[^\s]+$/u.test(contact)) return null;
    return { endpoint: endpoint.toString(), contact };
  } catch { return null; }
}

/** Explicit public-place query only. Raw provider text/errors never leave this adapter. */
export async function searchNominatim(query: string, config: OriginSearchConfig, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<OriginSearchResult[] | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) return null;
    const url = new URL(config.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "vn");
    url.searchParams.set("limit", "5");
    const response = await fetcher(url, { signal, redirect: "error", cache: "no-store", headers: { "user-agent": `KLTN-origin/1.0 (${config.contact})`, accept: "application/json", "accept-language": "vi,en;q=0.8" } });
    if (!response.ok || !response.body) return null;
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "", bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 64 * 1024 || signal.aborted) return null;
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const parsed = responseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const results: OriginSearchResult[] = [];
    for (const item of parsed.data) {
      // Empty numeric strings are not coordinates; Number("") must not turn them into zero.
      if (!item.lat.trim() || !item.lon.trim()) continue;
      const latitude = Number(item.lat), longitude = Number(item.lon);
      if (vietnamCoverageAt({ latitude, longitude }) !== "SUPPORTED") continue;
      const label = item.display_name.normalize("NFC").replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 300);
      if (label && !results.some(result => result.latitude === latitude && result.longitude === longitude)) results.push({ label, latitude, longitude, source: "NOMINATIM", confirmed: false });
    }
    return results.slice(0, 5);
  } catch { return null; }
  finally { signal.removeEventListener("abort", cancel); cancel(); }
}
