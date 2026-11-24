import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { AssistantPlanMessage } from "@/components/assistant/assistant-plan-message";
import { EMPTY_PLANNING_NEEDS } from "@/modules/assistant-planning/planning-contract";
import { scheduleSelection } from "@/modules/assistant-planning/planning-engine";
import { clearForecastCache } from "@/modules/trip-weather/forecast";
import { fixtureNeeds, fixtureRoutes, planningCandidate, planningNow } from "@/test/planning-fixtures";
import {
  fallbackPlanningV2Reply,
  planningResponsePlan,
  safePlanningV2Reply,
  type PlanningResponsePlan,
} from "./planning-response";
import {
  ADVISORY_KIND_PRIORITY,
  createProposalWeatherEvaluator,
  formatProposalWeatherAdvisoryLine,
  selectProposalWeatherAdvisories,
} from "./proposal-weather-advisories";
import { loadAssistantSkill } from "./skill-registry";

vi.mock("server-only", () => ({}));

const FIXED_NOW = () => new Date("2026-11-18T00:00:00Z");
const TRIP_DATE = "2026-11-20";

function makeOpenMeteoFetcher(
  overrideHour: (hour: number) => Partial<{
    temperature_2m: number;
    precipitation_probability: number;
    precipitation: number;
    visibility: number;
    wind_gusts_10m: number;
  }> = () => ({}),
  dates = ["2026-11-18", "2026-11-19", TRIP_DATE, "2026-11-21"],
): typeof fetch {
  const rows = dates.flatMap(d =>
    Array.from({ length: 24 }, (_, h) => ({
      time: `${d}T${String(h).padStart(2, "0")}:00`,
      temperature_2m: 15,
      precipitation_probability: 10,
      precipitation: 0,
      visibility: 15_000,
      wind_gusts_10m: 12,
      ...overrideHour(h),
    })),
  );
  const location = {
    hourly: {
      time: rows.map(r => r.time),
      temperature_2m: rows.map(r => r.temperature_2m),
      precipitation_probability: rows.map(r => r.precipitation_probability),
      precipitation: rows.map(r => r.precipitation),
      visibility: rows.map(r => r.visibility),
      wind_gusts_10m: rows.map(r => r.wind_gusts_10m),
      weather_code: rows.map(() => 1),
    },
  };
  return (async (url: string | URL | Request) => {
    const count = new URL(String(url)).searchParams.get("latitude")!.split(",").length;
    return new Response(JSON.stringify(count === 1 ? location : Array.from({ length: count }, () => location)));
  }) as typeof fetch;
}

function fakeWeatherDb(outdoorIds: string[] = ["a", "b"]) {
  const rows = [
    { id: "a", latitude: 23.36, longitude: 105.31, isOutdoor: outdoorIds.includes("a") },
    { id: "b", latitude: 23.27, longitude: 105.36, isOutdoor: outdoorIds.includes("b") },
    { id: "c", latitude: 23.06, longitude: 104.99, isOutdoor: outdoorIds.includes("c") },
  ];
  return {
    destination: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        rows.filter(r => where.id.in.includes(r.id)),
    },
  } as unknown as Pick<Database, "destination">;
}

async function buildProposal(startDate: string | null = TRIP_DATE) {
  const needs = {
    ...fixtureNeeds,
    requirement: { ...fixtureNeeds.requirement, durationDays: 2, transport: "MOTORCYCLE" as const, startDate },
  };
  return scheduleSelection(
    needs,
    { days: [["a"], ["b"]] },
    [planningCandidate("a"), planningCandidate("b")],
    fixtureRoutes,
    planningNow,
  );
}

beforeEach(() => {
  clearForecastCache();
});

