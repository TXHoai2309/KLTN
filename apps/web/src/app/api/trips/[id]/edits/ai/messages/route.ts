import {
  deleteTripEditChatMessagesResponse,
  getTripEditChatMessagesResponse,
  postTripEditChatMessagesResponse,
} from "@/modules/trip-edit/trip-edit-chat-memory";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  database: db,
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return getTripEditChatMessagesResponse(request, id, dependencies);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return postTripEditChatMessagesResponse(request, id, dependencies);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return deleteTripEditChatMessagesResponse(request, id, dependencies);
}
