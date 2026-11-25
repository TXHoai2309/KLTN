import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayTimeline } from "@/components/trip-timeline/day-timeline";
import { ItineraryValidationPanel, HA_GIANG_VALIDATION_SCOPE_TEXT } from "@/components/trip-planner/planner-presentation";
import { TripsageAccessLegCard } from "@/components/tripsage-chat/tripsage-access-leg-card";
import { getDestinationVisual, NEUTRAL_DESTINATION_FALLBACK_SRC } from "@/lib/destination-visuals";
import { fixtureRoutes, planningCandidate, planningNow } from "@/test/planning-fixtures";
import { applyGroupSizeDurationScale, scaleDurationForGroupSize } from "../trip-planner/planner-engine";
import { arrangeTripRoute, diversityAdjustedStopValue } from "../trip-planner/planner-route";
import { validatePlannerDays } from "../trip-planner/planner-validator";
import { collectAccessLegWarnings, type AccessLegPart } from "./tripsage-access-leg";

describe("D8: neutral fallback visual and category-specific seed visuals", () => {
  it("never falls back to stone village for unmatched names and returns neutral fallback with alt 'Chưa có ảnh của ...'", () => {
    const unknown = getDestinationVisual("Bảo tàng Địa chất XYZ", "Hà Giang");
    expect(unknown.src).toBe(NEUTRAL_DESTINATION_FALLBACK_SRC);
    expect(unknown.src).not.toContain("stone-village");
    expect(unknown.alt).toBe("Chưa có ảnh của Bảo tàng Địa chất XYZ");

    // Verify all mapped /images assets exist on disk under apps/web/public
    const samples = [
      getDestinationVisual("Hang Lùng Khúy", "Quản Bạ"),
      getDestinationVisual("Dốc Thẩm Mã", "Phố Bảng"),
      getDestinationVisual("Thác Du Già", "Du Già"),
      getDestinationVisual("Làng dệt lanh Lùng Tám", "Quản Bạ"),
      unknown,
    ];
    for (const v of samples) {
      const diskPath = path.join(process.cwd(), "public", v.src.replace(/^\//, ""));
      expect(fs.existsSync(diskPath), `missing image file: ${diskPath}`).toBe(true);
    }
  });
});

describe("D9: same-category diversity penalty and consecutive scenic photo-stop display merge", () => {
  it("halves stopValue within 15 min drive of same category so arrangeTripRoute prefers diverse stops (Pả Vi Hạ vs Pả Vi Thượng)", async () => {
    const pvHa = {
      ...planningCandidate("pv-ha", 45),
      name: "Pả Vi Hạ",
      category: "làng du lịch – bản làng",
      latitude: 23.17,
      longitude: 105.42,
    };
    const pvThuong = {
      ...planningCandidate("pv-thuong", 45),
      name: "Pả Vi Thượng",
      category: "làng du lịch – bản làng",
      // ~1.5 km (~2–3 min drive) from Pả Vi Hạ
      latitude: 23.175,
      longitude: 105.425,
    };
    const canyon = {
      ...planningCandidate("nho-que", 45),
      name: "Điểm ngắm Nho Quế",
      category: "thiên nhiên – điểm ngắm cảnh",
      // Nearly identical drive detour, distinct category
      latitude: 23.176,
      longitude: 105.426,
    };
    const day2Anchor = {
      ...planningCandidate("dong-van", 240),
      name: "Phố cổ Đồng Văn",
      category: "văn hóa",
      latitude: 23.278,
      longitude: 105.362,
    };

    const penaltyRatio = diversityAdjustedStopValue(pvThuong, ["NATURE"], [pvHa], () => 300);
    const fullRatio = diversityAdjustedStopValue(canyon, ["NATURE"], [pvHa], () => 300);
    expect(penaltyRatio).toBeLessThan(fullRatio);

    const arranged = await arrangeTripRoute({
      requirement: {
        startDate: "2026-12-21",
        durationDays: 2,
        transport: "MOTORCYCLE",
        interests: ["NATURE"],
        pace: "MODERATE",
        companions: null,
        mobilityConstraints: null,
      },
      days: [[pvHa], [day2Anchor]],
      pool: [pvHa, pvThuong, canyon, day2Anchor],
      fill: true,
    });
    const addedIds = arranged.added.map(c => c.id);
    expect(addedIds[0]).toBe("nho-que");
  });

  it("merges consecutive <= 20m scenic stops in DayTimeline display as 'Dừng chụp ảnh: ...' without altering clocks", () => {
    const html = renderToStaticMarkup(
      createElement(DayTimeline, {
        day: {
          dayIndex: 1,
          localDate: "2026-12-21",
          transportLabel: "Xe máy",
          stops: [
            {
              id: "s1",
              destinationId: "tm",
              order: 1,
              name: "Thẩm Mã",
              area: "Phố Bảng",
              category: "thiên nhiên – điểm ngắm cảnh",
              startMinute: 540,
              durationMinutes: 20,
            },
            {
              id: "s2",
              destinationId: "ck",
              order: 2,
              name: "Chín Khoanh",
              area: "Phố Bảng",
              category: "thiên nhiên – điểm ngắm cảnh",
              startMinute: 575,
              durationMinutes: 15,
            },
            {
              id: "s3",
              destinationId: "dv",
              order: 3,
              name: "Phố cổ Đồng Văn",
              area: "Đồng Văn",
              category: "văn hóa",
              startMinute: 620,
              durationMinutes: 90,
            },
          ],
        },
      }),
    );

    expect(html).toContain('data-testid="merged-photo-stops"');
    expect(html).toContain("Dừng chụp ảnh: Thẩm Mã, Chín Khoanh");
    expect(html).toContain("Phố cổ Đồng Văn");
    // Individual clocks stay intact inside card detail
    expect(html).toContain("09:00");
    expect(html).toContain("09:35");
  });
});

describe("D10: activity durations SQL & +15% group duration scaling for party >= 6", () => {
  it("scales suggestedDurationMinutes by +15% (rounded 5 min) for groupSize >= 6 without altering photo stops, user overrides, minimumDurationMinutes, or Validator", () => {
    expect(scaleDurationForGroupSize(120, 10)).toBe(140); // 138 -> 140
    expect(scaleDurationForGroupSize(60, 10)).toBe(70); // 69 -> 70
    expect(scaleDurationForGroupSize(75, 10)).toBe(85); // 86.25 -> 85
    expect(scaleDurationForGroupSize(20, 10)).toBe(20); // photo stop (< 45m) unchanged
    expect(scaleDurationForGroupSize(120, 4)).toBe(120); // group < 6 unchanged

    const hang = {
      ...planningCandidate("lung-khuy", 120),
      minimumDurationMinutes: 75,
    };
    const photo = {
      ...planningCandidate("tham-ma", 20),
      minimumDurationMinutes: 10,
    };
    const manual = {
      ...planningCandidate("nho-que", 120),
      minimumDurationMinutes: 90,
      userChosenDuration: true as const,
    };
    const scaled = applyGroupSizeDurationScale([hang, photo, manual], 10);
    expect(scaled[0]).toMatchObject({ suggestedDurationMinutes: 140, minimumDurationMinutes: 75 });
    expect(scaled[1]).toMatchObject({ suggestedDurationMinutes: 20, minimumDurationMinutes: 10 });
    expect(scaled[2]).toMatchObject({ suggestedDurationMinutes: 120, minimumDurationMinutes: 90 });

    // Validator remains strictly anchored on canonical minimumDurationMinutes
    const check = validatePlannerDays(
      {
        startDate: "2026-12-21",
        durationDays: 1,
        transport: "MOTORCYCLE",
        interests: ["NATURE"],
        pace: "MODERATE",
        companions: { type: "FRIENDS", groupSize: 10 },
        mobilityConstraints: null,
      },
      [
        {
          day: 1,
          date: "2026-12-21",
          stops: [
            {
              order: 1,
              destination: hang,
              arrivalMinute: 480,
              departureMinute: 560, // 80 min: >= min (75), even though < scaled suggested (140)
              visitDurationMinutes: 80,
              scheduleState: "PLANNED",
              inbound: null,
              validationStatus: "PASS",
            },
          ],
          distanceMeters: 0,
          travelSeconds: 0,
        },
      ],
      [hang],
    );
    expect(check.checks.find(c => c.key === "MINIMUM_DURATION")?.status).toBe("PASS");
  });

  it("includes idempotent single-transaction SQL script for Hang Lùng Khúy (120/75), Sông Nho Quế (180/120), Lùng Tám (60/45)", () => {
    const sqlPath = path.resolve(process.cwd(), "../../docs/analysis/18-destination-durations-2026-11-25.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("Hang Lùng Khúy");
    expect(sql).toContain("120");
    expect(sql).toContain("75");
    expect(sql).toContain("Sông Nho Quế");
    expect(sql).toContain("180");
    expect(sql).toContain("Làng dệt lanh Lùng Tám");
    expect(sql).toContain("60");
    expect(sql).toContain("45");
  });
});

describe("D11: validation scope clarity & non-blocking access-leg connection warnings", () => {
  it("clarifies Ha Giang sightseeing check scope vs unchecked access leg and surfaces return departure warning", () => {
    const valHtml = renderToStaticMarkup(
      createElement(ItineraryValidationPanel, {
        checks: [
          { key: "OPENING_HOURS", status: "PASS", issues: [] },
          { key: "MINIMUM_DURATION", status: "PASS", issues: [] },
          { key: "TRAVEL_TIME", status: "PASS", issues: [] },
          { key: "SCHEDULE_CONFLICTS", status: "PASS", issues: [] },
          { key: "MOBILITY", status: "PASS", issues: [] },
        ],
      }),
    );
    expect(valHtml).toContain(HA_GIANG_VALIDATION_SCOPE_TEXT);

    const tightLeg: AccessLegPart = {
      id: "al-warn-1",
      homeCity: "TP Hồ Chí Minh",
      hubName: "TP Hà Giang",
      travelers: 10,
      outbound: [
        { mode: "FLIGHT", from: "TP.HCM", to: "Hà Nội", departTime: "05:40", durationMinutes: 130, priceVndPerPerson: 1_500_000, priceSource: "ESTIMATE" },
        { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", departTime: "10:00", durationMinutes: 390, priceVndPerPerson: 325_000, priceSource: "ESTIMATE" },
      ],
      return: [
        { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", departTime: "16:00", durationMinutes: 390, priceVndPerPerson: 325_000, priceSource: "ESTIMATE" },
        { mode: "FLIGHT", from: "Hà Nội", to: "TP.HCM", departTime: "23:30", durationMinutes: 130, priceVndPerPerson: 1_500_000, priceSource: "ESTIMATE" },
      ],
      outboundMinutes: 520,
      returnMinutes: 520,
      totalVnd: 36_500_000,
    };

    // Return bus ends at 22:30 -> < 60m Noi Bai transfer + 120m flight check-in (needs >= 180m before 23:30), AND 16:00 < 17:30 last sightseeing end
    const warnings = collectAccessLegWarnings(tightLeg, { lastSightseeingEndMinute: 1050, returnDepartsSameDay: true });
    expect(warnings.some(w => w.includes("khá sát") && w.includes("2 giờ"))).toBe(true);
    expect(warnings.some(w => w.includes("16:00") && w.includes("17:30"))).toBe(true);

    const cardHtml = renderToStaticMarkup(
      createElement(TripsageAccessLegCard, {
        leg: tightLeg,
        lastSightseeingEndMinute: 1050,
        returnDepartsSameDay: true,
      }),
    );
    expect(cardHtml).toContain('data-testid="access-leg-warnings"');
    expect(cardHtml).toContain("16:00");
  });
});
