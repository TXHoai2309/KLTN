import { companionChatReadResponse } from "@/modules/trip-companions/companion-chat-http";
import { getCompanionDelta } from "@/modules/trip-companions/companion-delta-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return companionChatReadResponse(request, input => getCompanionDelta(request.headers, id, input, tripReadDependencies));
}
