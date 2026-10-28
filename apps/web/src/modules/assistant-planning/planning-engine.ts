import { randomUUID } from "node:crypto";
import { AppError } from "../../server/http/app-error";
import type { TripRequirementInput } from "../trip-requirement/trip-requirement-contract";
import { assertTripRequirementClear } from "../trip-requirement/trip-clarification-server";
import { assertStartDateForFinalConfirmation } from "../trip-requirement/trip-requirement-readiness";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import { plannerRoutePairs, schedulePlannerDays, visitDuration, openingFor, PACE_STOP_LIMIT } from "../trip-planner/planner-engine";
import { resolvePlannerRoutes, type RouteProvider } from "../trip-planner/planner-routes";
import { validatePlannerDays } from "../trip-planner/planner-validator";
import { plannerResultSchema, type PlannerResult } from "../trip-planner/planner-contract";
import { planningSelectionSchema, type PlanningSelection, type PlanningNeeds, type PlanningGenerated, type PlanningEdit } from "./planning-contract";

export function isUsablePlanningCandidate(candidate: PlannerCandidate) {
  const duration = visitDuration(candidate);
  return candidate.visibility === "VISIBLE" && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) && Math.abs(candidate.latitude) <= 90 && Math.abs(candidate.longitude) <= 180 && duration !== null && duration <= 600;
}

export function assertPlanningSelection(raw: unknown, needs: PlanningNeeds, candidates: readonly PlannerCandidate[], now = new Date()): PlannerCandidate[][] {
  const requirement = assertTripRequirementClear(needs.requirement, now);
  const selection = planningSelectionSchema.safeParse(raw);
  if (!selection.success) throw new AppError("INVALID_AI_PLAN", "AI chưa tạo được cấu trúc hành trình hợp lệ. Hãy thử lại.", 502);
  const ids = selection.data.days.flat();
  const eligible = new Map(candidates.filter(isUsablePlanningCandidate).map(c => [c.id, c]));
  if (selection.data.days.length !== requirement.durationDays || ids.length > 28 || (!ids.length && eligible.size > 0) || new Set(ids).size !== ids.length || ids.some(id => !eligible.has(id)))
    throw new AppError("INVALID_AI_PLAN", "Đề xuất chứa điểm đến hoặc thứ tự ngày không hợp lệ.", 422);
  if (needs.requiredDestinationIds.some(id => !ids.includes(id))) throw new AppError("MANDATORY_DESTINATION_MISSING", "Đề xuất chưa đáp ứng điểm bắt buộc. Hãy điều chỉnh nhu cầu hoặc tạo lại.", 422);
  if (ids.some(id => needs.excludedDestinationIds?.includes(id))) throw new AppError("EXCLUDED_DESTINATION", "Đề xuất còn chứa điểm bạn đã yêu cầu bỏ. Vui lòng tạo lại.", 422);
  if (selection.data.days.some(day => day.length > PACE_STOP_LIMIT[requirement.pace ?? "MODERATE"])) throw new AppError("PACE_LIMIT", "Đề xuất vượt nhịp độ đã xác nhận. Hãy tạo lại hoặc đổi nhu cầu.", 422);
  return selection.data.days.map(day => day.map(id => eligible.get(id)!));
}

