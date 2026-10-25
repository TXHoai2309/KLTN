import { describe, expect, it, vi } from "vitest";
import { plannerRouteGeometry, MAX_PLANNER_ROUTE_POINTS } from "./planner-route-geometry";
import { createStadiaRoutesProvider } from "./planner-routes";
import { travelLegSchema } from "./planner-contract";
import { candidate } from "./__fixtures__/planner-fixtures";

function polyline6(points: [number, number][]): string {
  let lat = 0, lon = 0, shape = "";
  const encode = (difference: number) => {
    let value = difference < 0 ? ~(difference << 1) : difference << 1;
    while (value >= 32) { shape += String.fromCharCode((32 | (value & 31)) + 63); value >>>= 5; }
    shape += String.fromCharCode(value + 63);
  };
  for (const [x, y] of points) { const nextLat = Math.round(y * 1e6), nextLon = Math.round(x * 1e6); encode(nextLat - lat); encode(nextLon - lon); lat = nextLat; lon = nextLon; }
  return shape;
}

describe("planner public route geometry", () => {
  it("returns only normalized geometry from the same single routing call", async () => {
    const coordinates: [number, number][] = [[105.01, 23.01], [105.05, 23.02], [105.02, 23.02]];
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ trip: { summary: { time: 120, length: 5 }, legs: [{ shape: polyline6(coordinates), privateProviderField: "never-return" }] } }));
    const leg = await createStadiaRoutesProvider({ apiKey: () => "server-only-fixture", fetcher }).route({ from: candidate("a"), to: candidate("bb"), transport: "CAR" }, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(leg).toMatchObject({ status: "VERIFIED", durationSeconds: 120, distanceMeters: 5000, geometry: { type: "LineString", coordinates } });
    expect(JSON.stringify(leg)).not.toMatch(/shape|privateProviderField|never-return|server-only-fixture/);
  });

  it("keeps usable metrics when the provider has no usable shape", async () => {
    const route = createStadiaRoutesProvider({ apiKey: () => "fixture", fetcher: async () => Response.json({ trip: { summary: { time: 120, length: 5 }, legs: [{ shape: "invalid" }] } }) });
    const leg = await route.route({ from: candidate("a"), to: candidate("b"), transport: "MOTORCYCLE" }, new AbortController().signal);
    expect(leg.status).toBe("VERIFIED"); expect(leg.geometry).toBeUndefined();
  });

  it("bounds detailed routes, preserves endpoints and keeps payloads within the client limit", () => {
    const points: [number, number][] = Array.from({ length: 20000 }, (_, i) => [105 + i / 1e6, 23 + i / 1e6]);
    const geometry = plannerRouteGeometry({ type: "LineString", coordinates: points })!;
    expect(geometry.coordinates).toHaveLength(MAX_PLANNER_ROUTE_POINTS);
    expect(geometry.coordinates[0]).toEqual(points[0]); expect(geometry.coordinates.at(-1)).toEqual(points.at(-1));
    expect(Buffer.byteLength(JSON.stringify(Array.from({ length: 27 }, () => geometry)))).toBeLessThan(400 * 1024);
  });

  it("rejects invalid coordinates and cannot attach geometry to missing route evidence", () => {
    expect(plannerRouteGeometry({ type: "LineString", coordinates: [[105, 23], [Infinity, 24]] })).toBeUndefined();
    expect(travelLegSchema.safeParse({ fromDestinationId: "a", toDestinationId: "b", status: "INSUFFICIENT_DATA", reason: "NO_ROUTE", durationSeconds: null, distanceMeters: null, provider: null, geometry: { type: "LineString", coordinates: [[105, 23], [106, 24]] } }).success).toBe(false);
  });
});
