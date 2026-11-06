import "server-only";
import { authorizationDependencies } from "@/server/authorization/server";
import { runtimeSetting } from "../runtime-config/runtime-config-service";
import { createStadiaOriginSearch } from "./origin-search-stadia";

export const originSearchDependencies = {
  authorization: authorizationDependencies,
  search: createStadiaOriginSearch({ apiKey: () => runtimeSetting("STADIA", "apiKey") }),
};
