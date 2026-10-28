import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type { PublicLocation } from "../destination/public-destination-list";
import { PerspectiveCamera, Vector3 } from "three";
import { terrainCameraFrame, terrainFramePadding, createTerrainSelection, terrainDefaults, terrainDistrict, terrainPlaces, terrainRings, withinTerrain, type TerrainData, type TerrainFeature } from "./terrain-model";

const square: TerrainFeature = { type: "Feature", properties: { name: "Test district" }, geometry: { type: "Polygon", coordinates: [[[104, 22], [106, 22], [106, 24], [104, 24], [104, 22]], [[104.1, 22.1], [104.2, 22.1], [104.2, 22.2], [104.1, 22.2], [104.1, 22.1]]] } };
const data: TerrainData = { bbox: [104, 22, 106, 24], size: 2, province: square, districts: [square], roads: [], rivers: [], roadLabels: [], places: [
  { id: "osm-place", name: "Dinh thự họ Vương", coordinate: [105, 23], area: "Test district", type: "castle" },
] };
const article = (patch: Partial<PublicLocation> = {}): PublicLocation => ({ id: "public-article", name: "Dinh họ Vương", area: "Test district", category: "Di tích", latitude: 23, longitude: 105, ...patch });

it("preserves holes, multipolygons and the province boundary", () => {
  expect(withinTerrain([105, 23], square)).toBe(true);
  expect(withinTerrain([104.15, 22.15], square)).toBe(false);
  expect(terrainDistrict([107, 23], data)).toBe(-1);
  const multi: TerrainFeature = { ...square, geometry: { type: "MultiPolygon", coordinates: [square.geometry.type === "Polygon" ? square.geometry.coordinates : []] } };
  expect(withinTerrain([105, 23], multi)).toBe(true);
});
it("only attaches an article returned by the current public query; hiding it removes the link", () => {
  expect(terrainPlaces(data, [article()])[0]?.destination?.id).toBe("public-article");
  expect(terrainPlaces(data, [])[0]?.destination).toBeUndefined();
  expect(terrainPlaces(data, [article({ name: "Unrelated nearest monument" })])[0]?.destination).toBeUndefined();
});
it("never guesses among duplicate titles or imports invalid/outside public coordinates", () => {
  const result = terrainPlaces(data, [article(), article({ id: "another" }), article({ id: "invalid", latitude: null }), article({ id: "outside", longitude: 109 })]);
  expect(result[0]?.destination).toBeUndefined();
  expect(result.slice(1).map(p => p.destination?.id)).toEqual(["public-article", "another"]);
});
it("includes unmatched public articles as their own pins and retains their real IDs", () => {
  const result = terrainPlaces(data, [article({ id: "id-with_underscore", name: "New public destination" })]);
  expect(result[1]?.destination?.id).toBe("id-with_underscore");
  expect(result[1]?.coordinate).toEqual([105, 23]);
});
it("ships all preview roads and measured landmarks without static CMS links or secrets", async () => {
  const bytes = await readFile(new URL("../../../public/terrain/ha-giang/landscape.json", import.meta.url), "utf8");
  const asset: TerrainData = JSON.parse(bytes);
  const dem = await readFile(new URL("../../../public/terrain/ha-giang/dem.bin", import.meta.url));
  expect(asset.roads).toHaveLength(417);
  expect(asset.roads.reduce((sum, road) => sum + road.coordinates.length, 0)).toBe(31933);
  expect(asset.places).toHaveLength(14); expect(asset.districts).toHaveLength(11);
  expect(asset.roadLabels.map(label => label.ref)).toEqual(expect.arrayContaining(["QL.2", "QL.4C", "QL.34"]));
  expect(dem.byteLength).toBe(asset.size ** 2 * 4);
  expect(bytes).not.toMatch(/localhost|cloudinary|test_planner|sourceUrl|destinationId|api_key/i);
  expect(terrainDefaults).toEqual({ view: "top", relief: 2.2, rotate: true });
});

