import { authorizationDependencies } from "@/server/authorization/server";
import { assistantConversationsResponse } from "@/modules/tripsage-chat/assistant-conversation-http";
import { tripsageConversationsRuntime } from "@/modules/tripsage-chat/tripsage-chat-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return assistantConversationsResponse(request, { authorization: authorizationDependencies, store: tripsageConversationsRuntime });
}

export async function DELETE(request: Request) {
  return assistantConversationsResponse(request, { authorization: authorizationDependencies, store: tripsageConversationsRuntime });
}
