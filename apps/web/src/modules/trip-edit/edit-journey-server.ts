import { fromMinute } from "../destination/destination-contract";
import { resolveOvernightAnchorTown } from "../../lib/overnight-anchor";
import { assertJourneyBeforeDeparture } from "../trip-origin/journey-cutoff";
import {
  journeyPlanSchema,
  type JourneyPlan,
  type JourneyRoute,
} from "../trip-origin/journey-route-contract";
import {
  journeyVisitFingerprint,
  savedJourneySchema,
  type SavedJourney,
} from "../trip-origin/journey-saved-contract";
import { afterVisitDriving, driveWithRest, REST_POLICY_VERSION } from "../trip-origin/rest-policy";
import {
  JOURNEY_MISSING_LABELS,
  missingJourneyFields,
  type TripJourney,
} from "../trip-origin/trip-origin-contract";
import { assertJourneyCoverage, assertJourneyReady } from "../trip-origin/trip-origin-service";
import { vietnamCoverageAt } from "../trip-origin/vietnam-coverage";
import { mapsProviderFromEnv } from "../map/maps-provider";
import type { TripValidation, ValidationAdvisory, ValidationFinding } from "../trip-validation/trip-validation";
import { hasJourneyChanged, type EditCandidate } from "./edit-candidate";
import type { PreviewJourneySummary } from "./edit-journey-helper";
import type {
  CanonicalDestination,
  PreviewLegMetric,
  TripEditRouteProvider,
} from "./trip-edit-service";

type EvaluateJourneyInput = {
  candidate: EditCandidate;
  existingJourneySnapshot: unknown;
  tripStartDate: Date;
  manuallyCompletedAt: Date | null;
  destinations: ReadonlyMap<string, CanonicalDestination>;
  hasUsableCoords?: ReadonlyMap<string, boolean>;
  legs: readonly PreviewLegMetric[];
  getRoute: TripEditRouteProvider;
  timeReference: Date;
  enforceReadyForSave?: boolean;
};

export type EvaluatedEditJourney = {
  extraFindings: ValidationFinding[];
  advisories?: ValidationAdvisory[];
  journeySummary?: PreviewJourneySummary;
  nextJourneySnapshot?: SavedJourney | null;
};

function unavailableRoute(reason: NonNullable<JourneyRoute["reason"]>): JourneyRoute {
  return {
    status: "INSUFFICIENT_DATA",
    reason,
    durationSeconds: null,
    distanceMeters: null,
    provider: null,
  };
}

