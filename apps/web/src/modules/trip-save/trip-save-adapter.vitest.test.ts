import { describe, expect, it } from "vitest";

import { candidates, fakeRoutes, referenceTime, requirement } from "../trip-planner/__fixtures__/planner-fixtures";
import { createPlannerService } from "../trip-planner/planner-service";
import { toSaveProposal } from "./trip-save-adapter";

const planner = createPlannerService({
  repository: { candidates: async () => candidates, recheck: async () => true },
  routes: fakeRoutes,
  now: () => referenceTime,
});

describe("US-30 planner to save handoff", () => {
  it("uses the real planned destination IDs, days, clocks, and durations", async () => {
    const result = await planner.propose("traveler", "save-handoff", requirement);
    const proposal = toSaveProposal(result);
    expect(proposal).not.toBeNull();
    expect(proposal).toMatchObject({
      startDate: requirement.startDate,
      durationDays: requirement.durationDays,
      transport: requirement.transport,
    });
    expect(proposal!.days.flatMap(day => day.visits.map(visit => visit.destinationId)))
      .toEqual(result.days.flatMap(day => day.stops.map(stop => stop.destination.id)));
    expect(proposal!.days[0]!.visits[0]).toMatchObject({
      startMinute: result.days[0]!.stops[0]!.arrivalMinute,
      plannedDurationMinutes: result.days[0]!.stops[0]!.visitDurationMinutes,
      order: 1,
    });
  });

  it("does not turn an undated or unscheduled preliminary proposal into a save request", async () => {
    const result = await planner.propose("traveler", "undated-handoff", { ...requirement, startDate: null });
    expect(toSaveProposal(result)).toBeNull();
    const valid = await planner.propose("traveler", "unscheduled-handoff", requirement);
    expect(toSaveProposal({ ...valid, days: valid.days.map((day, index) => index === 0 ? {
      ...day, stops: day.stops.map((stop, stopIndex) => stopIndex === 0 ? { ...stop, arrivalMinute: null, departureMinute: null, scheduleState: "TIME_UNKNOWN" as const } : stop),
    } : day) })).toBeNull();
  });
});