it("fills the usable frame with the real province through every rotation, including phone and raised 3D views", async () => {
  const asset: TerrainData = JSON.parse(await readFile(new URL("../../../public/terrain/ha-giang/landscape.json", import.meta.url), "utf8"));
  const [west, south, east, north] = asset.bbox;
  const worldWidth = (east - west) * 111.32 * Math.cos((south + north) / 2 * Math.PI / 180) * .065;
  const depth = (north - south) * 111.32 * .065;
  const outline = terrainRings(asset.province).flatMap(polygon => polygon[0]!.map(([lon, lat]) =>
    new Vector3((lon - west) / (east - west) * worldWidth - worldWidth / 2, 0, (north - lat) / (north - south) * depth - depth / 2)));
  // An elevation envelope also covers interior peaks and the full district lift.
  const dem = await readFile(new URL("../../../public/terrain/ha-giang/dem.bin", import.meta.url));
  let maximum = 0;
  for (let i = 0; i < dem.byteLength; i += 4) maximum = Math.max(maximum, dem.readFloatLE(i));
  const ceiling = .035 + maximum / 1000 * .22 * terrainDefaults.relief + .3 - .45;
  const points = outline.flatMap(p => [new Vector3(p.x, -.5, p.z), new Vector3(p.x, ceiling, p.z)]);
  for (const [width, height] of [[1000, 640], [590, 580], [500, 460], [680, 520], [366, 500], [340, 440], [320, 410]]) {
    const fov = width! / height! < 1 ? 48 : 40;
    const camera = new PerspectiveCamera(fov, width! / height!, .1, 100);
    const padding = terrainFramePadding(width!);
    const limitX = 1 - 2 * padding.x / width!, limitTop = 1 - 2 * padding.top / height!, limitBottom = 1 - 2 * padding.bottom / height!;
    const centerY = (padding.bottom - padding.top) / height!, limitY = 1 - (padding.top + padding.bottom) / height!;
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 24) {
      for (const pitch of [.018, .8, 1.3]) {
        const direction = new Vector3(Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw));
        const fit = terrainCameraFrame(points, direction, width!, height!, fov);
        camera.setViewOffset(width!, height!, fit.offsetX, fit.offsetY, width!, height!);
        camera.position.copy(direction).multiplyScalar(fit.distance);
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
        let occupied = 0, maxX = 0, maxY = -Infinity, minY = Infinity;
        for (const vertex of points) {
          const point = vertex.clone().project(camera);
          maxX = Math.max(maxX, Math.abs(point.x)); maxY = Math.max(maxY, point.y); minY = Math.min(minY, point.y);
          occupied = Math.max(occupied, Math.abs(point.x) / limitX, Math.abs(point.y - centerY) / limitY);
        }
        expect(maxX).toBeLessThanOrEqual(limitX);
        expect(maxY).toBeLessThanOrEqual(limitTop);
        expect(minY).toBeGreaterThanOrEqual(-limitBottom);
        // Containment alone allowed the old undersized sphere fit to pass.
        expect(occupied).toBeGreaterThan(.94);
      }
    }
    if (width! <= 366) {
      const direction = new Vector3(0, 1, .018).normalize();
      const fit = terrainCameraFrame(points, direction, width!, height!, fov);
      camera.setViewOffset(width!, height!, fit.offsetX, fit.offsetY, width!, height!);
      camera.position.copy(direction).multiplyScalar(fit.distance); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const projected = outline.map(p => p.clone().project(camera));
      const occupiedWidth = (Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x))) / 2 * width!;
      // Flat outline proxy sits behind the highest lifted elevation envelope.
      expect(occupiedWidth).toBeGreaterThan(width! * .79);
    }
  }
});

it("starts without destination disclosure and only activates the pointed district", () => {
  const changes: number[] = [], selection = createTerrainSelection(district => changes.push(district));
  expect(selection.district).toBe(-1);
  selection.activate(2, "pointer"); selection.activate(3, "pointer"); selection.leave();
  expect(changes).toEqual([2, 3, -1]);
});
it("keeps touch/keyboard disclosure usable without hover and clears it on blank tap, blur or rotation", () => {
  const selection = createTerrainSelection(() => {});
  selection.activate(2, "touch"); selection.leave(); selection.blur();
  expect(selection.district).toBe(2);
  selection.activate(-1, "touch"); expect(selection.input).toBeNull();
  selection.activate(4, "keyboard"); selection.leave(); expect(selection.district).toBe(4);
  selection.blur(); expect(selection.district).toBe(-1);
  selection.activate(3, "touch"); selection.reset(); expect(selection.district).toBe(-1);
});
it("retains the preview's region and return-focus target until the preview closes", () => {
  const selection = createTerrainSelection(() => {});
  selection.activate(3, "pointer"); selection.preview(true);
  selection.leave(); selection.blur(); selection.activate(6, "pointer");
  expect(selection.district).toBe(3);
  selection.preview(false); selection.activate(3, "keyboard"); selection.leave();
  expect(selection.district).toBe(3);
  selection.blur(); expect(selection.district).toBe(-1);
});