export async function evaluateEditJourney(
  input: EvaluateJourneyInput,
): Promise<EvaluatedEditJourney> {
  const existingSnapshotParsed = savedJourneySchema.safeParse(input.existingJourneySnapshot);
  const existingJourney: TripJourney | null = existingSnapshotParsed.success
    ? existingSnapshotParsed.data.journey
    : null;

  const requestedJourney = input.candidate.journey;
  if (
    requestedJourney !== undefined &&
    hasJourneyChanged(existingJourney, requestedJourney)
  ) {
    assertJourneyBeforeDeparture(
      {
        startDate: input.tripStartDate,
        manuallyCompletedAt: input.manuallyCompletedAt,
        journeySnapshot: input.existingJourneySnapshot,
      },
      input.timeReference,
    );
  }

  const activeJourney = requestedJourney === undefined ? existingJourney : requestedJourney;
  if (!activeJourney) {
    return {
      extraFindings: [],
      ...(requestedJourney === null ? { nextJourneySnapshot: null } : {}),
    };
  }

  const lastDayEmpty = (input.candidate.days.at(-1)?.visits.length ?? 0) === 0;
  if (input.enforceReadyForSave) {
    assertJourneyReady(activeJourney, lastDayEmpty);
  }

  const extraFindings: ValidationFinding[] = [];
  const missing = missingJourneyFields(activeJourney, lastDayEmpty);
  if (missing.length > 0) {
    for (const field of missing) {
      extraFindings.push({
        group: "travelTime",
        status: "INSUFFICIENT_DATA",
        reasonCode: "JOURNEY_INPUT_MISSING",
        message: JOURNEY_MISSING_LABELS[field],
      });
    }
  }

  if (activeJourney.origin) {
    const coverage = vietnamCoverageAt(activeJourney.origin);
    if (coverage !== "SUPPORTED") {
      if (input.enforceReadyForSave) {
        assertJourneyCoverage(activeJourney);
      }
      extraFindings.push({
        group: "travelTime",
        status: coverage === "OUTSIDE" ? "VIOLATION" : "INSUFFICIENT_DATA",
        reasonCode: coverage === "OUTSIDE" ? "ORIGIN_OUTSIDE_VIETNAM" : "ORIGIN_COVERAGE_UNKNOWN",
        message:
          coverage === "OUTSIDE"
            ? "Nơi xuất phát phải thuộc phạm vi Việt Nam được hỗ trợ."
            : "Chưa xác định được phạm vi nơi xuất phát.",
      });
    }
  }

  const orderedVisits = input.candidate.days.flatMap((day) =>
    day.visits.map((visit) => ({ dayIndex: day.dayIndex, visit })),
  );
  const firstEntry = orderedVisits[0];
  const lastEntry = orderedVisits.at(-1);

  const originPoint = activeJourney.origin?.confirmed ? activeJourney.origin : null;
  if (!originPoint || !firstEntry || !lastEntry) {
    return {
      extraFindings,
      journeySummary: {
        outboundDurationSeconds: null,
        outboundDistanceMeters: null,
        outboundRestMinutes: 0,
        estimatedArrivalAtFirstMinute: null,
        firstVisitStartMinute: firstEntry?.visit.startMinute ?? null,
        returnDurationSeconds: null,
        returnDistanceMeters: null,
        returnRestMinutes: 0,
        estimatedReturnArrivalMinute: null,
        returnDeadlineMinute: activeJourney.returnDeadlineMinute,
      },
      nextJourneySnapshot: undefined,
    };
  }

  const firstDest = input.destinations.get(firstEntry.visit.destinationId);
  const lastDest = input.destinations.get(lastEntry.visit.destinationId);
  if (!firstDest || !lastDest) {
    return { extraFindings };
  }

  const firstCoordsOk = input.hasUsableCoords?.get(firstEntry.visit.destinationId) ?? true;
  const lastCoordsOk = input.hasUsableCoords?.get(lastEntry.visit.destinationId) ?? true;

  const lastAnchor = lastDayEmpty
    ? resolveOvernightAnchorTown({
        latitude: lastDest.latitude,
        longitude: lastDest.longitude,
      })
    : null;
  const returnOriginPoint =
    lastAnchor?.needsCheckinLeg
      ? { latitude: lastAnchor.latitude, longitude: lastAnchor.longitude }
      : { latitude: lastDest.latitude, longitude: lastDest.longitude };

  const [rawOutbound, rawReturn] = await Promise.all([
    firstCoordsOk
      ? input.getRoute({
          origin: { latitude: originPoint.latitude, longitude: originPoint.longitude },
          destination: { latitude: firstDest.latitude, longitude: firstDest.longitude },
          vehicle: input.candidate.transport,
        })
      : Promise.resolve({ kind: "unavailable" as const }),
    lastCoordsOk
      ? input.getRoute({
          origin: returnOriginPoint,
          destination: { latitude: originPoint.latitude, longitude: originPoint.longitude },
          vehicle: input.candidate.transport,
        })
      : Promise.resolve({ kind: "unavailable" as const }),
  ]);

  const legacyProvider = mapsProviderFromEnv() === "GOOGLE" ? "GOOGLE_MAPS" : "STADIA_MAPS";
  const outboundRoute: JourneyRoute =
    rawOutbound.kind === "ok"
      ? {
          status: "VERIFIED",
          reason: null,
          durationSeconds: rawOutbound.durationSeconds,
          distanceMeters: rawOutbound.distanceMeters ?? 0,
          provider: rawOutbound.provider ?? legacyProvider,
          ...(rawOutbound.geometry ? { geometry: rawOutbound.geometry } : {}),
        }
      : unavailableRoute("UNAVAILABLE");

  const returnRoute: JourneyRoute =
    rawReturn.kind === "ok"
      ? {
          status: "VERIFIED",
          reason: null,
          durationSeconds: rawReturn.durationSeconds,
          distanceMeters: rawReturn.distanceMeters ?? 0,
          provider: rawReturn.provider ?? legacyProvider,
          ...(rawReturn.geometry ? { geometry: rawReturn.geometry } : {}),
        }
      : unavailableRoute("UNAVAILABLE");

  if (outboundRoute.status !== "VERIFIED") {
    extraFindings.push({
      group: "travelTime",
      status: "INSUFFICIENT_DATA",
      reasonCode: "JOURNEY_OUTBOUND_ROUTE_UNKNOWN",
      message: "Chưa đủ dữ liệu tuyến đường từ nơi xuất phát tới điểm tham quan đầu tiên.",
      affectedVisitId: firstEntry.visit.visitId,
    });
  }
  if (returnRoute.status !== "VERIFIED") {
    extraFindings.push({
      group: "travelTime",
      status: "INSUFFICIENT_DATA",
      reasonCode: "JOURNEY_RETURN_ROUTE_UNKNOWN",
      message: "Chưa đủ dữ liệu tuyến đường từ điểm tham quan cuối về nơi xuất phát.",
      affectedVisitId: lastEntry.visit.visitId,
    });
  }

  let outboundRestMinutes = 0;
  let estimatedArrivalAtFirstMinute: number | null = null;
  let accumulatedDrivingSeconds = 0;

  if (outboundRoute.status === "VERIFIED" && activeJourney.departureMinute != null && outboundRoute.durationSeconds !== null) {
    const outDrive = driveWithRest(outboundRoute.durationSeconds, 0, input.candidate.transport);
    outboundRestMinutes = outDrive.restMinutes;
    accumulatedDrivingSeconds = outDrive.accumulatedSeconds;
    estimatedArrivalAtFirstMinute =
      activeJourney.departureMinute +
      Math.ceil(outboundRoute.durationSeconds / 60) +
      outboundRestMinutes;

    if (estimatedArrivalAtFirstMinute >= 1440) {
      extraFindings.push({
        group: "travelTime",
        status: "VIOLATION",
        reasonCode: "OVERNIGHT_DRIVING_UNSUPPORTED",
        message: "Chặng xuất phát kéo sang ngày hôm sau; không hỗ trợ lái xe xuyên đêm.",
        affectedVisitId: firstEntry.visit.visitId,
      });
    } else if (firstEntry.dayIndex === 1 && firstEntry.visit.startMinute < estimatedArrivalAtFirstMinute) {
      extraFindings.push({
        group: "travelTime",
        status: "VIOLATION",
        reasonCode: "JOURNEY_ARRIVAL_TOO_EARLY",
        message: `Dự kiến đến nơi lúc ${fromMinute(estimatedArrivalAtFirstMinute)} (tính cả ${outboundRestMinutes} phút nghỉ), sớm hơn giờ mở đầu ${fromMinute(firstEntry.visit.startMinute)}.`,
        affectedVisitId: firstEntry.visit.visitId,
      });
    }
  }

  const legByPair = new Map<string, PreviewLegMetric>();
  for (const leg of input.legs) {
    legByPair.set(`${leg.fromVisitId}->${leg.toVisitId}`, leg);
  }

  const planLegs: JourneyPlan["legs"] = [];
  if (outboundRoute.status === "VERIFIED" || missing.length === 0) {
    planLegs.push({
      kind: "OUTBOUND",
      day: 1,
      from: { kind: "ORIGIN" },
      to: { kind: "ATTRACTION", destinationId: firstEntry.visit.destinationId },
      route: outboundRoute,
      startMinute: activeJourney.departureMinute,
      endMinute: estimatedArrivalAtFirstMinute,
      restMinutes: outboundRoute.status === "VERIFIED" ? outboundRestMinutes : null,
    });
  }

  let currentDayAccumulated: number | null =
    outboundRoute.status === "VERIFIED"
      ? afterVisitDriving(accumulatedDrivingSeconds, firstEntry.visit.plannedDurationMinutes)
      : null;

  for (let i = 1; i < orderedVisits.length; i++) {
    const prev = orderedVisits[i - 1]!;
    const curr = orderedVisits[i]!;
    const sameDay = prev.dayIndex === curr.dayIndex;
    if (!sameDay) currentDayAccumulated = 0;

    const legMetric = sameDay
      ? legByPair.get(`${prev.visit.visitId}->${curr.visit.visitId}`)
      : undefined;

    if (sameDay && legMetric?.status === "VERIFIED" && legMetric.durationSeconds !== null) {
      const rest = driveWithRest(legMetric.durationSeconds, currentDayAccumulated ?? 0, input.candidate.transport);
      currentDayAccumulated = afterVisitDriving(rest.accumulatedSeconds, curr.visit.plannedDurationMinutes);
      const startMin = prev.visit.startMinute + prev.visit.plannedDurationMinutes;
      const endMin = startMin + Math.ceil(legMetric.durationSeconds / 60) + rest.restMinutes;
      planLegs.push({
        kind: "TRANSFER",
        day: curr.dayIndex,
        from: { kind: "ATTRACTION", destinationId: prev.visit.destinationId },
        to: { kind: "ATTRACTION", destinationId: curr.visit.destinationId },
        route: {
          status: "VERIFIED",
          reason: null,
          durationSeconds: legMetric.durationSeconds,
          distanceMeters: legMetric.distanceMeters ?? 0,
          provider: legMetric.provider ?? legacyProvider,
          ...(legMetric.geometry ? { geometry: legMetric.geometry } : {}),
        },
        startMinute: startMin,
        endMinute: endMin,
        restMinutes: rest.restMinutes,
      });
    } else if (sameDay) {
      currentDayAccumulated = afterVisitDriving(0, curr.visit.plannedDurationMinutes);
      planLegs.push({
        kind: "TRANSFER",
        day: curr.dayIndex,
        from: { kind: "ATTRACTION", destinationId: prev.visit.destinationId },
        to: { kind: "ATTRACTION", destinationId: curr.visit.destinationId },
        route: unavailableRoute("UNAVAILABLE"),
        startMinute: prev.visit.startMinute + prev.visit.plannedDurationMinutes,
        endMinute: null,
        restMinutes: null,
      });
    } else {
      // Cross-day boundary; restart driving clock after visit on curr day
      const prevDest = input.destinations.get(prev.visit.destinationId);
      const currDest = input.destinations.get(curr.visit.destinationId);
      let transferRoute: JourneyRoute = unavailableRoute("UNAVAILABLE");
      let restMinutes: number | null = null;
      let endMin: number | null = null;
      const prevCoordsOk = input.hasUsableCoords?.get(prev.visit.destinationId) ?? true;
      const currCoordsOk = input.hasUsableCoords?.get(curr.visit.destinationId) ?? true;
      if (prevDest && currDest && prevCoordsOk && currCoordsOk) {
        const prevAnchor = resolveOvernightAnchorTown({
          latitude: prevDest.latitude,
          longitude: prevDest.longitude,
        });
        const morningOrigin =
          prevAnchor?.needsCheckinLeg
            ? { latitude: prevAnchor.latitude, longitude: prevAnchor.longitude }
            : { latitude: prevDest.latitude, longitude: prevDest.longitude };
        const res = await input.getRoute({
          origin: morningOrigin,
          destination: { latitude: currDest.latitude, longitude: currDest.longitude },
          vehicle: input.candidate.transport,
        });
        if (res.kind === "ok") {
          const rest = driveWithRest(res.durationSeconds, 0, input.candidate.transport);
          restMinutes = rest.restMinutes;
          currentDayAccumulated = afterVisitDriving(rest.accumulatedSeconds, curr.visit.plannedDurationMinutes);
          endMin = 480 + Math.ceil(res.durationSeconds / 60) + rest.restMinutes;
          transferRoute = {
            status: "VERIFIED",
            reason: null,
            durationSeconds: res.durationSeconds,
            distanceMeters: res.distanceMeters ?? 0,
            provider: res.provider ?? legacyProvider,
            ...(res.geometry ? { geometry: res.geometry } : {}),
          };
        }
      }
      planLegs.push({
        kind: "TRANSFER",
        day: curr.dayIndex,
        from: { kind: "ATTRACTION", destinationId: prev.visit.destinationId },
        to: { kind: "ATTRACTION", destinationId: curr.visit.destinationId },
        route: transferRoute,
        startMinute: 480,
        endMinute: endMin,
        restMinutes,
      });
    }
  }

  let returnRestMinutes = 0;
  let estimatedReturnArrivalMinute: number | null = null;
  const returnStartMinute = lastDayEmpty
    ? activeJourney.returnDepartureMinute
    : lastEntry.visit.startMinute + lastEntry.visit.plannedDurationMinutes;

  const advisories: ValidationAdvisory[] = [];
  if (returnRoute.status === "VERIFIED" && returnStartMinute !== null && returnRoute.durationSeconds !== null) {
    const accumulatedBeforeReturn = lastDayEmpty ? 0 : (currentDayAccumulated ?? 0);
    const retDrive = driveWithRest(
      returnRoute.durationSeconds,
      accumulatedBeforeReturn,
      input.candidate.transport,
    );
    returnRestMinutes = retDrive.restMinutes;
    estimatedReturnArrivalMinute =
      returnStartMinute + Math.ceil(returnRoute.durationSeconds / 60) + returnRestMinutes;

    if (estimatedReturnArrivalMinute >= 1440) {
      extraFindings.push({
        group: "travelTime",
        status: "VIOLATION",
        reasonCode: "OVERNIGHT_DRIVING_UNSUPPORTED",
        message: "Chặng về nơi xuất phát vượt quá 23:59 (không hỗ trợ lái xuyên đêm).",
        affectedVisitId: lastEntry.visit.visitId,
      });
    } else if (
      activeJourney.returnDeadlineMinute != null &&
      estimatedReturnArrivalMinute > activeJourney.returnDeadlineMinute
    ) {
      // ADR-57 (D1): late return arrival is a non-blocking advisory, never a save blocker.
      advisories.push({
        reasonCode: "RETURN_DEADLINE_MISSED",
        message: `Lưu ý: dự kiến về tới nơi lúc ${fromMinute(estimatedReturnArrivalMinute)}, trễ hơn khung giờ mong muốn ${fromMinute(activeJourney.returnDeadlineMinute)} (vẫn có thể lưu chuyến).`,
        affectedVisitId: lastEntry.visit.visitId,
      });
    }
  }

  planLegs.push({
    kind: "RETURN",
    day: input.candidate.durationDays,
    from: { kind: "ATTRACTION", destinationId: lastEntry.visit.destinationId },
    to: { kind: "ORIGIN" },
    route: returnRoute,
    startMinute: returnStartMinute,
    endMinute: estimatedReturnArrivalMinute,
    restMinutes: returnRoute.status === "VERIFIED" ? returnRestMinutes : null,
  });

  const completeLegs =
    planLegs.length > 0 &&
    planLegs.every((leg) => leg.route.status === "VERIFIED" && leg.restMinutes !== null);

  let builtPlan: JourneyPlan | null = null;
  if (planLegs.length <= 29) {
    builtPlan = journeyPlanSchema.parse({
      policy: REST_POLICY_VERSION,
      legs: planLegs,
      totals: {
        drivingSeconds: completeLegs
          ? planLegs.reduce((sum, l) => sum + (l.route.durationSeconds ?? 0), 0)
          : null,
        restMinutes: completeLegs
          ? planLegs.reduce((sum, l) => sum + (l.restMinutes ?? 0), 0)
          : null,
        distanceMeters: completeLegs
          ? planLegs.reduce((sum, l) => sum + (l.route.distanceMeters ?? 0), 0)
          : null,
      },
    });
  }

  const journeySummary: PreviewJourneySummary = {
    outboundDurationSeconds: outboundRoute.durationSeconds,
    outboundDistanceMeters: outboundRoute.distanceMeters,
    outboundRestMinutes,
    estimatedArrivalAtFirstMinute,
    firstVisitStartMinute: firstEntry.visit.startMinute,
    returnDurationSeconds: returnRoute.durationSeconds,
    returnDistanceMeters: returnRoute.distanceMeters,
    returnRestMinutes,
    estimatedReturnArrivalMinute,
    returnDeadlineMinute: activeJourney.returnDeadlineMinute,
  };

  const canBuildSnapshot = missing.length === 0 && vietnamCoverageAt(originPoint) === "SUPPORTED";
  const nextJourneySnapshot: SavedJourney | undefined = canBuildSnapshot
    ? savedJourneySchema.parse({
        revision: "journey-save-v1",
        journey: activeJourney,
        plan: builtPlan,
        visitFingerprint: journeyVisitFingerprint(input.candidate.days),
      })
    : undefined;

  return {
    extraFindings,
    ...(advisories.length > 0 ? { advisories } : {}),
    journeySummary,
    ...(nextJourneySnapshot !== undefined ? { nextJourneySnapshot } : {}),
  };
}

