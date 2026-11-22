import type { Database } from "@KLTN/db";
import { nearbyActivitySuggestions, type ActivityAnchor } from "../tripsage-chat/tripsage-activities";
import type { PlacesSearch } from "../tripsage-chat/tripsage-places";
import { isExternalPlaceId } from "./edit-unchecked";

export type OvernightDaySnapshot = {
  dayIndex: number;
  visits: readonly { destinationId: string; order: number }[];
};

function lastStopIdOf(day: OvernightDaySnapshot | undefined): string | null {
  if (!day || day.visits.length === 0) return null;
  const sorted = [...day.visits].sort((a, b) => a.order - b.order);
  return sorted.at(-1)?.destinationId ?? null;
}

/**
 * PARITY AC-8: returns night indices (Days 1..N-1) whose last stop changed between
 * the original trip and the applied edit candidate.
 */
export function changedOvernightDays(
  beforeDays: readonly OvernightDaySnapshot[],
  afterDays: readonly OvernightDaySnapshot[],
): number[] {
  const totalDays = afterDays.length;
  const beforeByDay = new Map(beforeDays.map((day) => [day.dayIndex, day] as const));
  const changed: number[] = [];
  for (const day of afterDays) {
    if (day.dayIndex >= totalDays) continue;
    const prevLast = lastStopIdOf(beforeByDay.get(day.dayIndex));
    const nextLast = lastStopIdOf(day);
    if (prevLast !== nextLast) changed.push(day.dayIndex);
  }
  return changed;
}

/**
 * Best-effort refresh of persisted `EVENING` nearby suggestions for nights whose last stop changed
 * during trip edit (PARITY AC-8). Never alters Constraint Validator results, visit times, or throws
 * back to fail a committed edit.
 */
export async function refreshTripEveningSuggestions(input: {
  database: Pick<Database, "tripNearbySuggestion" | "destination" | "externalPlace">;
  tripId: string;
  beforeDays: readonly OvernightDaySnapshot[];
  afterDays: readonly OvernightDaySnapshot[];
  places?: PlacesSearch;
  now?: () => number;
}): Promise<{ refreshedDays: number[]; insertedCount: number }> {
  const changed = changedOvernightDays(input.beforeDays, input.afterDays);
  if (changed.length === 0) return { refreshedDays: [], insertedCount: 0 };

  const afterByDay = new Map(input.afterDays.map((day) => [day.dayIndex, day] as const));
  const lastIds = new Map<number, string>();
  const catalogIds = new Set<string>();
  const externalProviderIds = new Set<string>();

  for (const dayIndex of changed) {
    const lastId = lastStopIdOf(afterByDay.get(dayIndex));
    if (!lastId) continue;
    lastIds.set(dayIndex, lastId);
    if (isExternalPlaceId(lastId)) {
      externalProviderIds.add(lastId.replace(/^ext:/u, ""));
    } else {
      catalogIds.add(lastId);
    }
  }

  const coordsById = new Map<string, { name: string; latitude: number; longitude: number }>();
  if (catalogIds.size > 0 && typeof input.database.destination?.findMany === "function") {
    const destinations = await input.database.destination.findMany({
      where: { id: { in: [...catalogIds] } },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    for (const dest of destinations) {
      if (typeof dest.latitude === "number" && typeof dest.longitude === "number") {
        coordsById.set(dest.id, { name: dest.name, latitude: dest.latitude, longitude: dest.longitude });
      }
    }
  }
  if (externalProviderIds.size > 0 && typeof input.database.externalPlace?.findMany === "function") {
    const externals = await input.database.externalPlace.findMany({
      where: { providerPlaceId: { in: [...externalProviderIds] } },
      select: { providerPlaceId: true, name: true, latitude: true, longitude: true },
    });
    for (const ext of externals) {
      if (typeof ext.latitude === "number" && typeof ext.longitude === "number") {
        coordsById.set(`ext:${ext.providerPlaceId}`, {
          name: ext.name ?? "",
          latitude: ext.latitude,
          longitude: ext.longitude,
        });
      }
    }
  }

  // Clear stale EVENING rows for changed days even if Places is unavailable or returns 0 results.
  if (typeof input.database.tripNearbySuggestion?.deleteMany === "function") {
    await input.database.tripNearbySuggestion.deleteMany({
      where: { tripId: input.tripId, kind: "EVENING", dayIndex: { in: changed } },
    });
  }

  if (!input.places) return { refreshedDays: changed, insertedCount: 0 };

  const anchors: ActivityAnchor[] = [];
  const stopNames: string[] = [];
  for (const [dayIndex, destId] of lastIds.entries()) {
    const info = coordsById.get(destId);
    if (!info) continue;
    if (info.name) stopNames.push(info.name);
    anchors.push({
      slotId: `d${dayIndex}-overnight`,
      kind: "EVENING",
      latitude: info.latitude,
      longitude: info.longitude,
    });
  }
  if (anchors.length === 0) return { refreshedDays: changed, insertedCount: 0 };

  const found = await nearbyActivitySuggestions({
    places: input.places,
    anchors,
    stopNames,
    now: input.now,
  });

  const rows = found.flatMap((suggestion, idx) => {
    const match = /^d(\d+)-overnight$/u.exec(suggestion.slotId);
    if (!match || !suggestion.place?.placeId) return [];
    return [{
      tripId: input.tripId,
      dayIndex: Number(match[1]),
      slot: "overnight",
      kind: "EVENING",
      placeId: suggestion.place.placeId,
      name: suggestion.title.slice(0, 80),
      distanceKm: suggestion.place.distanceKm,
      sortOrder: idx,
    }];
  });

  if (rows.length > 0 && typeof input.database.tripNearbySuggestion?.createMany === "function") {
    await input.database.tripNearbySuggestion.createMany({ data: rows });
  }

  return { refreshedDays: changed, insertedCount: rows.length };
}
