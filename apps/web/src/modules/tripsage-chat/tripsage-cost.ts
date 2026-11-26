import { z } from "zod";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";
import { sameAccessPlace, type AccessLegPart } from "./tripsage-access-leg";

/**
 * Client-safe cost estimate (ADR-42, ticket 03). The model estimates lodging, food, tickets and extras; the server computes
 * fuel from the itinerary's own distance and does all the arithmetic. Every amount is an estimate in whole VND.
 */
export const PRICE_REFERENCE = {
  updatedAt: "2026-11-21",
  /** Petrolimex zone 2, E5 RON 92-II, price table of 2026-11-19. Used only when the live price cannot be read; refresh by hand. */
  fuelVndPerLiter: 18_940,
  fuelPriceDate: "2026-11-19",
  litersPer100Km: { MOTORCYCLE: 2.5, CAR: 8 } satisfies Record<TripTransport, number>,
} as const;

export const COST_CATEGORIES = ["transport", "lodging", "food", "activities", "other"] as const;
export const COST_CATEGORY_LABELS: Record<(typeof COST_CATEGORIES)[number], string> = { transport: "Đi lại", lodging: "Lưu trú", food: "Ăn uống", activities: "Vé & vui chơi", other: "Khác" };
const vnd = z.number().int().min(0).max(1_000_000_000);

export const LODGING_TIERS = ["DORM", "HOMESTAY", "HOTEL"] as const;
export type LodgingTier = (typeof LODGING_TIERS)[number];
export const MEAL_TIERS = ["BUDGET", "STANDARD", "COMFORT"] as const;
export type MealTier = (typeof MEAL_TIERS)[number];
export const RENTAL_TIERS = [
  "OWN_VEHICLE",
  "SEMI_AUTO",
  "MANUAL",
  "EASY_RIDER",
  "CAR_SELF_DRIVE",
  "CAR_DRIVER",
] as const;
export type RentalTier = (typeof RENTAL_TIERS)[number];

/** Midpoint rates grounded in docs/fixtures/price-reference-ha-giang.md (2026-11-21). */
export const SERVER_COST_RATES = {
  lodging: {
    DORM: { label: "Homestay phòng tập thể", unitPrice: 125_000, perRoom: false },
    HOMESTAY: { label: "Homestay phòng riêng", unitPrice: 450_000, perRoom: true },
    HOTEL: { label: "Khách sạn 2–3 sao", unitPrice: 750_000, perRoom: true },
  },
  meal: {
    BUDGET: { label: "Ăn uống tiết kiệm", perPersonPerDay: 190_000 },
    STANDARD: { label: "Ăn uống phổ thông", perPersonPerDay: 270_000 },
    COMFORT: { label: "Ăn uống thoải mái (lẩu & đặc sản)", perPersonPerDay: 400_000 },
  },
  rental: {
    OWN_VEHICLE: { label: "Xe tự túc (không thuê)", perVehiclePerDay: 0, perTraveler: false },
    SEMI_AUTO: { label: "Thuê xe máy số", perVehiclePerDay: 175_000, perTraveler: false },
    MANUAL: { label: "Thuê xe máy côn tay", perVehiclePerDay: 300_000, perTraveler: false },
    EASY_RIDER: { label: "Thuê xe máy có người lái (easy rider)", perVehiclePerDay: 850_000, perTraveler: true },
    CAR_SELF_DRIVE: { label: "Thuê ô tô tự lái", perVehiclePerDay: 900_000, perTraveler: false },
    CAR_DRIVER: { label: "Thuê xe ô tô có tài xế", perVehiclePerDay: 1_500_000, perTraveler: false },
  },
  overnightParkingPerBikeNight: 15_000,
} as const;

export const costLineInputSchema = z.object({
  category: z.enum(COST_CATEGORIES),
  label: z.string().trim().min(1).max(60),
  amount: vnd.describe("Tổng cho cả nhóm, VND, số nguyên."),
  basis: z.string().trim().max(120).optional().describe("Cách tính ngắn, ví dụ: 3 đêm × 2 phòng × 400.000đ."),
}).strict();
export type CostLineInput = z.infer<typeof costLineInputSchema>;

