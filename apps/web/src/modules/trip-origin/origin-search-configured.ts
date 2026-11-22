import "server-only";
import { mapsProviderFromEnv, type MapsProvider } from "../map/maps-provider";
import { GOOGLE_ORIGIN_ATTRIBUTION, STADIA_ORIGIN_ATTRIBUTION } from "./origin-search-contract";
import { createGoogleOriginSearch } from "./origin-search-google";
import { createStadiaOriginSearch } from "./origin-search-stadia";

export function createConfiguredOriginSearch(deps: { googleApiKey: () => string | undefined | Promise<string | undefined>; stadiaApiKey: () => Promise<string | undefined>; fetcher?: typeof fetch; provider?: () => Promise<MapsProvider> }) {
  return async (input: unknown, signal?: AbortSignal) => {
    const google = (deps.provider ? await deps.provider() : mapsProviderFromEnv()) === "GOOGLE";
    const search = google ? createGoogleOriginSearch({ apiKey: deps.googleApiKey, fetcher: deps.fetcher }) : createStadiaOriginSearch({ apiKey: deps.stadiaApiKey, fetcher: deps.fetcher });
    const outcome = await search(input, signal);
    return { ...outcome, attribution: google ? GOOGLE_ORIGIN_ATTRIBUTION : STADIA_ORIGIN_ATTRIBUTION };
  };
}
