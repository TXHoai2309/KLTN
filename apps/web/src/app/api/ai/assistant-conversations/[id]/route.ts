import { authorizationDependencies } from "@/server/authorization/server";
import { assistantConversationsResponse } from "@/modules/tripsage-chat/assistant-conversation-http";
import { tripsageConversationsRuntime } from "@/modules/tripsage-chat/tripsage-chat-runtime";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return assistantConversationsResponse(request, { authorization: authorizationDependencies, store: tripsageConversationsRuntime }, (await context.params).id);
}

export async function DELETE(request: Request, context: Context) {
  return assistantConversationsResponse(request, { authorization: authorizationDependencies, store: tripsageConversationsRuntime }, (await context.params).id);
}

export async function PATCH(request: Request, context: Context) {
  return assistantConversationsResponse(request, { authorization: authorizationDependencies, store: tripsageConversationsRuntime }, (await context.params).id);
}
