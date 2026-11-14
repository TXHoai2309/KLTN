import "server-only";

import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import { getTravelRoute } from "../trip-validation/stadia-route";
import type { TripSaveDependencies } from "./trip-save-service";
import { createConfiguredRoutesProvider } from "../trip-planner/planner-routes";

export const tripSaveDependencies: TripSaveDependencies = {
  ...authorizationDependencies,
  database: db,
  getRoute: getTravelRoute,
  journeyRoutes: createConfiguredRoutesProvider(),
};
