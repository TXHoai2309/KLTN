import { z } from "zod";
import type { RouteGeometry } from "../map/map-model";

// Bound presentation payloads without changing provider time/distance evidence.
export const MAX_PLANNER_ROUTE_POINTS = 512;
export const plannerRouteGeometrySchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)])).min(2).max(MAX_PLANNER_ROUTE_POINTS),
}).strict();

export function plannerRouteGeometry(geometry: RouteGeometry | undefined): RouteGeometry | undefined {
  if (!geometry || geometry.type !== "LineString" || geometry.coordinates.length < 2 || geometry.coordinates.some(point => point.length !== 2 || !Number.isFinite(point[0]) || Math.abs(point[0]) > 180 || !Number.isFinite(point[1]) || Math.abs(point[1]) > 90)) return undefined;
  const count = Math.min(MAX_PLANNER_ROUTE_POINTS, geometry.coordinates.length);
  const coordinates: [number, number][] = Array.from({ length: count }, (_, index) => {
    const point = geometry.coordinates[Math.round(index * (geometry.coordinates.length - 1) / (count - 1))]!;
    return [Number(point[0].toFixed(6)), Number(point[1].toFixed(6))];
  });
  return { type: "LineString", coordinates };
}
