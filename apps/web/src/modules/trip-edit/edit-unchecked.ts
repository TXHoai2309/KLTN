import { EXTERNAL_PLACE_ID_PREFIX } from "../trip-planner/external-place-id";
import {
  sortUnchecked,
  type UncheckedAssessment,
  type UncheckedItem,
} from "../trip-save/unchecked-checks";
import type { TripValidation, ValidationFinding } from "../trip-validation/trip-validation";
import type { EditCandidate } from "./edit-candidate";

export function isExternalPlaceId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.startsWith(EXTERNAL_PLACE_ID_PREFIX);
}

export function stripExternalProviderPlaceId(id: string): string {
  return id.slice(EXTERNAL_PLACE_ID_PREFIX.length);
}

export function externalPlaceDestinationId(providerPlaceId: string): string {
  return `${EXTERNAL_PLACE_ID_PREFIX}${providerPlaceId}`;
}

/**
 * Classifies TripValidation outcome for manual/AI itinerary editing:
 * - Any VIOLATION => BLOCKED (never saveable)
 * - Missing required data on KLTN catalog stops, routes between catalog stops, or journey inputs => BLOCKED
 * - Missing openingHours / minimumDuration / travelTime solely attributable to kept ExternalPlace stops => UNCHECKED (saveable after explicit acknowledgement)
 * - All 4 groups SATISFIED => PASS
 */
export function assessEditUnchecked(
  validation: TripValidation,
  candidate: EditCandidate,
): UncheckedAssessment {
  const groups = [
    validation.groups.openingHours,
    validation.groups.minimumDuration,
    validation.groups.travelTime,
    validation.groups.scheduleConflict,
  ];
  if (groups.some((group) => group.status === "VIOLATION")) {
    return { kind: "BLOCKED" };
  }
  if (groups.every((group) => group.status === "SATISFIED")) {
    return { kind: "PASS" };
  }

  const visitDestMap = new Map<string, string>();
  for (const day of candidate.days) {
    for (const visit of day.visits) {
      visitDestMap.set(visit.visitId, visit.destinationId);
    }
  }

  const items: UncheckedItem[] = [];

  for (const [groupKey, group] of Object.entries(validation.groups) as [
    keyof TripValidation["groups"],
    { status: string; findings: ValidationFinding[] },
  ][]) {
    if (group.status === "SATISFIED") continue;
    if (groupKey === "scheduleConflict") return { kind: "BLOCKED" };
    if (!group.findings.length) return { kind: "BLOCKED" };

    for (const finding of group.findings) {
      if (finding.status === "VIOLATION") return { kind: "BLOCKED" };

      if (groupKey === "openingHours") {
        const destId = finding.affectedVisitId
          ? visitDestMap.get(finding.affectedVisitId)
          : undefined;
        if (finding.reasonCode !== "OPENING_HOURS_MISSING" || !isExternalPlaceId(destId)) {
          return { kind: "BLOCKED" };
        }
        items.push({
          check: "OPENING_HOURS",
          reasonCode: "OPENING_UNKNOWN",
          placeId: destId,
        });
        continue;
      }

      if (groupKey === "minimumDuration") {
        const destId = finding.affectedVisitId
          ? visitDestMap.get(finding.affectedVisitId)
          : undefined;
        if (finding.reasonCode !== "MINIMUM_DURATION_MISSING" || !isExternalPlaceId(destId)) {
          return { kind: "BLOCKED" };
        }
        items.push({
          check: "MINIMUM_DURATION",
          reasonCode: "MINIMUM_UNKNOWN",
          placeId: destId,
        });
        continue;
      }

      if (groupKey === "travelTime") {
        if (
          finding.reasonCode === "ROUTE_UNAVAILABLE" &&
          finding.fromVisitId &&
          finding.toVisitId
        ) {
          const fromDest = visitDestMap.get(finding.fromVisitId);
          const toDest = visitDestMap.get(finding.toVisitId);
          const externalDest = isExternalPlaceId(toDest)
            ? toDest
            : isExternalPlaceId(fromDest)
              ? fromDest
              : null;
          if (!externalDest) return { kind: "BLOCKED" };
          items.push({
            check: "TRAVEL_TIME",
            reasonCode: "ROUTE_UNKNOWN",
            placeId: externalDest,
          });
          continue;
        }

        if (
          (finding.reasonCode === "JOURNEY_OUTBOUND_ROUTE_UNKNOWN" ||
            finding.reasonCode === "JOURNEY_RETURN_ROUTE_UNKNOWN") &&
          finding.affectedVisitId
        ) {
          const destId = visitDestMap.get(finding.affectedVisitId);
          if (!isExternalPlaceId(destId)) return { kind: "BLOCKED" };
          items.push({
            check: "TRAVEL_TIME",
            reasonCode: "ROUTE_UNKNOWN",
            placeId: destId,
          });
          continue;
        }

        return { kind: "BLOCKED" };
      }
    }
  }

  return items.length > 0 ? { kind: "UNCHECKED", items: sortUnchecked(items) } : { kind: "BLOCKED" };
}
