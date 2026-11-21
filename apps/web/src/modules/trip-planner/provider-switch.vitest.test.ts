import { afterEach, expect, it, vi } from "vitest";
import { createConfiguredRoutesProvider } from "./planner-routes";
import { candidate } from "./__fixtures__/planner-fixtures";

afterEach(() => vi.unstubAllEnvs());

it("uses the website's Google flag for proposal and origin-leg evidence without Stadia fallback", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE");
  vi.stubEnv("PLANNER_ROUTING_PROVIDER", "STADIA"); // obsolete config must not split the website
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "fixture-private-server-key");
  const endpoints: string[] = [];
  const provider = createConfiguredRoutesProvider({ fetcher: async (url) => {
    endpoints.push(String(url));
    return Response.json({ routes: [{ duration: "120s", distanceMeters: 600 }] });
  } });
  const pair = { from: candidate("a"), to: candidate("b"), transport: "MOTORCYCLE" as const };
  const signal = new AbortController().signal;
  expect(await provider.route(pair, signal)).toMatchObject({ status: "VERIFIED", provider: "GOOGLE_MAPS", durationSeconds: 120, distanceMeters: 600 });
  expect(await provider.coordinateRoute!(pair, signal)).toMatchObject({ status: "VERIFIED", provider: "GOOGLE_MAPS" });
  expect(endpoints).toEqual(["https://routes.googleapis.com/directions/v2:computeRoutes", "https://routes.googleapis.com/directions/v2:computeRoutes"]);
});
