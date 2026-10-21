import { describe, expect, it } from "vitest";
import { toTripProposal, toTripValidation } from "./planner-save-adapter";
import { tripProposalSchema } from "../trip-validation/trip-proposal-contract";
import type { PlannerResult } from "./planner-contract";

const baseProposal: PlannerResult = {
  proposalId: "proposal-1",
  phase: "PRELIMINARY_PROPOSAL",
  status: "PROPOSAL_READY",
  requirement: {
    startDate: "2026-12-20",
    durationDays: 2,
    transport: "CAR",
    pace: "MODERATE",
    companions: { type: "FRIENDS", groupSize: 4 },
    interests: ["NATURE"],
    mobilityConstraints: null,
  },
  timezone: "Asia/Ho_Chi_Minh",
  days: [
    {
      day: 1,
      date: "2026-12-20",
      stops: [
        {
          order: 1,
          destination: {
            id: "dest-1",
            name: "Điểm 1",
            description: "Mô tả 1",
            area: "Hà Giang",
            address: null,
            category: "NATURE",
            latitude: 23.1,
            longitude: 105.1,
            image: null,
          },
          arrivalMinute: 480,
          departureMinute: 540,
          visitDurationMinutes: 60,
          scheduleState: "PLANNED",
          inbound: null,
          validationStatus: "PASS",
        },
      ],
      distanceMeters: null,
      travelSeconds: null,
    },
    {
      day: 2,
      date: "2026-12-21",
      stops: [
        {
          order: 1,
          destination: {
            id: "dest-2",
            name: "Điểm 2",
            description: "Mô tả 2",
            area: "Đồng Văn",
            address: null,
            category: "NATURE",
            latitude: 23.2,
            longitude: 105.2,
            image: null,
          },
          arrivalMinute: 500,
          departureMinute: 560,
          visitDurationMinutes: 60,
          scheduleState: "PLANNED",
          inbound: null,
          validationStatus: "PASS",
        },
      ],
      distanceMeters: null,
      travelSeconds: null,
    },
  ],
  checks: [
    { key: "OPENING_HOURS", status: "PASS", issues: [] },
    { key: "MINIMUM_DURATION", status: "PASS", issues: [] },
    { key: "TRAVEL_TIME", status: "PASS", issues: [] },
    { key: "SCHEDULE_CONFLICTS", status: "PASS", issues: [] },
    { key: "MOBILITY", status: "PASS", issues: [] },
  ],
  warnings: [],
  reasonCodes: [],
  eligibleForFinalConfirmation: true,
};

describe("planner-save-adapter", () => {
  it("converts a valid PlannerResult into a valid TripProposal matching the schema", () => {
    const tripProposal = toTripProposal(baseProposal);
    expect(tripProposalSchema.safeParse(tripProposal).success).toBe(true);
    expect(tripProposal.startDate).toBe("2026-12-20");
    expect(tripProposal.durationDays).toBe(2);
    expect(tripProposal.days.length).toBe(2);
    expect(tripProposal.days[0]!.visits[0]!.destinationId).toBe("dest-1");
  });

  it("converts Planner checks into TripValidation and marks canConfirm correctly", () => {
    const validation = toTripValidation(baseProposal);
    expect(validation.canConfirm).toBe(true);
    expect(validation.groups.openingHours.status).toBe("SATISFIED");
    expect(validation.groups.minimumDuration.status).toBe("SATISFIED");
    expect(validation.groups.travelTime.status).toBe("SATISFIED");
    expect(validation.groups.scheduleConflict.status).toBe("SATISFIED");
  });

  it("blocks canConfirm when proposal is not eligible or has violations/insufficient data", () => {
    const unconfirmedProposal: PlannerResult = {
      ...baseProposal,
      eligibleForFinalConfirmation: false,
      checks: baseProposal.checks.map((c) =>
        c.key === "MOBILITY" ? { ...c, status: "INSUFFICIENT_DATA" } : c,
      ),
    };
    const validation = toTripValidation(unconfirmedProposal);
    expect(validation.canConfirm).toBe(false);
  });
});
