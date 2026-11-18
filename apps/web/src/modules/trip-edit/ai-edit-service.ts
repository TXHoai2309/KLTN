import { randomUUID } from "node:crypto";
import type { Database, Prisma } from "@KLTN/db";

import { AppError } from "@/server/http/app-error";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { externalPlaceView } from "../trip-read/external-place-cache";
import { savedJourneySchema } from "../trip-origin/journey-saved-contract";
import { assertJourneyBeforeDeparture } from "../trip-origin/journey-cutoff";
import type { TripJourney } from "../trip-origin/trip-origin-contract";
import type { UncheckedItem } from "../trip-save/unchecked-checks";
import type { TripValidation } from "../trip-validation/trip-validation";
import {
  applySuggestedDurationsToPlan,
  applyWorkspaceOperations,
  buildGroundedAdvice,
  MAX_AI_CHOICES,
  planToPrimaryEditIntent,
  resolveWorkspacePlan,
  type AiChatHistoryTurn,
  type WorkspacePromptJourneyContext,
} from "./ai-workspace-plan";
import {
  createEditCandidate,
  diffEditCandidate,
  type EditCandidate,
  type EditCandidateDiff,
  type SavedTripForEdit,
} from "./edit-candidate";
import {
  minuteClockLabel,
  rescheduleDraftFromOrigin,
  type PreviewJourneySummary,
} from "./edit-journey-helper";
import {
  assertResolutionReferencesServerData,
  createEditClarification,
  type EditClarification,
  type EditClarificationContext,
  type EditResolution,
} from "./edit-clarification";
import type {
  EditIntentClarificationReason,
  EditIntentResult,
} from "./edit-intent-contract";
import {
  MAX_EDIT_INTENT_DESTINATIONS,
  MAX_EDIT_INTENT_MESSAGE_LENGTH,
} from "./edit-intent-prompt";
import { recognizeWorkspaceEditPlan } from "./edit-intent-service";
import { classifyOngoingCompletedVisits, assertOngoingCompletedVisitsUnchanged } from "./edit-ongoing";
import { externalPlaceDestinationId, isExternalPlaceId } from "./edit-unchecked";
import {
  assertCandidateMatchesTrip,
  assertTripEditable,
  extractOwnedExternalPlaces,
  previewEdit,
  tripExternalPlaceSelect,
  type EditPlaceDetail,
  type OwnedExternalPlace,
  type PreviewEditResult,
  type PreviewLegMetric,
  type TripEditRouteProvider,
} from "./trip-edit-service";

