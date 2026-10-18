import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Source contract like US27-FE-NOSUBST. Audit production TS/TSX only, never its own
// negative fixtures/spies. This is a conservative source guard, not runtime taint analysis.
function productionFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return /\.tsx?$/u.test(entry.name) && !/\.(?:test|spec)\.[^.]+$/u.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

const roots = ["src/modules/in-trip", "src/components/in-trip", "src/app/trips/[id]/in-trip"];
const files = roots.flatMap(root => productionFiles(resolve(process.cwd(), root))).sort();
const guards = [
  { name: "browser storage", pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/u, example: 'window["localStorage"].setItem("position", JSON.stringify(coordinates))' },
  { name: "cookies", pattern: /\b(?:cookie|cookies|cookieStore)\b/iu, example: 'document.cookie = "position=" + latitude' },
  { name: "URL/navigation sinks", pattern: /\b(?:URL|URLSearchParams)\s*\(|\b(?:history|router)\s*(?:\?*\.|\[)|\b(?:window|document|globalThis)\s*(?:\.\s*location\b|\[\s*["']location["'])|\blocation\s*(?:\.\s*(?:href|search|hash|pathname|assign|replace)\b|\[\s*["'](?:href|search|hash|pathname|assign|replace)["'])|\b(?:href|searchParams)\s*=/u, example: 'history.replaceState(null, "", "?lat=" + latitude)' },
  { name: "coordinate logging", pattern: /\b(?:console|logger)\s*(?:\?*\.|\[)|\b(?:log|debug|info|warn|error)\s*\(\s*(?:coordinates|latitude|longitude|location)\b/u, example: 'console.warn({ latitude, longitude })' },
  { name: "continuous GPS", pattern: /\bwatchPosition\b/u, example: 'navigator.geolocation.watchPosition(onPosition)' },
] as const;

describe("US35 location privacy source contract", () => {
  it("includes all current production helpers and picker without scanning tests", () => {
    const paths = files.map(file => relative(process.cwd(), file).replaceAll("\\", "/"));
    expect(paths).toEqual(expect.arrayContaining([
      "src/modules/in-trip/browser-location.ts", "src/modules/in-trip/location-flow.ts",
      "src/modules/in-trip/in-trip-location.ts", "src/modules/in-trip/manual-location-picker.ts",
      "src/components/in-trip/manual-location-picker.tsx",
    ]));
    expect(paths.every(path => !path.includes(".test."))).toBe(true);
  });

  for (const guard of guards) {
    it(`does not introduce ${guard.name} in in-trip production files`, () => {
      for (const file of files) expect(readFileSync(file, "utf8"), relative(process.cwd(), file)).not.toMatch(guard.pattern);
    });

    it(`recognizes a forbidden ${guard.name} source example`, () => {
      expect(guard.example).toMatch(guard.pattern);
    });
  }

  it("allows location data fields while detecting common global/bracket URL sinks", () => {
    const guard = guards.find(item => item.name === "URL/navigation sinks")!;
    expect("roundCoordinate(location.latitude); location.longitude").not.toMatch(guard.pattern);
    for (const text of [
      'new URLSearchParams({ lat: latitude })', 'new URL("?lat=" + latitude)',
      'window.location = coordinates', 'window["location"].search = latitude',
      'location.href = latitude', 'location["hash"] = longitude',
      'router.push("?lat=" + latitude)', '<a href={latitude} />',
    ]) expect(text).toMatch(guard.pattern);
  });
});
