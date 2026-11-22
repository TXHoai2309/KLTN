import { previewEditResponse } from "@/modules/trip-edit/trip-edit-http";
import { createTripEditRouteProvider } from "@/modules/trip-edit/trip-edit-routes";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  service: { database: db },
  now: () => new Date(),
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return previewEditResponse(request, id, { ...dependencies, service: { ...dependencies.service, getRoute: createTripEditRouteProvider() } });
}
