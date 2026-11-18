import { authorizationDependencies } from "@/server/authorization/server";
import { tripsageChatResponse } from "@/modules/tripsage-chat/tripsage-chat-http";
import { resolveTripsageChatModel } from "@/modules/tripsage-chat/tripsage-chat-provider";
import { tripsagePlacesRuntime, tripsagePlanningRuntime, tripsageWebRuntime } from "@/modules/tripsage-chat/tripsage-chat-runtime";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  return tripsageChatResponse(request, { authorization: authorizationDependencies, model: () => resolveTripsageChatModel(), planning: tripsagePlanningRuntime, places: tripsagePlacesRuntime, web: tripsageWebRuntime });
}
