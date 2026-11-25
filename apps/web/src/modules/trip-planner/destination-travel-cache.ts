import type { Database } from "@KLTN/db";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";
import { calibrateWindingFactor, DEFAULT_WINDING_FACTOR } from "./planner-geography";

export type CachedTravelTime = {
  durationSeconds: number;
  distanceMeters: number;
  provider: string;
};

export type TravelTimeLookup = (
  fromId: string,
  toId: string,
  transport: TripTransport,
) => CachedTravelTime | null;

export type TravelTimeCacheBundle = {
  lookup: TravelTimeLookup;
  windingFactor: number;
};

export type RevisionableDestination = {
  id: string;
  revision?: string;
  contentRevision?: number;
  latitude: number;
  longitude: number;
};

export function destinationContentRevision(dest: { revision?: string; contentRevision?: number }): number {
  if (typeof dest.contentRevision === "number" && Number.isInteger(dest.contentRevision) && dest.contentRevision > 0) {
    return dest.contentRevision;
  }
  if (typeof dest.revision === "string") {
    const leading = Number.parseInt(dest.revision.split(":")[0] ?? "", 10);
    if (Number.isInteger(leading) && leading > 0) return leading;
  }
  return 1;
}

export function createTravelTimeMapLookup(
  entries: ReadonlyMap<string, CachedTravelTime>,
): TravelTimeLookup {
  return (fromId, toId, transport) => entries.get(`${fromId}:${toId}:${transport}`) ?? null;
}

export async function loadDestinationTravelTimeLookup(
  db: Database,
  destinations: readonly RevisionableDestination[],
  transport: TripTransport,
): Promise<TravelTimeCacheBundle> {
  const delegate = (db as unknown as {
    destinationTravelTime?: {
      findMany?: (args: unknown) => Promise<
        Array<{
          fromDestinationId: string;
          toDestinationId: string;
          transport: TripTransport;
          durationSeconds: number;
          distanceMeters: number;
          provider: string;
          fromRevision: number;
          toRevision: number;
        }>
      >;
    };
  })?.destinationTravelTime;

  if (!delegate || typeof delegate.findMany !== "function" || destinations.length < 2) {
    return { lookup: () => null, windingFactor: DEFAULT_WINDING_FACTOR };
  }

  const byId = new Map(destinations.map(d => [d.id, d]));
  const ids = [...byId.keys()];
  const rows = await delegate
    .findMany({
      where: {
        transport,
        fromDestinationId: { in: ids },
        toDestinationId: { in: ids },
      },
      select: {
        fromDestinationId: true,
        toDestinationId: true,
        transport: true,
        durationSeconds: true,
        distanceMeters: true,
        provider: true,
        fromRevision: true,
        toRevision: true,
      },
    })
    .catch(() => []);

  const entries = new Map<string, CachedTravelTime>();
  const samples: { from: RevisionableDestination; to: RevisionableDestination; distanceMeters: number }[] = [];
  for (const row of rows) {
    const from = byId.get(row.fromDestinationId);
    const to = byId.get(row.toDestinationId);
    if (!from || !to) continue;
    if (row.fromRevision !== destinationContentRevision(from)) continue;
    if (row.toRevision !== destinationContentRevision(to)) continue;
    if (!Number.isFinite(row.durationSeconds) || !Number.isFinite(row.distanceMeters)) continue;
    entries.set(`${row.fromDestinationId}:${row.toDestinationId}:${row.transport}`, {
      durationSeconds: row.durationSeconds,
      distanceMeters: row.distanceMeters,
      provider: row.provider,
    });
    samples.push({ from, to, distanceMeters: row.distanceMeters });
  }

  return {
    lookup: createTravelTimeMapLookup(entries),
    windingFactor: calibrateWindingFactor(samples, DEFAULT_WINDING_FACTOR),
  };
}
