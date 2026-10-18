import { createOpenAiStructuredClient } from "@/modules/preference-extraction/openai-structured-client";
import { replanResponse } from "@/modules/in-trip/replan-http";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    database: db,
    llm: createOpenAiStructuredClient(),
    now: () => new Date(),
  },
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return replanResponse(request, id, dependencies);
}
