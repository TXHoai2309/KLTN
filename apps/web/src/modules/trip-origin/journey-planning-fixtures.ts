import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { plannerResultSchema, type PlannerResult } from "../trip-planner/planner-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";

/** Synthetic FE fixtures, not tourism evidence; never imported by runtime services. */
export function syntheticJourneyProposal(): PlannerResult {
  const requirement = tripRequirementInputSchema.parse({ startDate: "2027-01-02", durationDays: 1, transport: "CAR", journey: COMPLETE_JOURNEY_FIXTURE });
  const route = { status: "VERIFIED", reason: null, durationSeconds: 7200, distanceMeters: 120_000, provider: "STADIA_MAPS" } as const;
  return plannerResultSchema.parse({ proposalId: "synthetic-origin-proposal", phase: "PRELIMINARY_PROPOSAL", status: "PROPOSAL_READY", requirement, timezone: "Asia/Ho_Chi_Minh", eligibleForFinalConfirmation: true,
    days: [{ day: 1, date: "2027-01-02", journeyDayKind: "VISITS", distanceMeters: 240_000, travelSeconds: 14_400,
      stops: [{ order: 1, destination: { id: "synthetic-stop", name: "Điểm thử nghiệm", description: "Dữ liệu tổng hợp cho UI fixture", area: "TEST", category: "TEST", latitude: 22.8233, longitude: 104.9836, address: null, image: null },
        arrivalMinute: 480, departureMinute: 540, visitDurationMinutes: 60, scheduleState: "PLANNED", inbound: null, validationStatus: "PASS" }] }],
    journeyPlan: { policy: "roadside-rest-v1", legs: [
      { kind: "OUTBOUND", day: 1, from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: "synthetic-stop" }, route, startMinute: 360, endMinute: 480, restMinutes: 0 },
      { kind: "RETURN", day: 1, from: { kind: "ATTRACTION", destinationId: "synthetic-stop" }, to: { kind: "ORIGIN" }, route, startMinute: 540, endMinute: 660, restMinutes: 0 },
    ], totals: { drivingSeconds: 14_400, restMinutes: 0, distanceMeters: 240_000 } },
    checks: ["OPENING_HOURS", "MINIMUM_DURATION", "TRAVEL_TIME", "SCHEDULE_CONFLICTS", "MOBILITY"].map(key => ({ key, status: "PASS", issues: [] })),
    warnings: [{ code: "LODGING_LEGS_NOT_INCLUDED", day: null, destinationId: null, message: "Chưa tính chặng ra/vào nơi nghỉ; không có booking được xác nhận." }], reasonCodes: [],
  });
}

export function syntheticMissingJourneyProposal(): PlannerResult {
  const result = syntheticJourneyProposal();
  result.status = "INSUFFICIENT_DATA";
  result.eligibleForFinalConfirmation = false;
  result.journeyPlan!.legs[0]!.route = { status: "INSUFFICIENT_DATA", reason: "TIMEOUT", durationSeconds: null, distanceMeters: null, provider: null };
  result.journeyPlan!.legs[0]!.endMinute = null;
  result.journeyPlan!.legs[0]!.restMinutes = null;
  result.journeyPlan!.legs[1]!.startMinute = null;
  result.journeyPlan!.legs[1]!.endMinute = null;
  result.journeyPlan!.totals = { drivingSeconds: null, restMinutes: null, distanceMeters: null };
  result.days[0]!.distanceMeters = null; result.days[0]!.travelSeconds = null;
  result.days[0]!.stops[0] = { ...result.days[0]!.stops[0]!, arrivalMinute: null, departureMinute: null, scheduleState: "TIME_UNKNOWN", validationStatus: "INSUFFICIENT_DATA" };
  result.checks.find(check => check.key === "TRAVEL_TIME")!.status = "INSUFFICIENT_DATA";
  return plannerResultSchema.parse(result);
}
