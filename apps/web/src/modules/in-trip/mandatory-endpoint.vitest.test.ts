import { describe, expect, it } from "vitest";

import { createEditCandidate, type EditCandidate } from "../trip-edit/edit-candidate";
import type { VerifiedMandatoryEndpoint } from "./replan-contract";
import { applyMandatoryEndpoint } from "./mandatory-endpoint";

const NOW = new Date("2026-10-17T10:00:00.000Z"); // 17:00 in Asia/Ho_Chi_Minh.

function endpoint(destinationId: string, deadline: string): VerifiedMandatoryEndpoint {
  // Test fixture stands in for the branded value produced only by replan-verify.
  return { destinationId, deadline } as VerifiedMandatoryEndpoint;
}

function candidate(): EditCandidate {
  return createEditCandidate({
    startDate: "2026-10-17",
    durationDays: 2,
    transport: "CAR",
    days: [
      {
        dayIndex: 1,
        visits: [
          {
            id: "remaining-endpoint",
            destinationId: "destination-endpoint",
            startMinute: 1080,
            plannedDurationMinutes: 30,
            order: 1,
          },
          {
            id: "remaining-other",
            destinationId: "destination-other",
            startMinute: 1140,
            plannedDurationMinutes: 30,
            order: 2,
          },
        ],
      },
      {
        dayIndex: 2,
        visits: [],
      },
    ],
  });
}

function apply(
  value: EditCandidate,
  input: Partial<Parameters<typeof applyMandatoryEndpoint>[0]> = {},
) {
  return applyMandatoryEndpoint({
    verifiedEndpoint: endpoint("destination-endpoint", "18:00"),
    candidate: value,
    completedVisitIds: [],
    eligibleDestinationIds: ["destination-endpoint", "destination-other"],
    now: NOW,
    remainingMinutesToday: 120,
    ...input,
  });
}

describe("US36 Task290 mandatory endpoint", () => {
  it("returns a code-built constraint for a valid future deadline in the remaining window", () => {
    expect(apply(candidate())).toMatchObject({
      status: "READY",
      mandatoryEndpoint: { destinationId: "destination-endpoint", deadline: "18:00" },
    });
  });

  it("rejects a deadline that has already passed in Vietnam local time", () => {
    expect(apply(candidate(), { verifiedEndpoint: endpoint("destination-endpoint", "16:59") }))
      .toMatchObject({
        status: "INFEASIBLE",
        code: "REPLAN_ENDPOINT_DEADLINE_INFEASIBLE",
      });
  });

  it("rejects a future deadline outside the remaining-time window", () => {
    expect(apply(candidate(), { remainingMinutesToday: 30 })).toMatchObject({
      status: "INFEASIBLE",
      code: "REPLAN_ENDPOINT_DEADLINE_INFEASIBLE",
    });
  });

  it("rejects an endpoint that is no longer eligible", () => {
    expect(apply(candidate(), { eligibleDestinationIds: ["destination-other"] })).toMatchObject({
      status: "INFEASIBLE",
      code: "REPLAN_ENDPOINT_INELIGIBLE",
    });
  });

  it("does not require a destination already present in a completed visit", () => {
    const withCompletedEndpoint = createEditCandidate({
      startDate: "2026-10-17",
      durationDays: 1,
      transport: "CAR",
      days: [{
        dayIndex: 1,
        visits: [
          {
            id: "completed-endpoint",
            destinationId: "destination-endpoint",
            startMinute: 840,
            plannedDurationMinutes: 30,
            order: 1,
          },
          {
            id: "remaining-other",
            destinationId: "destination-other",
            startMinute: 1080,
            plannedDurationMinutes: 30,
            order: 2,
          },
        ],
      }],
    });

    expect(apply(withCompletedEndpoint, { completedVisitIds: ["completed-endpoint"] })).toMatchObject({
      status: "INFEASIBLE",
      code: "REPLAN_ENDPOINT_ALREADY_COMPLETED",
    });
  });

  it("moves an existing remaining endpoint visit to the last remaining position", () => {
    const endpointOnEarlierDay = createEditCandidate({
      startDate: "2026-10-17",
      durationDays: 2,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [{
            id: "remaining-endpoint",
            destinationId: "destination-endpoint",
            startMinute: 1080,
            plannedDurationMinutes: 30,
            order: 1,
          }],
        },
        {
          dayIndex: 2,
          visits: [{
            id: "remaining-other",
            destinationId: "destination-other",
            startMinute: 600,
            plannedDurationMinutes: 30,
            order: 1,
          }],
        },
      ],
    });
    const result = apply(endpointOnEarlierDay);

    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.candidate.days[1]?.visits.map((visit) => visit.visitId)).toEqual([
      "remaining-other",
      "remaining-endpoint",
    ]);
    expect(result.candidate.days[1]?.visits.map((visit) => visit.order)).toEqual([1, 2]);
  });

  it("returns infeasible instead of inventing a new visit when the proposal omits the endpoint", () => {
    const withoutEndpoint = createEditCandidate({
      startDate: "2026-10-17",
      durationDays: 1,
      transport: "CAR",
      days: [{
        dayIndex: 1,
        visits: [{
          id: "remaining-other",
          destinationId: "destination-other",
          startMinute: 1080,
          plannedDurationMinutes: 30,
          order: 1,
        }],
      }],
    });

    expect(apply(withoutEndpoint)).toMatchObject({
      status: "INFEASIBLE",
      code: "REPLAN_ENDPOINT_NOT_IN_CANDIDATE",
    });
  });
});