export const costSelectionsSchema = z.object({
  lodgingTier: z.enum(LODGING_TIERS).default("HOMESTAY").describe("Hạng lưu trú: DORM (tập thể 125k/người/đêm), HOMESTAY (phòng riêng 450k/phòng/đêm), HOTEL (khách sạn 2-3 sao 750k/phòng/đêm)."),
  mealTier: z.enum(MEAL_TIERS).default("STANDARD").describe("Mức ăn uống: BUDGET (190k/người/ngày), STANDARD (270k/người/ngày), COMFORT (400k/người/ngày)."),
  rentalTier: z.enum(RENTAL_TIERS).optional().describe("Phương án xe: OWN_VEHICLE (tự lái xe nhà / xe cá nhân từ nhà — KHÔNG tính tiền thuê, 0đ), SEMI_AUTO (thuê xe máy số 175k/xe/ngày), MANUAL (thuê xe máy côn 300k/xe/ngày), EASY_RIDER (thuê xe máy có tài xế 850k/người/ngày), CAR_SELF_DRIVE (THUÊ ô tô tự lái 900k/xe/ngày — CHỈ chọn khi khách nói rõ muốn thuê ô tô/thuê xe), CAR_DRIVER (thuê ô tô có tài xế 1.500k/xe/ngày). Khách tự lái ô tô/xe máy của nhà từ nơi ở (không đi chặng tiếp cận) PHẢI chọn OWN_VEHICLE."),
  extras: z.array(costLineInputSchema).max(6).optional().describe("CHỈ thêm khoản phát sinh đặc biệt ngoài lưu trú, ăn uống, thuê xe, gửi xe, vé danh mục, xăng và chặng tiếp cận."),
}).strict();
export type CostSelectionsInput = z.infer<typeof costSelectionsSchema>;

export const costPersistedSelectionsSchema = z.object({
  lodgingTier: z.enum(LODGING_TIERS),
  mealTier: z.enum(MEAL_TIERS),
  rentalTier: z.enum(RENTAL_TIERS),
  extras: z.array(costLineInputSchema).max(6).optional(),
  fuelVndPerLiter: z.number().int().min(10_000).max(60_000).optional(),
  fuelSource: z.string().max(160).optional(),
}).strict();
export type CostPersistedSelections = z.infer<typeof costPersistedSelectionsSchema>;

export const budgetSavingsChipSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(200),
  estimatedSavingsVnd: vnd,
}).strict();
export type BudgetSavingsChip = z.infer<typeof budgetSavingsChipSchema>;

export const costPartSchema = z.object({
  currency: z.literal("VND"),
  travelers: z.number().int().min(1).max(20),
  days: z.number().int().min(1).max(30),
  sightseeingDays: z.number().int().min(1).max(14).optional(),
  lines: z.array(costLineInputSchema.extend({ computed: z.literal(true).optional() }).strict()).min(1).max(16),
  total: vnd,
  perPersonPerDay: vnd,
  budgetCap: z.number().int().min(0).max(1_000_000_000).nullable(),
  withinCap: z.boolean().nullable(),
  overBy: vnd.nullable(),
  assumptions: z.array(z.string().max(200)).max(6),
  priceReferenceDate: z.string().max(10),
  accessLegId: z.string().min(1).max(64).optional(),
  savingsOptions: z.array(budgetSavingsChipSchema).max(3).optional(),
  selections: costPersistedSelectionsSchema.optional(),
  /** Bug 2: items whose price could not be estimated from the reference table; total is incomplete and never "withinCap: true". */
  isIncomplete: z.literal(true).optional(),
  missingItems: z.array(z.string().max(120)).max(8).optional(),
}).strict();
export type CostPart = z.infer<typeof costPartSchema>;

