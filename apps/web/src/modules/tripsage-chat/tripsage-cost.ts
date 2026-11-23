import { z } from "zod";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";
import type { AccessLegPart } from "./tripsage-access-leg";

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

export const costLineInputSchema = z.object({
  category: z.enum(COST_CATEGORIES),
  label: z.string().trim().min(1).max(60),
  amount: vnd.describe("Tổng cho cả nhóm, VND, số nguyên."),
  basis: z.string().trim().max(120).optional().describe("Cách tính ngắn, ví dụ: 3 đêm × 2 phòng × 400.000đ."),
}).strict();
export type CostLineInput = z.infer<typeof costLineInputSchema>;

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
  days: z.number().int().min(1).max(14),
  lines: z.array(costLineInputSchema.extend({ computed: z.literal(true).optional() }).strict()).min(1).max(16),
  total: vnd,
  perPersonPerDay: vnd,
  budgetCap: vnd.nullable(),
  withinCap: z.boolean().nullable(),
  overBy: vnd.nullable(),
  assumptions: z.array(z.string().max(200)).max(6),
  priceReferenceDate: z.string().max(10),
  accessLegId: z.string().min(1).max(64).optional(),
  savingsOptions: z.array(budgetSavingsChipSchema).max(3).optional(),
}).strict();
export type CostPart = z.infer<typeof costPartSchema>;

export type CostInput = {
  transport: TripTransport; travelers: number; days: number; distanceKm: number | null;
  fuelVndPerLiter?: number; /** Where a live price came from, shown in the assumption line. */ fuelSource?: string; budgetCap?: number | null; lines: readonly CostLineInput[];
  /** Server-computed lines added before the model's (e.g. the access leg, ticket 04). */
  extraLines?: readonly CostLineInput[];
  /** PARITY BR-1: stable id of the current access leg summed into this cost table. */
  accessLegId?: string | null;
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
  assumptions.push("Các khoản khác là ước tính của trợ lý; giá thực tế có thể khác.");
  return {
    currency: "VND", travelers: input.travelers, days: input.days, lines: lines.slice(0, 16), total,
    perPersonPerDay: Math.round(total / (input.travelers * input.days)),
    budgetCap: cap, withinCap: cap === null ? null : total <= cap, overBy: cap === null ? null : Math.max(0, total - cap),
    assumptions, priceReferenceDate: PRICE_REFERENCE.updatedAt,
    ...(input.accessLegId ? { accessLegId: input.accessLegId } : {}),
  };
}

/**
 * Reference figures sourced from `docs/fixtures/price-reference-ha-giang.md` (slim D21, BR-5).
 * Every savings number is an estimate ("ước tính") and never auto-mutates the itinerary.
 */
export const SAVINGS_REFERENCE = {
  sleeperBusPerPersonOneWayVnd: 550_000,
  budgetHomestayPerRoomNightVnd: 350_000,
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
): BudgetSavingsChip[] {
  if (cost.withinCap !== false || !cost.overBy || cost.overBy <= 0) return [];

  const chips: BudgetSavingsChip[] = [];
  const travelers = Math.max(1, cost.travelers);
  const nights = Math.max(1, cost.days - 1);
  const rooms = Math.max(1, Math.ceil(travelers / 2));

  if (accessLeg) {
    const flightSegments = [...accessLeg.outbound, ...accessLeg.return].filter(
      (seg) => seg.mode === "FLIGHT" && seg.priceVndPerPerson > 0,
    );
    if (flightSegments.length > 0) {
      const flightTotal = flightSegments.reduce((sum, seg) => sum + seg.priceVndPerPerson * travelers, 0);
      const busAlt = flightSegments.length * SAVINGS_REFERENCE.sleeperBusPerPersonOneWayVnd * travelers;
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

  if (cost.days >= 2) {
    const foodTotal = cost.lines
      .filter((line) => line.category === "food")
      .reduce((sum, line) => sum + line.amount, 0);
    const perNightLodging = lodgingTotal > 0 ? lodgingTotal / nights : 0;
    const perDayFood = foodTotal > 0 ? foodTotal / cost.days : 0;
    const rawDaily = Math.round(perNightLodging + perDayFood);
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
): BudgetSavingsChip[] {
  if (!cost || cost.withinCap !== false || !cost.overBy || cost.overBy <= 0) return [];
  if (cost.savingsOptions && cost.savingsOptions.length > 0) return cost.savingsOptions;
  return computeBudgetSavingsChips(cost, accessLeg);
}
