import { describe, expect, it } from "vitest";
import { candidate } from "../trip-planner/__fixtures__/planner-fixtures";
import type { CoordinateRoutePair, RouteProvider } from "../trip-planner/planner-routes";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { planJourney } from "./journey-planner";
import { OVERNIGHT_TOWN_CENTERS } from "../../lib/traveler-display-clean";
import {
  resolveOvernightAnchorTown,
  resolveOvernightCheckinPresentation,
  resolvePreviousOvernightArea,
} from "../../lib/overnight-anchor";
import { evaluateEditJourney } from "../trip-edit/edit-journey-server";

describe("ADR-57 (D2): overnight town anchors and day route headers", () => {
  it("anchors RETURN_ONLY return leg and evening checkin on overnight town center when > 1 km from last stop", async () => {
    const coordCalls: CoordinateRoutePair[] = [];
    const nhoQue = candidate("song-nho-que", {
      name: "Sông Nho Quế",
      area: "Mèo Vạc",
      latitude: 23.2195,
      longitude: 105.429,
      suggestedDurationMinutes: 180,
      minimumDurationMinutes: 120,
    });
    const provider: RouteProvider = {
      async route(pair) {
        return {
          fromDestinationId: pair.from.id,
          toDestinationId: pair.to.id,
          status: "VERIFIED",
          reason: null,
          durationSeconds: 1800,
          distanceMeters: 15_000,
          provider: "STADIA_MAPS",
        };
      },
      async coordinateRoute(pair) {
        coordCalls.push(pair);
        const dx = (pair.from.latitude - pair.to.latitude) * 111;
        const dy = (pair.from.longitude - pair.to.longitude) * 102;
        const km = Math.max(1, Math.hypot(dx, dy) * 1.4);
        return {
          status: "VERIFIED",
          reason: null,
          durationSeconds: Math.max(600, Math.round((km / 35) * 3600)),
          distanceMeters: Math.round(km * 1000),
          provider: "STADIA_MAPS",
        };
      },
    };

    const req = tripRequirementInputSchema.parse({
      startDate: "2027-01-01",
      durationDays: 2,
      transport: "MOTORCYCLE",
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        departureMinute: 360,
        returnDepartureMinute: 480,
        returnDeadlineMinute: 1200,
      },
    });

    const result = await planJourney(req, [[nhoQue], []], provider);
    const meoVacCenter = OVERNIGHT_TOWN_CENTERS["Mèo Vạc"]!;

    // RETURN leg on RETURN_ONLY Day 2 must depart from Mèo Vạc center, NOT Sông Nho Quế
    const returnCoordCall = coordCalls.find(
      (c) =>
        Math.abs(c.to.latitude - req.journey!.origin!.latitude) < 1e-4 &&
        Math.abs(c.to.longitude - req.journey!.origin!.longitude) < 1e-4,
    );
    expect(returnCoordCall).toBeDefined();
    expect(returnCoordCall!.from.latitude).toBeCloseTo(meoVacCenter.latitude, 4);
    expect(returnCoordCall!.from.longitude).toBeCloseTo(meoVacCenter.longitude, 4);

    // Day 1 records evening checkin leg Sông Nho Quế -> Mèo Vạc center
    const stay = result.journeyPlan.overnightStays?.find((s) => s.day === 1);
    expect(stay).toMatchObject({
      day: 1,
      area: "Mèo Vạc",
      fromDestinationId: "song-nho-que",
      checkinRoute: { status: "VERIFIED" },
    });
    expect(stay!.distanceFromLastStopKm).toBeGreaterThan(1);

    const checkinPres = resolveOvernightCheckinPresentation({
      overnightStay: stay,
      lastStop: nhoQue,
      transport: "MOTORCYCLE",
    });
    expect(checkinPres.area).toBe("Mèo Vạc");
    expect(checkinPres.checkinRouteSummary).toContain("Về khu vực Mèo Vạc:");

    const prevArea = resolvePreviousOvernightArea({
      dayIndex: 2,
      overnightStays: result.journeyPlan.overnightStays,
      previousDays: [{ dayIndex: 1, lastStop: nhoQue }],
    });
    expect(prevArea).toBe("Mèo Vạc");
  });

  it("uses overnight town center for cross-day morning transfer (>1km) and skips checkin detour when <=1km", async () => {
    const coordCalls: CoordinateRoutePair[] = [];
    const lungKhuy = candidate("lung-khuy", {
      name: "Hang Lùng Khúy",
      area: "Quản Bạ",
      latitude: 23.0788,
      longitude: 105.0199,
    });
    const yenMinh = candidate("yen-minh", {
      name: "Rừng thông Yên Minh",
      area: "Yên Minh",
      latitude: 23.1167,
      longitude: 105.15,
    });
    const dongVanCenterStop = candidate("dong-van", {
      name: "Phố cổ Đồng Văn",
      area: "Đồng Văn",
      latitude: OVERNIGHT_TOWN_CENTERS["Đồng Văn"]!.latitude,
      longitude: OVERNIGHT_TOWN_CENTERS["Đồng Văn"]!.longitude,
    });

    const provider: RouteProvider = {
      async route(pair) {
        return {
          fromDestinationId: pair.from.id,
          toDestinationId: pair.to.id,
          status: "VERIFIED",
          reason: null,
          durationSeconds: 1800,
          distanceMeters: 15_000,
          provider: "STADIA_MAPS",
        };
      },
      async coordinateRoute(pair) {
        coordCalls.push(pair);
        return {
          status: "VERIFIED",
          reason: null,
          durationSeconds: 3600,
          distanceMeters: 30_000,
          provider: "STADIA_MAPS",
        };
      },
    };

    const req = tripRequirementInputSchema.parse({
      startDate: "2027-01-01",
      durationDays: 2,
      transport: "MOTORCYCLE",
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        departureMinute: 360,
        returnDeadlineMinute: 1260,
      },
    });

    const res = await planJourney(req, [[lungKhuy], [yenMinh]], provider);
    const quanBaCenter = OVERNIGHT_TOWN_CENTERS["Quản Bạ"]!;
    const morningToYenMinh = coordCalls.find(
      (c) =>
        Math.abs(c.to.latitude - yenMinh.latitude) < 1e-4 &&
        Math.abs(c.to.longitude - yenMinh.longitude) < 1e-4,
    );
    expect(morningToYenMinh?.from.latitude).toBeCloseTo(quanBaCenter.latitude, 4);
    expect(morningToYenMinh?.from.longitude).toBeCloseTo(quanBaCenter.longitude, 4);
    expect(res.journeyPlan.overnightStays?.[0]?.area).toBe("Quản Bạ");

    // In-town stop (<= 1 km) skips detour leg & check-in presentation never shifts when lodging changes
    const inTownAnchor = resolveOvernightAnchorTown(dongVanCenterStop);
    expect(inTownAnchor).not.toBeNull();
    expect(inTownAnchor!.needsCheckinLeg).toBe(false);
    expect(
      resolveOvernightCheckinPresentation({ lastStop: dongVanCenterStop, transport: "MOTORCYCLE" }),
    ).toEqual({
      area: "Đồng Văn",
      estimatedCheckinTravelMinutes: 5,
      checkinRouteSummary: null,
    });
  });

  it("matches edit-journey-server overnight town anchors on RETURN_ONLY and cross-day legs", async () => {
    const originsRequested: Array<{ latitude: number; longitude: number }> = [];
    const meoVacCenter = OVERNIGHT_TOWN_CENTERS["Mèo Vạc"]!;
    const nhoQue = {
      id: "nho-que",
      latitude: 23.2195,
      longitude: 105.429,
      minimumDurationMinutes: 60,
      openingDays: [
        { dayOfWeek: "TUESDAY" as const, status: "OPEN" as const, intervals: [{ opensAtMinute: 360, closesAtMinute: 1200 }] },
      ],
    };

    await evaluateEditJourney({
      candidate: {
        startDate: "2026-10-20",
        durationDays: 2,
        transport: "MOTORCYCLE",
        days: [
          {
            dayIndex: 1,
            visits: [
              { visitId: "v1", destinationId: "nho-que", startMinute: 660, plannedDurationMinutes: 120, order: 1 },
            ],
          },
          { dayIndex: 2, visits: [] },
        ],
        journey: {
          origin: { label: "Hà Nội", latitude: 21.0285, longitude: 105.8542, source: "MANUAL", confirmed: true },
          departureMinute: 360,
          returnDepartureMinute: 480,
          returnDeadlineMinute: 1080,
        },
      },
      existingJourneySnapshot: null,
      tripStartDate: new Date("2026-10-20T00:00:00.000Z"),
      manuallyCompletedAt: null,
      destinations: new Map([["nho-que", nhoQue]]),
      legs: [],
      getRoute: async (input) => {
        originsRequested.push(input.origin);
        return { kind: "ok", durationSeconds: 28_800, distanceMeters: 420_000, provider: "STADIA_MAPS" };
      },
      timeReference: new Date("2026-10-01T00:00:00.000Z"),
    });

    expect(
      originsRequested.some(
        (pt) => Math.abs(pt.latitude - meoVacCenter.latitude) < 1e-4 && Math.abs(pt.longitude - meoVacCenter.longitude) < 1e-4,
      ),
    ).toBe(true);
  });
});
