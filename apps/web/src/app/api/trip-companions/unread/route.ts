import { companionChatReadResponse } from "@/modules/trip-companions/companion-chat-http";
import { getCompanionUnread } from "@/modules/trip-companions/companion-unread-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function GET(request: Request) {
  return companionChatReadResponse(request, input => getCompanionUnread(request.headers, input, tripReadDependencies));
}
