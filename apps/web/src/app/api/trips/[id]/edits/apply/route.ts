import { applyEditResponse } from "@/modules/trip-edit/trip-edit-http";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import { getTravelRoute } from "@/modules/trip-validation/stadia-route";

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    authorization: authorizationDependencies,
    database: db,
    getRoute: getTravelRoute,
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
