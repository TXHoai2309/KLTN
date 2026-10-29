import { describe, expect, it } from "vitest";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { analyzeCurrentProposal } from "./planning-guidance";

type Stop = { name: string; arrival: number | null; visit: number; travelSeconds: number | null };
const stop = ({ name, arrival, visit, travelSeconds }: Stop, order: number) => ({
  order, destination: { id: name, name }, arrivalMinute: arrival, departureMinute: arrival === null ? null : arrival + visit, visitDurationMinutes: visit,
  scheduleState: arrival === null ? "TIME_UNKNOWN" : "PLANNED", validationStatus: "PASS",
  inbound: travelSeconds === null ? null : { fromDestinationId: "x", toDestinationId: name, status: "VERIFIED", reason: null, durationSeconds: travelSeconds, distanceMeters: 1000, provider: "STADIA_MAPS" },
});
const day = (n: number, stops: Stop[]) => ({ day: n, date: null, stops: stops.map((s, i) => stop(s, i + 1)), distanceMeters: null, travelSeconds: stops.reduce((sum, s) => sum + (s.travelSeconds ?? 0), 0) });
const proposal = (days: ReturnType<typeof day>[], openingHours: "PASS" | "INSUFFICIENT_DATA" = "INSUFFICIENT_DATA", date: string | null = null) => ({
  status: openingHours === "PASS" ? "PROPOSAL_READY" : "INSUFFICIENT_DATA", requirement: { durationDays: days.length, transport: "MOTORCYCLE", startDate: date },
  days, checks: [{ key: "OPENING_HOURS", status: openingHours, issues: [] }, { key: "TRAVEL_TIME", status: "PASS", issues: [] }], eligibleForFinalConfirmation: openingHours === "PASS",
}) as unknown as Pick<PlannerResult, "days" | "status" | "checks" | "requirement" | "eligibleForFinalConfirmation">;

describe("V2-08 analyzeCurrentProposal derives guidance only from the stored itinerary", () => {
  const dense = proposal([
    day(1, [{ name: "Quản Bạ", arrival: 480, visit: 60, travelSeconds: null }, { name: "Đồng Văn", arrival: 606, visit: 90, travelSeconds: 3960 }, { name: "Lũng Cú", arrival: 717, visit: 90, travelSeconds: 1260 }]),
    day(2, [{ name: "Mã Pì Lèng", arrival: 509, visit: 60, travelSeconds: 1740 }, { name: "Nho Quế", arrival: 578, visit: 120, travelSeconds: 540 }]),
  ]);

  it("summarises each day with its stops, stop count and travel minutes", () => {
    const result = analyzeCurrentProposal(dense);
    expect(result.days).toEqual([
      { day: 1, stops: ["Quản Bạ", "Đồng Văn", "Lũng Cú"], stopCount: 3, travelMinutes: 87, finishMinute: 807 },
      { day: 2, stops: ["Mã Pì Lèng", "Nho Quế"], stopCount: 2, travelMinutes: 38, finishMinute: 698 },
    ]);
  });

  it("flags the denser day and offers dropping its last stop as an explicit, unapplied fallback", () => {
    const result = analyzeCurrentProposal(dense);
    expect(result.signals).toContainEqual({ code: "DENSER_DAY", day: 1, stopCount: 3, lighterDay: 2, lighterStopCount: 2 });
    expect(result.fallbackSuggestions).toEqual([{ day: 1, dropStop: "Lũng Cú", reason: "DENSER_DAY" }]);
  });

  it("reports pending date-dependent checks instead of treating them as passed", () => {
    const result = analyzeCurrentProposal(dense);
    expect(result.signals).toContainEqual({ code: "DATE_REQUIRED_FOR_HOURS" });
    expect(result.validation).toEqual({ status: "INSUFFICIENT_DATA", pendingChecks: ["OPENING_HOURS"], eligibleForFinalConfirmation: false });
  });

  it("flags a long travel day and a late finish from stored minutes only", () => {
    const heavy = proposal([day(1, [{ name: "A", arrival: 480, visit: 60, travelSeconds: null }, { name: "B", arrival: 840, visit: 120, travelSeconds: 15000 }, { name: "C", arrival: 1100, visit: 60, travelSeconds: 8000 }])], "PASS", "2026-11-05");
    const result = analyzeCurrentProposal(heavy);
    expect(result.signals).toContainEqual({ code: "LONG_TRAVEL_DAY", day: 1, travelMinutes: 383 });
    expect(result.signals).toContainEqual({ code: "LATE_FINISH", day: 1, finishMinute: 1160 });
    expect(result.signals.some(signal => signal.code === "DATE_REQUIRED_FOR_HOURS")).toBe(false);
    expect(result.fallbackSuggestions[0]).toMatchObject({ day: 1, dropStop: "C" });
  });

  it("makes no claim about travel time when a route leg is unverified", () => {
    const unknown = proposal([day(1, [{ name: "A", arrival: 480, visit: 60, travelSeconds: null }, { name: "B", arrival: null, visit: 60, travelSeconds: null }])]);
    const result = analyzeCurrentProposal(unknown);
    expect(result.days[0]).toMatchObject({ stopCount: 2, finishMinute: null });
    expect(result.signals.some(signal => signal.code === "LONG_TRAVEL_DAY" || signal.code === "LATE_FINISH")).toBe(false);
  });
});

describe("V2-08 guidance without a notable problem still answers 'what if I run slow?'", () => {
  const balanced = proposal([
    day(1, [{ name: "Quản Bạ", arrival: 480, visit: 60, travelSeconds: null }, { name: "Đồng Văn", arrival: 600, visit: 90, travelSeconds: 3600 }]),
    day(2, [{ name: "Mã Pì Lèng", arrival: 480, visit: 60, travelSeconds: null }, { name: "Nho Quế", arrival: 560, visit: 120, travelSeconds: 1200 }]),
  ]);
  it("reports a balanced load with its measured maxima", () => {
    expect(analyzeCurrentProposal(balanced).signals).toContainEqual({ code: "BALANCED_LOAD", maxStopCount: 2, maxTravelMinutes: 60 });
  });
  it("always offers one unapplied slow-day fallback on the day with the most travel", () => {
    expect(analyzeCurrentProposal(balanced).fallbackSuggestions).toEqual([{ day: 1, dropStop: "Đồng Văn", reason: "SLOWDOWN" }]);
  });
});
