import type { db as defaultDb } from "@KLTN/db";
import { visibleDestinationWhere } from "./destination-eligibility";

export type PublicDestinationPlannerDuration = {
  suggestedDurationMinutes: number | null;
  minimumDurationMinutes: number | null;
};

/**
 * Reads the same duration fields used by the trip planner (`suggestedDurationMinutes` and
 * `minimumDurationMinutes`) on the server for visible destinations without altering the public API DTO.
 */
export async function readPublicDestinationPlannerDuration(
  id: string,
  database: typeof defaultDb,
): Promise<PublicDestinationPlannerDuration | null> {
  const delegate = (database as { destination?: { findFirst?: unknown } } | null | undefined)?.destination;
  if (!delegate || typeof delegate.findFirst !== "function") return null;
  try {
    const row = await database.destination.findFirst({
      where: { id, ...visibleDestinationWhere },
      select: { suggestedDurationMinutes: true, minimumDurationMinutes: true },
    });
    if (!row) return null;
    return {
      suggestedDurationMinutes: row.suggestedDurationMinutes ?? null,
      minimumDurationMinutes: row.minimumDurationMinutes ?? null,
    };
  } catch {
    return null;
  }
}