const aiEditTripSelect = {
  id: true,
  userId: true,
  startDate: true,
  durationDays: true,
  transport: true,
  updatedAt: true,
  manuallyCompletedAt: true,
  journeySnapshot: true,
  days: {
    orderBy: [{ dayIndex: "asc" }, { id: "asc" }],
    select: {
      dayIndex: true,
      visits: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          order: true,
          startMinute: true,
          plannedDurationMinutes: true,
          externalPlace: { select: tripExternalPlaceSelect },
          destination: {
            select: {
              id: true,
              name: true,
              visibility: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

type AiEditLoadedTrip = {
  id: string;
  userId: string;
  startDate: Date;
  durationDays: number;
  transport: EditCandidate["transport"];
  updatedAt: Date;
  manuallyCompletedAt?: Date | null;
  journeySnapshot?: unknown;
  days: {
    dayIndex: number;
    visits: {
      id: string;
      order: number;
      startMinute: number;
      plannedDurationMinutes: number;
      externalPlace?: OwnedExternalPlace | null;
      destination: {
        id: string;
        name: string;
        visibility: string;
        deletedAt?: Date | null;
      } | null;
    }[];
  }[];
};

const eligibleDestinationSelect = {
  id: true,
  name: true,
  area: true,
  category: true,
  latitude: true,
  longitude: true,
  suggestedDurationMinutes: true,
  minimumDurationMinutes: true,
  isOutdoor: true,
} satisfies Prisma.DestinationSelect;

type EligibleDestinationRow = {
  id: string;
  name: string;
  area?: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  suggestedDurationMinutes: number | null;
  minimumDurationMinutes?: number | null;
  isOutdoor?: boolean;
};

export type AiEditServiceDependencies = {
  database: Database;
  llm: StructuredLlmClient;
  getRoute: TripEditRouteProvider;
  /** Injectable only to make generated visit identifiers deterministic in tests. */
  createVisitId?: () => string;
};

export type AiEditRequest = {
  baseRevision: string;
  message: string;
  resolution?: EditResolution;
  draft?: EditCandidate;
  history?: AiChatHistoryTurn[];
};

export type AiEditClarificationResult = {
  status: "NEEDS_CLARIFICATION";
  intent: EditIntentResult;
  reason: EditIntentClarificationReason;
  clarification: EditClarification;
  aiSummary?: string;
};

export type AiEditAdvisedResult = {
  status: "ADVISED";
  intent: EditIntentResult;
  advice: string;
  validation: TripValidation;
  aiSummary: string;
  saveEligibility?: PreviewEditResult["saveEligibility"];
};

export type AiEditProposalResult = {
  status: "PROPOSED";
  candidate: EditCandidate;
  intent: EditIntentResult;
  diff: EditCandidateDiff;
  validation: TripValidation;
  aiSummary?: string;
  changedVisitIds?: {
    added: string[];
    updated: string[];
    shifted: string[];
    removedCount: number;
  };
  legs?: PreviewLegMetric[];
  saveEligibility?: PreviewEditResult["saveEligibility"];
  uncheckedItems?: UncheckedItem[];
  journeySummary?: PreviewJourneySummary;
  addedPlaceDetails?: Record<string, EditPlaceDetail>;
};

export type AiEditServiceResult =
  | AiEditClarificationResult
  | AiEditProposalResult
  | AiEditAdvisedResult;

function tripNotFound(): AppError {
  return new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
}

function revisionConflict(): AppError {
  return new AppError(
    "TRIP_REVISION_CONFLICT",
    "Hành trình đã thay đổi. Hãy tải lại trước khi tạo đề xuất chỉnh sửa.",
    409,
  );
}

function formatStartTime(startMinute: number): string {
  const hours = Math.floor(startMinute / 60).toString().padStart(2, "0");
  const minutes = (startMinute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function savedTripShapeFromLoaded(trip: AiEditLoadedTrip): SavedTripForEdit & { manuallyCompletedAt?: Date | null } {
  return {
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    transport: trip.transport,
    manuallyCompletedAt: trip.manuallyCompletedAt ?? null,
    days: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => {
        if (visit.destination) {
          return {
            id: visit.id,
            destinationId: visit.destination.id,
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          };
        }
        if (visit.externalPlace) {
          return {
            id: visit.id,
            destinationId: externalPlaceDestinationId(visit.externalPlace.providerPlaceId),
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          };
        }
        throw new AppError("INVALID_TRIP_STATE", "Lượt tham quan thiếu địa điểm.", 500);
      }),
    })),
  };
}

function candidateFromSavedShape(
  savedTrip: SavedTripForEdit,
  journeySnapshot: unknown,
): EditCandidate {
  const candidate = createEditCandidate(savedTrip);
  const parsedJourney = savedJourneySchema.safeParse(journeySnapshot);
  if (parsedJourney.success) {
    candidate.journey = parsedJourney.data.journey;
  }
  return candidate;
}

async function readEligibleDestinations(
  database: Pick<Database, "destination">,
): Promise<EligibleDestinationRow[]> {
  return database.destination.findMany({
    where: visibleDestinationWhere,
    select: eligibleDestinationSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_EDIT_INTENT_DESTINATIONS,
  }) as Promise<EligibleDestinationRow[]>;
}

async function readMissingDraftDestinations(
  database: Pick<Database, "destination">,
  missingIds: readonly string[],
): Promise<EligibleDestinationRow[]> {
  if (missingIds.length === 0) return [];
  return database.destination.findMany({
    where: { ...visibleDestinationWhere, id: { in: [...missingIds] } },
    select: eligibleDestinationSelect,
  }) as Promise<EligibleDestinationRow[]>;
}

function buildPlaceNameLookup(
  trip: AiEditLoadedTrip,
  destinations: readonly EligibleDestinationRow[],
  timeReference: Date,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const dest of destinations) {
    names.set(dest.id, dest.name);
  }
  for (const day of trip.days) {
    for (const visit of day.visits) {
      if (visit.externalPlace) {
        const view = externalPlaceView(visit.externalPlace, timeReference, true);
        names.set(view.id, view.name);
        continue;
      }
      if (visit.destination) {
        const available = visit.destination.visibility === "VISIBLE" && !visit.destination.deletedAt;
        names.set(
          visit.destination.id,
          available ? visit.destination.name : "Điểm đến không còn khả dụng",
        );
      }
    }
  }
  return names;
}

function buildClarificationContext(
  candidate: EditCandidate,
  placeNames: ReadonlyMap<string, string>,
  destinations: readonly EligibleDestinationRow[],
  lockedVisitIds: ReadonlySet<string>,
): EditClarificationContext {
  return {
    visits: candidate.days.flatMap((day) =>
      day.visits
        .filter((visit) => !lockedVisitIds.has(visit.visitId))
        .map((visit) => ({
          visitId: visit.visitId,
          destinationId: visit.destinationId,
          destinationName: placeNames.get(visit.destinationId) ?? "Điểm đến không còn khả dụng",
          dayIndex: day.dayIndex,
          startMinute: visit.startMinute,
        })),
    ),
    eligibleDestinations: destinations.map((d) => ({ id: d.id, name: d.name })),
    dayIndexes: candidate.days.map((d) => d.dayIndex).sort((a, b) => a - b),
  };
}

function buildAddedPlaceDetails(
  diff: EditCandidateDiff,
  destinationsById: ReadonlyMap<string, EligibleDestinationRow>,
): Record<string, EditPlaceDetail> | undefined {
  const touchedDestIds = new Set<string>();
  for (const added of diff.added) touchedDestIds.add(added.destinationId);
  for (const upd of diff.updated) {
    if (upd.changedFields.includes("destinationId")) {
      touchedDestIds.add(upd.after.destinationId);
    }
  }
  if (touchedDestIds.size === 0) return undefined;

  const details: Record<string, EditPlaceDetail> = {};
  for (const destId of touchedDestIds) {
    const dest = destinationsById.get(destId);
    if (!dest) continue;
    details[dest.id] = {
      id: dest.id,
      name: dest.name,
      area: dest.area ?? "",
      ...(typeof dest.category === "string" ? { category: dest.category } : {}),
      ...(typeof dest.latitude === "number" ? { latitude: dest.latitude } : {}),
      ...(typeof dest.longitude === "number" ? { longitude: dest.longitude } : {}),
      suggestedDurationMinutes: dest.suggestedDurationMinutes ?? null,
      minimumDurationMinutes: dest.minimumDurationMinutes ?? null,
      ...(typeof dest.isOutdoor === "boolean" ? { isOutdoor: dest.isOutdoor } : {}),
      availability: "AVAILABLE",
      external: false,
    };
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

function validateRequest(request: AiEditRequest): void {
  if ([...request.message].length > MAX_EDIT_INTENT_MESSAGE_LENGTH) {
    throw new AppError("VALIDATION_ERROR", "Yêu cầu chỉnh sửa quá dài.", 400, {
      fieldErrors: { message: `Tối đa ${MAX_EDIT_INTENT_MESSAGE_LENGTH} ký tự.` },
    });
  }
  if (!request.message.trim()) {
    throw new AppError("VALIDATION_ERROR", "Hãy nhập yêu cầu chỉnh sửa hành trình.", 400, {
      fieldErrors: { message: "Yêu cầu không được để trống." },
    });
  }
}

/** Build a verified read-only AI edit proposal against live workingDraft (or saved Trip). */
export async function createAiEditProposal(
  tripId: string,
  userId: string,
  request: AiEditRequest,
  dependencies: AiEditServiceDependencies,
  timeReference: Date,
): Promise<AiEditServiceResult> {
  validateRequest(request);

  const rawFound = await dependencies.database.trip.findFirst({
    where: { id: tripId, userId },
    select: aiEditTripSelect,
  });
  if (!rawFound) throw tripNotFound();
  const found = rawFound as unknown as AiEditLoadedTrip;

  const baseRevision = found.updatedAt.toISOString();
  if (request.baseRevision !== baseRevision) throw revisionConflict();
  assertTripEditable(found, timeReference);

  const savedShape = savedTripShapeFromLoaded(found);
  const ownedExternalPlaces = extractOwnedExternalPlaces(found);
  const ownedExternalIds = new Set(
    ownedExternalPlaces.map((ext) => externalPlaceDestinationId(ext.providerPlaceId)),
  );

  let baseCandidate: EditCandidate;
  if (request.draft) {
    assertCandidateMatchesTrip(found, request.draft);
    assertOngoingCompletedVisitsUnchanged(savedShape, request.draft, timeReference);
    for (const day of request.draft.days) {
      for (const visit of day.visits) {
        if (isExternalPlaceId(visit.destinationId) && !ownedExternalIds.has(visit.destinationId)) {
          throw new AppError(
            "DESTINATION_UNAVAILABLE",
            "Có điểm đến không còn công khai hoặc không thuộc chuyến đi này.",
            422,
          );
        }
      }
    }
    baseCandidate = request.draft;
  } else {
    baseCandidate = candidateFromSavedShape(savedShape, found.journeySnapshot);
  }

  const completedInfo = classifyOngoingCompletedVisits(savedShape, timeReference);
  const lockedVisitIds = new Set(completedInfo.completedVisitIds);

  const eligibleDestinations = await readEligibleDestinations(dependencies.database);
  const eligibleIds = new Set(eligibleDestinations.map((d) => d.id));
  const extraDraftCatalogIds = [
    ...new Set(
      baseCandidate.days.flatMap((day) =>
        day.visits
          .map((v) => v.destinationId)
          .filter((id) => !isExternalPlaceId(id) && !eligibleIds.has(id)),
      ),
    ),
  ];
  const extraDraftCatalog = await readMissingDraftDestinations(
    dependencies.database,
    extraDraftCatalogIds,
  );
  const allCatalogDestinations = [...eligibleDestinations, ...extraDraftCatalog];
  const catalogById = new Map(allCatalogDestinations.map((d) => [d.id, d]));

  const placeNames = buildPlaceNameLookup(found, allCatalogDestinations, timeReference);
  const clarificationData = buildClarificationContext(
    baseCandidate,
    placeNames,
    eligibleDestinations,
    lockedVisitIds,
  );
  assertResolutionReferencesServerData(request.resolution, clarificationData);

  const parsedSavedJourney = savedJourneySchema.safeParse(found.journeySnapshot);
  const currentJourney: TripJourney | null =
    baseCandidate.journey !== undefined
      ? baseCandidate.journey
      : parsedSavedJourney.success
        ? parsedSavedJourney.data.journey
        : null;
  let isBeforeDeparture = true;
  try {
    assertJourneyBeforeDeparture(
      {
        startDate: found.startDate,
        manuallyCompletedAt: savedShape.manuallyCompletedAt ?? null,
        journeySnapshot: found.journeySnapshot,
      },
      timeReference,
    );
  } catch {
    isBeforeDeparture = false;
  }
  const journeyState: WorkspacePromptJourneyContext = {
    hasOrigin: Boolean(currentJourney?.origin?.confirmed),
    isBeforeDeparture,
    departureTime: currentJourney?.departureMinute != null ? minuteClockLabel(currentJourney.departureMinute) : null,
    returnDeadlineTime: currentJourney?.returnDeadlineMinute != null ? minuteClockLabel(currentJourney.returnDeadlineMinute) : null,
    returnDepartureTime: currentJourney?.returnDepartureMinute != null ? minuteClockLabel(currentJourney.returnDepartureMinute) : null,
  };

  const recognizedPlan = await recognizeWorkspaceEditPlan(
    {
      message: request.message,
      itinerary: baseCandidate.days.map((day) => ({
        dayIndex: day.dayIndex,
        visits: day.visits.map((visit) => ({
          visitId: visit.visitId,
          destinationName: placeNames.get(visit.destinationId) ?? "Điểm đến không còn khả dụng",
          startTime: formatStartTime(visit.startMinute),
          durationMinutes: visit.plannedDurationMinutes,
        })),
      })),
      eligibleDestinations: eligibleDestinations.map((destination) => ({
        id: destination.id,
        name: destination.name,
      })),
      ...(request.history && request.history.length > 0 ? { history: request.history } : {}),
      journeyState,
    },
    { llm: dependencies.llm },
  );

  const safeGetRoute: TripEditRouteProvider = async (input) => {
    try {
      return await dependencies.getRoute(input);
    } catch {
      return { kind: "unavailable" };
    }
  };

  const resolvedPlan = resolveWorkspacePlan(recognizedPlan, request.resolution, clarificationData);
  const hydratedPlan = applySuggestedDurationsToPlan(resolvedPlan, allCatalogDestinations);

  if (hydratedPlan.mode === "ADVISED") {
    const validationPreview = await previewEdit(
      tripId,
      userId,
      request.baseRevision,
      baseCandidate,
      { database: dependencies.database, getRoute: safeGetRoute },
      timeReference,
    );
    const advice = buildGroundedAdvice({
      candidate: baseCandidate,
      placeNames,
      validation: validationPreview.validation,
      legs: validationPreview.legs,
      journeySummary: validationPreview.journeySummary,
      saveEligibility: validationPreview.saveEligibility,
      uncheckedItems: validationPreview.uncheckedItems,
      focusDayIndex: hydratedPlan.adviceFocus?.dayIndex,
      topic: hydratedPlan.adviceFocus?.topic,
    });
    return {
      status: "ADVISED",
      intent: planToPrimaryEditIntent(hydratedPlan),
      advice,
      validation: validationPreview.validation,
      aiSummary: advice,
      ...(validationPreview.saveEligibility ? { saveEligibility: validationPreview.saveEligibility } : {}),
    };
  }

  if (hydratedPlan.mode === "CHANGE_ORIGIN_CLOCKS") {
    if (!currentJourney || !currentJourney.origin) {
      const validationPreview = await previewEdit(
        tripId,
        userId,
        request.baseRevision,
        baseCandidate,
        { database: dependencies.database, getRoute: safeGetRoute },
        timeReference,
      );
      const advice =
        "Chuyến đi hiện chưa có điểm xuất phát (Trip origin). Hãy nhấn '+ Bổ sung nơi xuất phát' trong khung Hành trình xuất phát & trở về để chọn tọa độ trên bản đồ trước khi đặt giờ đi hoặc hạn về.";
      return {
        status: "ADVISED",
        intent: planToPrimaryEditIntent(hydratedPlan),
        advice,
        validation: validationPreview.validation,
        aiSummary: advice,
        ...(validationPreview.saveEligibility ? { saveEligibility: validationPreview.saveEligibility } : {}),
      };
    }

    if (!isBeforeDeparture) {
      const savedBaselineCandidate: EditCandidate = {
        ...baseCandidate,
        journey: parsedSavedJourney.success ? parsedSavedJourney.data.journey : undefined,
      };
      const validationPreview = await previewEdit(
        tripId,
        userId,
        request.baseRevision,
        savedBaselineCandidate,
        { database: dependencies.database, getRoute: safeGetRoute },
        timeReference,
      );
      const advice =
        "Chuyến đi đã qua mốc giờ khởi hành nên điểm xuất phát và giờ đi/về đã được cố định, không thể chỉnh sửa trên bản nháp.";
      return {
        status: "ADVISED",
        intent: planToPrimaryEditIntent(hydratedPlan),
        advice,
        validation: validationPreview.validation,
        aiSummary: advice,
        ...(validationPreview.saveEligibility ? { saveEligibility: validationPreview.saveEligibility } : {}),
      };
    }

    const clocks = hydratedPlan.originClocks!;
    const updatedJourney: TripJourney = {
      ...currentJourney,
      departureMinute: clocks.departureMinute ?? currentJourney.departureMinute,
      returnDeadlineMinute: clocks.returnDeadlineMinute ?? currentJourney.returnDeadlineMinute,
      returnDepartureMinute: clocks.returnDepartureMinute ?? currentJourney.returnDepartureMinute,
    };
    let nextCandidate: EditCandidate = { ...baseCandidate, journey: updatedJourney };
    let validationPreview = await previewEdit(
      tripId,
      userId,
      request.baseRevision,
      nextCandidate,
      { database: dependencies.database, getRoute: safeGetRoute },
      timeReference,
    );
    if (clocks.rescheduleDayOne && lockedVisitIds.size === 0 && validationPreview.journeySummary) {
      const rescheduled = rescheduleDraftFromOrigin(
        nextCandidate,
        validationPreview.journeySummary,
        validationPreview.legs ?? [],
      );
      if (rescheduled.candidate !== nextCandidate) {
        nextCandidate = rescheduled.candidate;
        validationPreview = await previewEdit(
          tripId,
          userId,
          request.baseRevision,
          nextCandidate,
          { database: dependencies.database, getRoute: safeGetRoute },
          timeReference,
        );
      }
    }
    const diff = diffEditCandidate(baseCandidate, nextCandidate);
    const clockParts: string[] = [];
    if (clocks.departureMinute !== null) {
      clockParts.push(`giờ khởi hành ${minuteClockLabel(clocks.departureMinute)}`);
    }
    if (clocks.returnDeadlineMinute !== null) {
      clockParts.push(`hạn trở về ${minuteClockLabel(clocks.returnDeadlineMinute)}`);
    }
    if (clocks.returnDepartureMinute !== null) {
      clockParts.push(`giờ bắt đầu về ${minuteClockLabel(clocks.returnDepartureMinute)}`);
    }
    const aiSummary = `AI đã cập nhật ${clockParts.join(", ")} cho lộ trình xuất phát trên bản nháp.`;
    return {
      status: "PROPOSED",
      candidate: nextCandidate,
      intent: planToPrimaryEditIntent(hydratedPlan, diff),
      diff,
      validation: validationPreview.validation,
      aiSummary,
      changedVisitIds: {
        added: [],
        updated: diff.updated.map((u) => u.visitId),
        shifted: [],
        removedCount: 0,
      },
      ...(validationPreview.legs ? { legs: validationPreview.legs } : {}),
      ...(validationPreview.saveEligibility ? { saveEligibility: validationPreview.saveEligibility } : {}),
      ...(validationPreview.uncheckedItems ? { uncheckedItems: validationPreview.uncheckedItems } : {}),
      ...(validationPreview.journeySummary ? { journeySummary: validationPreview.journeySummary } : {}),
    };
  }

  if (hydratedPlan.mode !== "APPLY_BATCH") {
    const reason =
      hydratedPlan.clarificationReason ??
      (hydratedPlan.mode === "UNSUPPORTED" ? "OUT_OF_SCOPE" : "MISSING_TARGET");
    const clarificationObj = createEditClarification(
      reason,
      planToPrimaryEditIntent(hydratedPlan),
      clarificationData,
      {
        candidateVisitIds: hydratedPlan.candidateVisitIds,
        candidateDestinationIds: hydratedPlan.candidateDestinationIds,
        maxChoices: MAX_AI_CHOICES,
      },
    );
    return {
      status: "NEEDS_CLARIFICATION",
      intent: { ...planToPrimaryEditIntent(hydratedPlan), needsClarification: true, clarificationReason: reason },
      reason,
      clarification: clarificationObj,
      aiSummary: clarificationObj.prompt,
    };
  }

  const makeVisitId = dependencies.createVisitId ?? randomUUID;
  const applied = applyWorkspaceOperations({
    original: baseCandidate,
    plan: hydratedPlan,
    destinations: allCatalogDestinations,
    lockedVisitIds,
    createVisitId: makeVisitId,
  });

  if (applied.kind === "CLARIFY") {
    const clarificationObj = createEditClarification(
      applied.reason,
      applied.intent,
      clarificationData,
      {
        candidateVisitIds: hydratedPlan.candidateVisitIds,
        candidateDestinationIds: hydratedPlan.candidateDestinationIds,
        maxChoices: MAX_AI_CHOICES,
      },
    );
    return {
      status: "NEEDS_CLARIFICATION",
      intent: { ...applied.intent, needsClarification: true, clarificationReason: applied.reason },
      reason: applied.reason,
      clarification: clarificationObj,
      aiSummary: clarificationObj.prompt,
    };
  }

  const validationPreview = await previewEdit(
    tripId,
    userId,
    request.baseRevision,
    applied.candidate,
    {
      database: dependencies.database,
      getRoute: safeGetRoute,
    },
    timeReference,
  );

  const addedPlaceDetails = buildAddedPlaceDetails(applied.diff, catalogById);

  return {
    status: "PROPOSED",
    candidate: applied.candidate,
    intent: applied.intent,
    diff: applied.diff,
    validation: validationPreview.validation,
    aiSummary: applied.aiSummary,
    changedVisitIds: applied.changedVisitIds,
    ...(validationPreview.legs ? { legs: validationPreview.legs } : {}),
    ...(validationPreview.saveEligibility ? { saveEligibility: validationPreview.saveEligibility } : {}),
    ...(validationPreview.uncheckedItems ? { uncheckedItems: validationPreview.uncheckedItems } : {}),
    ...(validationPreview.journeySummary ? { journeySummary: validationPreview.journeySummary } : {}),
    ...(addedPlaceDetails ? { addedPlaceDetails } : {}),
  };
}
