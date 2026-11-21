import "server-only";

import type { Database } from "@KLTN/db";
import {
  openingDayFromMinuteIntervals,
  type EditCatalogDestinationMeta,
} from "./add-visit-helper";

export async function loadPublicCatalogMeta(
  database: Pick<Database, "destination">,
): Promise<Record<string, EditCatalogDestinationMeta>> {
  const rows = await database.destination.findMany({
    where: {
      visibility: "VISIBLE",
      deletedAt: null,
    },
    select: {
      id: true,
      suggestedDurationMinutes: true,
      minimumDurationMinutes: true,
      isOutdoor: true,
      openingDays: {
        select: {
          dayOfWeek: true,
          status: true,
          intervals: {
            select: {
              opensAtMinute: true,
              closesAtMinute: true,
            },
            orderBy: { opensAtMinute: "asc" },
          },
        },
      },
    },
  });

  const result: Record<string, EditCatalogDestinationMeta> = {};
  for (const row of rows) {
    result[row.id] = {
      suggestedDurationMinutes: row.suggestedDurationMinutes,
      minimumDurationMinutes: row.minimumDurationMinutes,
      isOutdoor: row.isOutdoor,
      openingDays: row.openingDays.map((day) =>
        openingDayFromMinuteIntervals({
          dayOfWeek: day.dayOfWeek,
          status: day.status,
          intervals: day.intervals,
        }),
      ),
    };
  }
  return result;
}
