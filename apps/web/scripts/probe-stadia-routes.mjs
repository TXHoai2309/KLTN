// One-off US-29B live probe. Run from the repository root with:
// node --env-file=apps/web/.env apps/web/scripts/probe-stadia-routes.mjs
// Reads current Destination coordinates and prints no credentials or raw provider payloads.
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

const key = process.env.STADIA_MAPS_API_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!key || !databaseUrl) {
  console.error("Missing STADIA_MAPS_API_KEY or DATABASE_URL");
  process.exitCode = 1;
} else {
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT id, name, latitude, longitude, visibility, "locationVerified" AS verified
    FROM destination
    WHERE visibility = 'VISIBLE'
    ORDER BY "locationVerified" DESC, name ASC
  `;
  const valid = rows.filter(row => Number.isFinite(row.latitude) && Math.abs(row.latitude) <= 90
    && Number.isFinite(row.longitude) && Math.abs(row.longitude) <= 180);
  const wanted = [/lũng cú/iu, /dinh.*vương/iu, /mã pí lèng/iu, /đồng văn/iu];
  const chosen = [];
  for (const pattern of wanted) {
    const row = valid.find(item => pattern.test(item.name) && !chosen.includes(item));
    if (row) chosen.push(row);
  }
  for (const row of valid) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  if (chosen.length < 3) {
    const source = JSON.parse(await readFile(new URL("../../../docs/implementation/lung-cu-destination.payload.json", import.meta.url), "utf8"));
    if (Number.isFinite(source.latitude) && Number.isFinite(source.longitude)
      && !chosen.some(row => row.name === source.name)) {
      chosen.push({ name: source.name, latitude: source.latitude, longitude: source.longitude,
        visibility: "SOURCE_PAYLOAD", verified: false });
    }
  }
  if (chosen.length < 2) {
    console.error(`Only ${chosen.length} Destinations have usable coordinates; need at least 2`);
    process.exitCode = 1;
  } else {
    console.log("Dataset points:", chosen.map(({ name, latitude, longitude, visibility, verified }) => ({ name, latitude, longitude, visibility, verified })));
    const pairs = chosen.length >= 4 ? [[0, 1], [1, 2], [2, 3]] : chosen.length === 3 ? [[0, 1], [1, 2], [2, 0]] : [[0, 1], [1, 0]];
    for (const [from, to] of pairs) {
      const origin = chosen[from];
      const destination = chosen[to];
      for (const costing of ["auto", "motorcycle"]) {
        const started = performance.now();
        try {
          const response = await fetch("https://api.stadiamaps.com/route/v1", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Stadia-Auth ${key}` },
            body: JSON.stringify({ locations: [
              { lat: origin.latitude, lon: origin.longitude, type: "break" },
              { lat: destination.latitude, lon: destination.longitude, type: "break" },
            ], costing, units: "kilometers" }),
            signal: AbortSignal.timeout(10_000),
          });
          const payload = response.ok ? await response.json() : null;
          const summary = payload?.trip?.summary;
          console.log(JSON.stringify({ from: origin.name, to: destination.name, costing,
            httpStatus: response.status, routeFound: Number.isFinite(summary?.time),
            durationSeconds: Number.isFinite(summary?.time) ? summary.time : null,
            distanceKilometers: Number.isFinite(summary?.length) ? summary.length : null,
            geometry: Boolean(payload?.trip?.legs?.[0]?.shape), elapsedMs: Math.round(performance.now() - started),
          }));
        } catch (error) {
          console.log(JSON.stringify({ from: origin.name, to: destination.name, costing,
            error: error instanceof Error ? error.name : "unknown", elapsedMs: Math.round(performance.now() - started),
          }));
        }
      }
    }
  }
}
