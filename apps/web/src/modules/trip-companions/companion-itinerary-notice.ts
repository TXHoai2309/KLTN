import type { Prisma } from "@KLTN/db";
import type { EditCandidate } from "../trip-edit/edit-candidate";
import { companionSystemNoticeSchema } from "./companion-chat-contract";

export function companionItineraryChanges(before: EditCandidate, after: EditCandidate) {
  const destinations = (trip: EditCandidate) => trip.days.map(day => [day.dayIndex, day.visits.map(visit => [visit.order, visit.destinationId])]);
  const times = (trip: EditCandidate) => trip.days.map(day => [day.dayIndex, day.visits.map(visit => [visit.order, visit.startMinute, visit.plannedDurationMinutes])]);
  return {
    dates: before.startDate !== after.startDate || before.durationDays !== after.durationDays,
    destinations: JSON.stringify(destinations(before)) !== JSON.stringify(destinations(after)),
    times: JSON.stringify(times(before)) !== JSON.stringify(times(after)),
  };
}

/** Caller holds the authoritative Trip write lock. No external effects, one transaction. */
export async function recordCompanionItineraryChange(tx: Prisma.TransactionClient, tripId: string, before: EditCandidate, after: EditCandidate) {
  const changes = companionItineraryChanges(before, after);
  if (!changes.dates && !changes.destinations && !changes.times) return;
  const publication = await tx.tripCompanionPublication.findUnique({ where: { tripId }, select: { id: true } });
  if (!publication) return;
  await tx.$queryRaw`SELECT "id" FROM "trip_companion_publication" WHERE "id" = ${publication.id} FOR UPDATE`;
  const updated = await tx.tripCompanionPublication.update({ where: { id: publication.id }, data: { messageSequence: { increment: 1 }, itineraryRevision: { increment: 1 } }, select: { messageSequence: true, itineraryRevision: true } });
  const notice = companionSystemNoticeSchema.parse({ type: "ITINERARY_CHANGED", revision: updated.itineraryRevision.toString(), changes });
  const parts = [changes.dates ? "ngày đi" : null, changes.destinations ? "điểm đến" : null, changes.times ? "giờ/thời lượng" : null].filter(Boolean);
  await tx.tripCompanionMessage.create({ data: { publicationId: publication.id, sequence: updated.messageSequence, kind: "SYSTEM", authorId: null, text: `Chủ chuyến đã lưu thay đổi ${parts.join(", ")}. Mở lịch trình để xem bản mới nhất.`, notice } });
}
