import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CHECK_KEYS, type PlannerResult } from "@/modules/trip-planner/planner-contract";
import { tripRequirementInputSchema } from "@/modules/trip-requirement/trip-requirement-contract";
import { nearbyActivitySuggestions } from "@/modules/tripsage-chat/tripsage-activities";
import { formatTravelerOriginLabel } from "@/lib/traveler-trip-title";
import { getDestinationVisual } from "@/lib/destination-visuals";
import { DayTimeline } from "@/components/trip-timeline/day-timeline";
import { buildDayEveningPlan } from "@/components/trip-timeline/evening-plan";
import { TripsagePlanPanel } from "./tripsage-plan-panel";
import { readConversationState } from "./tripsage-conversation-state";

function makeSelfDriveHaNoiProposal(): PlannerResult {
  return {
    proposalId: "prop-adr57-d3",
    phase: "PRELIMINARY_PROPOSAL",
    status: "PROPOSAL_READY",
    requirement: tripRequirementInputSchema.parse({
      startDate: "2026-12-28",
      durationDays: 2,
      transport: "MOTORCYCLE",
      interests: ["NATURE"],
      journey: {
        origin: {
          label: "Hà Nội (bến xe Mỹ Đình)",
          latitude: 21.0287,
          longitude: 105.7782,
          source: "MANUAL",
          confirmed: true,
        },
        departureMinute: 360,
        returnDeadlineMinute: 1080,
        returnDepartureMinute: 480,
      },
    }),
    timezone: "Asia/Ho_Chi_Minh",
    days: [
      {
        day: 1,
        date: "2026-12-28",
        distanceMeters: 280_000,
        travelSeconds: 25_200,
        stops: [
          {
            order: 1,
            destination: {
              id: "nui-cam",
              name: "Núi Cấm",
              description: "Ngắm toàn cảnh TP Hà Giang",
              area: "TP Hà Giang",
              address: null,
              category: "thiên nhiên",
              latitude: 22.824,
              longitude: 104.9782,
              image: null,
            },
            arrivalMinute: 870,
            departureMinute: 915,
            visitDurationMinutes: 45,
            scheduleState: "PLANNED",
            inbound: null,
            validationStatus: "PASS",
          },
        ],
      },
      {
        day: 2,
        date: "2026-12-29",
        distanceMeters: 310_000,
        travelSeconds: 28_000,
        journeyDayKind: "RETURN_ONLY",
        stops: [],
      },
    ],
    journeyPlan: {
      policy: "roadside-rest-v1",
      legs: [
        {
          kind: "OUTBOUND",
          day: 1,
          from: { kind: "ORIGIN" },
          to: { kind: "ATTRACTION", destinationId: "nui-cam" },
          route: {
            status: "VERIFIED",
            reason: null,
            durationSeconds: 25_200,
            distanceMeters: 280_000,
            provider: "STADIA_MAPS",
          },
          startMinute: 360,
          endMinute: 810,
          restMinutes: 30,
        },
        {
          kind: "RETURN",
          day: 2,
          from: { kind: "ATTRACTION", destinationId: "nui-cam" },
          to: { kind: "ORIGIN" },
          route: {
            status: "VERIFIED",
            reason: null,
            durationSeconds: 28_800,
            distanceMeters: 310_000,
            provider: "STADIA_MAPS",
          },
          startMinute: 480,
          endMinute: 1125, // 18:45 > 18:00 deadline -> gentle note only
          restMinutes: 45,
        },
      ],
      totals: { drivingSeconds: 54_000, restMinutes: 75, distanceMeters: 590_000 },
      overnightStays: [
        {
          day: 1,
          area: "Mèo Vạc",
          latitude: 23.164,
          longitude: 105.405,
          fromDestinationId: "nui-cam",
          distanceFromLastStopKm: 6.6,
        },
      ],
    },
    checks: CHECK_KEYS.map((key) => ({ key, status: "PASS" as const, issues: [] })),
    warnings: [],
    reasonCodes: [],
    eligibleForFinalConfirmation: true,
  };
}

