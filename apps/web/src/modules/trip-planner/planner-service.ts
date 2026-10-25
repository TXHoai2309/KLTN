import { createHash, randomUUID } from "node:crypto";
import { AppError } from "@/server/http/app-error";
import { assertTripRequirementClear } from "../trip-requirement/trip-clarification-server";
import { assertStartDateForFinalConfirmation } from "../trip-requirement/trip-requirement-readiness";
import { plannerResultSchema, type PlannerResult } from "./planner-contract";
import { plannerRoutePairs, schedulePlannerDays, selectPlannerDays } from "./planner-engine";
import { resolvePlannerRoutes, type RouteProvider } from "./planner-routes";
import { validatePlannerDays } from "./planner-validator";
import { balancePlannerDays } from "./planner-day-balance";
import type { PlannerCandidate, PlannerCandidateInventory } from "./planner-candidates";

export type PlannerRepository = { candidates: () => Promise<PlannerCandidate[]>; inventory?: () => Promise<PlannerCandidateInventory>; recheck: (selected: readonly PlannerCandidate[]) => Promise<boolean> };
type Completed = { result: PlannerResult; selected: PlannerCandidate[] };
export function createPlannerService(deps: { repository: PlannerRepository; routes: RouteProvider; now?: () => Date; id?: () => string; routeTimeoutMs?: number; databaseTimeoutMs?: number }) {
  const entries = new Map<string, { hash: string; expires: number; promise: Promise<Completed> }>();
  const admissions = new Map<string, number[]>();
  let active = 0;
  const technical = () => new AppError("PLANNER_UNAVAILABLE", "Dịch vụ lập lịch trình tạm thời không khả dụng. Vui lòng thử lại.", 503);
  async function dbCall<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation(), new Promise<T>((_, reject) => { timer = setTimeout(() => reject(technical()), deps.databaseTimeoutMs ?? 3000); })]); }
    catch { throw technical(); } finally { clearTimeout(timer); }
  }
  async function ensureCurrent(selected: PlannerCandidate[]) {
    if (!await dbCall(() => deps.repository.recheck(selected))) throw new AppError("PLANNER_DATA_CHANGED", "Dữ liệu điểm đến đã thay đổi. Vui lòng kiểm tra nhu cầu và tạo đề xuất mới.", 409);
  }
  return { async propose(userId: string, key: string, candidate: unknown): Promise<PlannerResult> {
    const now = (deps.now ?? (() => new Date()))();
    const requirement = assertTripRequirementClear(candidate, now);
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new AppError("INVALID_IDEMPOTENCY_KEY", "Thiếu mã yêu cầu hợp lệ.", 400);
    const hash = createHash("sha256").update(JSON.stringify(requirement)).digest("hex");
    const scope = `${userId}:${key}`, time = now.getTime();
    for (const [id, entry] of entries) if (entry.expires <= time) entries.delete(id);
    for (const [id, times] of admissions) { const recent = times.filter(t => t > time - 60_000); if (recent.length) admissions.set(id, recent); else admissions.delete(id); }
    const existing = entries.get(scope);
    if (existing) {
      if (existing.hash !== hash) throw new AppError("IDEMPOTENCY_CONFLICT", "Mã yêu cầu đã được dùng với nhu cầu khác.", 409);
      const completed = await existing.promise;
      await ensureCurrent(completed.selected);
      return structuredClone(completed.result);
    }
    const recent = admissions.get(userId) ?? [];
    if (recent.length >= 4 || active >= 3 || entries.size >= 64) throw new AppError("RATE_LIMITED", "Bạn đang tạo lịch trình quá nhanh. Hãy đợi một chút rồi thử lại.", 429);
    admissions.set(userId, [...recent, time]); active++;
    const promise = (async (): Promise<Completed> => {
      const inventory = deps.repository.inventory ? await dbCall(deps.repository.inventory) : null;
      const candidates = inventory ? inventory.candidates : await dbCall(deps.repository.candidates);
      const selectedDays = selectPlannerDays(requirement, candidates);
      const selected = selectedDays.flat();
      const pairs = plannerRoutePairs(selectedDays, requirement.transport);
      const routes = await resolvePlannerRoutes(pairs, deps.routes, deps.routeTimeoutMs);
      const balancedDays = balancePlannerDays(requirement, selectedDays, routes);
      const days = schedulePlannerDays(requirement, balancedDays, routes);
      const { checks, stopStatuses } = validatePlannerDays(requirement, days, selected);
      for (const day of days) for (const stop of day.stops) stop.validationStatus = stopStatuses.get(stop.destination.id) ?? "PASS";
      const warnings: PlannerResult["warnings"] = [{ code: "PRELIMINARY_ONLY", message: "Đề xuất sơ bộ trong phiên hiện tại; chưa xác nhận hoặc lưu chính thức. Khung 08:00–18:00 là giờ lập kế hoạch, không phải giờ mở cửa.", day: null, destinationId: null },
        { code: "ORIGIN_AND_LODGING_UNKNOWN", message: "Điểm đầu được đề xuất theo vị trí và sở thích; chưa biết nơi xuất phát, chỗ nghỉ hoặc điểm kết thúc của bạn. Chưa tính các chặng này. Chuyển ngày dùng chặng từ điểm cuối ngày trước.", day: null, destinationId: null }];
      if (pairs.length) warnings.push({ code: "ROUTE_ESTIMATE", message: "Tuyến đường và thời gian di chuyển là ước tính theo mạng đường; không xác minh giao thông, thời tiết hay điều kiện đường thực tế.", day: null, destinationId: null });
      if (requirement.transport === "MOTORCYCLE") warnings.push({ code: "MOTORCYCLE_CAUTION", message: "Tuyến xe máy có thể thiếu lối đi hoặc hướng dẫn chính xác; cần kiểm tra điều kiện đường trước chuyến đi.", day: null, destinationId: null });
      if (selected.length < candidates.length) warnings.push({ code: "BOUNDED_SELECTION", message: "Chỉ đề xuất các điểm có tọa độ và thời lượng trong giới hạn kế hoạch; không phải danh sách đầy đủ điểm đến Hà Giang.", day: null, destinationId: null });
      if (candidates.some(c => c.suggestedDurationMinutes === null && c.minimumDurationMinutes === null)) warnings.push({ code: "MISSING_VISIT_DURATION", message: "Một số điểm đến công khai chưa có thời lượng tham quan và chưa được đưa vào đề xuất. Cần quản trị viên bổ sung dữ liệu đã xác minh.", day: null, destinationId: null });
      if (inventory?.invalidCoordinateCount) warnings.push({ code: "INVALID_DESTINATION_COORDINATES", message: "Một số điểm đến công khai chưa có tọa độ hợp lệ và đã được loại khỏi đề xuất.", day: null, destinationId: null });
      const violation = checks.some(check => check.status === "VIOLATION"), allPass = checks.every(check => check.status === "PASS");
      let eligibleForFinalConfirmation = false;
      if (allPass) { try { assertStartDateForFinalConfirmation(requirement, now); eligibleForFinalConfirmation = true; } catch { /* still preliminary */ } }
      const result = plannerResultSchema.parse({ proposalId: (deps.id ?? randomUUID)(), phase: "PRELIMINARY_PROPOSAL", status: violation ? "NO_FEASIBLE_ITINERARY" : allPass ? "PROPOSAL_READY" : "INSUFFICIENT_DATA",
        requirement, timezone: "Asia/Ho_Chi_Minh", days, checks, warnings, eligibleForFinalConfirmation,
        reasonCodes: [...new Set([...(selected.length ? [] : ["NO_ELIGIBLE_CANDIDATES",
          ...(candidates.length ? ["NO_SCHEDULABLE_CANDIDATES"] : []),
          ...(inventory?.publicRowCount === 0 ? ["NO_PUBLIC_DESTINATIONS"] : []),
          ...(inventory?.invalidCoordinateCount ? ["INVALID_DESTINATION_COORDINATES"] : []),
          ...(inventory?.excludedCount ? ["REGISTRY_EXCLUDES_CANDIDATES"] : [])]), ...checks.flatMap(check => check.issues.map(issue => issue.code))])].slice(0, 30) });
      await ensureCurrent(selected);
      return { result, selected };
    })();
    entries.set(scope, { hash, expires: time + 120_000, promise });
    try { return structuredClone((await promise).result); }
    catch (error) { entries.delete(scope); throw error instanceof AppError ? error : technical(); }
    finally { active--; }
  } };
}
