import { aiEditResponse } from "@/modules/trip-edit/ai-edit-http";
import {
  createTripAssistantStructuredClient,
  resolveTripAssistantModel,
} from "@/modules/trip-edit/trip-assistant-openai";
import { createTripEditRouteProvider } from "@/modules/trip-edit/trip-edit-routes";
import { applicationSettings } from "@/modules/runtime-config/runtime-config-service";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

// A reasoning turn may run several model rounds plus routing/Validator previews.
export const maxDuration = 300;

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    database: db,
    llm: createTripAssistantStructuredClient(),
    agent: () => resolveTripAssistantModel(),
  },
  agentEnabled: async () => (await applicationSettings()).tripAssistantAgentEnabled,
  now: () => new Date(),
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return aiEditResponse(request, id, { ...dependencies, service: { ...dependencies.service, getRoute: createTripEditRouteProvider() } });
}
