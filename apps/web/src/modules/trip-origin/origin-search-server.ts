import "server-only";
import { authorizationDependencies } from "@/server/authorization/server";
import { runtimeSetting } from "../runtime-config/runtime-config-service";
import { createConfiguredOriginSearch } from "./origin-search-configured";

export const originSearchDependencies = {
  authorization: authorizationDependencies,
  search: createConfiguredOriginSearch({ googleApiKey: () => process.env.GOOGLE_MAPS_API_KEY, stadiaApiKey: () => runtimeSetting("STADIA", "apiKey") }),
};
