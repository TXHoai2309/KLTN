import "server-only";
import { auth, db } from "@/services";
import type { AccountDependencies } from "./account-service";

export const accountDependencies: AccountDependencies = {
  database: db,
  resolveSession: (headers) => auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
};
