import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import {
  calibrateWindingFactor,
  DEFAULT_WINDING_FACTOR,
  estimatedRoadKm,
  estimateSeconds,
  haversine,
} from "./planner-geography";
import { loadDestinationTravelTimeLookup } from "./destination-travel-cache";
import { arrangeTripRoute, MIN_FILL_SAFETY_MARGIN_MINUTES, orderRoundTrip } from "./planner-route";
import { repairOvertimeItinerary } from "../tripsage-chat/tripsage-chat-tools";
import { candidate, referenceTime, requirement } from "./__fixtures__/planner-fixtures";
import type { PlannerResult } from "./planner-contract";

describe("D1, D2, D3, D4: travel cache, winding calibration, overtime repair, 45m margin", () => {
  it("D1: loads cached travel times only when source & target revisions match and feeds orderRoundTrip", async () => {
    const a = candidate("a", { latitude: 22.8, longitude: 104.9, revision: "2:2026-11-25T00:00:00.000Z" });
    const b = candidate("b", { latitude: 23.0, longitude: 105.0, revision: "3:2026-11-25T00:00:00.000Z" });
    const c = candidate("c", { latitude: 23.01, longitude: 105.1, revision: "1:2026-11-25T00:00:00.000Z" });

    const mockDb = {
      destinationTravelTime: {
        findMany: vi.fn(async () => [
          {
            fromDestinationId: "a",
            toDestinationId: "b",
            transport: "MOTORCYCLE",
            durationSeconds: 3600,
            distanceMeters: 42_000,
            provider: "STADIA_MAPS",
            fromRevision: 2,
            toRevision: 3,
          },
          {
            fromDestinationId: "b",
            toDestinationId: "c",
            transport: "MOTORCYCLE",
            durationSeconds: 1800,
            distanceMeters: 15_000,
            provider: "STADIA_MAPS",
            fromRevision: 99, // stale revision must be ignored
            toRevision: 1,
          },
        ]),
      },
    } as unknown as Database;

    const bundle = await loadDestinationTravelTimeLookup(mockDb, [a, b, c], "MOTORCYCLE");
    expect(bundle.lookup("a", "b", "MOTORCYCLE")).toEqual({
      durationSeconds: 3600,
      distanceMeters: 42_000,
      provider: "STADIA_MAPS",
    });
    expect(bundle.lookup("b", "c", "MOTORCYCLE")).toBeNull();
    // Calibrated winding ratio from (a -> b): air ~24.5 km vs 42 km road -> ~1.71
    expect(bundle.windingFactor).toBeGreaterThanOrEqual(1.5);
    expect(bundle.windingFactor).toBeLessThanOrEqual(3.5);

    // Fails safe on minimal DB mocks missing destinationTravelTime
    const minimalBundle = await loadDestinationTravelTimeLookup({} as Database, [a, b], "MOTORCYCLE");
    expect(minimalBundle.lookup("a", "b", "MOTORCYCLE")).toBeNull();
    expect(minimalBundle.windingFactor).toBe(DEFAULT_WINDING_FACTOR);

    // Prefers cached road distance over straight line in orderRoundTrip:
    // Straight line a->b is shorter than a->c, but cached b->a detour is huge so a->c->b wins.
    const ordered = orderRoundTrip([a, b, c], null, {
      transport: "MOTORCYCLE",
      travelLookup: (fromId, toId) => {
        if ((fromId === "a" && toId === "b") || (fromId === "b" && toId === "a")) {
          return { durationSeconds: 14_400, distanceMeters: 200_000, provider: "STADIA_MAPS" };
        }
        return { durationSeconds: 900, distanceMeters: 10_000, provider: "STADIA_MAPS" };
      },
    });
    expect(ordered.map(s => s.id)).toEqual(["a", "c", "b"]);
  });

  it("D2: uses 2.0 default winding factor and clamps median calibration to [1.5, 3.5]", () => {
    const p1 = { latitude: 22.8, longitude: 104.98 };
    const p2 = { latitude: 23.06, longitude: 105.05 };
    const air = haversine(p1, p2);
    expect(estimatedRoadKm(p1, p2)).toBeCloseTo(air * 2.0, 5);
    expect(estimateSeconds(p1, p2, "MOTORCYCLE")).toBe(Math.ceil(((air * 2.0) / 40) * 3600));

    // Calibrated median (~1.89 like c6be04d7 23 legs) is preserved
    const median189 = calibrateWindingFactor([
      { from: p1, to: p2, distanceMeters: air * 1000 * 1.6 },
      { from: p1, to: p2, distanceMeters: air * 1000 * 1.89 },
      { from: p1, to: p2, distanceMeters: air * 1000 * 2.6 },
    ]);
    expect(median189).toBeCloseTo(1.89, 2);

    // Clamps extreme low and high ratios into [1.5, 3.5]
    expect(calibrateWindingFactor([{ from: p1, to: p2, distanceMeters: air * 1000 * 1.1 }])).toBe(1.5);
    expect(calibrateWindingFactor([{ from: p1, to: p2, distanceMeters: air * 1000 * 5.2 }])).toBe(3.5);
  });

  it("D4: fill stops adding bonus stops when free margin would fall below 45 minutes", async () => {
    const baseStop = candidate("base", {
      latitude: 22.82,
      longitude: 104.98,
      suggestedDurationMinutes: 460,
      minimumDurationMinutes: 60,
    });
    // Day 1 starts 07:30 (450), visits 460m -> 15:10 (910), day ends 18:00 (1080) => ~170m idle.
    // Bonus stop needs 120m + driving/scenic -> leaves ~30m margin (< 45m), so D4 must reject it.
    const tightBonus = candidate("tight-bonus", {
      latitude: 22.83,
      longitude: 104.99,
      suggestedDurationMinutes: 120,
      minimumDurationMinutes: 60,
    });
    // Shorter bonus 30m -> leaves >= 120m margin (>= 45m), so D4 accepts it.
    const comfyBonus = candidate("comfy-bonus", {
      latitude: 22.825,
      longitude: 104.985,
      suggestedDurationMinutes: 30,
      minimumDurationMinutes: 15,
    });

    const req = { ...requirement, durationDays: 2, startDate: "2026-12-20" };
    const day2Keep = candidate("d2", { latitude: 23.0, longitude: 105.0, suggestedDurationMinutes: 460, minimumDurationMinutes: 60 });

    const rejected = await arrangeTripRoute({
      requirement: req,
      days: [[baseStop], [day2Keep]],
      pool: [baseStop, day2Keep, tightBonus],
      fill: true,
      budgetMs: 5_000,
    });
    expect(rejected.added.map(s => s.id)).not.toContain("tight-bonus");

    expect(MIN_FILL_SAFETY_MARGIN_MINUTES).toBe(45);
    const accepted = await arrangeTripRoute({
      requirement: req,
      days: [[baseStop], [day2Keep]],
      pool: [baseStop, day2Keep, comfyBonus],
      fill: true,
      budgetMs: 5_000,
    });
    expect(accepted.added.map(s => s.id)).toContain("comfy-bonus");
  });

  it("D3: resolves overtime in exact order: addedStops -> lowest non-required -> 15m trim -> COMPACT last", async () => {
    const req = { ...requirement, durationDays: 1, startDate: "2026-12-20" };
    const reqStop = candidate("req-stop", { suggestedDurationMinutes: 120, minimumDurationMinutes: 60 });
    const lowUserStop = candidate("low-user", { suggestedDurationMinutes: 90, minimumDurationMinutes: 60 });
    const extraStop = candidate("extra-fill", { suggestedDurationMinutes: 60, minimumDurationMinutes: 30 });

    const makeMockResult = (opts: {
      ids: string[];
      durations: Record<string, number>;
      restMode: string;
      violate: boolean;
    }): PlannerResult => ({
      proposalId: "p-d3",
      phase: "PRELIMINARY_PROPOSAL",
      status: "PROPOSAL_READY",
      timezone: "Asia/Ho_Chi_Minh",
      requirement: { ...req, restMode: opts.restMode as "STANDARD" | "COMPACT" },
      days: [
        {
          day: 1,
          date: "2026-12-20",
          distanceMeters: 10_000,
          travelSeconds: 900,
          stops: opts.ids.map((id, i) => ({
            order: i + 1,
            destination: {
              id,
              name: id,
              area: "Quản Bạ",
              category: "SCENIC",
              latitude: 23.06,
              longitude: 104.99,
              description: "d",
              address: null,
              image: null,
            },
            arrivalMinute: 480 + i * 100,
            departureMinute: 480 + i * 100 + (opts.durations[id] ?? 60),
            visitDurationMinutes: opts.durations[id] ?? 60,
            scheduleState: "PLANNED",
            inbound: null,
            validationStatus: opts.violate ? "VIOLATION" : "PASS",
          })),
        },
      ],
      checks: [
        {
          key: "SCHEDULE_CONFLICTS",
          status: opts.violate ? "VIOLATION" : "PASS",
          issues: opts.violate ? [{ code: "DAY_OVERTIME", day: 1, destinationId: null, message: "Quá giờ" }] : [],
        },
      ],
      warnings: [],
      reasonCodes: [],
      eligibleForFinalConfirmation: !opts.violate,
    });

    const events: string[] = [];
    // Case A: dropping addedStop fixes immediately without dropping user pick, trimming, or COMPACT
    const resA = await repairOvertimeItinerary({
      initialResult: makeMockResult({ ids: ["req-stop", "extra-fill"], durations: { "req-stop": 120, "extra-fill": 60 }, restMode: "STANDARD", violate: true }),
      needs: { requirement: req, missingFields: [], clear: true } as never,
      chosen: [reqStop, extraStop],
      routes: { route: vi.fn() },
      now: referenceTime,
      addedStopIds: new Set(["extra-fill"]),
      requiredIds: new Set(["req-stop"]),
      protectedOvernightIds: new Set(),
      overrides: {},
      scheduler: async (n, sel, list) => {
        const ids = sel.days[0]!;
        const dur = Object.fromEntries(list.map(c => [c.id, c.suggestedDurationMinutes ?? 60]));
        events.push(`A:${ids.join(",")}:${n.requirement.restMode}`);
        return makeMockResult({ ids, durations: dur, restMode: n.requirement.restMode ?? "STANDARD", violate: ids.includes("extra-fill") });
      },
    });
    expect(resA.droppedSuggestedStops).toEqual(["extra-fill"]);
    expect(resA.droppedChosenStops).toEqual([]);
    expect(resA.trimmedApplied).toBe(false);
    expect(resA.compactApplied).toBe(false);

    // Case B: no addedStops, drops low-value user stop before trimming or COMPACT; when still tight with only reqStop, trims 15m before COMPACT; COMPACT runs last
    const traceB: string[] = [];
    const resB = await repairOvertimeItinerary({
      initialResult: makeMockResult({ ids: ["req-stop", "low-user"], durations: { "req-stop": 120, "low-user": 90 }, restMode: "STANDARD", violate: true }),
      needs: { requirement: req, missingFields: [], clear: true } as never,
      chosen: [reqStop, lowUserStop],
      routes: { route: vi.fn() },
      now: referenceTime,
      addedStopIds: new Set(),
      requiredIds: new Set(["req-stop"]),
      protectedOvernightIds: new Set(),
      overrides: {},
      scheduler: async (n, sel, list) => {
        const ids = sel.days[0]!;
        const dur = Object.fromEntries(list.map(c => [c.id, c.suggestedDurationMinutes ?? 60]));
        const rest = n.requirement.restMode ?? "STANDARD";
        traceB.push(`${ids.join("+")}:${dur["req-stop"]}:${rest}`);
        // Only passes once low-user dropped AND req-stop trimmed twice (120 -> 90) AND restMode becomes COMPACT
        const ok = !ids.includes("low-user") && (dur["req-stop"] ?? 120) <= 90 && rest === "COMPACT";
        return makeMockResult({ ids, durations: dur, restMode: rest, violate: !ok });
      },
    });
    expect(resB.droppedChosenStops).toEqual(["low-user"]);
    expect(resB.trimmedApplied).toBe(true);
    expect(resB.compactApplied).toBe(true);
    // Exact sequence: drop low-user at 120 STANDARD -> trim 105 STANDARD -> trim 90 STANDARD -> trim 75 -> 60 STANDARD -> finally COMPACT
    expect(traceB[0]).toBe("req-stop:120:STANDARD");
    expect(traceB[1]).toBe("req-stop:105:STANDARD");
    expect(traceB[2]).toBe("req-stop:90:STANDARD");
    expect(traceB.at(-1)).toBe("req-stop:60:COMPACT");
    expect(traceB.slice(0, -1).every(step => step.endsWith(":STANDARD"))).toBe(true);
  });
});