export type CostInput = {
  transport: TripTransport; travelers: number; days: number; distanceKm: number | null;
  fuelVndPerLiter?: number; /** Where a live price came from, shown in the assumption line. */ fuelSource?: string; budgetCap?: number | null; lines: readonly CostLineInput[];
  /** Server-computed lines added before the model's (e.g. the access leg, ticket 04). */
  extraLines?: readonly CostLineInput[];
  /** PARITY BR-1: stable id of the current access leg summed into this cost table. */
  accessLegId?: string | null;
  /** Bug 2: explicit unpriced segments/items (e.g. "Chặng tiếp cận Đà Nẵng ⇄ Hà Nội"). */
  missingItems?: readonly string[];
  /** D5: sightseeing days in Hà Giang when whole-trip `days` includes travel days. */
  sightseeingDays?: number;
  /** D5/D6: tier choices stored for automatic server recomputation across edits. */
  selections?: CostPersistedSelections;
};

export const formatVnd = (amount: number) => `${amount.toLocaleString("vi-VN")}đ`;

export function estimateTripCost(input: CostInput): CostPart {
  const fuelPrice = input.fuelVndPerLiter ?? PRICE_REFERENCE.fuelVndPerLiter;
  const litersPer100 = PRICE_REFERENCE.litersPer100Km[input.transport];
  const assumptions: string[] = [];
  const lines: CostPart["lines"] = [];
  if (input.distanceKm !== null && input.distanceKm > 0) {
    const liters = (input.distanceKm * litersPer100) / 100;
    // One motorbike per two travelers; one car for the group.
    const vehicles = input.transport === "MOTORCYCLE" ? Math.ceil(input.travelers / 2) : 1;
    lines.push({ category: "transport", label: "Xăng", amount: Math.round(liters * fuelPrice * vehicles), basis: `${Math.round(input.distanceKm)} km × ${litersPer100} L/100 km × ${formatVnd(fuelPrice)}/L${vehicles > 1 ? ` × ${vehicles} xe` : ""}`, computed: true });
    assumptions.push(`Tiền xăng tính theo quãng đường của lịch (${Math.round(input.distanceKm)} km), ${input.fuelSource ? `giá xăng ${formatVnd(fuelPrice)}/L (${input.fuelSource})` : `giá xăng ${formatVnd(fuelPrice)}/L (Petrolimex vùng 2, E5 RON 92, ${PRICE_REFERENCE.fuelPriceDate.split("-").reverse().join("/")}; chưa tra được giá mới)`}${input.transport === "MOTORCYCLE" ? ", 2 người một xe máy" : ""}.`);
  } else {
    assumptions.push("Chưa có quãng đường đã kiểm tra nên chưa tính tiền xăng.");
  }
  for (const line of input.extraLines ?? []) lines.push({ ...line, computed: true });
  lines.push(...input.lines.filter(line => !(line.category === "transport" && /x[aă]ng/i.test(line.label))));
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const cap = input.budgetCap !== undefined && input.budgetCap !== null && input.budgetCap > 0 ? input.budgetCap : null;
  const missingItems = [...new Set((input.missingItems ?? []).map(item => item.trim()).filter(Boolean))].slice(0, 8);
  const isIncomplete = missingItems.length > 0;
  if (isIncomplete) {
    assumptions.push(`Chưa tính: ${missingItems.join(", ")}. Tổng chi phí chưa đầy đủ nên chưa thể kết luận trong ngân sách.`);
  }
  assumptions.push("Các khoản lưu trú, ăn uống và thuê xe ước tính theo bảng giá tham khảo; giá thực tế có thể khác.");
  // Never conclude "withinCap: true" when required price segments are missing; still flag overBy if partial total already exceeds cap.
  const withinCap = cap === null ? null : total > cap ? false : isIncomplete ? null : true;
  const overBy = cap === null ? null : total > cap ? total - cap : isIncomplete ? null : 0;
  return {
    currency: "VND", travelers: input.travelers, days: input.days, lines: lines.slice(0, 16), total,
    ...(input.sightseeingDays ? { sightseeingDays: input.sightseeingDays } : {}),
    perPersonPerDay: Math.round(total / (input.travelers * input.days)),
    budgetCap: cap, withinCap, overBy,
    assumptions: assumptions.slice(0, 6), priceReferenceDate: PRICE_REFERENCE.updatedAt,
    ...(input.accessLegId ? { accessLegId: input.accessLegId } : {}),
    ...(input.selections ? { selections: input.selections } : {}),
    ...(isIncomplete ? { isIncomplete: true as const, missingItems } : {}),
  };
}

