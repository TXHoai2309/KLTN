import "server-only";
import { auth, db } from "@/services";
import type { AuthorizationDependencies } from "./guard";

export const authorizationDependencies: AuthorizationDependencies = {
  database: db,
  resolveSession: (headers) => auth.api.getSession({
    headers, query: { disableCookieCache: true, disableRefresh: true },
  }),
};
