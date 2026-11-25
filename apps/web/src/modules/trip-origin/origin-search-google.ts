import "server-only";
import { z } from "zod";
import { readBounded, GOOGLE_PLACES_SEARCH_ENDPOINT } from "../tripsage-chat/tripsage-places";
import { deduplicateOriginResults, originSearchRequestSchema, type OriginSearchOutcome, type OriginSearchResult } from "./origin-search-contract";
import { vietnamCoverageAt } from "./vietnam-coverage";

const responseSchema = z.object({ places: z.array(z.object({
  displayName: z.object({ text: z.string().max(1000) }),
  location: z.object({ latitude: z.number().finite(), longitude: z.number().finite() }),
})).max(20).optional() });

/** Vietnam-wide Text Search, not the Hà Giang-only external-place search. No persistence/cache. */
export function createGoogleOriginSearch(deps: { apiKey: () => string | undefined | Promise<string | undefined>; fetcher?: typeof fetch }) {
  return async (input: unknown, signal?: AbortSignal): Promise<OriginSearchOutcome> => {
    const parsed = originSearchRequestSchema.safeParse(input);
    if (!parsed.success || signal?.aborted) return { status: "UNAVAILABLE" };
    const controller = new AbortController();
    let expired: (() => void) | undefined;
    const interrupted = new Promise<OriginSearchOutcome>(resolve => { expired = () => { controller.abort(); resolve({ status: "UNAVAILABLE" }); }; });
    const abort = () => expired?.();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 8000);
    const run = async (): Promise<OriginSearchOutcome> => {
      try {
        const key = (await deps.apiKey())?.trim();
        if (!key || controller.signal.aborted) return { status: "UNAVAILABLE" };
        const response = await (deps.fetcher ?? fetch)(GOOGLE_PLACES_SEARCH_ENDPOINT, {
          method: "POST", signal: controller.signal, redirect: "error", cache: "no-store",
          headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.location" },
          body: JSON.stringify({ textQuery: parsed.data.query, languageCode: "vi", regionCode: "VN", pageSize: 5 }),
        });
        if (!response.ok) { void response.body?.cancel().catch(() => {}); return { status: "UNAVAILABLE" }; }
        const text = await readBounded(response, 256 * 1024);
        const body = text === null ? null : responseSchema.safeParse(JSON.parse(text));
        if (!body?.success || controller.signal.aborted) return { status: "UNAVAILABLE" };
        const results: OriginSearchResult[] = [];
        for (const place of body.data.places ?? []) {
          if (vietnamCoverageAt(place.location) !== "SUPPORTED") continue;
          const label = place.displayName.text.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 300);
          const { latitude, longitude } = place.location;
          if (label && !results.some(p => p.latitude === latitude && p.longitude === longitude)) results.push({ label, latitude, longitude, source: "GOOGLE_PLACES", confirmed: false });
        }
        const deduped = deduplicateOriginResults(results).slice(0, 5);
        return { status: deduped.length ? "RESULTS" : "NO_RESULTS", results: deduped, cached: false };
      } catch { return { status: "UNAVAILABLE" }; }
    };
    try { return await Promise.race([run(), interrupted]); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); controller.abort(); }
  };
}
