import { z } from "zod";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";

/**
 * Client-safe cost estimate (ADR-42, ticket 03). The model estimates lodging, food, tickets and extras; the server computes
 * fuel from the itinerary's own distance and does all the arithmetic. Every amount is an estimate in whole VND.
 */
export const PRICE_REFERENCE = {
  updatedAt: "2026-11-21",
  fuelVndPerLiter: 23_000,
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
}).strict();
export type CostPart = z.infer<typeof costPartSchema>;

export type CostInput = {
  transport: TripTransport; travelers: number; days: number; distanceKm: number | null;
  fuelVndPerLiter?: number; budgetCap?: number | null; lines: readonly CostLineInput[];
  /** Server-computed lines added before the model's (e.g. the access leg, ticket 04). */
  extraLines?: readonly CostLineInput[];
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
    assumptions.push(`Tiền xăng tính theo quãng đường của lịch (${Math.round(input.distanceKm)} km), giá xăng giả định ${formatVnd(fuelPrice)}/L${input.transport === "MOTORCYCLE" ? ", 2 người một xe máy" : ""}.`);
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
  };
}
