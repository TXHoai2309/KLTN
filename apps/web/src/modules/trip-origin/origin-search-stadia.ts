import "server-only";
import { z } from "zod";
import { originSearchRequestSchema, type OriginSearchOutcome, type OriginSearchResult } from "./origin-search-contract";
import { vietnamCoverageAt } from "./vietnam-coverage";

const responseSchema = z.object({ features: z.array(z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({ name: z.string().min(1).max(500), coarse_location: z.string().max(500).optional() }),
})).max(10) });

/** Stadia Geocoding search. (The autocomplete endpoint returns no coordinates, so it cannot fill the pin.) Errors never leave this function. */
export function createStadiaOriginSearch(deps: { apiKey: () => Promise<string | undefined>; fetcher?: typeof fetch }) {
  return async (input: unknown, signal?: AbortSignal): Promise<OriginSearchOutcome> => {
    const parsed = originSearchRequestSchema.safeParse(input);
    if (!parsed.success) return { status: "UNAVAILABLE" };
    try {
      const key = await deps.apiKey();
      if (!key) return { status: "UNAVAILABLE" };
      const url = new URL("https://api.stadiamaps.com/geocoding/v2/search");
      url.searchParams.set("text", parsed.data.query);
      url.searchParams.set("boundary.country", "VN");
      url.searchParams.set("lang", "vi");
      url.searchParams.set("size", "5");
      // Bias ranking toward northern Vietnam so "hoàng mai" finds Hà Nội before Nghệ An.
      url.searchParams.set("focus.point.lat", "21"); url.searchParams.set("focus.point.lon", "105.8");
      const timeout = AbortSignal.timeout(4000);
      const response = await (deps.fetcher ?? fetch)(url, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        redirect: "error", cache: "no-store", headers: { accept: "application/json", authorization: `Stadia-Auth ${key}` },
      });
      if (!response.ok) return { status: "UNAVAILABLE" };
      const body = responseSchema.safeParse(await response.json());
      if (!body.success) return { status: "UNAVAILABLE" };
      const results: OriginSearchResult[] = [];
      for (const { geometry, properties } of body.data.features) {
        const [longitude, latitude] = geometry.coordinates;
        if (vietnamCoverageAt({ latitude, longitude }) !== "SUPPORTED") continue;
        const label = [properties.name, properties.coarse_location].filter(Boolean).join(", ").normalize("NFC").replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 300);
        // shortcut: results keep source "NOMINATIM" (the stored enum); rename with a migration if provenance matters.
        if (label && !results.some(r => r.latitude === latitude && r.longitude === longitude)) results.push({ label, latitude, longitude, source: "NOMINATIM", confirmed: false });
      }
      return { status: results.length ? "RESULTS" : "NO_RESULTS", results: results.slice(0, 5), cached: false };
    } catch { return { status: "UNAVAILABLE" }; }
  };
}
