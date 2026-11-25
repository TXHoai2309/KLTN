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
 * Approved transport price reference table synced with `docs/fixtures/price-reference-ha-giang.md` (ADR-52).
 * Bundled in code so Vercel serverless prod, chat tools, cost table, and saved trips read the exact same source.
 * Routes not listed here have NO approved estimate and deterministically resolve to "chưa có giá" (`MISSING`)
 * unless a live Google Flights lookup matches the route and dates (±1 day).
 */
export const APPROVED_PRICE_REFERENCE_DATE = "2026-11-21";

export type ApprovedAccessRoutePrice = {
  mode: (typeof ACCESS_MODES)[number];
  places: readonly [string, string];
  minVnd: number;
  maxVnd: number;
  midpointVnd: number;
  label: string;
};

export const APPROVED_ACCESS_ROUTE_PRICES: readonly ApprovedAccessRoutePrice[] = [
  {
    mode: "SLEEPER_BUS",
    places: ["ha noi", "ha giang"],
    minVnd: 250_000,
    maxVnd: 400_000,
    midpointVnd: 325_000,
    label: "Xe khách giường nằm Hà Nội ⇄ TP Hà Giang",
  },
  {
    mode: "FLIGHT",
    places: ["ho chi minh", "ha noi"],
    minVnd: 1_200_000,
    maxVnd: 2_500_000,
    midpointVnd: 1_850_000,
    label: "Vé máy bay TP Hồ Chí Minh ⇄ Hà Nội (phổ thông)",
  },
] as const;

const AIRPORT_TO_CANONICAL_CITY: Record<string, string> = {
  DAD: "da nang",
  HAN: "ha noi",
  SGN: "ho chi minh",
  HUI: "hue",
  CXR: "nha trang",
  DLI: "da lat",
  PQC: "phu quoc",
  VCA: "can tho",
  HPH: "hai phong",
  VII: "vinh",
};

/** Checks whether a 3-letter IATA origin airport matches a segment endpoint city (e.g. DAD ↔ Đà Nẵng). */
export function airportMatchesPlace(airportCode: string | undefined, place: string): boolean {
  if (!airportCode) return true;
  const code = airportCode.trim().toUpperCase();
  const mapped = AIRPORT_TO_CANONICAL_CITY[code];
  if (mapped) return sameAccessPlace(mapped, place);
  return place.toUpperCase().includes(code);
}

/** Looks up the approved price reference range for an exact (mode, from, to) corridor (bidirectional). */
export function lookupApprovedAccessSegmentPrice(
  mode: (typeof ACCESS_MODES)[number],
  from: string,
  to: string,
): ApprovedAccessRoutePrice | null {
  const a = canonicalAccessPlace(from);
  const b = canonicalAccessPlace(to);
  if (!a || !b) return null;
  for (const entry of APPROVED_ACCESS_ROUTE_PRICES) {
    if (entry.mode !== mode) continue;
    const [p1, p2] = entry.places;
    if ((a === p1 && b === p2) || (a === p2 && b === p1)) return entry;
  }
  return null;
}
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

/**
 * Resolves context-aware actionable chips for missing access-leg fares (B1):
 * - Only offers "Tra lại vé máy bay" when a FLIGHT segment actually lacks a fare.
 * - On bus-only missing fares, offers "Giữ xe khách, chốt giá sau" and "Đổi tuyến qua Hà Nội"
 *   (only when the Hà Nội ⇄ TP Hà Giang corridor exists in the approved price table and isn't already used).
 * - Never suggests switching to a transport mode already used on the missing leg.
 */
