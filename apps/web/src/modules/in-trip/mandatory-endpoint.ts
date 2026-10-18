import { z } from "zod";

import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { moveVisit, type EditCandidate } from "../trip-edit/edit-candidate";
import type { VerifiedMandatoryEndpoint } from "./replan-contract";

const deadlineSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);

/** A server-owned constraint derived only from Task 288's verified endpoint. */
export const mandatoryEndpointSchema = z
  .object({
    destinationId: z.string().min(1).max(128),
    deadline: deadlineSchema,
  })
  .strict();

export type MandatoryEndpoint = z.infer<typeof mandatoryEndpointSchema>;

export type MandatoryEndpointInfeasibleCode =
  | "REPLAN_ENDPOINT_INELIGIBLE"
  | "REPLAN_ENDPOINT_ALREADY_COMPLETED"
  | "REPLAN_ENDPOINT_DEADLINE_INFEASIBLE"
  | "REPLAN_ENDPOINT_NOT_IN_CANDIDATE"
  | "REPLAN_ENDPOINT_CANNOT_BE_LAST";

export type MandatoryEndpointResult =
  | { status: "READY"; candidate: EditCandidate; mandatoryEndpoint: MandatoryEndpoint }
  | { status: "NEEDS_CLARIFICATION"; reason: "MISSING_TIME" }
  | { status: "INFEASIBLE"; code: MandatoryEndpointInfeasibleCode };

export type ApplyMandatoryEndpointInput = {
  /** This argument can only be produced after Task 288 verifies model IDs. */
  verifiedEndpoint: VerifiedMandatoryEndpoint;
  candidate: EditCandidate;
  completedVisitIds: readonly string[];
  eligibleDestinationIds: readonly string[];
  now: Date;
  remainingMinutesToday: number | null;
};

function deadlineInstant(now: Date, deadline: string): number | null {
  const parsedDeadline = deadlineSchema.safeParse(deadline);
  if (!parsedDeadline.success || Number.isNaN(now.getTime())) return null;

  const localDate = vietnamDateOf(now);
  // Vietnam uses UTC+07; the local date comes from the shared business-zone helper.
  const instant = Date.parse(`${localDate}T${parsedDeadline.data}:00+07:00`);
  return Number.isFinite(instant) ? instant : null;
}

function candidateVisits(candidate: EditCandidate) {
  return candidate.days.flatMap((day) =>
    day.visits.map((visit) => ({ dayIndex: day.dayIndex, visit })),
  );
}

/**
 * Applies only the structural endpoint rule. It checks today's time window,
 * destination eligibility and candidate order; routing feasibility remains
 * for the Validator in US-37.
 */
export function applyMandatoryEndpoint(
  input: ApplyMandatoryEndpointInput,
): MandatoryEndpointResult {
  const parsedEndpoint = mandatoryEndpointSchema.safeParse({
    destinationId: input.verifiedEndpoint.destinationId,
    deadline: input.verifiedEndpoint.deadline,
  });
  if (!parsedEndpoint.success) return { status: "NEEDS_CLARIFICATION", reason: "MISSING_TIME" };
  const mandatoryEndpoint = parsedEndpoint.data;

  if (!input.eligibleDestinationIds.includes(mandatoryEndpoint.destinationId)) {
    return { status: "INFEASIBLE", code: "REPLAN_ENDPOINT_INELIGIBLE" };
  }

  const visits = candidateVisits(input.candidate);
  const completedIds = new Set(input.completedVisitIds);
  if (
    visits.some(
      ({ visit }) =>
        visit.destinationId === mandatoryEndpoint.destinationId && completedIds.has(visit.visitId),
    )
  ) {
    return { status: "INFEASIBLE", code: "REPLAN_ENDPOINT_ALREADY_COMPLETED" };
  }

  if (
    input.remainingMinutesToday === null ||
    !Number.isSafeInteger(input.remainingMinutesToday) ||
    input.remainingMinutesToday < 0 ||
    input.remainingMinutesToday > 1439
  ) {
    return { status: "NEEDS_CLARIFICATION", reason: "MISSING_TIME" };
  }

  const dueAt = deadlineInstant(input.now, mandatoryEndpoint.deadline);
  const remainingWindowMs = input.remainingMinutesToday * 60_000;
  if (
    dueAt === null ||
    dueAt <= input.now.getTime() ||
    dueAt - input.now.getTime() > remainingWindowMs
  ) {
    return { status: "INFEASIBLE", code: "REPLAN_ENDPOINT_DEADLINE_INFEASIBLE" };
  }

  const remaining = visits.filter(({ visit }) => !completedIds.has(visit.visitId));
  const endpointVisits = remaining.filter(
    ({ visit }) => visit.destinationId === mandatoryEndpoint.destinationId,
  );
  if (endpointVisits.length === 0) {
    return { status: "INFEASIBLE", code: "REPLAN_ENDPOINT_NOT_IN_CANDIDATE" };
  }

  const lastRemaining = remaining.at(-1);
  if (lastRemaining?.visit.destinationId === mandatoryEndpoint.destinationId) {
    return {
      status: "READY",
      candidate: input.candidate,
      mandatoryEndpoint,
    };
  }

  const endpointVisit = endpointVisits.at(-1);
  const targetDayIndex = lastRemaining?.dayIndex;
  if (!endpointVisit || targetDayIndex === undefined) {
    return { status: "INFEASIBLE", code: "REPLAN_ENDPOINT_NOT_IN_CANDIDATE" };
  }

  try {
    const movedCandidate = moveVisit(
      input.candidate,
      endpointVisit.visit.visitId,
      targetDayIndex,
    );
    const movedRemaining = candidateVisits(movedCandidate).filter(
      ({ visit }) => !completedIds.has(visit.visitId),
    );
    if (movedRemaining.at(-1)?.visit.destinationId !== mandatoryEndpoint.destinationId) {
      return { status: "INFEASIBLE", code: "REPLAN_ENDPOINT_CANNOT_BE_LAST" };
    }
    return {
      status: "READY",
      candidate: movedCandidate,
      mandatoryEndpoint,
    };
  } catch {
    return { status: "INFEASIBLE", code: "REPLAN_ENDPOINT_CANNOT_BE_LAST" };
  }
}
