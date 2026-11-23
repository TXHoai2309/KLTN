import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TripsageSaveSection } from "../../components/tripsage-chat/tripsage-save-section";
import { scheduleSelection } from "../assistant-planning/planning-engine";
import { freshJourneyValidation, revalidateJourneySnapshot, type JourneyDestination } from "../trip-origin/journey-save-validation";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { toTripProposal } from "../trip-planner/planner-save-adapter";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { describeSaveValidationFailure } from "../tripsage-chat/tripsage-chat-save";
import { toSaveProposal } from "./trip-save-adapter";

const ALL_OPEN = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({
  dayOfWeek,
  status: "OPEN",
  intervals: [{ opensAtMinute: 360, closesAtMinute: 1200 }],
}));

function makeCandidate(id: string, name: string, lat: number, lng: number, min: number | null, suggested: number | null): PlannerCandidate {
  return {
    id,
    name,
    description: "",
    area: "Đồng Văn",
    address: "Hà Giang",
    category: "thiên nhiên",
    latitude: lat,
    longitude: lng,
    image: null,
    visibility: "VISIBLE",
    revision: "v1",
    suggestedDurationMinutes: suggested,
    minimumDurationMinutes: min,
    openingDays: ALL_OPEN,
  };
}

describe("Bug 1 — chat vs save validation parity (ADR-51)", () => {
  const now = new Date("2026-11-23T08:00:00Z");
  const maPiLeng = makeCandidate("ma-pi-leng", "Đèo Mã Pì Lèng", 23.24, 105.4, 60, 60);
  const nhoQue = makeCandidate("nho-que", "Sông Nho Quế", 23.1907, 105.4695, 120, 180);
  const dongVan = makeCandidate("dong-van", "Phố cổ Đồng Văn", 23.2782, 105.3614, 90, 120);

  const legs: Record<string, { durationSeconds: number; distanceMeters: number }> = {
    "dong-van>ma-pi-leng": { durationSeconds: 1399, distanceMeters: 10772 }, // 24m
    "ma-pi-leng>nho-que": { durationSeconds: 3389, distanceMeters: 25569 }, // 57m
  };

  const routes: RouteProvider = {
    async route(pair) {
      const m = legs[`${pair.from.id}>${pair.to.id}`] ?? { durationSeconds: 1800, distanceMeters: 15000 };
      return {
        fromDestinationId: pair.from.id,
        toDestinationId: pair.to.id,
        status: "VERIFIED",
        reason: null,
        durationSeconds: m.durationSeconds,
        distanceMeters: m.distanceMeters,
        provider: "GOOGLE_MAPS",
      };
    },
    async coordinateRoute() {
      // 3 hours 10 min driving -> triggers 10-min compact rest (vs 15-min standard rest)
      return {
        status: "VERIFIED",
        reason: null,
        durationSeconds: 11400,
        distanceMeters: 100000,
        provider: "GOOGLE_MAPS",
      };
    },
  };

  const journey = {
    origin: {
      label: "TP Hà Giang (bến xe phía Nam)",
      latitude: 22.8036,
      longitude: 104.9783,
      source: "MANUAL" as const,
      confirmed: true as const,
    },
    departureMinute: 420,
    returnDeadlineMinute: 1080,
    returnDepartureMinute: 420,
  };

  const dbDestinations = new Map<string, JourneyDestination>([
    [dongVan.id, { id: dongVan.id, latitude: dongVan.latitude, longitude: dongVan.longitude, minimumDurationMinutes: 90, openingDays: ALL_OPEN }],
    [maPiLeng.id, { id: maPiLeng.id, latitude: maPiLeng.latitude, longitude: maPiLeng.longitude, minimumDurationMinutes: 60, openingDays: ALL_OPEN }],
    [nhoQue.id, { id: nhoQue.id, latitude: nhoQue.latitude, longitude: nhoQue.longitude, minimumDurationMinutes: 120, openingDays: ALL_OPEN }],
  ]);

  it("matches chat PASS and save PASS for user-chosen 30-min visit with restMode COMPACT", async () => {
    const requirement = tripRequirementInputSchema.parse({
      startDate: "2026-12-14",
      durationDays: 2,
      transport: "MOTORCYCLE",
      pace: "PACKED",
      journey,
      dayRhythm: { lunchMinutes: 60, dayEndMinute: 1080 },
      restMode: "COMPACT",
    });

    const chatCandidates: PlannerCandidate[] = [
      dongVan,
      { ...maPiLeng, suggestedDurationMinutes: 30, minimumDurationMinutes: 30, userChosenDuration: true },
      nhoQue,
    ];

    const chatResult = await scheduleSelection(
      { requirement, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} },
      { days: [[dongVan.id], [maPiLeng.id, nhoQue.id]] },
      chatCandidates,
      routes,
      now,
    );

    expect(chatResult.checks.every(c => c.status === "PASS")).toBe(true);
    expect(chatResult.eligibleForFinalConfirmation).toBe(true);
    expect(chatResult.days[1]!.stops[0]!.visitDurationMinutes).toBe(30);
    expect(chatResult.days[1]!.stops[0]!.userChosenDuration).toBe(true);
    expect(chatResult.days[1]!.stops[0]!.departureMinute).toBe(510);
    expect(chatResult.days[1]!.stops[1]!.arrivalMinute).toBe(567);

    const saveProposal = toSaveProposal(chatResult);
    expect(saveProposal).not.toBeNull();
    expect(saveProposal!.restMode).toBe("COMPACT");
    expect(saveProposal!.dayRhythm).toEqual({ lunchMinutes: 60, dayEndMinute: 1080 });
    expect(saveProposal!.days[1]!.visits[0]!.userChosenDuration).toBe(true);

    // Planner form adapter also forwards userChosenDuration and dayRhythm
    const formProposal = toTripProposal(chatResult);
    expect(formProposal.restMode).toBe("COMPACT");
    expect(formProposal.dayRhythm).toEqual({ lunchMinutes: 60, dayEndMinute: 1080 });
    expect(formProposal.days[1]!.visits[0]!.userChosenDuration).toBe(true);

    // Save validator produces the exact same PASS result and emits USER_SHORT_VISIT warning
    const fresh = await freshJourneyValidation(saveProposal!, dbDestinations, routes, now);
    expect(fresh.validation.canConfirm).toBe(true);
    expect(fresh.validation.groups.minimumDuration.status).toBe("SATISFIED");
    expect(fresh.validation.groups.travelTime.status).toBe("SATISFIED");
    expect(fresh.validation.groups.openingHours.status).toBe("SATISFIED");
    expect(fresh.validation.groups.scheduleConflict.status).toBe("SATISFIED");
    expect(fresh.result.warnings.some(w => w.code === "USER_SHORT_VISIT" && w.destinationId === maPiLeng.id)).toBe(true);
    expect(fresh.plan.policy).toBe("roadside-rest-compact-v1");

    // Snapshot revalidation inside the DB transaction agrees identically
    const rechecked = revalidateJourneySnapshot(saveProposal!, dbDestinations, fresh.plan, now);
    expect(rechecked.validation.canConfirm).toBe(true);
    expect(rechecked.validation.groups.minimumDuration.status).toBe("SATISFIED");
    expect(rechecked.validation.groups.travelTime.status).toBe("SATISFIED");
  });

  it("still flags VIOLATION (VISIT_TOO_SHORT) when a short visit is NOT marked userChosenDuration", async () => {
    const requirement = tripRequirementInputSchema.parse({
      startDate: "2026-12-14",
      durationDays: 2,
      transport: "MOTORCYCLE",
      journey,
      restMode: "COMPACT",
    });
    const chatResult = await scheduleSelection(
      { requirement, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} },
      { days: [[dongVan.id], [maPiLeng.id, nhoQue.id]] },
      [dongVan, { ...maPiLeng, suggestedDurationMinutes: 30, minimumDurationMinutes: 30, userChosenDuration: true }, nhoQue],
      routes,
      now,
    );
    const saveProposal = toSaveProposal(chatResult)!;
    // Strip explicit userChosenDuration to simulate AI-shortened visit without traveler consent
    delete saveProposal.days[1]!.visits[0]!.userChosenDuration;

    const fresh = await freshJourneyValidation(saveProposal, dbDestinations, routes, now);
    expect(fresh.validation.canConfirm).toBe(false);
    expect(fresh.validation.groups.minimumDuration.status).toBe("VIOLATION");
    expect(fresh.validation.groups.minimumDuration.findings.some(f => f.reasonCode === "VISIT_TOO_SHORT")).toBe(true);
  });

  it("never passes missing catalog minimumDurationMinutes even when userChosenDuration is set", async () => {
    const requirement = tripRequirementInputSchema.parse({
      startDate: "2026-12-14",
      durationDays: 1,
      transport: "MOTORCYCLE",
      journey,
    });
    const chatResult = await scheduleSelection(
      { requirement, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} },
      { days: [[maPiLeng.id]] },
      [{ ...maPiLeng, suggestedDurationMinutes: 30, minimumDurationMinutes: 30, userChosenDuration: true }],
      routes,
      now,
    );
    const saveProposal = toSaveProposal(chatResult)!;
    const missingMinDb = new Map<string, JourneyDestination>([
      [maPiLeng.id, { id: maPiLeng.id, latitude: maPiLeng.latitude, longitude: maPiLeng.longitude, minimumDurationMinutes: null, openingDays: ALL_OPEN }],
    ]);

    const fresh = await freshJourneyValidation(saveProposal, missingMinDb, routes, now);
    expect(fresh.validation.canConfirm).toBe(false);
    expect(fresh.validation.groups.minimumDuration.status).toBe("INSUFFICIENT_DATA");
  });

  it("formats specific failure reasons and actionable recovery chips when save validation fails", async () => {
    const requirement = tripRequirementInputSchema.parse({
      startDate: "2026-12-14",
      durationDays: 2,
      transport: "MOTORCYCLE",
      journey,
      restMode: "COMPACT",
    });
    const chatResult = await scheduleSelection(
      { requirement, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} },
      { days: [[dongVan.id], [maPiLeng.id, nhoQue.id]] },
      [dongVan, { ...maPiLeng, suggestedDurationMinutes: 30, minimumDurationMinutes: 30, userChosenDuration: true }, nhoQue],
      routes,
      now,
    );
    const stripped = toSaveProposal(chatResult)!;
    delete stripped.days[1]!.visits[0]!.userChosenDuration;
    const failed = await freshJourneyValidation(stripped, dbDestinations, routes, now);

    const described = describeSaveValidationFailure(failed.validation, "Hành trình chưa đủ điều kiện xác nhận và lưu.", chatResult);
    expect(described.message).toContain("Đèo Mã Pì Lèng");
    expect(described.message).toContain("30 phút");
    expect(described.message).not.toBe("Hành trình chưa đủ điều kiện xác nhận và lưu.");
    expect(described.recovery.length).toBeGreaterThanOrEqual(1);
    expect(described.recovery[0]!.label).toContain("Đèo Mã Pì Lèng");

    const html = renderToStaticMarkup(
      createElement(TripsageSaveSection, {
        result: chatResult,
        primaryLabel: "Lưu chuyến",
        initialView: {
          state: "failed",
          message: described.message,
          tripId: null,
          unchecked: [],
          recovery: described.recovery,
        },
        onRequestFix: () => {},
      }),
    );
    expect(html).toContain("Đèo Mã Pì Lèng");
    expect(html).toContain("tripsage-save-recovery");
    expect(html).toContain(described.recovery[0]!.label);
  });
});
