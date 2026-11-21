import "server-only";
import { db } from "../../services";
import { ENV } from "../../env.server";
import { routingRegistry } from "../destination/destination-routing-registry";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";
import { createConfiguredRoutesProvider } from "../trip-planner/planner-routes";
import { createGooglePlacesSearch, type PlacesSearch } from "./tripsage-places";
import { createFirecrawlWeb, type WebLookup } from "./tripsage-web";
import { createDuffelFlightLookup, type FlightLookup } from "./tripsage-duffel";
import { createAmadeusHotelLookup, type HotelLookup } from "./tripsage-amadeus";
import type { LocalKnowledge, TripsagePlanningDeps } from "./tripsage-chat-tools";
import { createQaRetriever } from "../ai/qa-retrieval";

export { tripsageMemoryRuntime } from "../tripsage-memory/memory-runtime";

/** Same candidate reader and routing provider (Stadia by default) as the existing planner. Provider keys stays server-side. */
export function tripsagePlanningRuntime(): TripsagePlanningDeps {
  const registry = routingRegistry(ENV.DATABASE_URL);
  return {
    candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds),
    routes: createConfiguredRoutesProvider(),
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

/** Reviewed RAG documents through the public Q&A retriever (same eligibility rules); only titles and excerpt text leave it. */
export function tripsageKnowledgeRuntime(): LocalKnowledge {
  const retriever = createQaRetriever(db, { topK: 4, maxEvidenceTokens: 2000, hybrid: true });
  return async (question, signal) => (await retriever.retrieve(question, [], signal)).map(evidence => ({ title: evidence.citation.title, text: evidence.text }));
}

export function tripsageFlightRuntime(): FlightLookup | undefined {
  const accessToken = ENV.DUFFEL_ACCESS_TOKEN?.trim();
  return accessToken ? createDuffelFlightLookup({ accessToken: () => accessToken }) : undefined;
}

export function tripsageHotelRuntime(): HotelLookup | undefined {
  const clientId = ENV.AMADEUS_CLIENT_ID?.trim();
  const clientSecret = ENV.AMADEUS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return createAmadeusHotelLookup({
    clientId: () => clientId,
    clientSecret: () => clientSecret,
    environment: () => ENV.AMADEUS_ENV,
  });
}
