import { applyEditResponse } from "@/modules/trip-edit/trip-edit-http";
import { createTripEditRouteProvider } from "@/modules/trip-edit/trip-edit-routes";
import { createGooglePlacesSearch } from "@/modules/tripsage-chat/tripsage-places";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

const googlePlaces = createGooglePlacesSearch({
  apiKey: () => process.env.GOOGLE_PLACES_API_KEY,
});

const dependencies = {
  authorization: authorizationDependencies,
  service: {
    authorization: authorizationDependencies,
    database: db,
    places: googlePlaces,
  },
  now: () => new Date(),
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return applyEditResponse(request, id, { ...dependencies, service: { ...dependencies.service, getRoute: createTripEditRouteProvider() } });
}
