import "server-only";
import { mapSettings } from "../runtime-config/runtime-config-service";
import { createConfiguredRoutesProvider, type RouteProvider } from "../trip-planner/planner-routes";
import { getTravelRoute } from "../trip-validation/stadia-route";

// Each planner, save or edit operation uses one provider for all of its legs.
export function createRuntimeRouting() {
  let settings: ReturnType<typeof mapSettings> | undefined;
  const resolve = () => settings ??= mapSettings();
  let adapter: Promise<Required<RouteProvider>> | undefined;
  const routes = () => adapter ??= resolve().then(({ provider }) => createConfiguredRoutesProvider({ provider }));
  const provider: Required<RouteProvider> = {
    route: async (pair, signal) => (await routes()).route(pair, signal),
    coordinateRoute: async (pair, signal) => (await routes()).coordinateRoute(pair, signal),
  };
  const travelRoute: typeof getTravelRoute = async (input, options) => {
    const active = await resolve().catch(() => null);
    return active ? getTravelRoute(input, { ...options, provider: active.provider }) : { kind: "unavailable" };
  };
  return { routes: provider, travelRoute };
}