export function resolveMissingPriceChips(input: {
  accessLeg?: AccessLegPart | null;
  missingItems?: readonly string[] | null;
  lang: "vi" | "en";
  approvedRoutes?: readonly ApprovedAccessRoutePrice[];
}): {
  chips: string[];
  hasMissingFlight: boolean;
  missingModes: ReadonlySet<(typeof ACCESS_MODES)[number]>;
  usedModes: ReadonlySet<(typeof ACCESS_MODES)[number]>;
} {
  const isEn = input.lang === "en";
  const allSegments = [...(input.accessLeg?.outbound ?? []), ...(input.accessLeg?.return ?? [])];
  const usedModes = new Set<(typeof ACCESS_MODES)[number]>(allSegments.map((s) => s.mode));
  const missingSegments = allSegments.filter(
    (s) => s.priceSource === "MISSING" || s.priceVndPerPerson <= 0,
  );
  const missingModes = new Set<(typeof ACCESS_MODES)[number]>(missingSegments.map((s) => s.mode));

  if (missingSegments.length === 0 && !input.accessLeg) {
    const missingText = (input.missingItems ?? []).join(" ");
    if (/xe\s*kh[aá]ch|gi[uư][oờ]ng\s*n[aằ]m|\bbus\b/iu.test(missingText)) {
      missingModes.add("SLEEPER_BUS");
      usedModes.add("SLEEPER_BUS");
    } else if (/t[aà]u\s*h[oỏ]a|\btrain\b/iu.test(missingText)) {
      missingModes.add("TRAIN");
      usedModes.add("TRAIN");
    } else if (/m[aá]y\s*bay|chuy[eế]n\s*bay|\bflight\b|\b(?:DAD|SGN|PQC|CXR|HUI|DLI|VCA)\b|Đ[aà]\s*N[aẵ]ng|TP\.?\s*HCM|H[oồ]\s*Ch[ií]\s*Minh|C[aầ]n\s*Th[oơ]|Nha\s*Trang|Ph[uú]\s*Qu[oố]c|Hu[eế]/iu.test(missingText)) {
      missingModes.add("FLIGHT");
      usedModes.add("FLIGHT");
    } else if ((input.missingItems?.length ?? 0) > 0) {
      missingModes.add("SLEEPER_BUS");
      usedModes.add("SLEEPER_BUS");
    }
  }

  const routes = input.approvedRoutes ?? APPROVED_ACCESS_ROUTE_PRICES;
  const hasApprovedHaNoiBusCorridor = routes.some(
    (entry) =>
      entry.mode === "SLEEPER_BUS" &&
      ((entry.places[0] === "ha noi" && entry.places[1] === "ha giang") ||
        (entry.places[0] === "ha giang" && entry.places[1] === "ha noi")),
  );
  const missingSegAlreadyViaHaNoi =
    missingSegments.length > 0 &&
    missingSegments.every(
      (s) => sameAccessPlace(s.from, "Hà Nội") || sameAccessPlace(s.to, "Hà Nội"),
    );

  const hasMissingFlight = missingModes.has("FLIGHT");
  const chips: string[] = [];

  if (hasMissingFlight) {
    chips.push(isEn ? "Retry flight lookup" : "Tra lại vé máy bay");
    if (!missingModes.has("SLEEPER_BUS")) {
      chips.push(isEn ? "Switch to bus" : "Đổi sang xe khách");
    } else if (!usedModes.has("TRAIN")) {
      chips.push(isEn ? "Switch to train" : "Đổi sang tàu hỏa");
    }
    chips.push(isEn ? "Skip and save first" : "Bỏ qua, lưu trước");
  } else if (missingModes.has("SLEEPER_BUS")) {
    chips.push(isEn ? "Keep bus, check fare later" : "Giữ xe khách, chốt giá sau");
    if (hasApprovedHaNoiBusCorridor && !missingSegAlreadyViaHaNoi) {
      chips.push(isEn ? "Route via Hà Nội" : "Đổi tuyến qua Hà Nội");
    }
    chips.push(isEn ? "Skip and save first" : "Bỏ qua, lưu trước");
  } else if (missingModes.has("TRAIN")) {
    chips.push(isEn ? "Keep train, check fare later" : "Giữ tàu hỏa, chốt giá sau");
    if (!usedModes.has("SLEEPER_BUS") && !missingModes.has("SLEEPER_BUS")) {
      chips.push(isEn ? "Switch to bus" : "Đổi sang xe khách");
    } else if (hasApprovedHaNoiBusCorridor && !missingSegAlreadyViaHaNoi) {
      chips.push(isEn ? "Route via Hà Nội" : "Đổi tuyến qua Hà Nội");
    }
    chips.push(isEn ? "Skip and save first" : "Bỏ qua, lưu trước");
  } else {
    chips.push(isEn ? "Keep current mode, check later" : "Giữ phương tiện hiện tại");
    chips.push(isEn ? "Skip and save first" : "Bỏ qua, lưu trước");
  }

  return { chips, hasMissingFlight, missingModes, usedModes };
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
  originAirport?: string;
};