export async function scheduleSelection(needs: PlanningNeeds, selection: PlanningSelection, candidates: readonly PlannerCandidate[], routes: RouteProvider, now: Date): Promise<PlannerResult> {
  const requirement = assertTripRequirementClear(needs.requirement, now);
  const selected = assertPlanningSelection(selection, needs, candidates, now);
  const evidence = await resolvePlannerRoutes(plannerRoutePairs(selected, requirement.transport), routes, 10_000);
  const days = schedulePlannerDays(requirement, selected, evidence);
  const { checks, stopStatuses } = validatePlannerDays(requirement, days, selected.flat());
  for (const day of days) for (const stop of day.stops) stop.validationStatus = stopStatuses.get(stop.destination.id) ?? "INSUFFICIENT_DATA";
  const allPass = checks.every(check => check.status === "PASS");
  let eligibleForFinalConfirmation = false;
  if (allPass) { try { assertStartDateForFinalConfirmation(requirement, now); eligibleForFinalConfirmation = true; } catch { /* relative/invalid date cannot save */ } }
  return plannerResultSchema.parse({
    proposalId: randomUUID(), phase: "PRELIMINARY_PROPOSAL", requirement, timezone: "Asia/Ho_Chi_Minh", days, checks,
    status: checks.some(c => c.status === "VIOLATION") ? "NO_FEASIBLE_ITINERARY" : allPass ? "PROPOSAL_READY" : "INSUFFICIENT_DATA",
    eligibleForFinalConfirmation,
    warnings: [
      { code: "PRELIMINARY_ONLY", message: "Đề xuất chưa được lưu. Khung lập kế hoạch 08:00–18:00 không phải giờ mở cửa.", day: null, destinationId: null },
      { code: "ORIGIN_AND_LODGING_UNKNOWN", message: "Chưa tính chặng từ nơi xuất phát, chỗ nghỉ và nơi kết thúc. Chuyển ngày tính từ điểm cuối ngày trước.", day: null, destinationId: null },
      { code: "ROUTE_ESTIMATE", message: "Thời gian di chuyển là ước tính theo mạng đường; cần kiểm tra thời tiết và điều kiện đường thực tế.", day: null, destinationId: null },
    ],
    reasonCodes: [...new Set(checks.flatMap(c => c.issues.map(i => i.code)))].slice(0, 30),
  });
}

