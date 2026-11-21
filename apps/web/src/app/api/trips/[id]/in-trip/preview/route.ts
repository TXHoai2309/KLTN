import { previewInTripResponse } from "@/modules/in-trip/in-trip-preview-http";
import { createRuntimeRouting } from "@/modules/map/runtime-routing";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  service: { database: db, now: () => new Date() },
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return previewInTripResponse(request, id, { ...dependencies, service: { ...dependencies.service, getRoute: createRuntimeRouting().travelRoute } });
}