function findPreservedGoogleFlightSegment(
  previous: AccessLegPart | null | undefined,
  segment: AccessLegInput["outbound"][number],
): AccessLegPart["outbound"][number] | null {
  if (!previous || segment.mode !== "FLIGHT") return null;
  const allPrev = [...previous.outbound, ...previous.return];
  const exact = allPrev.find(
    prev =>
      prev.mode === "FLIGHT"
      && prev.priceSource === "GOOGLE_FLIGHTS"
      && prev.priceVndPerPerson > 0
      && sameAccessPlace(prev.from, segment.from)
      && sameAccessPlace(prev.to, segment.to),
  );
  if (exact) return exact;
  return (
    allPrev.find(
      prev =>
        prev.mode === "FLIGHT"
        && prev.priceSource === "GOOGLE_FLIGHTS"
        && prev.priceVndPerPerson > 0
        && sameAccessPlace(prev.from, segment.to)
        && sameAccessPlace(prev.to, segment.from),
    ) ?? null
  );
}

/**
 * Deterministic server-side pricing for every access-leg segment (ADR-52):
 *   (1) Live Google Flights price matching route & dates (±1 day), or preserved Google Flights price from `previousAccessLeg`
 *       when route and dates did not change.
 *   (2) Approved price reference table for the exact `(mode, from, to)` corridor (uses midpoint; accepts model's number ONLY if
 *       it lies strictly inside the approved `[minVnd, maxVnd]` range).
 *   (3) `MISSING` (`priceVndPerPerson: 0`, "chưa có giá") — never trusts an unverified model-invented number.
 */
