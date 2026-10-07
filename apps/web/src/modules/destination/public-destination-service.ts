import { visibleCultureWhere, publicCultureSelect } from "../culture/culture-eligibility";
import type { Database, Prisma } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { fromMinute } from "./destination-contract";
import { visibleDestinationWhere } from "./destination-eligibility";
import { validateDestinationId } from "./destination-service";
import { publicDestinationDetailSchema } from "./public-destination-contract";

export const publicDestinationSelect = {
  id: true, name: true, description: true, area: true, category: true,
  latitude: true, longitude: true, suggestedDurationMinutes: true,
  cultureLinks: { where: { culture: visibleCultureWhere }, take: 20, orderBy: { cultureId: "asc" }, select: { culture: { select: publicCultureSelect } } },
  openingDays: { select: { dayOfWeek: true, status: true, intervals: {
    select: { opensAtMinute: true, closesAtMinute: true }, orderBy: { opensAtMinute: "asc" },
  } } },
} satisfies Prisma.DestinationSelect;

/** Public semantics for every role. Hidden detail never leaves persistence. */
export async function getPublicDestination(id: string, database: Pick<Database, "destination">) {
  validateDestinationId(id);
  const row = await database.destination.findUnique({ where: { id, ...visibleDestinationWhere }, select: publicDestinationSelect });
  if (!row) {
    const exists = await database.destination.findUnique({ where: { id }, select: { id: true } });
    if (exists) throw new AppError("DESTINATION_UNAVAILABLE", "Điểm đến không còn khả dụng", 410);
    throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến", 404);
  }
  return publicDestinationDetailSchema.parse({
    id: row.id, name: row.name, description: row.description, area: row.area, category: row.category,
    latitude: row.latitude, longitude: row.longitude, suggestedDurationMinutes: row.suggestedDurationMinutes,
    openingDays: row.openingDays.map(day => ({ dayOfWeek: day.dayOfWeek, status: day.status,
      intervals: day.intervals.map(interval => ({ opensAt: fromMinute(interval.opensAtMinute), closesAt: fromMinute(interval.closesAtMinute) })),
    })),
    relatedCulture: row.cultureLinks.map(({ culture }) => ({ id: culture.id, title: culture.title, excerpt: culture.content.replace(/\s+/g, " ").trim().slice(0, 280), sourceTitle: culture.sourceTitle, sourceUrl: culture.sourceUrl })),
  });
}
