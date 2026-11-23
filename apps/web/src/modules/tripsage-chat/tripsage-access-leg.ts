import { z } from "zod";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { TRIP_HUBS } from "./trip-hubs";

/**
 * Client-safe access leg (ADR-42 §4, ticket 04): how a traveler from far away reaches a trip hub and gets home again.
 * Every time and price is an estimate; the leg is shown but never validated, never saved and never a PASS.
 */
export const ACCESS_MODES = ["FLIGHT", "SLEEPER_BUS", "TRAIN", "SHUTTLE"] as const;
export const ACCESS_MODE_LABELS: Record<(typeof ACCESS_MODES)[number], string> = { FLIGHT: "Máy bay", SLEEPER_BUS: "Xe khách giường nằm", TRAIN: "Tàu hỏa", SHUTTLE: "Xe trung chuyển" };
export const ACCESS_PRICE_SOURCES = ["ESTIMATE", "GOOGLE_FLIGHTS", "MISSING"] as const;
export type AccessPriceSource = (typeof ACCESS_PRICE_SOURCES)[number];
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

const inputSegmentSchema = z.object({
  mode: z.enum(ACCESS_MODES),
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(60),
  departTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("Giờ đi gợi ý HH:MM."),
  durationMinutes: z.number().int().min(0).max(1440),
  priceVndPerPerson: z.number().int().min(0).max(20_000_000),
}).strict();

const partSegmentSchema = inputSegmentSchema.extend({
  priceSource: z.enum(ACCESS_PRICE_SOURCES).optional(),
  priceLookupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
}).strict();

export const accessLegInputSchema = z.object({
  hubId: z.enum(TRIP_HUBS.map(hub => hub.id) as [string, ...string[]]),
  outbound: z.array(inputSegmentSchema).min(1).max(4),
  return: z.array(inputSegmentSchema).min(1).max(4),
}).strict();
export type AccessLegInput = z.infer<typeof accessLegInputSchema>;

export const accessLegPartSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  hubName: z.string().min(1).max(80),
  homeCity: z.string().min(1).max(80),
  travelers: z.number().int().min(1).max(20),
  outbound: z.array(partSegmentSchema).min(1).max(4),
  return: z.array(partSegmentSchema).min(1).max(4),
  outboundMinutes: z.number().int().min(0).max(5760),
  returnMinutes: z.number().int().min(0).max(5760),
  totalVnd: z.number().int().min(0).max(1_000_000_000),
  /** Corridors whose price is missing (priceVndPerPerson === 0 / priceSource === "MISSING"). */
  missingPriceSegments: z.array(z.string().max(120)).max(8).optional(),
}).strict();
export type AccessLegPart = z.infer<typeof accessLegPartSchema>;

/** Normalizes Vietnamese city / airport / station labels to a canonical city key for continuity checks. */
export function canonicalAccessPlace(label: string): string {
  const clean = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase()
    .replace(/\([^)]*\)/gu, " ")
    .replace(/\b(?:san bay|quoc te|ben xe|ga|thanh pho|tp\.?|tinh|khu vuc|phia nam|my dinh)\b/gu, " ")
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (/^(?:ho chi minh|hcm|sai gon|sg|sgn)$/u.test(clean) || clean.includes("ho chi minh")) return "ho chi minh";
  if (/^(?:ha noi|hn|han|noi bai)$/u.test(clean) || clean.includes("ha noi")) return "ha noi";
  if (/^(?:da nang|dn|dad)$/u.test(clean) || clean.includes("da nang")) return "da nang";
  if (/^(?:ha giang|hg)$/u.test(clean) || clean.includes("ha giang")) return "ha giang";
  return clean;
}