export function mergeJourneyValidation(
  baseValidation: TripValidation,
  extraFindings: readonly ValidationFinding[],
  extraAdvisories: readonly ValidationAdvisory[] = [],
): TripValidation {
  const combinedAdvisories = [...(baseValidation.advisories ?? []), ...extraAdvisories];
  if (extraFindings.length === 0) {
    return combinedAdvisories.length > 0 ? { ...baseValidation, advisories: combinedAdvisories } : baseValidation;
  }
  const currentTravel = baseValidation.groups.travelTime;
  const combinedFindings = [...currentTravel.findings, ...extraFindings];
  const hasViolation =
    currentTravel.status === "VIOLATION" ||
    extraFindings.some((f) => f.status === "VIOLATION");
  const hasInsufficient =
    currentTravel.status === "INSUFFICIENT_DATA" ||
    extraFindings.some((f) => f.status === "INSUFFICIENT_DATA");
  const nextTravelStatus: "SATISFIED" | "VIOLATION" | "INSUFFICIENT_DATA" = hasViolation
    ? "VIOLATION"
    : hasInsufficient
      ? "INSUFFICIENT_DATA"
      : "SATISFIED";
  const nextGroups = {
    ...baseValidation.groups,
    travelTime: {
      status: nextTravelStatus,
      findings: combinedFindings,
    },
  };
  return {
    ...baseValidation,
    groups: nextGroups,
    canConfirm:
      nextGroups.openingHours.status === "SATISFIED" &&
      nextGroups.minimumDuration.status === "SATISFIED" &&
      nextGroups.travelTime.status === "SATISFIED" &&
      nextGroups.scheduleConflict.status === "SATISFIED",
    ...(combinedAdvisories.length > 0 ? { advisories: combinedAdvisories } : {}),
  };
}
