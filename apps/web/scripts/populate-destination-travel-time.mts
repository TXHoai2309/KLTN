import "varlock/auto-load";
import { Pool } from "pg";
import { routingRegistry } from "../src/modules/destination/destination-routing-registry";
import { cappedDurationSeconds } from "../src/modules/trip-planner/planner-geography";
import type { TripTransport } from "../src/modules/trip-requirement/trip-requirement-contract";

const CONCURRENCY = 3;
const TRANSPORTS: readonly TripTransport[] = ["MOTORCYCLE", "CAR"];
const dryRun = process.argv.includes("--dry-run");

type DestRow = {
  id: string;
  name: string;
  area: string;
  category: string;
  latitude: number;
  longitude: number;
  contentRevision: number;
  updatedAt: Date;
};

type CachedKeyRow = {
  fromDestinationId: string;
  toDestinationId: string;
  transport: TripTransport;
  fromRevision: number;
  toRevision: number;
};

async function fetchStadiaRoute(args: {
  from: DestRow;
  to: DestRow;
  transport: TripTransport;
  apiKey: string;
}): Promise<{ status: "VERIFIED"; durationSeconds: number; distanceMeters: number } | { status: "ERROR" }> {
  const costing = args.transport === "CAR" ? "auto" : "motorcycle";
  const response = await fetch("https://api.stadiamaps.com/route/v1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Stadia-Auth ${args.apiKey}`,
    },
    body: JSON.stringify({
      locations: [
        { lat: args.from.latitude, lon: args.from.longitude, type: "break" },
        { lat: args.to.latitude, lon: args.to.longitude, type: "break" },
      ],
      costing,
      units: "kilometers",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return { status: "ERROR" };
  const payload = (await response.json()) as {
    trip?: { summary?: { time?: unknown; length?: unknown } };
  } | null;
  const time = payload?.trip?.summary?.time;
  const length = payload?.trip?.summary?.length;
  if (typeof time !== "number" || !Number.isFinite(time) || time < 0) return { status: "ERROR" };
  if (typeof length !== "number" || !Number.isFinite(length) || length < 0) return { status: "ERROR" };
  const distanceMeters = Math.round(length * 1000);
  const durationSeconds = cappedDurationSeconds(time, distanceMeters, args.transport);
  return { status: "VERIFIED", durationSeconds, distanceMeters };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!);
    }
  });
  await Promise.all(lanes);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL (run via npx varlock run -- ...).");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const registry = routingRegistry(databaseUrl);
  const excluded = new Set(registry.verified ? registry.excludedIds : []);

  try {
    const destResult = await pool.query<DestRow>(`
      SELECT id, name, area, category, latitude, longitude, "contentRevision", "updatedAt"
      FROM destination
      WHERE visibility = 'VISIBLE'
      ORDER BY id ASC
    `);
    const valid = destResult.rows.filter(
      row =>
        !excluded.has(row.id) &&
        Number.isFinite(row.latitude) &&
        Math.abs(row.latitude) <= 90 &&
        Number.isFinite(row.longitude) &&
        Math.abs(row.longitude) <= 180,
    );

    const existingResult = await pool.query<CachedKeyRow>(`
      SELECT "fromDestinationId", "toDestinationId", transport, "fromRevision", "toRevision"
      FROM destination_travel_time
    `);
    const existing = new Map<string, CachedKeyRow>();
    for (const row of existingResult.rows) {
      existing.set(`${row.fromDestinationId}:${row.toDestinationId}:${row.transport}`, row);
    }

    const todo: { from: DestRow; to: DestRow; transport: TripTransport }[] = [];
    let skipped = 0;

    for (const from of valid) {
      for (const to of valid) {
        if (from.id === to.id) continue;
        for (const transport of TRANSPORTS) {
          const hit = existing.get(`${from.id}:${to.id}:${transport}`);
          if (
            hit &&
            hit.fromRevision === from.contentRevision &&
            hit.toRevision === to.contentRevision
          ) {
            skipped += 1;
            continue;
          }
          todo.push({ from, to, transport });
        }
      }
    }

    const totalPairs = valid.length * Math.max(0, valid.length - 1) * TRANSPORTS.length;
    if (dryRun) {
      console.log(
        JSON.stringify({
          dryRun: true,
          host: new URL(databaseUrl).hostname,
          destinations: valid.length,
          totalPairs,
          toFetch: todo.length,
          skipped,
          loaded: 0,
          errors: 0,
        }),
      );
      return;
    }

    const apiKey = process.env.STADIA_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error("Missing STADIA_MAPS_API_KEY.");
    }

    let loaded = 0;
    let errors = 0;

    await runWithConcurrency(todo, CONCURRENCY, async item => {
      try {
        const leg = await fetchStadiaRoute({
          from: item.from,
          to: item.to,
          transport: item.transport,
          apiKey,
        });
        if (leg.status !== "VERIFIED") {
          errors += 1;
          return;
        }
        await pool.query(
          `
          INSERT INTO destination_travel_time (
            "fromDestinationId",
            "toDestinationId",
            transport,
            "durationSeconds",
            "distanceMeters",
            provider,
            "fromRevision",
            "toRevision",
            "computedAt"
          )
          VALUES ($1, $2, $3::"TripTransport", $4, $5, $6, $7, $8, NOW())
          ON CONFLICT ("fromDestinationId", "toDestinationId", transport)
          DO UPDATE SET
            "durationSeconds" = EXCLUDED."durationSeconds",
            "distanceMeters" = EXCLUDED."distanceMeters",
            provider = EXCLUDED.provider,
            "fromRevision" = EXCLUDED."fromRevision",
            "toRevision" = EXCLUDED."toRevision",
            "computedAt" = NOW()
          `,
          [
            item.from.id,
            item.to.id,
            item.transport,
            leg.durationSeconds,
            leg.distanceMeters,
            "STADIA_MAPS",
            item.from.contentRevision,
            item.to.contentRevision,
          ],
        );
        loaded += 1;
      } catch {
        errors += 1;
      }
    });

    console.log(
      JSON.stringify({
        dryRun: false,
        host: new URL(databaseUrl).hostname,
        destinations: valid.length,
        totalPairs,
        skipped,
        loaded,
        errors,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
