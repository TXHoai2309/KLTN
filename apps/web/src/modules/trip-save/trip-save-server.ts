import "server-only";

import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import { ENV } from "../../env.server";
import { createGooglePlaceDetailsResolver } from "./external-place-resolver";
import { getTravelRoute } from "../trip-validation/stadia-route";
import type { TripSaveDependencies } from "./trip-save-service";
import { createConfiguredRoutesProvider } from "../trip-planner/planner-routes";

export const tripSaveDependencies: TripSaveDependencies = {
  ...authorizationDependencies,
  database: db,
  getRoute: getTravelRoute,
  journeyRoutes: createConfiguredRoutesProvider(),
  /** Server-only Google key, read per call; never in a response, log or bundle. */
  resolveExternalPlaces: createGooglePlaceDetailsResolver({ apiKey: () => ENV.GOOGLE_MAPS_API_KEY }),
};