export type CostDateSpan = {
  sightseeingDays: number;
  wholeTripDays: number;
  lodgingNights: number;
  mealDays: number;
  rentalDays: number;
  hasPreTravelDay: boolean;
  hasPostTravelDay: boolean;
};

function addIsoCalendarDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function isoCalendarDiff(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function parseClockMinuteOrNull(hhmm?: string): number | null {
  if (!hhmm) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function isDirectionOvernight(segments: AccessLegPart["outbound"], direction: "outbound" | "return"): boolean {
  if (segments.length === 0) return false;
  for (const seg of segments) {
    if (seg.mode !== "SLEEPER_BUS" && seg.mode !== "TRAIN") continue;
    const dep = parseClockMinuteOrNull(seg.departTime);
    if (dep !== null) {
      if (dep >= 19 * 60 || dep < 4 * 60 || dep + seg.durationMinutes >= 24 * 60) return true;
    } else if (direction === "return" && seg.mode === "SLEEPER_BUS") {
      // Return sleeper buses from TP Hà Giang commonly depart overnight unless a daytime clock is given.
      return true;
    }
  }
  return false;
}

/**
 * D5/D7: derives whole-trip calendar day span (`mealDays`, `perPersonPerDay` divisor), Hà Giang `rentalDays`,
 * and actual `lodgingNights` (adding outbound arrival night if arriving daytime, subtracting overnight bus nights).
 */
export function computeCostDateSpan(input: {
  startDate?: string | null;
  durationDays: number;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  accessLeg?: AccessLegPart | null;
}): CostDateSpan {
  const sightseeingDays = Math.max(1, input.durationDays);
  let wholeTripDays = sightseeingDays;
  let hasPreTravelDay = false;
  let hasPostTravelDay = false;

  if (input.tripStartDate && input.tripEndDate && input.tripEndDate >= input.tripStartDate) {
    wholeTripDays = Math.min(30, Math.max(sightseeingDays, isoCalendarDiff(input.tripStartDate, input.tripEndDate) + 1));
    if (input.startDate) {
      hasPreTravelDay = input.tripStartDate < input.startDate;
      const lastSightseeing = addIsoCalendarDays(input.startDate, sightseeingDays - 1);
      hasPostTravelDay = input.tripEndDate > lastSightseeing;
    } else {
      const extra = Math.max(0, wholeTripDays - sightseeingDays);
      hasPreTravelDay = extra >= 1;
      hasPostTravelDay = extra >= 2;
    }
  } else if (input.accessLeg && (input.accessLeg.outbound.length > 0 || input.accessLeg.return.length > 0)) {
    const outMins =
      input.accessLeg.outboundMinutes > 0
        ? input.accessLeg.outboundMinutes
        : input.accessLeg.outbound.reduce((sum, s) => sum + s.durationMinutes, 0);
    const retMins =
      input.accessLeg.returnMinutes > 0
        ? input.accessLeg.returnMinutes
        : input.accessLeg.return.reduce((sum, s) => sum + s.durationMinutes, 0);
    hasPreTravelDay = outMins >= 300 || input.accessLeg.outbound.length >= 2;
    hasPostTravelDay = retMins >= 300 || input.accessLeg.return.length >= 2;
    wholeTripDays = Math.min(30, sightseeingDays + (hasPreTravelDay ? 1 : 0) + (hasPostTravelDay ? 1 : 0));
  }

  const outboundOvernight = hasPreTravelDay && isDirectionOvernight(input.accessLeg?.outbound ?? [], "outbound");
  const returnOvernight = hasPostTravelDay && isDirectionOvernight(input.accessLeg?.return ?? [], "return");
  const lodgingNights = Math.max(
    0,
    sightseeingDays - 1 + (hasPreTravelDay && !outboundOvernight ? 1 : 0) + (hasPostTravelDay && !returnOvernight ? 1 : 0),
  );

  return {
    sightseeingDays,
    wholeTripDays,
    lodgingNights,
    mealDays: wholeTripDays,
    rentalDays: sightseeingDays,
    hasPreTravelDay,
    hasPostTravelDay,
  };
}

export function parseTicketPriceVnd(raw: string | null | undefined): number | null {
  if (!raw) return null;
  if (/mi[eễ]n\s*ph[ií]/iu.test(raw)) return 0;
  const matches = [...raw.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+\s*[kK])\b/gu)];
  const values: number[] = [];
  for (const match of matches) {
    const token = match[1]!.toLowerCase().trim();
    const numeric = token.endsWith("k")
      ? Number.parseInt(token.slice(0, -1), 10) * 1000
      : Number.parseInt(token.replaceAll(/[.,]/g, ""), 10);
    if (Number.isFinite(numeric) && numeric > 0 && numeric <= 2_000_000) {
      values.push(numeric);
    }
  }
  if (values.length === 0) return null;
  if (values.length === 1) return values[0]!;
  return Math.round((values[0]! + values[1]!) / 2);
}

