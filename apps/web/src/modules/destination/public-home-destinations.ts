import type { Database } from "@KLTN/db";
import { visibleDestinationWhere } from "./destination-eligibility";
import { publicLocationSelect, projectPublicLocationRows } from "./public-destination-list";
import { publicLocationSchema } from "./public-destination-query";

/** Request-fresh public Home read; no filter-options or second prose lookup.
 * No cross-request cache: CMS visibility/media changes apply on the next read. */
export async function listPublicHomeDestinations(database: Pick<Database, "destination">) {
  const rows = await database.destination.findMany({
    where: visibleDestinationWhere,
    select: { ...publicLocationSelect, description: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const destinations = publicLocationSchema.array().parse(projectPublicLocationRows(rows));
  const descriptions: Record<string, string> = {};
  for (const row of rows) {
    const text = row.description.trim().replace(/\s+/g, " ");
    if (text) descriptions[row.id] = text.length > 130 ? `${text.slice(0, 127)}...` : text;
  }
  return { destinations, descriptions };
}