export function buildAccessLeg(
  input: AccessLegInput,
  homeCity: string,
  travelers: number,
  flightPriceOverride?: FlightPriceOverride | null,
  previousAccessLeg?: AccessLegPart | null,
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
  // Continuity guard (Bug 2): ensure homeCity continuity BEFORE deterministic pricing so inserted legs are priced consistently.
  const trimmedHome = homeCity.trim();
  const rawOutbound = [...input.outbound];
  const rawReturn = [...input.return];
  if (trimmedHome && rawOutbound.length > 0 && rawOutbound.length < 4 && !sameAccessPlace(rawOutbound[0]!.from, trimmedHome)) {
    rawOutbound.unshift({
      mode: rawOutbound[0]!.mode,
      from: trimmedHome,
      to: rawOutbound[0]!.from,
      durationMinutes: 0,
      priceVndPerPerson: 0,
    });
  }
  if (trimmedHome && rawReturn.length > 0 && rawReturn.length < 4 && !sameAccessPlace(rawReturn[rawReturn.length - 1]!.to, trimmedHome)) {
    rawReturn.push({
      mode: rawReturn[rawReturn.length - 1]!.mode,
      from: rawReturn[rawReturn.length - 1]!.to,
      to: trimmedHome,
      durationMinutes: 0,
      priceVndPerPerson: 0,
    });
  }

  const outboundFlightCount = rawOutbound.filter(s => s.mode === "FLIGHT").length;
  const returnFlightCount = rawReturn.filter(s => s.mode === "FLIGHT").length;
  // Normalize looked-up price to per-person using the lookup's `adults` count (not `travelers`),
  // so lookups for 1 adult (default) or any passenger count scale accurately to `travelers`.
  const perPersonTotal = applyFlightOverride ? Math.round(flightPriceOverride!.totalVnd / overrideAdults) : 0;
  const splitRoundTrip = applyFlightOverride && flightPriceOverride!.roundTrip && outboundFlightCount === 1 && returnFlightCount === 1;
  const outboundFlightVnd = splitRoundTrip ? Math.floor(perPersonTotal / 2) : perPersonTotal;
  const returnFlightVnd = splitRoundTrip ? perPersonTotal - outboundFlightVnd : perPersonTotal;

  const overrideMatchesSegment = (segment: AccessLegInput["outbound"][number]): boolean => {
    if (!applyFlightOverride || segment.mode !== "FLIGHT") return false;
    if (!flightPriceOverride?.originAirport) return true;
    return (
      airportMatchesPlace(flightPriceOverride.originAirport, segment.from)
      || airportMatchesPlace(flightPriceOverride.originAirport, segment.to)
    );
  };

  const enrich = (
    segments: AccessLegInput["outbound"],
    flightVnd: number,
  ): AccessLegPart["outbound"] => segments.map(segment => {
    // Priority 1a: active Google Flights lookup matching route & dates
    if (overrideMatchesSegment(segment)) {
      return {
        ...segment,
        priceVndPerPerson: Math.min(20_000_000, Math.max(0, flightVnd)),
        priceSource: "GOOGLE_FLIGHTS" as const,
        ...(flightPriceOverride?.lookupDate ? { priceLookupDate: flightPriceOverride.lookupDate } : {}),
      };
    }
    // Priority 1b: preserved Google Flights price from the previous access leg when route & dates still match
    const preservedFlight = findPreservedGoogleFlightSegment(previousAccessLeg, segment);
    if (preservedFlight) {
      return {
        ...segment,
        priceVndPerPerson: preservedFlight.priceVndPerPerson,
        priceSource: "GOOGLE_FLIGHTS" as const,
        ...(preservedFlight.priceLookupDate ? { priceLookupDate: preservedFlight.priceLookupDate } : {}),
      };
    }
    // Priority 2: approved price reference for exact (mode, from, to); accept model's figure ONLY if inside [minVnd, maxVnd]
    const approved = lookupApprovedAccessSegmentPrice(segment.mode, segment.from, segment.to);
    if (approved) {
      const withinApprovedRange =
        segment.priceVndPerPerson >= approved.minVnd && segment.priceVndPerPerson <= approved.maxVnd;
      return {
        ...segment,
        priceVndPerPerson: withinApprovedRange ? segment.priceVndPerPerson : approved.midpointVnd,
        priceSource: "ESTIMATE" as const,
      };
    }
    // Priority 3: no Google Flights lookup and no approved reference route -> deterministically MISSING (never invent a fare)
    return { ...segment, priceVndPerPerson: 0, priceSource: "MISSING" as const };
  });

  const outbound = enrich(rawOutbound, outboundFlightVnd);
  const ret = enrich(rawReturn, returnFlightVnd);
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
    leg,
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

/**
 * Bug 4: single source of truth for showing "Ngày đi / Ngày về" tabs on both `/assistant` and `/trips/[id]`.
 * Shown ONLY when:
 *   (a) a current access leg exists, OR
 *   (b) origin is a fixed hub (`isHubOrigin`) AND `homeCity` is a different city from that hub.
 * A concrete local origin inside the traveler's home city (e.g. "Cầu Giấy" when homeCity is "Hà Nội") has NO travel days.
 */
export function resolveTravelDaysContext(input: {
  accessLeg?: AccessLegPart | null;
  homeCity?: string | null;
  originLabel?: string | null;
}): { homeCity: string; hubName: string } | null {
  if (input.accessLeg) {
    return { homeCity: input.accessLeg.homeCity, hubName: input.accessLeg.hubName };
  }
  const homeCity = input.homeCity?.trim();
  const originLabel = input.originLabel?.trim();
  if (!homeCity || !originLabel) return null;
  if (!isHubOrigin(originLabel)) return null;
  if (sameAccessPlace(homeCity, originLabel)) return null;
  return { homeCity, hubName: originLabel };
}

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

/** D11 & D12: standard airport check-in lead time and airport ↔ bus station reference transit times. */
export const AIRPORT_CHECKIN_BUFFER_MINUTES = 120;
export const AIRPORT_TRANSFER_REFERENCES = {
  NOI_BAI_MY_DINH_MINUTES: 60,
} as const;

export type AccessScheduleStep =
  | {
      kind: "CHECKIN";
      clockLabel: string | null;
      text: string;
    }
  | {
      kind: "SEGMENT";
      segmentIndex: number;
      segment: AccessLegPart["outbound"][number];
      clockLabel: string | null;
      durationMinutes: number;
    }
  | {
      kind: "LAYOVER";
      clockLabel: string | null;
      gapMinutes: number | null;
      transferMinutes: number | null;
      transferLabel: string | null;
      tightWarning: string | null;
    };

export type AccessDirectionSchedule = {
  steps: AccessScheduleStep[];
  travelMinutes: number;
  totalSpanMinutes: number | null;
  hasMissingDuration: boolean;
  startsWithFlight: boolean;
  warnings: string[];
};

export function formatDurationVi(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins} phút`;
  return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
}

function parseClockHhMm(value?: string): number | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClockOffsetVi(minute: number): string {
  const dayOffset = Math.floor(minute / 1440);
  const withinDay = ((minute % 1440) + 1440) % 1440;
  const hh = String(Math.floor(withinDay / 60)).padStart(2, "0");
  const mm = String(withinDay % 60).padStart(2, "0");
  return dayOffset > 0 ? `${hh}:${mm} (+${dayOffset} ngày)` : `${hh}:${mm}`;
}

function isNoiBaiEndpoint(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes("nội bài") || lower.includes("noi bai") || /\bhan\b/i.test(label);
}

function isHaNoiBusEndpoint(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes("mỹ đình") || lower.includes("my dinh") || lower.includes("hà nội") || lower.includes("ha noi");
}

function resolveInterModalTransfer(
  prev: AccessLegPart["outbound"][number],
  next: AccessLegPart["outbound"][number],
): { minutes: number; label: string } | null {
  const isFlightToBus = prev.mode === "FLIGHT" && next.mode !== "FLIGHT";
  const isBusToFlight = prev.mode !== "FLIGHT" && next.mode === "FLIGHT";
  if (!isFlightToBus && !isBusToFlight) return null;
  if (
    (isFlightToBus && isNoiBaiEndpoint(prev.to) && isHaNoiBusEndpoint(next.from)) ||
    (isBusToFlight && isHaNoiBusEndpoint(prev.to) && isNoiBaiEndpoint(next.from))
  ) {
    return {
      minutes: AIRPORT_TRANSFER_REFERENCES.NOI_BAI_MY_DINH_MINUTES,
      label: isFlightToBus ? "Trung chuyển Nội Bài → Mỹ Đình" : "Trung chuyển Mỹ Đình → Nội Bài",
    };
  }
  return null;
}

/**
 * Builds an ordered, clock-aligned timeline for one access-leg direction (`outbound` or `return`),
 * preserving midnight wraps (+1 ngày), Nội Bài ↔ Mỹ Đình reference transfer (~60m), and 2h pre-flight check-in.
 */
export function buildAccessDirectionSchedule(
  segments: AccessLegPart["outbound"],
  direction: "outbound" | "return",
): AccessDirectionSchedule {
  const steps: AccessScheduleStep[] = [];
  const warnings: string[] = [];
  const hasMissingDuration = segments.some(s => s.durationMinutes <= 0);
  const travelMinutes = segments.reduce((sum, s) => sum + Math.max(0, s.durationMinutes), 0);
  const startsWithFlight = segments[0]?.mode === "FLIGHT";

  let prevEndMinute: number | null = null;
  let firstStartMinute: number | null = null;
  let lastEndMinute: number | null = null;
  let allTimedAndSized = segments.length > 0;

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const rawStart = parseClockHhMm(segment.departTime);
    let startMinute = rawStart;
    if (startMinute !== null && prevEndMinute !== null && startMinute < prevEndMinute) {
      const daysToAdd = Math.ceil((prevEndMinute - startMinute) / 1440);
      startMinute += daysToAdd * 1440;
    }
    const endMinute = startMinute !== null && segment.durationMinutes > 0
      ? startMinute + segment.durationMinutes
      : null;

    if (index === 0) {
      firstStartMinute = startMinute;
      if (segment.mode === "FLIGHT") {
        const checkinAt = startMinute !== null ? startMinute - AIRPORT_CHECKIN_BUFFER_MINUTES : null;
        steps.push({
          kind: "CHECKIN",
          clockLabel: checkinAt !== null && checkinAt >= 0 ? `Từ ${formatClockOffsetVi(checkinAt)}` : null,
          text: "Có mặt sân bay trước 2 giờ để làm thủ tục",
        });
      }
    } else {
      const prev = segments[index - 1]!;
      const transfer = resolveInterModalTransfer(prev, segment);
      const needsPreFlightCheckin = segment.mode === "FLIGHT";
      const gapMinutes = prevEndMinute !== null && startMinute !== null ? startMinute - prevEndMinute : null;
      const requiredMinutes = (transfer?.minutes ?? 0) + (needsPreFlightCheckin ? AIRPORT_CHECKIN_BUFFER_MINUTES : 0);

      let tightWarning: string | null = null;
      if (gapMinutes !== null && requiredMinutes > 0 && gapMinutes < requiredMinutes) {
        const prefix = direction === "outbound" ? "Chặng đi" : "Chặng về";
        const detail = needsPreFlightCheckin
          ? `${transfer ? `cần ~${transfer.minutes} phút ${transfer.label.toLowerCase()} + ` : ""}2 giờ có mặt sân bay trước giờ bay`
          : `cần ~${transfer!.minutes} phút ${transfer!.label.toLowerCase()}`;
        tightWarning = `${prefix}: thời gian nối chuyến (${formatDurationVi(gapMinutes)}) khá sát (${detail}).`;
        warnings.push(tightWarning);
      }

      if (gapMinutes !== null || transfer !== null || tightWarning !== null) {
        let transferLabel: string | null = null;
        if (transfer && gapMinutes !== null) {
          const spare = gapMinutes - requiredMinutes;
          transferLabel = spare >= 0
            ? `${transfer.label} (~${transfer.minutes} phút tham khảo)${spare > 0 ? `, còn ${formatDurationVi(spare)} chờ` : ""}`
            : `${transfer.label} (~${transfer.minutes} phút tham khảo)`;
        } else if (transfer) {
          transferLabel = `${transfer.label} (~${transfer.minutes} phút tham khảo)`;
        } else if (gapMinutes !== null) {
          transferLabel = gapMinutes > 0 ? `Chờ nối chuyến ${formatDurationVi(gapMinutes)}` : "Nối chuyến ngay";
        }
        steps.push({
          kind: "LAYOVER",
          clockLabel:
            prevEndMinute !== null && startMinute !== null
              ? `${formatClockOffsetVi(prevEndMinute)} → ${formatClockOffsetVi(startMinute)}`
              : null,
          gapMinutes,
          transferMinutes: transfer?.minutes ?? null,
          transferLabel,
          tightWarning,
        });
      }

      if (needsPreFlightCheckin) {
        const checkinAt = startMinute !== null ? startMinute - AIRPORT_CHECKIN_BUFFER_MINUTES : null;
        steps.push({
          kind: "CHECKIN",
          clockLabel: checkinAt !== null ? `Trước ${formatClockOffsetVi(checkinAt)}` : null,
          text: "Có mặt sân bay trước 2 giờ",
        });
      }
    }

    if (startMinute === null || endMinute === null) {
      allTimedAndSized = false;
    }
    steps.push({
      kind: "SEGMENT",
      segmentIndex: index,
      segment,
      clockLabel:
        startMinute !== null && endMinute !== null
          ? `${formatClockOffsetVi(startMinute)} → ${formatClockOffsetVi(endMinute)}`
          : startMinute !== null
            ? `Từ ${formatClockOffsetVi(startMinute)}`
            : null,
      durationMinutes: segment.durationMinutes,
    });

    if (endMinute !== null) {
      prevEndMinute = endMinute;
      lastEndMinute = endMinute;
    } else {
      prevEndMinute = null;
    }
  }

  const totalSpanMinutes =
    allTimedAndSized && firstStartMinute !== null && lastEndMinute !== null
      ? lastEndMinute - firstStartMinute
      : null;

  return {
    steps,
    travelMinutes,
    totalSpanMinutes,
    hasMissingDuration,
    startsWithFlight,
    warnings,
  };
}

/** D11: returns non-blocking transfer & airport check-in warnings across both access-leg directions. */
export function collectAccessLegWarnings(leg: AccessLegPart | null | undefined): string[] {
  if (!leg) return [];
  const outbound = buildAccessDirectionSchedule(leg.outbound, "outbound");
  const returning = buildAccessDirectionSchedule(leg.return, "return");
  return [...outbound.warnings, ...returning.warnings];
}
