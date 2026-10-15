import "server-only";

import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import type { TripReadDependencies } from "./trip-read-service";

export const tripReadDependencies: TripReadDependencies = { ...authorizationDependencies, database: db };
