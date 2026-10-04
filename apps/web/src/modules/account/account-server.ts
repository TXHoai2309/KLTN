import "server-only";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import type { AccountDependencies } from "./account-service";

export const accountDependencies: AccountDependencies = {
  database: db,
  resolveSession: authorizationDependencies.resolveSession,
};
