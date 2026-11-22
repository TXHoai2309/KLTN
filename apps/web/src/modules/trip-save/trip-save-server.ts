import "server-only";

import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import { ENV } from "../../env.server";
import { createGooglePlaceDetailsResolver } from "./external-place-resolver";
import type { TripSaveDependencies } from "./trip-save-service";
import { createRuntimeRouting } from "../map/runtime-routing";

export function createTripSaveDependencies(routing = createRuntimeRouting()): TripSaveDependencies {
  return {
    ...authorizationDependencies,
    database: db,
    getRoute: routing.travelRoute,
    journeyRoutes: routing.routes,
    resolveExternalPlaces: createGooglePlaceDetailsResolver({ apiKey: () => ENV.GOOGLE_MAPS_API_KEY }),
  };
}
