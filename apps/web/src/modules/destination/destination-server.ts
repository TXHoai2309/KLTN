import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import type { DestinationDependencies } from "./destination-service";
export const destinationDependencies: DestinationDependencies = { ...authorizationDependencies, database: db };
