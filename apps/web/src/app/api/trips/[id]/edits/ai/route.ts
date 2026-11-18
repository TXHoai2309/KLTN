import { aiEditResponse } from "@/modules/trip-edit/ai-edit-http";
import { createOpenAiStructuredClient } from "@/modules/preference-extraction/openai-structured-client";
import { createTripEditRouteProvider } from "@/modules/trip-edit/trip-edit-routes";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    database: db,
    llm: createOpenAiStructuredClient(),
    getRoute: createTripEditRouteProvider(),
  },
  now: () => new Date(),
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return aiEditResponse(request, id, dependencies);
}
