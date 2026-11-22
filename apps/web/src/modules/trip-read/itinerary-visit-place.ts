import { AppError } from "../../server/http/app-error";

export type ItineraryVisitPlaceRef = { kind: "DESTINATION" | "EXTERNAL"; id: string };

/** An ItineraryVisit references exactly one of destinationId / externalPlaceId (DB CHECK mirrors this). */
export function itineraryVisitPlaceRef(visit: { destinationId: string | null; externalPlaceId: string | null }): ItineraryVisitPlaceRef {
  const destination = visit.destinationId || null;
  const external = visit.externalPlaceId || null;
  if (destination && external) throw new Error("ItineraryVisit references both a destination and an external place.");
  if (destination) return { kind: "DESTINATION", id: destination };
  if (external) return { kind: "EXTERNAL", id: external };
  throw new Error("ItineraryVisit references neither a destination nor an external place.");
}

type VisitLike = { destinationId?: string | null; destination?: unknown };
type DayLike = { visits: readonly VisitLike[] };
type NarrowVisit<V> = Omit<V, "destinationId" | "destination"> &
  (V extends { destinationId: unknown } ? { destinationId: string } : unknown) &
  (V extends { destination: infer D } ? { destination: NonNullable<D> } : unknown);
export type DestinationOnlyTrip<T extends { days: readonly DayLike[] }> = Omit<T, "days"> & {
  days: (Omit<T["days"][number], "visits"> & { visits: NarrowVisit<T["days"][number]["visits"][number]>[] })[];
};

/**
 * Destination-only readers (trip read/edit/in-trip/journey edit) are not yet defined for external places
 * (needs a product decision). They fail closed instead of mis-reading a null destination.
 */
export function requireDestinationVisits<T extends { days: readonly DayLike[] }>(trip: T): DestinationOnlyTrip<T> {
  for (const day of trip.days) for (const visit of day.visits) {
    if (visit.destinationId === null || ("destination" in visit && visit.destination == null)) {
      throw new AppError("EXTERNAL_PLACE_UNSUPPORTED", "Chuyến đi có địa điểm ngoài danh mục chưa được hỗ trợ ở thao tác này.", 501);
    }
  }
  return trip as unknown as DestinationOnlyTrip<T>;
}
