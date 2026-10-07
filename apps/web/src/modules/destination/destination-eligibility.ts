import type { Database, Prisma } from "@KLTN/db";

/** Shared boundary for public content and candidates for a NEW itinerary.
 * Historical references require their own unavailable-content presentation.
 */
export const visibleDestinationWhere = { visibility: "VISIBLE" } as const satisfies Prisma.DestinationWhereInput;

export function isDestinationPublic(destination: { visibility: string } | null | undefined): boolean {
  return destination?.visibility === visibleDestinationWhere.visibility;
}
export const isDestinationEligibleForNewItinerary = isDestinationPublic;

/** Persistence proof of existence + visibility for ID candidates; planner integration remains future work. */
export async function findEligibleDestinationIds(ids: readonly string[], database: Pick<Database, "destination">): Promise<string[]> {
  const rows = await database.destination.findMany({
    where: { ...visibleDestinationWhere, id: { in: [...ids] } }, select: { id: true },
  });
  return rows.map(row => row.id);
}
