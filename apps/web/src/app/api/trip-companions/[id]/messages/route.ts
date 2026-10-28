import { companionHistoryResponse, companionSendResponse } from "@/modules/trip-companions/companion-chat-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return companionHistoryResponse(request, (await context.params).id, tripReadDependencies);
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return companionSendResponse(request, (await context.params).id, tripReadDependencies);
}
