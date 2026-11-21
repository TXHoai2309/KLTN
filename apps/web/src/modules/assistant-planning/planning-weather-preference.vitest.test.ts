import { afterEach, describe, expect, it } from "vitest";
import { weekdays } from "../destination/destination-contract";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { WEATHER_PREFERENCE_WARNING } from "../trip-planner/planner-weather-preference";
import { clearForecastCache } from "../trip-weather/forecast";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import {
  acceptsPlanningV2Reply,
  appendProposalWeatherAdvisoryLine,
  planningResponsePlan,
  WEATHER_PREFERENCE_REPLY_NOTE,
  type PlanningResponsePlan,
} from "../assistant-agent-v2/planning-response";
import { scheduleSelection } from "./planning-engine";
import type { PlanningNeeds } from "./planning-contract";

afterEach(() => {
  clearForecastCache();
});

const allOpen = weekdays.map(dayOfWeek => ({
  dayOfWeek,
  status: "OPEN",
  intervals: [{ opensAtMinute: 480, closesAtMinute: 1200 }],
}));

function makeCandidate(overrides: Partial<PlannerCandidate> & { id: string; name: string }): PlannerCandidate {
  return {
    description: "",
    area: "Đồng Văn",
    category: "Thiên nhiên",
    address: null,
    latitude: 23.27,
    longitude: 105.36,
    image: null,
    visibility: "VISIBLE",
    revision: "1:2026-11-01T00:00:00Z",
    suggestedDurationMinutes: 240,
    minimumDurationMinutes: 60,
    isOutdoor: false,
    openingDays: allOpen,
    ...overrides,
  };
}

const fakeRoutes: RouteProvider = {
  async route(pair) {
    return {
      fromDestinationId: pair.from.id,
      toDestinationId: pair.to.id,
      status: "VERIFIED",
      reason: null,
      durationSeconds: 600,
      distanceMeters: 6000,
      provider: "STADIA_MAPS",
    };
  },
};

function makeNeeds(durationDays: number, requiredDestinationIds: string[] = []): PlanningNeeds {
  return {
    requirement: tripRequirementInputSchema.parse({
      startDate: "2027-01-10",
      durationDays,
      transport: "CAR",
      pace: "MODERATE",
      interests: ["NATURE"],
      companions: { type: "SOLO", groupSize: 1 },
    }),
    requiredDestinationIds,
    preferredDestinationIds: [],
    excludedDestinationIds: [],
    destinationNames: {},
  };
}

describe("Assistant scheduleSelection weather & sunset preference", () => {
  it("reorders an outdoor stop before sunset on new proposal and emits WEATHER_PREFERENCE_WARNING", async () => {
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", isOutdoor: false, suggestedDurationMinutes: 330 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Đèo", isOutdoor: true, suggestedDurationMinutes: 240, latitude: 23.28, longitude: 105.37 });
    const needs = makeNeeds(1, ["indoor-1", "outdoor-1"]);

    const proposal = await scheduleSelection(
      needs,
      { days: [["indoor-1", "outdoor-1"]] },
      [indoor, outdoor],
      fakeRoutes,
      new Date("2026-11-18T00:00:00Z"),
    );

    expect(proposal.days[0]!.stops[0]!.destination.id).toBe("outdoor-1");
    expect(proposal.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(true);
  });

  it("only reorders within affectedDays on scoped edits and leaves untouched days unchanged", async () => {
    const d1Indoor = makeCandidate({ id: "d1-in", name: "Chợ", isOutdoor: false, suggestedDurationMinutes: 330 });
    const d1Outdoor = makeCandidate({ id: "d1-out", name: "Cổng trời", isOutdoor: true, suggestedDurationMinutes: 240, latitude: 23.28, longitude: 105.37 });
    const d2Indoor = makeCandidate({ id: "d2-in", name: "Bảo tàng", isOutdoor: false, suggestedDurationMinutes: 330 });
    const d2Outdoor = makeCandidate({ id: "d2-out", name: "Mã Pí Lèng", isOutdoor: true, suggestedDurationMinutes: 240, latitude: 23.29, longitude: 105.38 });
    const needs = makeNeeds(2);

    // Baseline has day 1 intentionally kept as [d1-in, d1-out] in current proposal
    const current = await scheduleSelection(
      needs,
      { days: [["d1-in", "d1-out"], ["d2-in", "d2-out"]] },
      [d1Indoor, d1Outdoor, d2Indoor, d2Outdoor],
      fakeRoutes,
      new Date("2026-11-18T00:00:00Z"),
    );
    // Force day 1 back to [d1-in, d1-out] in a synthetic current snapshot to test scope isolation
    const frozenDay1 = {
      ...current,
      days: [
        {
          ...current.days[0]!,
          stops: [
            { ...current.days[0]!.stops[0]!, destination: { ...current.days[0]!.stops[0]!.destination, id: "d1-in", name: "Chợ" } },
            { ...current.days[0]!.stops[1]!, destination: { ...current.days[0]!.stops[1]!.destination, id: "d1-out", name: "Cổng trời" } },
          ],
        },
        current.days[1]!,
      ],
    };

    const scoped = await scheduleSelection(
      needs,
      { days: [["d1-in", "d1-out"], ["d2-in", "d2-out"]] },
      [d1Indoor, d1Outdoor, d2Indoor, d2Outdoor],
      fakeRoutes,
      new Date("2026-11-18T00:00:00Z"),
      { current: frozenDay1, affectedDays: [2] },
    );

    // Day 1 was outside affectedDays -> untouched
    expect(scoped.days[0]!.stops.map(s => s.destination.id)).toEqual(["d1-in", "d1-out"]);
    // Day 2 was inside affectedDays -> outdoor moved before indoor
    expect(scoped.days[1]!.stops.map(s => s.destination.id)).toEqual(["d2-out", "d2-in"]);
    expect(scoped.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(true);
  });
});

describe("Assistant reply weather preference explainability note", () => {
  const basePlan: PlanningResponsePlan = {
    ...planningResponsePlan(makeNeeds(1), "PRESENT_PROPOSAL"),
    weatherPreferenceApplied: true,
  };

  it("appends WEATHER_PREFERENCE_REPLY_NOTE on mutating turns when applied and passes reply validation", () => {
    const baseReply = "Mình đã lên lịch trình 1 ngày cho bạn. Đề xuất này chưa được lưu.";
    const fullReply = appendProposalWeatherAdvisoryLine(baseReply, basePlan);
    expect(fullReply).toContain(WEATHER_PREFERENCE_REPLY_NOTE);
    expect(acceptsPlanningV2Reply(fullReply, basePlan)).toBe(true);
  });

  it("omits WEATHER_PREFERENCE_REPLY_NOTE on read-only turns", () => {
    const readOnlyPlan: PlanningResponsePlan = { ...basePlan, goal: "ACKNOWLEDGE_NO_CHANGE" };
    const baseReply = "Mình giữ nguyên lịch hiện tại.";
    expect(appendProposalWeatherAdvisoryLine(baseReply, readOnlyPlan)).toBe(baseReply);
  });
});
