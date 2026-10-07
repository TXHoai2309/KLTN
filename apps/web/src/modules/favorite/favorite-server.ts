import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import type { FavoriteDependencies } from "./favorite-service";
export const favoriteDependencies: FavoriteDependencies = { ...authorizationDependencies, database: db };
