import "server-only";

import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";

import type { FavoritesDependencies } from "./favorites.service";

export const favoritesDependencies: FavoritesDependencies = {
  database: db,
  authorization: authorizationDependencies,
};