export type PlanningGenerator = (input: { requirement: TripRequirementInput; needs: PlanningNeeds; candidates: readonly PlannerCandidate[]; previous: PlanningSelection | null; instruction: string; feedback: PlannerResult["checks"] }) => Promise<PlanningSelection>;
export function applyPlanningEdit(previous: PlanningSelection, edit: PlanningEdit): PlanningSelection {
  const next = structuredClone(previous);
  const day = next.days[edit.day - 1];
  if (!day) throw new AppError("EDIT_TARGET_MISSING", "Ngày cần sửa không còn trong hành trình. Hãy chọn lại.", 422);
  if (edit.kind === "REPLAN_DAY") return next;
  if (edit.kind === "ADD") {
    if (!edit.destinationId || next.days.flat().includes(edit.destinationId)) throw new AppError("EDIT_TARGET_MISSING", "Điểm cần thêm không hợp lệ hoặc đã có trong hành trình.", 422);
    day.push(edit.destinationId);
  } else {
    const index = day.indexOf(edit.targetId ?? "");
    if (index < 0) throw new AppError("EDIT_TARGET_MISSING", "Điểm cần sửa không còn trong ngày đã chọn.", 422);
    if (edit.kind === "REMOVE") day.splice(index, 1);
    else {
      if (!edit.destinationId || next.days.flat().includes(edit.destinationId)) throw new AppError("EDIT_TARGET_MISSING", "Điểm thay thế không hợp lệ hoặc đã có trong hành trình.", 422);
      day.splice(index, 1, edit.destinationId);
    }
  }
  return planningSelectionSchema.parse(next);
}
export function assertEditScope(selection: PlanningSelection, previous: PlanningSelection, edit: PlanningEdit) {
  if (selection.days.length !== previous.days.length || selection.days.some((day, i) => i !== edit.day - 1 && JSON.stringify(day) !== JSON.stringify(previous.days[i]))) throw new AppError("EDIT_SCOPE_CHANGED", "Phương án mới đổi cả ngày ngoài yêu cầu. Mình chưa áp dụng; hãy thử phương án khác.", 422);
  if (edit.kind === "REPLAN_DAY" && JSON.stringify(selection.days[edit.day - 1]) === JSON.stringify(previous.days[edit.day - 1])) throw new AppError("NO_ALTERNATIVE_FOUND", "Mình chưa tìm được phương án khác cho ngày này trong nhu cầu hiện tại. Bạn có thể đổi sở thích hoặc điểm bắt buộc.", 422);
}
export async function generatePlanningProposal(input: { needs: PlanningNeeds; candidates: readonly PlannerCandidate[]; previous: PlanningSelection | null; instruction: string; edit?: PlanningEdit; routes: RouteProvider; generate: PlanningGenerator; now: Date; recheck: (selected: readonly PlannerCandidate[]) => Promise<boolean> }): Promise<PlanningGenerated> {
  const requirement = assertTripRequirementClear(input.needs.requirement, input.now);
  const eligibleCandidates = input.candidates.filter(c => isUsablePlanningCandidate(c) && !input.needs.excludedDestinationIds?.includes(c.id));
  if (input.edit && !input.previous) throw new AppError("EDIT_TARGET_MISSING", "Cần tạo lại hành trình trước khi sửa điểm.", 422);
  if (input.needs.requiredDestinationIds.some(id => !eligibleCandidates.some(c => c.id === id))) throw new AppError("MANDATORY_DESTINATION_DATA_MISSING", "Điểm bắt buộc chưa có đủ dữ liệu lập lịch. Cần bổ sung dữ liệu hoặc bạn chủ động đổi yêu cầu.", 422);
  const attempts: PlanningGenerated["attempts"] = [];
  let previous = input.previous;
  let result: PlannerResult | undefined;
  let selection: PlanningSelection | undefined;
  let repairError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const candidate = input.edit && input.edit.kind !== "REPLAN_DAY" ? applyPlanningEdit(input.previous!, input.edit) : eligibleCandidates.length ? await input.generate({ requirement, needs: input.needs, candidates: eligibleCandidates, previous, instruction: input.instruction, feedback: result?.checks ?? [] }) : { days: Array.from({ length: requirement.durationDays }, () => [] as string[]) };
      if (input.edit) assertEditScope(candidate, input.previous!, input.edit);
      const next = await scheduleSelection(input.needs, candidate, eligibleCandidates, input.routes, input.now);
      result = next; selection = candidate; previous = candidate;
    } catch (error) {
      if (!result) throw error;
      repairError = "Chưa thể hoàn tất lần điều chỉnh. Giữ lại đề xuất trước; bạn có thể chỉnh nhu cầu rồi thử lại.";
      break;
    }
    attempts.push({ status: result.status, checks: result.checks.map(({ key, status }) => ({ key, status })) });
    // Unknown clocks caused by an overloaded schedule can be repaired. Missing
    // source evidence (hours/minimum/routes/accessibility) must never be guessed.
    const missingEvidence = result.requirement.startDate === null || !!result.requirement.mobilityConstraints || result.checks.some(c => ["TRAVEL_TIME", "MINIMUM_DURATION"].includes(c.key) && c.status === "INSUFFICIENT_DATA") || result.days.some(day => day.stops.some(stop => {
      const candidate = input.candidates.find(c => c.id === stop.destination.id)!;
      const hours = openingFor(candidate, day.date);
      return !hours || hours.status === "UNKNOWN" || (hours.status === "OPEN" && !hours.intervals.length);
    }));
    if (!result.checks.some(c => c.status === "VIOLATION") || missingEvidence || (input.edit && input.edit.kind !== "REPLAN_DAY")) break;
  }
  if (!result || !selection) throw new AppError("PLANNER_UNAVAILABLE", "Chưa tạo được đề xuất. Vui lòng thử lại.", 503);
  const selectedIds = new Set(selection.days.flat());
  if (!await input.recheck(input.candidates.filter(c => selectedIds.has(c.id)))) throw new AppError("PLANNER_DATA_CHANGED", "Dữ liệu điểm đến đã thay đổi. Vui lòng tạo lại.", 409);
  return { proposal: result, selection, attempts, repairError };
}
