import "server-only";
import { mapsProviderFromEnv } from "../map/maps-provider";
import { GOOGLE_ORIGIN_ATTRIBUTION, STADIA_ORIGIN_ATTRIBUTION } from "./origin-search-contract";
import { createGoogleOriginSearch } from "./origin-search-google";
import { createStadiaOriginSearch } from "./origin-search-stadia";

export function createConfiguredOriginSearch(deps: { googleApiKey: () => string | undefined | Promise<string | undefined>; stadiaApiKey: () => Promise<string | undefined>; fetcher?: typeof fetch }) {
  return async (input: unknown, signal?: AbortSignal) => {
    const google = mapsProviderFromEnv() === "GOOGLE";
    const search = google ? createGoogleOriginSearch({ apiKey: deps.googleApiKey, fetcher: deps.fetcher }) : createStadiaOriginSearch({ apiKey: deps.stadiaApiKey, fetcher: deps.fetcher });
    const outcome = await search(input, signal);
    return { ...outcome, attribution: google ? GOOGLE_ORIGIN_ATTRIBUTION : STADIA_ORIGIN_ATTRIBUTION };
  };
}