export function sameAccessPlace(a: string, b: string): boolean {
  const ca = canonicalAccessPlace(a);
  const cb = canonicalAccessPlace(b);
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

/** Deduplicates missing-price segments into concise corridor labels (e.g. "Đà Nẵng ⇄ Hà Nội"). */
export function collectMissingPriceSegments(
  outbound: readonly AccessLegPart["outbound"][number][],
  ret: readonly AccessLegPart["return"][number][],
): string[] {
  const missingOut = outbound.filter(s => s.priceVndPerPerson <= 0 || s.priceSource === "MISSING");
  const missingRet = ret.filter(s => s.priceVndPerPerson <= 0 || s.priceSource === "MISSING");
  const usedRet = new Set<number>();
  const labels: string[] = [];
  for (const seg of missingOut) {
    const revIdx = missingRet.findIndex(
      (r, idx) => !usedRet.has(idx) && sameAccessPlace(r.from, seg.to) && sameAccessPlace(r.to, seg.from),
    );
    if (revIdx >= 0) {
      usedRet.add(revIdx);
      labels.push(`${seg.from} ⇄ ${seg.to}`);
    } else {
      labels.push(`${seg.from} → ${seg.to}`);
    }
  }
  missingRet.forEach((seg, idx) => {
    if (!usedRet.has(idx)) labels.push(`${seg.from} → ${seg.to}`);
  });
  return [...new Set(labels)].slice(0, 8);
}

const SHORT_MODE_LABELS: Record<(typeof ACCESS_MODES)[number], string> = {
  FLIGHT: "Máy bay",
  SLEEPER_BUS: "Xe khách",
  TRAIN: "Tàu hỏa",
  SHUTTLE: "Trung chuyển",
};

let accessLegSeq = 0;
function nextAccessLegId(): string {
  const random = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${++accessLegSeq}`;
  return `al-${random}`;
}

export type FlightPriceOverride = {
  totalVnd: number;
  adults: number;
  roundTrip: boolean;
  lookupDate?: string;
};

export function buildAccessLeg(
  input: AccessLegInput,
  homeCity: string,
  travelers: number,
  flightPriceOverride?: FlightPriceOverride | null,
): AccessLegPart {
  const hub = TRIP_HUBS.find(item => item.id === input.hubId)!;
  const overrideAdults =
    flightPriceOverride && Number.isInteger(flightPriceOverride.adults) && flightPriceOverride.adults >= 1
      ? flightPriceOverride.adults
      : 0;
  const applyFlightOverride = Boolean(
    flightPriceOverride
    && Number.isFinite(flightPriceOverride.totalVnd)
    && flightPriceOverride.totalVnd > 0
    && overrideAdults >= 1,
  );
  const outboundFlightCount = input.outbound.filter(s => s.mode === "FLIGHT").length;
  const returnFlightCount = input.return.filter(s => s.mode === "FLIGHT").length;
  // Normalize looked-up price to per-person using the lookup's `adults` count (not `travelers`),
  // so lookups for 1 adult (default) or any passenger count scale accurately to `travelers`.
  const perPersonTotal = applyFlightOverride ? Math.round(flightPriceOverride!.totalVnd / overrideAdults) : 0;
  const splitRoundTrip = applyFlightOverride && flightPriceOverride!.roundTrip && outboundFlightCount === 1 && returnFlightCount === 1;
  const outboundFlightVnd = splitRoundTrip ? Math.floor(perPersonTotal / 2) : perPersonTotal;
  const returnFlightVnd = splitRoundTrip ? perPersonTotal - outboundFlightVnd : perPersonTotal;

  const enrich = (
    segments: AccessLegInput["outbound"],
    flightVnd: number,
  ): AccessLegPart["outbound"] => segments.map(segment => {
    if (segment.mode === "FLIGHT" && applyFlightOverride) {
      return {
        ...segment,
        priceVndPerPerson: Math.min(20_000_000, Math.max(0, flightVnd)),
        priceSource: "GOOGLE_FLIGHTS" as const,
        ...(flightPriceOverride?.lookupDate ? { priceLookupDate: flightPriceOverride.lookupDate } : {}),
      };
    }
    if (segment.priceVndPerPerson <= 0) {
      return { ...segment, priceVndPerPerson: 0, priceSource: "MISSING" as const };
    }
    return { ...segment, priceSource: "ESTIMATE" as const };
  });

  const outbound = enrich(input.outbound, outboundFlightVnd);
  const ret = enrich(input.return, returnFlightVnd);
  // Continuity guard (Bug 2): never drop the segment between homeCity and the first/last transit point.
  const trimmedHome = homeCity.trim();
  if (trimmedHome && outbound.length > 0 && outbound.length < 4 && !sameAccessPlace(outbound[0]!.from, trimmedHome)) {
    outbound.unshift({
      mode: outbound[0]!.mode,
      from: trimmedHome,
      to: outbound[0]!.from,
      durationMinutes: 0,
      priceVndPerPerson: 0,
      priceSource: "MISSING" as const,
    });
  }
  if (trimmedHome && ret.length > 0 && ret.length < 4 && !sameAccessPlace(ret[ret.length - 1]!.to, trimmedHome)) {
    ret.push({
      mode: ret[ret.length - 1]!.mode,
      from: ret[ret.length - 1]!.to,
      to: trimmedHome,
      durationMinutes: 0,
      priceVndPerPerson: 0,
      priceSource: "MISSING" as const,
    });
  }
  const missingPriceSegments = collectMissingPriceSegments(outbound, ret);
  const minutes = (segments: AccessLegPart["outbound"]) => segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const price = [...outbound, ...ret].reduce((sum, segment) => sum + segment.priceVndPerPerson, 0);
  return {
    id: nextAccessLegId(),
    hubName: hub.name,
    homeCity,
    travelers,
    outbound,
    return: ret,
    outboundMinutes: minutes(outbound),
    returnMinutes: minutes(ret),
    totalVnd: price * travelers,
    ...(missingPriceSegments.length ? { missingPriceSegments } : {}),
  };
}

/**
 * Re-applies a looked-up Google Flights price override to an existing access leg when `searchFlights`
 * completes after `planAccessLeg`. Returns a fresh `AccessLegPart` with a new `id`, or `null` if the
 * leg has no `FLIGHT` segments or the override is invalid.
 */
export function applyFlightOverrideToAccessLeg(
  leg: AccessLegPart,
  flightPriceOverride: FlightPriceOverride | null | undefined,
): AccessLegPart | null {
  const hub = TRIP_HUBS.find(item => item.name === leg.hubName);
  if (!hub || !flightPriceOverride) return null;
  const hasFlight = [...leg.outbound, ...leg.return].some(s => s.mode === "FLIGHT");
  if (!hasFlight) return null;
  const toInput = (segments: AccessLegPart["outbound"]): AccessLegInput["outbound"] =>
    segments.map(({ mode, from, to, departTime, durationMinutes, priceVndPerPerson }) => ({
      mode,
      from,
      to,
      ...(departTime ? { departTime } : {}),
      durationMinutes,
      priceVndPerPerson,
    }));
  const updated = buildAccessLeg(
    { hubId: hub.id, outbound: toInput(leg.outbound), return: toInput(leg.return) },
    leg.homeCity,
    leg.travelers,
    flightPriceOverride,
  );
  const applied = [...updated.outbound, ...updated.return].some(s => s.priceSource === "GOOGLE_FLIGHTS");
  return applied ? updated : null;
}

/** PARITY BR-5: concise per-segment breakdown for the cost table's "Chặng tiếp cận (đi và về)" basis (<= 120 chars). */
export function formatAccessLegCostBasis(leg: AccessLegPart): string {
  const fmtVnd = (amount: number) => `${amount.toLocaleString("vi-VN")}đ`;
  const summarizeDir = (segments: AccessLegPart["outbound"]) =>
    segments
      .map(s => `${SHORT_MODE_LABELS[s.mode]} ${s.priceVndPerPerson > 0 && s.priceSource !== "MISSING" ? fmtVnd(s.priceVndPerPerson) : "chưa có giá"}`)
      .join(" + ");
  const outSum = summarizeDir(leg.outbound);
  const retSum = summarizeDir(leg.return);
  const symmetric =
    leg.outbound.length === leg.return.length
    && leg.outbound.every((seg, i) => {
      const other = leg.return[leg.return.length - 1 - i];
      return other && other.mode === seg.mode && other.priceVndPerPerson === seg.priceVndPerPerson;
    });
  const base = symmetric
    ? `${outSum} × 2 chiều × ${leg.travelers} người`
    : `Đi: ${outSum}; Về: ${retSum} × ${leg.travelers} người`;
  if (base.length <= 120) return base;
  const compact = `${outSum} (đi & về) × ${leg.travelers} người`;
  return compact.length <= 120 ? compact : `${compact.slice(0, 119)}…`;
}

/** PARITY BR-1 & BR-2: true when `leg` matches the conversation's current access leg. */
export function isCurrentAccessLeg(
  leg: AccessLegPart,
  current: AccessLegPart | null | undefined,
): boolean {
  if (!current) return true;
  if (leg.id && current.id) return leg.id === current.id;
  return leg === current || JSON.stringify(leg) === JSON.stringify(current);
}

/** PARITY BR-3: ensures unsaved pinned items / save payload always carry the current access leg (never a stale version or duplicate). */
export function reconcileAccessPins<T extends { kind: string }>(
  pinned: readonly T[],
  currentAccessLeg: AccessLegPart | null | undefined,
): (Exclude<T, { kind: "ACCESS" }> | { kind: "ACCESS"; leg: AccessLegPart })[] {
  const withoutAccess = pinned.filter(
    (item): item is Exclude<T, { kind: "ACCESS" }> => item.kind !== "ACCESS",
  );
  if (!currentAccessLeg) return withoutAccess;
  return [{ kind: "ACCESS" as const, leg: currentAccessLeg }, ...withoutAccess];
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