describe("ADR-57 (D3 & D5): self-drive Hà Nội display, Day 1 Hà Giang prep, per-stop photos & evening dedup", () => {
  it("D3: strips '(bến xe Mỹ Đình)' only on self-drive trips while keeping coach hub and Giáp Bát intact", () => {
    expect(formatTravelerOriginLabel("Hà Nội (bến xe Mỹ Đình)", false)).toBe("Hà Nội");
    expect(formatTravelerOriginLabel("Hà Nội (bến xe Mỹ Đình)", true)).toBe("Hà Nội (bến xe Mỹ Đình)");
    expect(formatTravelerOriginLabel("Bến xe Giáp Bát", false)).toBe("Bến xe Giáp Bát");

    const html = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal: makeSelfDriveHaNoiProposal(),
        suggestions: [],
        tripInfo: { homeCity: "Hà Nội", travelers: 4, startDate: "2026-12-28", durationDays: 2 },
        chosenLodgings: {},
        pinnedItems: [],
        drawerOpen: false,
        onCloseDrawer: () => {},
        onToggleChosenLodging: () => {},
        onRequestMeals: () => {},
        onAskAccess: () => {},
        onSelectSavingsOption: () => {},
        onSaved: () => {},
        onSaveStateChange: () => {},
      }),
    );

    expect(html).not.toContain("(bến xe Mỹ Đình)");
    expect(html).toContain("Hà Nội → Núi Cấm");
    expect(html).toContain("Chặng lên Hà Giang");
    expect(html).toContain('data-testid="arrival-prep-ha-giang"');
    expect(html).toContain("Chuẩn bị tại TP Hà Giang");
    expect(html).toContain("linh động");
  });

  it("D5: renders visible photos on every sub-stop in dt-photo-group and strengthens seed visuals", () => {
    const html = renderToStaticMarkup(
      createElement(DayTimeline, {
        variant: "full",
        day: {
          dayIndex: 1,
          localDate: "2026-12-28",
          stops: [
            {
              id: "s1",
              destinationId: "bac-sum",
              order: 1,
              name: "Dốc Bắc Sum",
              area: "Quản Bạ",
              category: "thiên nhiên – điểm ngắm cảnh",
              startMinute: 540,
              durationMinutes: 15,
              image: null,
            },
            {
              id: "s2",
              destinationId: "tham-ma",
              order: 2,
              name: "Dốc Thẩm Mã",
              area: "Phố Bảng",
              category: "thiên nhiên – điểm ngắm cảnh",
              startMinute: 590,
              durationMinutes: 15,
              image: { url: "", alt: "empty should fallback" },
            },
            {
              id: "s3",
              destinationId: "chin-khoanh",
              order: 3,
              name: "Dốc Chín Khoanh",
              area: "Phố Bảng",
              category: "thiên nhiên – điểm ngắm cảnh",
              startMinute: 620,
              durationMinutes: 15,
              image: null,
            },
          ],
        },
      }),
    );

    expect(html).toContain('data-testid="merged-photo-stops"');
    const imgCount = (html.match(/class="dt-visit-photo"/g) ?? []).length;
    expect(imgCount).toBeGreaterThanOrEqual(4); // main group image + 3 sub-stop thumbnails
    expect(html).not.toContain('src=""');

    expect(getDestinationVisual("Núi Cấm", "TP Hà Giang").src).toBe("/images/gallery/ha-giang-terraces-mist-huts.webp");
    expect(getDestinationVisual("Lũng Phìn", "Mèo Vạc").src).toBe("/images/gallery/ha-giang-buckwheat-harvest.webp");
  });

  it("D5: deduplicates evening dining/activity results by placeId and folded venue name across queries and turns", async () => {
    const places = vi.fn(async () => ({
      status: "RESULTS" as const,
      places: [
        { placeId: "ChIJ_duc_1", name: "Nhà của Đức", latitude: 23.166, longitude: 105.408, types: ["restaurant"] },
        { placeId: "ChIJ_duc_2", name: "Nhà Của Đức", latitude: 23.1661, longitude: 105.4081, types: ["restaurant"] },
        { placeId: "ChIJ_other", name: "Quán Phố Núi", latitude: 23.165, longitude: 105.406, types: ["restaurant"] },
      ],
    }));

    const out = await nearbyActivitySuggestions({
      places,
      anchors: [
        {
          slotId: "d4-overnight",
          kind: "EVENING",
          anchorSource: "town_center",
          latitude: 23.164,
          longitude: 105.405,
        },
      ],
      stopNames: [],
      now: () => 1_700_000_000_000,
    });

    const ducCount = out.filter((s) => s.title.toLowerCase().includes("đức")).length;
    expect(ducCount).toBe(1);

    // Cross-turn conversation state deduplication
    const state = readConversationState(
      [
        {
          id: "m1",
          role: "assistant",
          parts: [
            { type: "data-itinerary", data: { proposalId: "p1" } },
            {
              type: "data-suggestions",
              data: {
                suggestions: [
                  {
                    slotId: "d4-overnight",
                    kind: "EVENING",
                    title: "Nhà của Đức",
                    place: { placeId: "ChIJ_duc_1", name: "Nhà của Đức", distanceKm: 2.9 },
                  },
                ],
              },
            },
          ],
        },
        {
          id: "m2",
          role: "assistant",
          parts: [
            {
              type: "data-suggestions",
              data: {
                suggestions: [
                  {
                    slotId: "d4-overnight",
                    kind: "EVENING",
                    title: "Nhà của Đức",
                    place: { placeId: "ChIJ_duc_2", name: "Nhà của Đức", distanceKm: 2.9 },
                  },
                  {
                    slotId: "d4-overnight",
                    kind: "EVENING",
                    title: "Cơm Phố Núi",
                    place: { placeId: "ChIJ_com", name: "Cơm Phố Núi", distanceKm: 1.2 },
                  },
                ],
              },
            },
          ],
        },
      ],
      () => true,
    );

    expect(state.suggestions.map((s) => s.title)).toEqual(["Nhà của Đức", "Cơm Phố Núi"]);

    // Evening plan defensive dedup
    const evening = buildDayEveningPlan({
      dayIndex: 4,
      totalDays: 5,
      lastStopArea: "Mèo Vạc",
      lastStopName: "Sông Nho Quế",
      eveningPlaces: [
        { key: "k1", name: "Nhà của Đức", distanceKm: 2.9 },
        { key: "k2", name: "Nhà của Đức", distanceKm: 2.9 },
      ],
    });
    expect(evening?.eveningPlaces).toHaveLength(1);
  });
});
