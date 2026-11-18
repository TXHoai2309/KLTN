import { getDestinationCoordinates } from "@/lib/destination-visuals";
import type { PlannerDay, PlannerStop, TravelLeg } from "../trip-planner/planner-contract";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { EditCandidate } from "./edit-candidate";
import type { EditPlaceDetail, PreviewLegMetric } from "./trip-edit-service";

export function editCandidateToPlannerDays(
  candidate: EditCandidate,
  placeDetails: Record<string, EditPlaceDetail>,
  previewLegs?: readonly PreviewLegMetric[],
): PlannerDay[] {
  let globalIndex = 0;
  const coordsByVisitId = new Map<string, { latitude: number; longitude: number }>();
  const legByPair = new Map<string, PreviewLegMetric>();
  for (const leg of previewLegs ?? []) {
    legByPair.set(`${leg.fromVisitId}->${leg.toVisitId}`, leg);
  }

  for (const day of candidate.days) {
    for (const visit of day.visits) {
      const place = placeDetails[visit.destinationId];
      if (place?.external && (place.latitude == null || place.longitude == null)) {
        continue;
      }
      coordsByVisitId.set(
        visit.visitId,
        getDestinationCoordinates(
          place?.name ?? "",
          place?.area ?? "",
          place?.latitude,
          place?.longitude,
          globalIndex++,
        ),
      );
    }
  }

  return candidate.days.map((day) => {
    let dayDistanceSum = 0;
    let dayTravelSum = 0;
    let allLegsHaveDistance = true;
    let allLegsHaveDuration = true;

    const stops: PlannerStop[] = day.visits.flatMap((visit, visitIndex) => {
      const coords = coordsByVisitId.get(visit.visitId);
      if (!coords) {
        allLegsHaveDistance = false;
        allLegsHaveDuration = false;
        return [];
      }
      const place = placeDetails[visit.destinationId];
      const prevVisit = visitIndex > 0 ? day.visits[visitIndex - 1] : undefined;
      const prevCoords = prevVisit ? coordsByVisitId.get(prevVisit.visitId) : undefined;
      const legMetric = prevVisit ? legByPair.get(`${prevVisit.visitId}->${visit.visitId}`) : undefined;
      let inbound: TravelLeg | null = null;
      if (prevVisit && prevCoords) {
        const durationSeconds = legMetric?.durationSeconds ?? (legMetric ? 0 : 1800);
        const distanceMeters = legMetric?.distanceMeters ?? (legMetric ? 0 : 15000);
        if (legMetric?.status === "VERIFIED" && legMetric.durationSeconds !== null) {
          dayTravelSum += legMetric.durationSeconds;
        } else {
          allLegsHaveDuration = false;
        }
        if (legMetric?.status === "VERIFIED" && legMetric.distanceMeters !== null) {
          dayDistanceSum += legMetric.distanceMeters;
        } else {
          allLegsHaveDistance = false;
        }
        inbound = {
          fromDestinationId: prevVisit.destinationId,
          toDestinationId: visit.destinationId,
          status: legMetric?.status ?? "VERIFIED",
          reason: null,
          durationSeconds,
          distanceMeters,
          provider: "STADIA_MAPS",
          geometry: legMetric?.geometry && legMetric.geometry.coordinates.length >= 2
            ? legMetric.geometry
            : {
                type: "LineString",
                coordinates: [
                  [prevCoords.longitude, prevCoords.latitude],
                  [coords.longitude, coords.latitude],
                ],
              },
        };
      }

      return [{
        order: visit.order,
        destination: {
          id: visit.destinationId,
          name: place?.name ?? "Điểm đến không còn khả dụng",
          description: "",
          area: place?.area ?? "",
          address: null,
          category: place?.category ?? "Điểm tham quan",
          latitude: coords.latitude,
          longitude: coords.longitude,
          image: place?.image
            ? { ...place.image, author: null, sourceUrl: null }
            : null,
        },
        arrivalMinute: visit.startMinute,
        departureMinute: visit.startMinute + visit.plannedDurationMinutes,
        visitDurationMinutes: visit.plannedDurationMinutes,
        scheduleState: "PLANNED",
        inbound,
        validationStatus: "PASS",
      }];
    });

    const hasLegs = day.visits.length > 1 && (previewLegs?.length ?? 0) > 0;
    return {
      day: day.dayIndex,
      date: tripDayDate(candidate.startDate, day.dayIndex),
      stops,
      distanceMeters: hasLegs && allLegsHaveDistance ? dayDistanceSum : null,
      travelSeconds: hasLegs && allLegsHaveDuration ? dayTravelSum : null,
    };
  });
}
