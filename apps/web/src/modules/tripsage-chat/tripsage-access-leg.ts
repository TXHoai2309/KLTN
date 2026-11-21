import { z } from "zod";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { TRIP_HUBS } from "./trip-hubs";

/**
 * Client-safe access leg (ADR-42 §4, ticket 04): how a traveler from far away reaches a trip hub and gets home again.
 * Every time and price is an estimate; the leg is shown but never validated, never saved and never a PASS.
 */
export const ACCESS_MODES = ["FLIGHT", "SLEEPER_BUS", "TRAIN", "SHUTTLE"] as const;
export const ACCESS_MODE_LABELS: Record<(typeof ACCESS_MODES)[number], string> = { FLIGHT: "Máy bay", SLEEPER_BUS: "Xe khách giường nằm", TRAIN: "Tàu hỏa", SHUTTLE: "Xe trung chuyển" };
/**
 * Single source of truth for suggesting a closer trip hub (TP Hà Giang / Hà Nội):
 * - Any trip: outbound drive exceeds 10h (600 min) or hits OVERNIGHT_DRIVING_UNSUPPORTED.
 * - Short trips (<= 4 days): Day 1 is travel-only (OUTBOUND_ONLY / 0 visits with an outbound leg),
 *   or Day-1 outbound drive is >= 6h (360 min) or >= 300 km (e.g. Thanh Hóa → Hà Giang ~446 km eats Day 1).
 */
export const LONG_OUTBOUND_MINUTES = 600;
export const SHORT_TRIP_MAX_DAYS = 4;
export const SHORT_TRIP_LONG_OUTBOUND_MINUTES = 360;
export const SHORT_TRIP_LONG_OUTBOUND_KM = 300;

const segmentSchema = z.object({
  mode: z.enum(ACCESS_MODES),
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(60),
  departTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("Giờ đi gợi ý HH:MM."),
  durationMinutes: z.number().int().min(10).max(1440),
  priceVndPerPerson: z.number().int().min(0).max(20_000_000),
}).strict();
export const accessLegInputSchema = z.object({
  hubId: z.enum(TRIP_HUBS.map(hub => hub.id) as [string, ...string[]]),
  outbound: z.array(segmentSchema).min(1).max(4),
  return: z.array(segmentSchema).min(1).max(4),
}).strict();
export type AccessLegInput = z.infer<typeof accessLegInputSchema>;

export const accessLegPartSchema = z.object({
  hubName: z.string().min(1).max(80),
  homeCity: z.string().min(1).max(80),
  travelers: z.number().int().min(1).max(20),
  outbound: z.array(segmentSchema).min(1).max(4),
  return: z.array(segmentSchema).min(1).max(4),
  outboundMinutes: z.number().int().min(0).max(5760),
  returnMinutes: z.number().int().min(0).max(5760),
  totalVnd: z.number().int().min(0).max(1_000_000_000),
}).strict();
export type AccessLegPart = z.infer<typeof accessLegPartSchema>;

export function buildAccessLeg(input: AccessLegInput, homeCity: string, travelers: number): AccessLegPart {
  const hub = TRIP_HUBS.find(item => item.id === input.hubId)!;
  const minutes = (segments: AccessLegInput["outbound"]) => segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const price = [...input.outbound, ...input.return].reduce((sum, segment) => sum + segment.priceVndPerPerson, 0);
  return { hubName: hub.name, homeCity, travelers, outbound: input.outbound, return: input.return, outboundMinutes: minutes(input.outbound), returnMinutes: minutes(input.return), totalVnd: price * travelers };
}

export const isHubOrigin = (label: string | undefined) => TRIP_HUBS.some(hub => hub.name === label);

/** Returns true when driving from the current origin eats too much of Day 1 and a closer hub should be offered. */
export function shouldSuggestHub(result: PlannerResult): boolean {
  if (isHubOrigin(result.requirement.journey?.origin?.label)) return false;
  const outbound = result.journeyPlan?.legs.find(leg => leg.kind === "OUTBOUND");
  const outboundMinutes = (outbound?.route.durationSeconds ?? 0) / 60;
  const outboundKm = (outbound?.route.distanceMeters ?? 0) / 1000;
  if (result.reasonCodes.includes("OVERNIGHT_DRIVING_UNSUPPORTED") || outboundMinutes > LONG_OUTBOUND_MINUTES) {
    return true;
  }
  if (result.requirement.durationDays <= SHORT_TRIP_MAX_DAYS) {
    const day1 = result.days[0];
    const day1TravelOnly = day1?.journeyDayKind === "OUTBOUND_ONLY" || (day1?.stops.length === 0 && outbound !== undefined);
    if (day1TravelOnly || outboundMinutes >= SHORT_TRIP_LONG_OUTBOUND_MINUTES || outboundKm >= SHORT_TRIP_LONG_OUTBOUND_KM) {
      return true;
    }
  }
  return false;
}
