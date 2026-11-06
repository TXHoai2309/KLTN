import "server-only";
import boundary from "./data/vietnam-adm0.json";

export const VIETNAM_COVERAGE = {
  id: "VNM-ADM0-46766057",
  revision: "geoBoundaries-9469f09",
  attribution: "geoBoundaries / William & Mary geoLab; source: geoBoundaries, Wikipedia",
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: "https://www.geoboundaries.org/api/current/gbOpen/VNM/ADM0/",
} as const;
type Point = readonly number[];
type Ring = readonly Point[];
type Polygon = readonly Ring[];

/** Boundary-adjacent coordinates are unresolved, never certified by a coarse polygon. */
function inRing(longitude: number, latitude: number, ring: Ring): "INSIDE" | "OUTSIDE" | "UNKNOWN" {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]!;
    const [bx, by] = ring[i]!;
    if (ax === undefined || ay === undefined || bx === undefined || by === undefined) return "UNKNOWN";
    const dx = bx - ax, dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((longitude - ax) * dx + (latitude - ay) * dy) / length));
    // ~100m uncertainty margin around this generalized source, including coastlines.
    if (Math.hypot(longitude - ax - t * dx, latitude - ay - t * dy) <= 0.001) return "UNKNOWN";
    if ((ay > latitude) !== (by > latitude) && longitude < (bx - ax) * (latitude - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? "INSIDE" : "OUTSIDE";
}

export function vietnamCoverageAt(coordinates: { latitude: number; longitude: number }): "SUPPORTED" | "OUTSIDE" | "UNKNOWN" {
  const { latitude, longitude } = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return "UNKNOWN";
  let uncertain = false;
  for (const feature of boundary.features) {
    if (feature.geometry.type !== "MultiPolygon") return "UNKNOWN";
    for (const polygon of feature.geometry.coordinates as Polygon[]) {
      if (!polygon[0]) return "UNKNOWN";
      const outer = inRing(longitude, latitude, polygon[0]);
      if (outer === "UNKNOWN") { uncertain = true; continue; }
      if (outer !== "INSIDE") continue;
      const holes = polygon.slice(1).map(ring => inRing(longitude, latitude, ring));
      if (holes.includes("UNKNOWN")) { uncertain = true; continue; }
      if (!holes.includes("INSIDE")) return "SUPPORTED";
    }
  }
  return uncertain ? "UNKNOWN" : "OUTSIDE";
}
