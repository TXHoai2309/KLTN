import { authorizationDependencies } from "@/server/authorization/server";
import { applicationSettings } from "@/modules/runtime-config/runtime-config-service";
import { tripsageChatResponse } from "@/modules/tripsage-chat/tripsage-chat-http";
import { resolveTripsageChatModel } from "@/modules/tripsage-chat/tripsage-chat-provider";
import { tripsageFlightRuntime, tripsageHotelRuntime, tripsageMemoryRuntime, tripsagePlacesRuntime, tripsagePlanningRuntime, tripsageWebRuntime } from "@/modules/tripsage-chat/tripsage-chat-runtime";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  return tripsageChatResponse(request, {
    authorization: authorizationDependencies, model: resolveTripsageChatModel,
    settings: applicationSettings, planning: tripsagePlanningRuntime,
    places: tripsagePlacesRuntime,
    web: tripsageWebRuntime,
    flights: tripsageFlightRuntime,
    hotels: tripsageHotelRuntime,
    memory: tripsageMemoryRuntime,
  });
}
