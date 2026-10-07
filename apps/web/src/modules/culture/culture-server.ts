import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
export const cultureDependencies = { ...authorizationDependencies, database: db };