export function defaultRentalTierForTrip(transport: TripTransport, usesLocalRental: boolean): RentalTier {
  if (!usesLocalRental) return "OWN_VEHICLE";
  return transport === "CAR" ? "CAR_SELF_DRIVE" : "SEMI_AUTO";
}

export function computeTieredTripCost(input: {
  transport: TripTransport;
  travelers: number;
  startDate?: string | null;
  durationDays: number;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  distanceKm: number | null;
  usesLocalRental: boolean;
  lodgingTier: LodgingTier;
  mealTier: MealTier;
  rentalTier?: RentalTier;
  extras?: readonly CostLineInput[];
  stopTickets?: readonly { name: string; perPersonVnd: number }[];
  accessLeg?: AccessLegPart | null;
  accessLegBasis?: string | null;
  fuelVndPerLiter?: number;
  fuelSource?: string;
  budgetCap?: number | null;
}): CostPart {
  const span = computeCostDateSpan({
    startDate: input.startDate,
    durationDays: input.durationDays,
    tripStartDate: input.tripStartDate,
    tripEndDate: input.tripEndDate,
    accessLeg: input.accessLeg,
  });
  const rentalTier = input.rentalTier ?? defaultRentalTierForTrip(input.transport, input.usesLocalRental);
  const serverLines: CostLineInput[] = [];

  if (span.lodgingNights > 0) {
    const lodging = SERVER_COST_RATES.lodging[input.lodgingTier];
    const roomsOrGuests = lodging.perRoom ? Math.ceil(input.travelers / 2) : input.travelers;
    const unitLabel = lodging.perRoom ? "phòng" : "người";
    serverLines.push({
      category: "lodging",
      label: lodging.label,
      amount: span.lodgingNights * roomsOrGuests * lodging.unitPrice,
      basis: `${span.lodgingNights} đêm × ${roomsOrGuests} ${unitLabel} × ${formatVnd(lodging.unitPrice)}`,
    });
  }

  const meal = SERVER_COST_RATES.meal[input.mealTier];
  serverLines.push({
    category: "food",
    label: meal.label,
    amount: span.mealDays * input.travelers * meal.perPersonPerDay,
    basis: `${span.mealDays} ngày${span.wholeTripDays > span.sightseeingDays ? " (cả ngày đi/về)" : ""} × ${input.travelers} người × ${formatVnd(meal.perPersonPerDay)}`,
  });

  const rental = SERVER_COST_RATES.rental[rentalTier];
  if (rental.perVehiclePerDay > 0) {
    const vehicles = rental.perTraveler
      ? input.travelers
      : rentalTier.startsWith("CAR_")
        ? Math.max(1, Math.ceil(input.travelers / 14))
        : Math.ceil(input.travelers / 2);
    const unitWord = rental.perTraveler ? "người" : "xe";
    serverLines.push({
      category: "transport",
      label: rental.label,
      amount: span.rentalDays * vehicles * rental.perVehiclePerDay,
      basis: `${vehicles} ${unitWord} × ${span.rentalDays} ngày × ${formatVnd(rental.perVehiclePerDay)}`,
    });
  }

  if (input.transport === "MOTORCYCLE" && rentalTier !== "EASY_RIDER" && span.lodgingNights > 0) {
    const bikes = Math.ceil(input.travelers / 2);
    serverLines.push({
      category: "other",
      label: "Gửi xe máy qua đêm",
      amount: bikes * span.lodgingNights * SERVER_COST_RATES.overnightParkingPerBikeNight,
      basis: `${span.lodgingNights} đêm × ${bikes} xe × ${formatVnd(SERVER_COST_RATES.overnightParkingPerBikeNight)}`,
    });
  }

  const pricedStops = (input.stopTickets ?? []).filter(s => s.perPersonVnd > 0);
  if (pricedStops.length > 0) {
    const perPersonSum = pricedStops.reduce((sum, s) => sum + s.perPersonVnd, 0);
    serverLines.push({
      category: "activities",
      label: "Vé tham quan trong lịch",
      amount: perPersonSum * input.travelers,
      basis: `${input.travelers} người × ${formatVnd(perPersonSum)} (${pricedStops.map(s => s.name).join(", ")})`.slice(0, 120),
    });
  }

  const extraLines: CostLineInput[] = [];
  if (input.accessLeg) {
    extraLines.push({
      category: "transport",
      label: "Chặng tiếp cận (đi và về)",
      amount: input.accessLeg.totalVnd,
      basis: input.accessLegBasis ?? `${input.accessLeg.travelers} người khứ hồi`,
    });
  }
  const missingItems = (input.accessLeg?.missingPriceSegments ?? []).map(seg => `Chặng tiếp cận ${seg}`);
  const mergedLines = [...serverLines, ...(input.extras ?? [])];

  return estimateTripCost({
    transport: input.transport,
    travelers: input.travelers,
    days: span.wholeTripDays,
    sightseeingDays: span.sightseeingDays,
    distanceKm: input.distanceKm,
    fuelVndPerLiter: input.fuelVndPerLiter,
    fuelSource: input.fuelSource,
    budgetCap: input.budgetCap,
    lines: mergedLines,
    extraLines,
    accessLegId: input.accessLeg?.id ?? null,
    ...(missingItems.length ? { missingItems } : {}),
    selections: {
      lodgingTier: input.lodgingTier,
      mealTier: input.mealTier,
      rentalTier,
      ...(input.extras && input.extras.length > 0 ? { extras: [...input.extras] } : {}),
      ...(input.fuelVndPerLiter !== undefined ? { fuelVndPerLiter: input.fuelVndPerLiter } : {}),
      ...(input.fuelSource !== undefined ? { fuelSource: input.fuelSource } : {}),
    },
  });
}

