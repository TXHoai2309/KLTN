import { aiEditResponse } from "@/modules/trip-edit/ai-edit-http";
import { createOpenAiStructuredClient } from "@/modules/preference-extraction/openai-structured-client";
import { getTravelRoute } from "@/modules/trip-validation/stadia-route";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    database: db,
    llm: createOpenAiStructuredClient(),
    getRoute: getTravelRoute,
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
