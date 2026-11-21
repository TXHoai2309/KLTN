import { applyEditResponse } from "@/modules/trip-edit/trip-edit-http";
import { createTripEditRouteProvider } from "@/modules/trip-edit/trip-edit-routes";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    authorization: authorizationDependencies,
    database: db,
    getRoute: createTripEditRouteProvider(),
  },
  now: () => new Date(),
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return applyEditResponse(request, id, dependencies);
}