/**
 * Reference figures sourced strictly from `docs/fixtures/price-reference-ha-giang.md` (slim D21, BR-5, Bug 2).
 * Only corridors present in the reference table may be used to compute mode-switch savings.
 */
export const PRICE_REFERENCE_BUS_ROUTES: readonly {
  from: string;
  to: string;
  perPersonOneWayVnd: number;
}[] = [
  // docs/fixtures/price-reference-ha-giang.md: "Xe khách giường nằm Hà Nội ⇄ TP Hà Giang | 250.000–400.000đ/lượt"
  { from: "Hà Nội", to: "TP Hà Giang", perPersonOneWayVnd: 325_000 },
];

export function findReferenceBusPricePerPerson(from: string, to: string): number | null {
  for (const route of PRICE_REFERENCE_BUS_ROUTES) {
    if (
      (sameAccessPlace(from, route.from) && sameAccessPlace(to, route.to))
      || (sameAccessPlace(from, route.to) && sameAccessPlace(to, route.from))
    ) {
      return route.perPersonOneWayVnd;
    }
  }
  return null;
}

export const SAVINGS_REFERENCE = {
  budgetHomestayPerRoomNightVnd: 350_000,
  /** docs/fixtures/price-reference-ha-giang.md: Thuê xe máy ~180.000–250.000đ/ngày. */
  motorbikeRentalPerBikeDayVnd: 200_000,
} as const;

