import { AppError } from "../../server/http/app-error";

/** Per-instance resource bound, matching the existing preliminary planner.
 * Database optimistic versions and save idempotency remain cross-instance. */
export function createPlanningAdmission(now = () => Date.now()) {
  const admissions = new Map<string, number[]>();
  let active = 0;
  return async <T>(userId: string, work: () => Promise<T>): Promise<T> => {
    const time = now();
    for (const [id, values] of admissions) {
      const current = values.filter(t => t > time - 60_000);
      if (current.length) admissions.set(id, current); else admissions.delete(id);
    }
    const recent = admissions.get(userId) ?? [];
    if (recent.length >= 8 || active >= 3 || admissions.size >= 512) throw new AppError("RATE_LIMITED", "Bạn đang gửi yêu cầu quá nhanh. Hãy đợi một chút rồi thử lại.", 429);
    admissions.set(userId, [...recent, time]); active++;
    try { return await work(); } finally { active--; }
  };
}
