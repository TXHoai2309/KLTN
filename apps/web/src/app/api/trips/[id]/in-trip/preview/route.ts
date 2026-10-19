import { previewInTripResponse } from "@/modules/in-trip/in-trip-preview-http";
import { getTravelRoute } from "@/modules/trip-validation/stadia-route";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const dependencies = {
  authorization: authorizationDependencies,
  service: { database: db, getRoute: getTravelRoute, now: () => new Date() },
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return previewInTripResponse(request, id, dependencies);
}
