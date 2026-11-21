import "server-only";
import { db } from "../../services";
import { ENV } from "../../env.server";
import { routingRegistry } from "../destination/destination-routing-registry";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";
import { createConfiguredRoutesProvider } from "../trip-planner/planner-routes";
import { createGooglePlacesSearch, type PlacesSearch } from "./tripsage-places";
import { createFirecrawlWeb, type WebLookup } from "./tripsage-web";
import { createSerpApiFlightLookup, type FlightLookup } from "./tripsage-serpapi-flights";
import { createSerpApiHotelLookup, type HotelLookup } from "./tripsage-serpapi-hotels";
import { createSerpApiClient, parseSerpApiKeys, sharedSerpApiKeyState, type SerpApiClient } from "./tripsage-serpapi";
import type { LocalKnowledge, OriginLookup, TripsagePlanningDeps } from "./tripsage-chat-tools";
import { createAssistantConversationStore, type AssistantConversationStore } from "./assistant-conversation-store";
import { createQaRetriever } from "../ai/qa-retrieval";
import { originSearchDependencies } from "../trip-origin/origin-search-server";

export { tripsageMemoryRuntime } from "../tripsage-memory/memory-runtime";

/** Owner-scoped persistence for unified assistant conversations (ADR-43 §6). */
export function tripsageConversationsRuntime(): AssistantConversationStore {
  return createAssistantConversationStore(db);
}

/** Same origin search (Vietnam coverage checked) as `/trips/new`; provider keys stay server-side. */
export function tripsageOriginSearchRuntime(): OriginLookup {
  return (query, signal) => originSearchDependencies.search({ query }, signal);
}

/** Server secret used to HMAC-sign origin candidates carried across turns. */
export function tripsageOriginSecretRuntime(): string {
  return ENV.BETTER_AUTH_SECRET;
}

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

export function tripsageSerpApiRuntime(): SerpApiClient | undefined {
  if (!parseSerpApiKeys(ENV.SERPAPI_API_KEYS).length) return undefined;
  return createSerpApiClient({
    apiKeys: () => ENV.SERPAPI_API_KEYS,
    state: sharedSerpApiKeyState,
  });
}

export function tripsageFlightRuntime(): FlightLookup | undefined {
  const client = tripsageSerpApiRuntime();
  return client ? createSerpApiFlightLookup(client) : undefined;
}

export function tripsageHotelRuntime(): HotelLookup | undefined {
  const client = tripsageSerpApiRuntime();
  return client ? createSerpApiHotelLookup(client) : undefined;
}
