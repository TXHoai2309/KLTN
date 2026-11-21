import { afterEach, describe, expect, it, vi } from "vitest";

const coordinateRouteMock = vi.fn();

vi.mock("../trip-planner/planner-routes", () => ({
  ROUTING_DEADLINE_MS: 5_000,
  createConfiguredRoutesProvider: () => ({
    coordinateRoute: coordinateRouteMock,
  }),
}));

import { createTripEditRouteProvider } from "./trip-edit-routes";

afterEach(() => {
  coordinateRouteMock.mockReset();
});

describe("createTripEditRouteProvider", () => {
  const input = {
    origin: { latitude: 22.82, longitude: 104.98 },
    destination: { latitude: 23.28, longitude: 105.36 },
    vehicle: "CAR" as const,
  };

  it("maps verified planner route responses to ok with distance and geometry", async () => {
    coordinateRouteMock.mockResolvedValue({
      status: "VERIFIED",
      durationSeconds: 3600,
      distanceMeters: 42000,
      geometry: {
        type: "LineString",
        coordinates: [
          [104.98, 22.82],
          [105.36, 23.28],
        ],
      },
    });

    const getRoute = createTripEditRouteProvider();
    const result = await getRoute(input);

    expect(coordinateRouteMock).toHaveBeenCalledWith(
      {
        from: input.origin,
        to: input.destination,
        transport: "CAR",
      },
      expect.any(AbortSignal),
    );
    expect(result).toEqual({
      kind: "ok",
      durationSeconds: 3600,
      distanceMeters: 42000,
      geometry: {
        type: "LineString",
        coordinates: [
          [104.98, 22.82],
          [105.36, 23.28],
        ],
      },
    });
  });

  it.each([
    { status: "INSUFFICIENT_DATA", durationSeconds: null },
    { status: "VERIFIED", durationSeconds: null },
  ])("returns unavailable when route is %o", async (route) => {
    coordinateRouteMock.mockResolvedValue(route);
    const getRoute = createTripEditRouteProvider();
    await expect(getRoute(input)).resolves.toEqual({ kind: "unavailable" });
  });

  it("returns unavailable when configured provider throws or aborts", async () => {
    coordinateRouteMock.mockRejectedValue(new Error("timeout"));
    const getRoute = createTripEditRouteProvider();
    await expect(getRoute(input)).resolves.toEqual({ kind: "unavailable" });
  });
});
