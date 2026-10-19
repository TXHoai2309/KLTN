import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
export const adminUserDependencies = { ...authorizationDependencies, database: db };
