import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildDayTimelineTravelLeg,
  DayTimeline,
  formatTravelLegLine,
  type DayTimelineDay,
} from "@/components/trip-timeline/day-timeline";
import { TripsageAccessLegCard } from "./tripsage-access-leg-card";
import {
  buildAccessDirectionSchedule,
  collectAccessLegWarnings,
  type AccessLegPart,
} from "@/modules/tripsage-chat/tripsage-access-leg";
import { buildDayTimeline } from "@/modules/tripsage-chat/tripsage-timeline";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { tripRequirementInputSchema } from "@/modules/trip-requirement/trip-requirement-contract";

describe("D12 & D13 display enhancements", () => {
  it("D12: renders c6be04d7 outbound clock schedule 05:40->07:50, transfer/wait, 10:00->16:30, total 10h50m and return check-in milestone", () => {
    const leg: AccessLegPart = {
      id: "al-c6be04d7",
      hubName: "TP Hà Giang",
      homeCity: "TP.HCM",
      travelers: 4,
      outbound: [
        {
          mode: "FLIGHT",
          from: "TP.HCM (SGN)",
          to: "Nội Bài (HAN)",
          departTime: "05:40",
          durationMinutes: 130,
          priceVndPerPerson: 1_500_000,
          priceSource: "GOOGLE_FLIGHTS",
          priceLookupDate: "2026-11-25",
        },
        {
          mode: "SLEEPER_BUS",
          from: "Hà Nội (bến xe Mỹ Đình)",
          to: "TP Hà Giang",
          departTime: "10:00",
          durationMinutes: 390,
          priceVndPerPerson: 325_000,
          priceSource: "ESTIMATE",
        },
      ],
      return: [
        {
          mode: "SLEEPER_BUS",
          from: "TP Hà Giang",
          to: "Hà Nội (bến xe Mỹ Đình)",
          departTime: "09:30",
          durationMinutes: 390,
          priceVndPerPerson: 325_000,
          priceSource: "ESTIMATE",
        },
        {
          mode: "FLIGHT",
          from: "Nội Bài (HAN)",
          to: "TP.HCM (SGN)",
          departTime: "20:00",
          durationMinutes: 130,
          priceVndPerPerson: 1_500_000,
          priceSource: "GOOGLE_FLIGHTS",
          priceLookupDate: "2026-11-25",
        },
      ],
      outboundMinutes: 520,
      returnMinutes: 520,
      totalVnd: 14_600_000,
    };

    const outboundSchedule = buildAccessDirectionSchedule(leg.outbound, "outbound");
    expect(outboundSchedule.totalSpanMinutes).toBe(650);
    expect(outboundSchedule.travelMinutes).toBe(520);
    expect(outboundSchedule.warnings).toEqual([]);

    const outboundHtml = renderToStaticMarkup(
      createElement(TripsageAccessLegCard, { leg, only: "outbound" }),
    ).replaceAll("\u00a0", " ");
    expect(outboundHtml).toContain("05:40 → 07:50");
    expect(outboundHtml).toContain("07:50 → 10:00");
    expect(outboundHtml).toContain("Nội Bài → Mỹ Đình (~60 phút tham khảo)");
    expect(outboundHtml).toContain("10:00 → 16:30");
    expect(outboundHtml).toContain("Tổng 10 giờ 50 phút từ lúc cất cánh (trong đó 8 giờ 40 phút di chuyển)");
    expect(outboundHtml).toContain("Có mặt sân bay trước 2 giờ");

    const returnHtml = renderToStaticMarkup(
      createElement(TripsageAccessLegCard, { leg, only: "return" }),
    ).replaceAll("\u00a0", " ");
    expect(returnHtml).toContain("09:30 → 16:00");
    expect(returnHtml).toContain("Trước 18:00");
    expect(returnHtml).toContain("Có mặt sân bay trước 2 giờ");
    expect(returnHtml).toContain("20:00 → 22:10");
  });

  it("D12: handles midnight wrap (+1 ngày) and warns cleanly when airport connection gap is tighter than 60m + 2h check-in", () => {
    const tightLeg: AccessLegPart = {
      hubName: "TP Hà Giang",
      homeCity: "TP.HCM",
      travelers: 2,
      outbound: [
        {
          mode: "SLEEPER_BUS",
          from: "Hà Nội (bến xe Mỹ Đình)",
          to: "TP Hà Giang",
          departTime: "21:00",
          durationMinutes: 390,
          priceVndPerPerson: 300_000,
          priceSource: "ESTIMATE",
        },
      ],
      return: [
        {
          mode: "SLEEPER_BUS",
          from: "TP Hà Giang",
          to: "Hà Nội (bến xe Mỹ Đình)",
          departTime: "12:00",
          durationMinutes: 390,
          priceVndPerPerson: 300_000,
          priceSource: "ESTIMATE",
        },
        {
          mode: "FLIGHT",
          from: "Nội Bài (HAN)",
          to: "TP.HCM (SGN)",
          departTime: "20:00",
          durationMinutes: 130,
          priceVndPerPerson: 1_400_000,
          priceSource: "ESTIMATE",
        },
      ],
      outboundMinutes: 390,
      returnMinutes: 520,
      totalVnd: 6_800_000,
    };

    const html = renderToStaticMarkup(createElement(TripsageAccessLegCard, { leg: tightLeg }));
    expect(html).toContain("21:00 → 03:30 (+1 ngày)");
    expect(html).toContain("Chặng về: thời gian nối chuyến (1 giờ 30 phút) khá sát");
    expect(collectAccessLegWarnings(tightLeg)).toHaveLength(1);
  });

  it("D13: displays verified inter-stop distance, duration, rest, photo buffers and daily totals, while unverified legs render 'Chưa có dữ liệu tuyến'", () => {
    const verifiedLine = formatTravelLegLine(
      buildDayTimelineTravelLeg({
        transport: "MOTORCYCLE",
        route: { status: "VERIFIED", distanceMeters: 12_400, durationSeconds: 1_500 },
        restMinutes: 15,
        photoMinutes: 5,
      }),
    );
    expect(verifiedLine).toBe("🛵 12,4 km · khoảng 25 phút · nghỉ 15 phút · +5 phút chụp ảnh");

    const unverifiedLine = formatTravelLegLine(
      buildDayTimelineTravelLeg({
        transport: "CAR",
        route: { status: "INSUFFICIENT_DATA", distanceMeters: null, durationSeconds: null },
        restMinutes: 15,
        photoMinutes: 5,
      }),
    );
    expect(unverifiedLine).toBe("Chưa có dữ liệu tuyến");

    const day: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-20",
      transportLabel: "Xe máy",
      totalDistanceMeters: 87_000,
      totalTravelSeconds: 12_600,
      stops: [
        {
          id: "s1",
          destinationId: "d1",
          order: 1,
          name: "Điểm một",
          startMinute: 480,
          durationMinutes: 60,
        },
        {
          id: "s2",
          destinationId: "d2",
          order: 2,
          name: "Điểm hai",
          startMinute: 590,
          durationMinutes: 60,
          travelFromPrevious: {
            transport: "MOTORCYCLE",
            distanceMeters: 12_400,
            durationMinutes: 25,
            restMinutes: 15,
            photoMinutes: 5,
            verified: true,
          },
        },
        {
          id: "s3",
          destinationId: "d3",
          order: 3,
          name: "Điểm ba",
          startMinute: null,
          durationMinutes: 60,
          travelFromPrevious: {
            transport: "MOTORCYCLE",
            distanceMeters: null,
            durationMinutes: null,
            verified: false,
          },
        },
      ],
    };

    const html = renderToStaticMarkup(createElement(DayTimeline, { day, variant: "full" }));
    expect(html).toContain("87 km · khoảng 3 giờ 30 phút lái xe");
    expect(html).toContain("🛵 12,4 km · khoảng 25 phút · nghỉ 15 phút · +5 phút chụp ảnh");
    expect(html).toContain("Chưa có dữ liệu tuyến");

    const proposal: PlannerResult = {
      proposalId: "p-d13",
      phase: "PRELIMINARY_PROPOSAL",
      status: "PROPOSAL_READY",
      timezone: "Asia/Ho_Chi_Minh",
      requirement: tripRequirementInputSchema.parse({
        startDate: "2026-12-20",
        durationDays: 1,
        transport: "CAR",
        interests: ["NATURE"],
      }),
      days: [
        {
          day: 1,
          date: "2026-12-20",
          distanceMeters: 18_500,
          travelSeconds: 1_800,
          stops: [
            {
              order: 1,
              destination: {
                id: "d1",
                name: "Điểm một",
                area: "Quản Bạ",
                category: "SCENIC",
                latitude: 23.06,
                longitude: 104.99,
                description: "Mô tả điểm một",
                address: null,
                image: null,
              },
              arrivalMinute: 480,
              departureMinute: 540,
              visitDurationMinutes: 60,
              scheduleState: "PLANNED",
              inbound: null,
              validationStatus: "PASS",
            },
            {
              order: 2,
              destination: {
                id: "d2",
                name: "Điểm hai",
                area: "Yên Minh",
                category: "CULTURE",
                latitude: 23.12,
                longitude: 105.14,
                description: "Mô tả điểm hai",
                address: null,
                image: null,
              },
              arrivalMinute: 575,
              departureMinute: 635,
              visitDurationMinutes: 60,
              scheduleState: "PLANNED",
              inbound: {
                fromDestinationId: "d1",
                toDestinationId: "d2",
                status: "VERIFIED",
                reason: null,
                durationSeconds: 1_800,
                distanceMeters: 18_500,
                provider: "STADIA_MAPS",
              },
              validationStatus: "PASS",
            },
          ],
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
    const built = buildDayTimeline(proposal);
    const drive = built.days[0]!.items.find(i => i.kind === "DRIVE");
    expect(drive?.label).toBe("🚗 18,5 km · khoảng 30 phút");
  });
});
