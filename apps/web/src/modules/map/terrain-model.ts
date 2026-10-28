import type { PublicLocation } from "../destination/public-destination-list";

export type Coordinate = [number, number];
export type TerrainFeature = {
  type: "Feature";
  properties: { name?: string; color?: string; [key: string]: unknown };
  geometry: { type: "Polygon"; coordinates: Coordinate[][] } | { type: "MultiPolygon"; coordinates: Coordinate[][][] };
};
export type TerrainPlace = { id: string; name: string; coordinate: Coordinate; area: string; type: string; destination?: PublicLocation };
export type TerrainData = {
  bbox: [number, number, number, number]; size: number;
  province: TerrainFeature; districts: TerrainFeature[];
  roads: { kind: string; coordinates: Coordinate[] }[];
  rivers: { coordinates: Coordinate[] }[];
  roadLabels: { ref: string; coordinate: Coordinate }[];
  places: TerrainPlace[];
};
export const terrainDefaults = { view: "top", relief: 2.2, rotate: true } as const;
export type TerrainFitPoint = { x: number; y: number; z: number };
export const terrainFramePadding = (_width: number) => ({ x: 20, top: 20, bottom: 20 });

/** Fit the actual terrain in the current camera direction. Refit as it turns:
 * a portrait phone must not reserve the width of a future horizontal rotation. */
export function terrainCameraFrame(points: readonly TerrainFitPoint[], direction: TerrainFitPoint, viewportWidth: number, viewportHeight: number, fovDegrees: number) {
  const aspect = viewportWidth / Math.max(1, viewportHeight);
  const tangent = Math.tan(fovDegrees * Math.PI / 360);
  const padding = terrainFramePadding(viewportWidth);
  const limitX = Math.max(.25, 1 - 2 * padding.x / Math.max(1, viewportWidth));
  const limitY = Math.max(.25, 1 - (padding.top + padding.bottom) / Math.max(1, viewportHeight));
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const nx = direction.x / length, ny = direction.y / length, nz = direction.z / length;
  const horizontal = Math.hypot(nx, nz);
  const rx = horizontal > 1e-6 ? nz / horizontal : 1, rz = horizontal > 1e-6 ? -nx / horizontal : 0;
  const ux = ny * rz, uy = nz * rx - nx * rz, uz = -ny * rx;
  const projected = new Float64Array(points.length * 3);
  let distance = 1, nearest = 1;
  let index = 0;
  for (const point of points) {
    const x = point.x * rx + point.z * rz;
    const y = point.x * ux + point.y * uy + point.z * uz;
    const depth = point.x * nx + point.y * ny + point.z * nz;
    projected[index++] = x; projected[index++] = y; projected[index++] = depth;
    nearest = Math.max(nearest, depth + .2);
    distance = Math.max(distance, depth + .2, depth + Math.abs(x) / (tangent * aspect * limitX),
      depth + Math.abs(y) / (tangent * limitY));
  }
  function bounds(at: number) {
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (let i = 0; i < projected.length; i += 3) {
      const depth = at - projected[i + 2]!;
      const x = projected[i]! / (depth * tangent * aspect), y = projected[i + 1]! / (depth * tangent);
      left = Math.min(left, x); right = Math.max(right, x); bottom = Math.min(bottom, y); top = Math.max(top, y);
    }
    return { left, right, bottom, top };
  }
  // Fit the projected span, then center it: a diagonal, irregular province
  // need not be symmetrical around the geographic bounding-box center.
  for (let iteration = 0; iteration < 16; iteration++) {
    const middle = (nearest + distance) / 2, box = bounds(middle);
    if (box.right - box.left <= limitX * 2 && box.top - box.bottom <= limitY * 2) distance = middle;
    else nearest = middle;
  }
  distance *= 1.015;
  const box = bounds(distance);
  return { distance, offsetX: (box.left + box.right) * viewportWidth / 4,
    offsetY: (padding.bottom - padding.top) / 2 - (box.top + box.bottom) * viewportHeight / 4 };
}

/** Region disclosure survives the move from a raised surface to its pin label,
 * touch selection, and the preview/focus round trip. No pins open initially. */
export function createTerrainSelection(change: (district: number) => void) {
  let district = -1, input: "pointer" | "keyboard" | "touch" | null = null, preview = false;
  function set(next: number, source: typeof input) {
    input = next >= 0 ? source : null;
    if (district !== next) { district = next; change(district); }
  }
  return {
    get district() { return district; },
    get input() { return input; },
    activate(next: number, source: Exclude<typeof input, null>) { if (!preview || next === district) set(next, source); },
    leave() { if (!preview && input === "pointer") set(-1, null); },
    blur() { if (!preview && input === "keyboard") set(-1, null); },
    preview(value: boolean) { preview = value; },
    reset() { preview = false; set(-1, null); },
  };
}
export const terrainRings = (feature: TerrainFeature): Coordinate[][][] => feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;

function inRing(point: Coordinate, ring: Coordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function withinTerrain(point: Coordinate, feature: TerrainFeature) {
  return terrainRings(feature).some(polygon => inRing(point, polygon[0]!) && !polygon.slice(1).some(hole => inRing(point, hole)));
}
export function terrainDistrict(point: Coordinate, data: TerrainData) {
  if (!withinTerrain(point, data.province)) return -1;
  return data.districts.findIndex(feature => withinTerrain(point, feature));
}

const normalizeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const aliases: Record<string, string> = {
  "dinh vua meo": "dinh ho vuong", "dinh thu ho vuong": "dinh ho vuong", "nha vuong": "dinh ho vuong",
  "ma pi leng pass": "deo ma pi leng", "cong troi heaven gate": "cong troi quan ba",
};
const articleName = (name: string) => { const normalized = normalizeName(name); return aliases[normalized] ?? normalized; };

/** Article links come exclusively from this request's public Home DTO. Never
 * guess a detail ID from OSM IDs, nearest coordinates or static content snapshots. */
export function terrainPlaces(data: TerrainData, destinations: readonly PublicLocation[]): TerrainPlace[] {
  const eligible = destinations.filter(destination => Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude)
    && destination.latitude !== null && destination.longitude !== null && withinTerrain([destination.longitude, destination.latitude], data.province));
  const used = new Set<string>();
  const places = data.places.map(place => {
    const matches = eligible.filter(destination => articleName(destination.name) === articleName(place.name));
    if (matches.length !== 1) return { ...place, destination: undefined };
    const destination = matches[0]!; used.add(destination.id);
    return { ...place, destination };
  });
  for (const destination of eligible) {
    if (used.has(destination.id)) continue;
    const coordinate: Coordinate = [destination.longitude!, destination.latitude!];
    const district = terrainDistrict(coordinate, data);
    places.push({ id: `destination-${destination.id}`, name: destination.name, coordinate,
      area: data.districts[district]?.properties.name ?? destination.area, type: destination.category, destination });
  }
  return places;
}
