import { describe, expect, it } from "vitest";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import { createPlannerService } from "../trip-planner/planner-service";
import type { RoutePair } from "../trip-planner/planner-routes";
import { candidate, requirement } from "../trip-planner/__fixtures__/planner-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { buildDayTimeline, resolveDayLunchBreak } from "../tripsage-chat/tripsage-timeline";

function makePlanner(candidates: PlannerCandidate[], opts: { coordSeconds?: number; routeSeconds?: number } = {}) {
  const routeSeconds = opts.routeSeconds ?? 1860;
  const coordSeconds = opts.coordSeconds ?? 7_500;
  return createPlannerService({
    repository: { candidates: async () => candidates, recheck: async () => true },
    routes: {
      async route(pair: RoutePair) {
        return {
          fromDestinationId: pair.from.id,
          toDestinationId: pair.to.id,
          status: "VERIFIED",
          reason: null,
          durationSeconds: routeSeconds,
          distanceMeters: 12_500,
          provider: "STADIA_MAPS",
        };
      },
      async coordinateRoute() {
        return {
          status: "VERIFIED" as const,
          reason: null,
          durationSeconds: coordSeconds,
          distanceMeters: Math.round(coordSeconds * 11),
          provider: "STADIA_MAPS" as const,
        };
      },
    },
    now: () => new Date("2026-12-01T00:00:00Z"),
    id: () => "adr57-d1-d4-test",
  });
}

describe("ADR-57 (D1 & D4): return deadline advisory & flexible mandatory lunch", () => {
  it("D1: late return past user deadline emits advisory warning without blocking confirmation", async () => {
    const stop: PlannerCandidate = candidate("dong-van-stop", {
      area: "Đồng Văn",
      latitude: 23.278,
      longitude: 105.362,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
    });
    const service = makePlanner([stop], { coordSeconds: 21_600 }); // 6h drive + 30m rest -> return past 18:00

    const result = await service.propose("owner-d1", "req-d1-late-return", {
      ...requirement,
      startDate: "2027-01-01",
      durationDays: 1,
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        departureMinute: 480, // 08:00 -> +6h30m = 14:30 arrive, +1h visit = 15:30, +6h30m return = 22:00 (> 18:00)
        returnDeadlineMinute: 1080, // 18:00 desired deadline
      },
    });

    expect(result.status).toBe("PROPOSAL_READY");
    expect(result.eligibleForFinalConfirmation).toBe(true);
    expect(result.checks.find((c) => c.key === "TRAVEL_TIME")?.status).toBe("PASS");
    expect(result.reasonCodes).not.toContain("RETURN_DEADLINE_MISSED");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RETURN_DEADLINE_MISSED",
          message: expect.stringContaining("18:00"),
        }),
      ]),
    );
  });

  it("D4: schedules early pre-visit lunch before a long afternoon attraction (Meo Vac 10:05 -> Nho Que 180m)", async () => {
    const meoVac = candidate("meo-vac", {
      name: "Trung tâm Mèo Vạc",
      area: "Mèo Vạc",
      latitude: 23.164,
      longitude: 105.405,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      openingDays: [
        { dayOfWeek: "FRIDAY", status: "OPEN", intervals: [{ opensAtMinute: 605, closesAtMinute: 1080 }] }, // 10:05–18:00
      ],
    });
    const nhoQue = candidate("song-nho-que", {
      name: "Sông Nho Quế",
      area: "Mèo Vạc",
      latitude: 23.225,
      longitude: 105.418,
      suggestedDurationMinutes: 180,
      minimumDurationMinutes: 120,
      openingDays: [
        { dayOfWeek: "FRIDAY", status: "OPEN", intervals: [{ opensAtMinute: 480, closesAtMinute: 1080 }] },
      ],
    });

    const service = makePlanner([meoVac, nhoQue], { coordSeconds: 3_600, routeSeconds: 1_860 });
    const result = await service.propose("owner-d4", "req-d4-early-lunch", {
      ...requirement,
      startDate: "2027-01-01",
      durationDays: 1,
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        departureMinute: 360,
        returnDeadlineMinute: 1380,
      },
    });

    expect(result.status).toBe("PROPOSAL_READY");
    const stops = result.days[0]!.stops;
    expect(stops).toHaveLength(2);
    expect(stops[0]!.departureMinute).toBe(665); // 11:05
    expect(stops[1]!.scheduleState).toBe("PLANNED");
    expect(stops[1]!.arrivalMinute).toBeGreaterThanOrEqual(665 + 60 + 31); // lunch inserted before 180m visit!

    const timeline = buildDayTimeline(result);
    const lunch = timeline.days[0]!.items.find((item) => item.kind === "LUNCH");
    expect(lunch).toMatchObject({
      kind: "LUNCH",
      startMinute: 665,
      endMinute: 725,
      description: "Nghỉ trưa sớm (trước điểm tham quan dài)",
    });

    const resolved = resolveDayLunchBreak({
      stops: stops.map((s) => ({
        destinationId: s.destination.id,
        arrivalMinute: s.arrivalMinute,
        departureMinute: s.departureMinute,
      })),
      timelineDay: timeline.days[0],
      journeyPlan: result.journeyPlan,
    });
    expect(resolved?.note).toBe("Nghỉ trưa sớm (trước điểm tham quan dài)");
  });

  it("D4: falls back to late flexible lunch without dropping stop when shifting before visit would miss closing hours", async () => {
    const meoVac = candidate("meo-vac", {
      name: "Trung tâm Mèo Vạc",
      area: "Mèo Vạc",
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      openingDays: [
        { dayOfWeek: "FRIDAY", status: "OPEN", intervals: [{ opensAtMinute: 605, closesAtMinute: 1080 }] },
      ],
    });
    const nhoQueTightClose = candidate("song-nho-que-early-close", {
      name: "Sông Nho Quế",
      area: "Mèo Vạc",
      suggestedDurationMinutes: 180,
      minimumDurationMinutes: 120,
      openingDays: [
        { dayOfWeek: "FRIDAY", status: "OPEN", intervals: [{ opensAtMinute: 480, closesAtMinute: 900 }] }, // closes 15:00
      ],
    });

    const service = makePlanner([meoVac, nhoQueTightClose], { coordSeconds: 3_600, routeSeconds: 1_860 });
    const result = await service.propose("owner-d4-tight", "req-d4-tight-close", {
      ...requirement,
      startDate: "2027-01-01",
      durationDays: 1,
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        departureMinute: 360,
        returnDeadlineMinute: 1380,
      },
    });

    const stops = result.days[0]!.stops;
    expect(stops).toHaveLength(2);
    expect(stops[1]!.scheduleState).toBe("PLANNED");
    expect(stops[1]!.arrivalMinute!).toBeLessThanOrEqual(720);
    expect(stops[1]!.departureMinute!).toBeLessThanOrEqual(900);
    expect(result.checks.find((c) => c.key === "OPENING_HOURS")?.status).toBe("PASS");
    expect(result.checks.find((c) => c.key === "SCHEDULE_CONFLICTS")?.status).toBe("PASS");

    const timeline = buildDayTimeline(result);
    const lunch = timeline.days[0]!.items.find((item) => item.kind === "LUNCH");
    expect(lunch).toBeDefined();
    expect(lunch!.startMinute).toBe(stops[1]!.departureMinute);
    expect(lunch!.description).toBe("Nghỉ trưa muộn (lịch liên tục qua trưa)");
  });
});
