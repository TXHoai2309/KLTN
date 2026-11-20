import { z } from "zod";

/**
 * Deterministic arithmetic over a budget the model estimated. The model proposes the figures; this module only sums,
 * compares with the user's stated cap and reports shares. It never invents a number, and with no cap it does not
 * claim the plan is within budget (`withinCap: null` = unknown, never a pass).
 */
export const BUDGET_CATEGORIES = ["transport", "lodging", "food", "activities", "other"] as const;
export const BUDGET_CURRENCIES = ["VND", "USD"] as const;
const MAX_AMOUNT = 1e12;

export const budgetInputSchema = z.object({
  currency: z.enum(BUDGET_CURRENCIES).describe("Đơn vị tiền: VND (số nguyên) hoặc USD (tối đa 2 chữ số thập phân)."),
  travelers: z.number().int().min(1).max(20).describe("Số người đi."),
  durationDays: z.number().int().min(1).max(14).describe("Số ngày của chuyến đi."),
  budgetCap: z.number().positive().max(MAX_AMOUNT).nullable().optional().describe("Ngân sách tối đa người dùng đã nêu cho cả nhóm, cùng đơn vị tiền; bỏ qua hoặc null nếu họ chưa nêu."),
  allocations: z.array(z.object({
    category: z.enum(BUDGET_CATEGORIES).describe("transport (đi lại), lodging (lưu trú), food (ăn uống), activities (tham quan), other (khác)."),
    amount: z.number().min(0).max(MAX_AMOUNT).describe("Số tiền ước tính cho cả nhóm, cùng đơn vị tiền."),
    note: z.string().trim().max(120).optional(),
  }).strict()).min(1).max(BUDGET_CATEGORIES.length).describe("Mỗi nhóm chi phí tối đa một dòng."),
}).strict();
export type BudgetInput = z.infer<typeof budgetInputSchema>;

export type BudgetCheck =
  | { ok: true; currency: string; total: number; perPersonPerDay: number; withinCap: boolean | null; overBy: number | null; allocations: { category: string; amount: number; sharePercent: number; note?: string }[]; note: string }
  | { ok: false; code: "INVALID_BUDGET"; message: string };

export function checkBudgetPlan(input: BudgetInput): BudgetCheck {
  const scale = input.currency === "USD" ? 100 : 1;
  const cap = input.budgetCap ?? null;
  const capUnits = cap === null ? null : Math.round(cap * scale);
  const allocations = input.allocations.map(allocation => ({
    ...allocation,
    units: Math.round(allocation.amount * scale),
  }));
  if ((capUnits !== null && capUnits / scale !== cap) || allocations.some(a => a.units / scale !== a.amount)) {
    return { ok: false, code: "INVALID_BUDGET", message: "Số tiền và ngân sách tối đa phải là số nguyên với VND hoặc có tối đa 2 chữ số thập phân với USD." };
  }

  const categories = input.allocations.map(a => a.category);
  if (new Set(categories).size !== categories.length) return { ok: false, code: "INVALID_BUDGET", message: "Mỗi nhóm chi phí chỉ được xuất hiện một lần. Hãy gộp các dòng trùng nhóm rồi gọi lại." };
  const totalUnits = allocations.reduce((sum, a) => sum + a.units, 0);
  if (totalUnits <= 0) return { ok: false, code: "INVALID_BUDGET", message: "Tổng chi phí phải lớn hơn 0." };
  // Round each share down to a whole percent so the displayed shares never add up to more than 100%.
  const divisor = BigInt(totalUnits);
  return {
    ok: true,
    currency: input.currency,
    total: totalUnits / scale,
    perPersonPerDay: Math.round(totalUnits / (input.travelers * input.durationDays)) / scale,
    withinCap: capUnits === null ? null : totalUnits <= capUnits,
    overBy: capUnits === null ? null : Math.max(0, totalUnits - capUnits) / scale,
    allocations: allocations.map(({ category, amount, units, note }) => ({
      category,
      amount,
      sharePercent: Number((BigInt(units) * BigInt(100)) / divisor),
      ...(note ? { note } : {}),
    })),
    note: capUnits === null
      ? "Người dùng chưa nêu ngân sách tối đa nên chưa so sánh được. Đây chỉ là ước tính, chưa được xác nhận."
      : "Đây chỉ là ước tính, chưa được xác nhận; giá thực tế có thể khác.",
  };
}
