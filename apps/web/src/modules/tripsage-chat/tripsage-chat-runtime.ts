import "server-only";
import { db } from "../../services";
import { ENV } from "../../env.server";
import { routingRegistry } from "../destination/destination-routing-registry";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";
import { createRuntimeRouting } from "../map/runtime-routing";
import { createGooglePlacesSearch, type PlacesSearch } from "./tripsage-places";
import { createFirecrawlWeb, type WebLookup } from "./tripsage-web";
import { createDuffelFlightLookup, type FlightLookup } from "./tripsage-duffel";
import { createAmadeusHotelLookup, type HotelLookup } from "./tripsage-amadeus";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

export { tripsageMemoryRuntime } from "../tripsage-memory/memory-runtime";

/** Same candidate reader and routing provider (Stadia by default) as the existing planner. Provider keys stays server-side. */
export function tripsagePlanningRuntime(): TripsagePlanningDeps {
  const registry = routingRegistry(ENV.DATABASE_URL);
  return {
    candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds),
    routes: createRuntimeRouting().routes,
    now: () => new Date(),
  };
}

/** Places search with the server-only Google key; the key is read per call and never leaves this module. */
export function tripsagePlacesRuntime(): PlacesSearch {
  return createGooglePlacesSearch({ apiKey: () => ENV.GOOGLE_MAPS_API_KEY });
}

/** Firecrawl web search and page extraction with the server-only key, read per call; it never leaves this module. */
export function tripsageWebRuntime(): WebLookup {
  return createFirecrawlWeb({ apiKey: () => ENV.FIRECRAWL_API_KEY });
}

export function tripsageFlightRuntime(): FlightLookup | undefined {
  const accessToken = ENV.DUFFEL_ACCESS_TOKEN?.trim();
  return accessToken ? createDuffelFlightLookup({ accessToken: () => accessToken }) : undefined;
}

export function tripsageHotelRuntime(environment = ENV.AMADEUS_ENV): HotelLookup | undefined {
  const clientId = ENV.AMADEUS_CLIENT_ID?.trim();
  const clientSecret = ENV.AMADEUS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return createAmadeusHotelLookup({
    clientId: () => clientId,
    clientSecret: () => clientSecret,
    environment: () => environment,
  });
}
