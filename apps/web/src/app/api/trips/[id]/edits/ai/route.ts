import { aiEditResponse } from "@/modules/trip-edit/ai-edit-http";
import {
  createTripAssistantResponsesClient,
  createTripAssistantStructuredClient,
} from "@/modules/trip-edit/trip-assistant-openai";
import { createTripEditRouteProvider } from "@/modules/trip-edit/trip-edit-routes";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

// A reasoning turn may run several model rounds plus routing/Validator previews.
export const maxDuration = 300;

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    database: db,
    llm: createTripAssistantStructuredClient(),
    getRoute: createTripEditRouteProvider(),
    // ADR-39 reasoning loop is on by default; TRIP_ASSISTANT_AGENT=off restores the ADR-38 pipeline.
    ...(process.env.TRIP_ASSISTANT_AGENT === "off" ? {} : { agent: createTripAssistantResponsesClient() }),
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