export function formatSavingsShortVnd(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = Math.round((amount / 1_000_000) * 10) / 10;
    return `${millions.toLocaleString("vi-VN")} tr`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000).toLocaleString("vi-VN")}k`;
  }
  return `${amount.toLocaleString("vi-VN")}đ`;
}

/**
 * Slim D21, BR-5, AC-7: when `cost.withinCap === false` (`overBy > 0`), computes 2–3 concrete
 * savings chips with "ước tính" amounts derived strictly from current cost lines / access leg
 * and `SAVINGS_REFERENCE`. Returns `[]` when within budget or no budget cap is set.
 */
export function computeBudgetSavingsChips(
  cost: CostPart,
  accessLeg?: AccessLegPart | null,
  transport?: TripTransport | null,
): BudgetSavingsChip[] {
  if (cost.withinCap !== false || !cost.overBy || cost.overBy <= 0) return [];

  const chips: BudgetSavingsChip[] = [];
  const travelers = Math.max(1, cost.travelers);
  const nights = Math.max(1, cost.days - 1);
  const rooms = Math.max(1, Math.ceil(travelers / 2));
  const bikes = Math.max(1, Math.ceil(travelers / 2));

  if (accessLeg) {
    const flightSegments = [...accessLeg.outbound, ...accessLeg.return].filter(
      (seg) => seg.mode === "FLIGHT" && seg.priceVndPerPerson > 0,
    );
    // Bug 2: only offer "switch-bus" with a numeric estimate when the price reference table has bus fares for EVERY replaced flight segment.
    if (flightSegments.length > 0) {
      const refBusPrices = flightSegments.map((seg) => findReferenceBusPricePerPerson(seg.from, seg.to));
      if (refBusPrices.every((price): price is number => price !== null)) {
        const flightTotal = flightSegments.reduce((sum, seg) => sum + seg.priceVndPerPerson * travelers, 0);
        const busAlt = refBusPrices.reduce((sum, price) => sum + price * travelers, 0);
        const savings = Math.round(flightTotal - busAlt);
        if (savings >= 200_000) {
          chips.push({
            id: "switch-bus",
            label: `Đi xe khách thay máy bay · −${formatSavingsShortVnd(savings)} (ước tính)`,
            prompt: "Đổi chặng máy bay sang xe khách giường nằm để tiết kiệm chi phí.",
            estimatedSavingsVnd: savings,
          });
        }
      }
    }
  }

  // Point 3: vehicle-aware savings — hired car/driver vs motorbike rental in Hà Giang.
  const localTransportLines = cost.lines.filter(
    (line) => line.category === "transport" && !/ch[aặ]ng\s+ti[eế]p\s+c[aậ]n/iu.test(line.label),
  );
  const carHireTotal = localTransportLines
    .filter((line) => /ô\s*tô|o\s*to|t[aà]i\s*x[eế]|xe\s*(?:4|7|16)\s*ch[oỗ]/iu.test(line.label))
    .reduce((sum, line) => sum + line.amount, 0);
  if (carHireTotal >= 1_000_000 && (transport === "CAR" || !transport)) {
    const motoRentalEst = bikes * cost.days * SAVINGS_REFERENCE.motorbikeRentalPerBikeDayVnd;
    const fuelLine = localTransportLines.find((line) => /^x[aă]ng$/iu.test(line.label.trim()));
    const fuelSavings = fuelLine
      ? Math.round(
          fuelLine.amount
          * Math.max(0, 1 - (PRICE_REFERENCE.litersPer100Km.MOTORCYCLE * bikes) / PRICE_REFERENCE.litersPer100Km.CAR),
        )
      : 0;
    const switchSavings = Math.round(carHireTotal - motoRentalEst + fuelSavings);
    if (switchSavings >= 300_000) {
      chips.push({
        id: "switch-motorbike",
        label: `Đổi sang xe máy tự lái · −${formatSavingsShortVnd(switchSavings)} (ước tính)`,
        prompt: "Đổi sang thuê xe máy tự lái tại Hà Giang để giảm chi phí đi lại.",
        estimatedSavingsVnd: switchSavings,
      });
    }
  }

  const lodgingTotal = cost.lines
    .filter((line) => line.category === "lodging")
    .reduce((sum, line) => sum + line.amount, 0);
  if (lodgingTotal > 0) {
    const homestayFloor = nights * rooms * SAVINGS_REFERENCE.budgetHomestayPerRoomNightVnd;
    const directDiff = Math.round(lodgingTotal - homestayFloor);
    const savings = directDiff >= 200_000 ? directDiff : Math.round(lodgingTotal * 0.3);
    if (savings >= 150_000) {
      chips.push({
        id: "lower-lodging",
        label: `Homestay rẻ hơn · −${formatSavingsShortVnd(savings)} (ước tính)`,
        prompt: "Đổi sang hạng homestay tiết kiệm hơn để giảm chi phí lưu trú.",
        estimatedSavingsVnd: savings,
      });
    }
  }

  // Point 3: never offer "Bớt 1 ngày" when trip is <= 2 days (minimum 2 days), and include per-day local vehicle cost.
  if (cost.days >= 3) {
    const foodTotal = cost.lines
      .filter((line) => line.category === "food")
      .reduce((sum, line) => sum + line.amount, 0);
    const localTransportTotal = localTransportLines.reduce((sum, line) => sum + line.amount, 0);
    const perNightLodging = lodgingTotal > 0 ? lodgingTotal / nights : 0;
    const perDayFood = foodTotal > 0 ? foodTotal / cost.days : 0;
    const perDayLocalTransport = localTransportTotal > 0 ? localTransportTotal / cost.days : 0;
    const rawDaily = Math.round(perNightLodging + perDayFood + perDayLocalTransport);
    const savings = rawDaily >= 200_000 ? rawDaily : Math.round(cost.total / cost.days);
    if (savings >= 200_000) {
      const targetDays = cost.days - 1;
      chips.push({
        id: "shorten-day",
        label: `Bớt 1 ngày (còn ${targetDays} ngày) · −${formatSavingsShortVnd(savings)} (ước tính)`,
        prompt: `Rút lịch trình xuống còn ${targetDays} ngày để phù hợp ngân sách.`,
        estimatedSavingsVnd: savings,
      });
    }
  }

  if (chips.length < 2) {
    const foodAndAct = cost.lines
      .filter((line) => line.category === "food" || line.category === "activities")
      .reduce((sum, line) => sum + line.amount, 0);
    const trimSavings = Math.round((foodAndAct > 0 ? foodAndAct : cost.total) * 0.2);
    if (trimSavings >= 100_000) {
      chips.push({
        id: "trim-food-activities",
        label: `Quán ăn bình dân hơn · −${formatSavingsShortVnd(trimSavings)} (ước tính)`,
        prompt: "Điều chỉnh mức ăn uống và vé tham quan tiết kiệm hơn để vừa ngân sách.",
        estimatedSavingsVnd: trimSavings,
      });
    }
  }

  return chips.sort((a, b) => b.estimatedSavingsVnd - a.estimatedSavingsVnd).slice(0, 3);
}

/** Resolves budget savings chips from server-emitted `cost.savingsOptions` or computes them client-side as fallback. */
export function resolveBudgetSavingsChips(
  cost: CostPart | null | undefined,
  accessLeg?: AccessLegPart | null,
  transport?: TripTransport | null,
): BudgetSavingsChip[] {
  if (!cost || cost.withinCap !== false || !cost.overBy || cost.overBy <= 0) return [];
  if (cost.savingsOptions && cost.savingsOptions.length > 0) return cost.savingsOptions;
  return computeBudgetSavingsChips(cost, accessLeg, transport);
}