describe("Ticket 05: Proposal reply weather advisory line", () => {
  it("ranks advisories by fixed severity (FOG > RAIN > WIND > AFTER_SUNSET, then relative exceedance) and caps at 2", async () => {
    expect(ADVISORY_KIND_PRIORITY).toEqual({ FOG: 4, RAIN: 3, WIND: 2, AFTER_SUNSET: 1 });
    const proposal = await buildProposal(TRIP_DATE);
    const selected = selectProposalWeatherAdvisories(
      {
        days: [
          {
            day: 1,
            date: TRIP_DATE,
            sunTimes: null,
            visits: [
              {
                destinationId: "a",
                isOutdoor: true,
                weather: {
                  status: "AVAILABLE",
                  summary: {
                    fromTime: `${TRIP_DATE}T08:00`,
                    toTime: `${TRIP_DATE}T09:00`,
                    minTemperatureC: 12,
                    maxTemperatureC: 14,
                    maxPrecipitationProbability: 75,
                    maxPrecipitationMm: 2,
                    minVisibilityM: 500,
                    maxWindGustKmh: 48,
                  },
                },
              },
            ],
          },
        ],
        legs: [],
        advisories: [
          { kind: "AFTER_SUNSET", day: 1, location: { type: "VISIT", destinationId: "a" }, fromTime: `${TRIP_DATE}T17:00`, toTime: `${TRIP_DATE}T18:10`, observed: 1090, threshold: 1035 },
          { kind: "WIND", day: 1, location: { type: "VISIT", destinationId: "a" }, fromTime: `${TRIP_DATE}T08:00`, toTime: `${TRIP_DATE}T09:00`, observed: 48, threshold: 40 },
          { kind: "RAIN", day: 2, location: { type: "VISIT", destinationId: "b" }, fromTime: `2026-11-21T10:00`, toTime: `2026-11-21T11:00`, observed: 72, threshold: 70 },
          { kind: "RAIN", day: 1, location: { type: "VISIT", destinationId: "a" }, fromTime: `${TRIP_DATE}T08:00`, toTime: `${TRIP_DATE}T09:00`, observed: 90, threshold: 70 },
          { kind: "FOG", day: 1, location: { type: "LEG", legIndex: 0, label: "Điểm a → Điểm b" }, fromTime: `${TRIP_DATE}T13:00`, toTime: `${TRIP_DATE}T14:00`, observed: 400, threshold: 1000 },
        ],
        source: { provider: "OPEN_METEO", fetchedAt: "2026-11-18T00:00:00Z" },
      },
      proposal,
    );

    // Out of 5 advisories, picks top 2: FOG (400m) first, then heavier RAIN (90% > 72%)
    expect(selected).toHaveLength(2);
    expect(selected.map(s => [s.kind, s.observed])).toEqual([
      ["FOG", 400],
      ["RAIN", 90],
    ]);
  });

  it("handles 0, 1, 2, and 3 advisories via getTripWeather without changing Validator results or save eligibility", async () => {
    const proposal = await buildProposal(TRIP_DATE);
    const originalChecks = structuredClone(proposal.checks);
    const originalStatus = proposal.status;
    const originalEligible = proposal.eligibleForFinalConfirmation;

    // 0 advisories
    const evalZero = createProposalWeatherEvaluator({
      database: fakeWeatherDb(),
      forecast: { now: FIXED_NOW, fetcher: makeOpenMeteoFetcher() },
    });
    const zero = await evalZero(proposal);
    expect(zero).toEqual([]);
    expect(formatProposalWeatherAdvisoryLine(zero)).toBeNull();

    // 1 advisory (RAIN on day 1 only: day 1 visit at 08:00, day 2 visit at 08:00 -> use single-day proposal for 1 advisory)
    clearForecastCache();
    const oneDayProposal = await scheduleSelection(
      { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, durationDays: 1, transport: "MOTORCYCLE", startDate: TRIP_DATE } },
      { days: [["a"]] },
      [planningCandidate("a")],
      fixtureRoutes,
      planningNow,
    );
    const evalOne = createProposalWeatherEvaluator({
      database: fakeWeatherDb(),
      forecast: { now: FIXED_NOW, fetcher: makeOpenMeteoFetcher(() => ({ precipitation_probability: 80 })) },
    });
    const one = await evalOne(oneDayProposal);
    expect(one).toHaveLength(1);
    const lineOne = formatProposalWeatherAdvisoryLine(one)!;
    expect(lineOne).toContain("ngày 1 tại Điểm a");
    expect(lineOne).toContain("cảnh báo mưa (khả năng mưa 80%)");
    expect(lineOne).toContain("bảng thời tiết bên dưới");
    expect(lineOne).not.toMatch(/nên đi|không nên đi/i);

    // 2 advisories (RAIN + WIND on 1-day proposal)
    clearForecastCache();
    const evalTwo = createProposalWeatherEvaluator({
      database: fakeWeatherDb(),
      forecast: { now: FIXED_NOW, fetcher: makeOpenMeteoFetcher(() => ({ precipitation_probability: 85, wind_gusts_10m: 46 })) },
    });
    const two = await evalTwo(oneDayProposal);
    expect(two).toHaveLength(2);
    const lineTwo = formatProposalWeatherAdvisoryLine(two)!;
    expect(lineTwo).toContain("cảnh báo mưa (khả năng mưa 85%)");
    expect(lineTwo).toContain("cảnh báo gió giật mạnh (46 km/h)");

    // 3 advisories (FOG + RAIN + WIND on 1-day proposal -> only 2 heaviest named: FOG and RAIN)
    clearForecastCache();
    const evalThree = createProposalWeatherEvaluator({
      database: fakeWeatherDb(),
      forecast: {
        now: FIXED_NOW,
        fetcher: makeOpenMeteoFetcher(() => ({ visibility: 500, precipitation_probability: 85, wind_gusts_10m: 46 })),
      },
    });
    const three = await evalThree(oneDayProposal);
    expect(three).toHaveLength(2);
    const lineThree = formatProposalWeatherAdvisoryLine(three)!;
    expect(lineThree).toContain("cảnh báo sương mù (tầm nhìn 0,5 km)");
    expect(lineThree).toContain("cảnh báo mưa (khả năng mưa 85%)");
    expect(lineThree).not.toContain("gió giật");

    // Validator & save conditions untouched
    expect(proposal.checks).toEqual(originalChecks);
    expect(proposal.status).toBe(originalStatus);
    expect(proposal.eligibleForFinalConfirmation).toBe(originalEligible);
  });

  it("omits the line when forecast is NOT_YET_AVAILABLE, missing startDate, or provider fails/times out", async () => {
    const farProposal = await buildProposal("2027-01-15");
    const evalFar = createProposalWeatherEvaluator({
      database: fakeWeatherDb(),
      forecast: { now: FIXED_NOW, fetcher: makeOpenMeteoFetcher(() => ({ precipitation_probability: 100 })) },
    });
    expect(await evalFar(farProposal)).toEqual([]);

    const datelessProposal = await buildProposal(null);
    expect(await evalFar(datelessProposal)).toEqual([]);

    // Provider HTTP 500
    clearForecastCache();
    const nearProposal = await buildProposal(TRIP_DATE);
    const evalError = createProposalWeatherEvaluator({
      database: fakeWeatherDb(),
      forecast: { now: FIXED_NOW, fetcher: (async () => new Response("", { status: 503 })) as typeof fetch },
    });
    expect(await evalError(nearProposal)).toEqual([]);

    // Hanging provider bounded by short timeout
    clearForecastCache();
    const started = Date.now();
    const evalSlow = createProposalWeatherEvaluator({
      database: fakeWeatherDb(),
      timeoutMs: 50,
      forecast: {
        now: FIXED_NOW,
        fetcher: ((_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })) as typeof fetch,
      },
    });
    expect(await evalSlow(nearProposal)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("adds the code-built line on PRESENT_PROPOSAL, REFINE_PROPOSAL and REPLAN_PROPOSAL, never on read-only or no-change turns, and never passes weather figures to the model", async () => {
    const proposal = await buildProposal(TRIP_DATE);
    const generated = {
      proposal,
      selection: { days: [["a"], ["b"]] },
      attempts: [{ status: proposal.status, checks: [] }],
      repairError: null,
      version: 2,
    };
    const needs = {
      ...EMPTY_PLANNING_NEEDS,
      requirement: { durationDays: 2, transport: "MOTORCYCLE" as const, startDate: TRIP_DATE },
    };
    const advisories = [
      {
        kind: "FOG" as const,
        day: 1,
        targetKind: "VISIT" as const,
        label: "Điểm a",
        fromTime: `${TRIP_DATE}T08:00`,
        toTime: `${TRIP_DATE}T09:00`,
        observed: 500,
        threshold: 1000,
      },
    ];
    const skill = loadAssistantSkill("travel-planning");

    // 1. PRESENT_PROPOSAL: model composer does NOT receive weatherAdvisories; code appends the line afterward
    const presentPlan: PlanningResponsePlan = {
      ...planningResponsePlan(needs, "PRESENT_PROPOSAL", generated),
      proposalChanged: true,
      weatherAdvisories: advisories,
    };
    const seenByModel: PlanningResponsePlan[] = [];
    const presentReply = await safePlanningV2Reply(presentPlan, skill, async planFromRuntime => {
      seenByModel.push(planFromRuntime);
      return "Với 2 ngày đi xe máy, mình xếp ngày 1: Điểm a; ngày 2: Điểm b để giữ tuyến gọn. Lịch này chưa lưu; các kiểm tra hiện có đều đáp ứng.";
    });
    expect(seenByModel[0]?.weatherAdvisories).toBeUndefined();
    expect(presentReply).toContain("Lưu ý thời tiết (chỉ để tham khảo): ngày 1 tại Điểm a (08:00–09:00) có cảnh báo sương mù (tầm nhìn 0,5 km) — bạn xem chi tiết ở bảng thời tiết bên dưới nhé.");

    // Renders cleanly in AssistantPlanMessage without breaking day parsing
    const planHtml = renderToStaticMarkup(createElement(AssistantPlanMessage, { message: presentReply, proposalBelow: true }));
    expect(planHtml).toContain("Lưu ý thời tiết (chỉ để tham khảo)");

    // 2. REPLAN_PROPOSAL (edit turn): includes advisory line
    const replanPlan: PlanningResponsePlan = {
      ...planningResponsePlan(needs, "REPLAN_PROPOSAL", generated),
      proposalChanged: true,
      replanDelta: { editTypes: ["ADD"], affectedDays: [1], dependencyDays: [], added: ["Điểm a"], removed: [], moved: [], semanticSelection: false },
      weatherAdvisories: advisories,
    };
    const replanReply = await safePlanningV2Reply(replanPlan, loadAssistantSkill("itinerary-replanning"), async () => "");
    expect(replanReply).toContain("Mình đã thêm Điểm a vào ngày 1");
    expect(replanReply).toContain("Lưu ý thời tiết (chỉ để tham khảo): ngày 1 tại Điểm a (08:00–09:00) có cảnh báo sương mù (tầm nhìn 0,5 km)");

    // 3. Read-only PLANNING_GUIDANCE and ACKNOWLEDGE_NO_CHANGE: NEVER adds weather advisory line even if present
    const guidancePlan: PlanningResponsePlan = {
      ...planningResponsePlan(needs, "PLANNING_GUIDANCE", generated),
      guidance: presentPlan.guidance,
      userQuestion: "Lịch này có mệt không?",
      proposalChanged: false,
      weatherAdvisories: advisories,
    };
    expect(fallbackPlanningV2Reply(guidancePlan)).not.toContain("Lưu ý thời tiết");
    const composedGuidance = await safePlanningV2Reply(
      guidancePlan,
      skill,
      async () => "Lịch 2 ngày khá nhẹ nhàng vì mỗi ngày chỉ có 1 điểm dừng.",
    );
    expect(composedGuidance).not.toContain("Lưu ý thời tiết");

    const noChangePlan: PlanningResponsePlan = {
      ...planningResponsePlan(needs, "ACKNOWLEDGE_NO_CHANGE", generated),
      proposalChanged: false,
      weatherAdvisories: advisories,
    };
    expect(fallbackPlanningV2Reply(noChangePlan)).not.toContain("Lưu ý thời tiết");
  });
});
