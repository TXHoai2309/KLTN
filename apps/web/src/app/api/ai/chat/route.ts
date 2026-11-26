import { authorizationDependencies } from "@/server/authorization/server";
import { applicationSettings } from "@/modules/runtime-config/runtime-config-service";
import { tripsageChatResponse } from "@/modules/tripsage-chat/tripsage-chat-http";
import { resolveTripsageChatModel } from "@/modules/tripsage-chat/tripsage-chat-provider";
import { tripsageConversationsRuntime, tripsageFlightRuntime, tripsageFuelPriceRuntime, tripsageHotelRuntime, tripsageKnowledgeRuntime, tripsageMemoryRuntime, tripsageOriginSearchRuntime, tripsageOriginSecretRuntime, tripsagePlacesRuntime, tripsagePlanningRuntime, tripsageTripReadRuntime, tripsageWebRuntime } from "@/modules/tripsage-chat/tripsage-chat-runtime";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  return tripsageChatResponse(request, {
    authorization: authorizationDependencies, model: resolveTripsageChatModel,
    settings: applicationSettings,
    planning: tripsagePlanningRuntime, originSearch: tripsageOriginSearchRuntime, originSecret: tripsageOriginSecretRuntime,
    conversations: tripsageConversationsRuntime, places: tripsagePlacesRuntime, fuelPrice: tripsageFuelPriceRuntime, web: tripsageWebRuntime,
    knowledge: tripsageKnowledgeRuntime, flights: tripsageFlightRuntime, hotels: tripsageHotelRuntime, memory: tripsageMemoryRuntime,
    weather: true, tripRead: tripsageTripReadRuntime,
  });
}
