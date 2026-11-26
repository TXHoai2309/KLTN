import { cleanPlaceDisplayName } from "../../lib/traveler-display-clean";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { toSaveProposal, toUncheckedSavePlan } from "../trip-save/trip-save-adapter";
import { submitTripSave, type TripSaveClientResult } from "../trip-save/trip-save-client";
import type { ChosenLodgingSaveItem, NearbySuggestionSaveItem } from "../trip-save/trip-save-contract";
import { MAX_PINNED_ITEMS, type PinnedItem } from "../trip-save/trip-pin-contract";
import { costPin } from "../trip-save/trip-pin-builders";
import type { AccessLegPart } from "./tripsage-access-leg";
import type { CostPart } from "./tripsage-cost";
import type { UncheckedItem } from "../trip-save/unchecked-checks";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation, ValidationFinding } from "../trip-validation/trip-validation";
import { isTripSaveNavigationLocked, type SaveState } from "../trip-save/trip-save-state";

export type SaveRecoveryAction = {
  label: string;
  prompt: string;
};

/** `unchecked` lists the items the saved/saving Trip records as NOT checked; empty for an all-PASS schedule. */
export type ChatSaveView = {
  state: SaveState;
  message: string;
  tripId: string | null;
  unchecked: UncheckedItem[];
  recovery?: SaveRecoveryAction[];
};

/**
 * Formats server-returned TripValidation findings into a specific, actionable Vietnamese explanation
 * plus assistant recovery chips so the traveler never sees only a generic "cannot save" message.
 */
export function describeSaveValidationFailure(
  validation: TripValidation | undefined,
  fallbackMessage: string,
  result: PlannerResult,
): { message: string; recovery: SaveRecoveryAction[] } {
  if (!validation) return { message: fallbackMessage, recovery: [] };

  const stopById = new Map<string, { name: string; duration: number; day: number }>();
  const stopByVisitKey = new Map<string, { name: string; duration: number; day: number }>();
  for (const day of result.days) {
    for (const stop of day.stops) {
      const info = {
        name: cleanPlaceDisplayName(stop.destination.name) || stop.destination.name,
        duration: stop.visitDurationMinutes,
        day: day.day,
      };
      stopById.set(stop.destination.id, info);
      stopByVisitKey.set(`day-${day.day}-visit-${stop.order}`, info);
    }
  }
  const resolveStop = (finding: ValidationFinding) =>
    (finding.affectedVisitId && (stopById.get(finding.affectedVisitId) ?? stopByVisitKey.get(finding.affectedVisitId)))
    || (finding.toVisitId && (stopById.get(finding.toVisitId) ?? stopByVisitKey.get(finding.toVisitId)))
    || (finding.fromVisitId && (stopById.get(finding.fromVisitId) ?? stopByVisitKey.get(finding.fromVisitId)))
    || null;

  const allFindings: ValidationFinding[] = [
    ...validation.groups.minimumDuration.findings,
    ...validation.groups.travelTime.findings,
    ...validation.groups.openingHours.findings,
    ...validation.groups.scheduleConflict.findings,
  ];
  if (!allFindings.length) return { message: fallbackMessage, recovery: [] };

  const reasons: string[] = [];
  const recovery: SaveRecoveryAction[] = [];
  const seenReason = new Set<string>();
  const seenAction = new Set<string>();
  const addReason = (text: string) => {
    if (!seenReason.has(text)) {
      seenReason.add(text);
      reasons.push(text);
    }
  };
  const addAction = (label: string, prompt: string) => {
    if (!seenAction.has(label) && recovery.length < 3) {
      seenAction.add(label);
      recovery.push({ label, prompt });
    }
  };

  for (const finding of allFindings) {
    const stop = resolveStop(finding);
    const code = finding.reasonCode;
    if (code === "VISIT_TOO_SHORT" || code === "BELOW_MINIMUM_DURATION") {
      const text = stop
        ? `${stop.name} (${stop.duration} phút) ngắn hơn mức tối thiểu khuyến nghị — giữ ${stop.duration} phút hay tăng lên?`
        : "Có lượt tham quan ngắn hơn mức tối thiểu khuyến nghị — cần tăng thời lượng hoặc xác nhận giữ ngắn.";
      addReason(text);
      if (stop) {
        addAction(
          `Tăng thời lượng ${stop.name}`,
          `Tăng thời lượng tham quan ở ${stop.name} lên mức tối thiểu khuyến nghị để lưu được chuyến đi.`,
        );
      } else {
        addAction("Tăng thời lượng điểm ngắn", "Tăng thời lượng các điểm đang ngắn hơn mức tối thiểu để lưu được chuyến đi.");
      }
      continue;
    }
    if (
      code === "TRANSFER_TOO_SHORT"
      || code === "JOURNEY_ARRIVAL_TOO_EARLY"
      || code === "JOURNEY_REST_MISMATCH"
      || code === "JOURNEY_TRAVEL_TIME_MISMATCH"
      || code === "TRAVEL_TIME_SHORT"
    ) {
      const text = stop
        ? `Chặng di chuyển tới ${stop.name} (Ngày ${stop.day}) chưa đủ thời gian chạy xe hoặc nghỉ dọc đường theo định tuyến mới nhất — cần giãn giờ hoặc bớt điểm.`
        : "Thời gian di chuyển hoặc nghỉ dọc đường giữa các điểm chưa khớp định tuyến mới nhất — cần giãn giờ hoặc bớt điểm.";
      addReason(text);
      addAction("Nhờ trợ lý giãn giờ chặng đi", "Kiểm tra lúc lưu báo chưa đủ thời gian di chuyển hoặc nghỉ dọc đường, hãy giãn giờ hoặc bớt điểm để lịch hợp lệ và lưu được.");
      continue;
    }
    if (code === "RETURN_DEADLINE_MISSED") {
      addReason("Chặng về vượt quá giờ về mong muốn — hãy nới giờ về hoặc bớt điểm ngày cuối.");
      addAction("Nới giờ về hoặc bớt điểm ngày cuối", "Chặng về bị trễ hơn hạn về, hãy bớt điểm ngày cuối hoặc điều chỉnh giờ để về kịp và lưu được.");
      continue;
    }
    if (code === "CLOSED" || code === "CLOSED_ALL_DAY" || code === "OUTSIDE_OPENING_HOURS") {
      const text = stop
        ? `${stop.name} (Ngày ${stop.day}) đóng cửa hoặc nằm ngoài giờ mở cửa — cần đổi giờ hoặc đổi ngày.`
        : "Có điểm dừng nằm ngoài giờ mở cửa vào ngày đã chọn — cần đổi giờ hoặc đổi ngày.";
      addReason(text);
      addAction(
        stop ? `Đổi giờ ${stop.name}` : "Nhờ trợ lý đổi giờ mở cửa",
        stop
          ? `${stop.name} bị báo ngoài giờ mở cửa khi lưu, hãy đổi khung giờ hoặc đổi ngày để lưu được.`
          : "Có điểm bị báo ngoài giờ mở cửa khi lưu, hãy điều chỉnh giờ tham quan để lưu được.",
      );
      continue;
    }
    if (code === "SCHEDULE_CONFLICT" || code === "VISITS_OVERLAP" || code === "NO_TIME_SLOT") {
      addReason("Có lượt tham quan bị trùng giờ hoặc vượt khung ngày — cần sắp xếp lại lịch.");
      addAction("Nhờ trợ lý sắp xếp lại lịch", "Kiểm tra lúc lưu báo trùng giờ hoặc vượt khung ngày, hãy sắp xếp lại lịch để lưu được.");
      continue;
    }
    if (finding.status === "INSUFFICIENT_DATA") {
      addReason(finding.message || "Thiếu dữ liệu kiểm tra (định tuyến hoặc giờ mở cửa) nên chưa thể lưu.");
      addAction("Nhờ trợ lý kiểm tra lại lịch", "Lúc lưu báo thiếu dữ liệu kiểm tra, hãy kiểm tra lại hành trình giúp mình.");
      continue;
    }
    addReason(finding.message || fallbackMessage);
  }

  if (!recovery.length && reasons.length) {
    addAction("Nhờ trợ lý sửa lịch", "Lịch trình chưa lưu được theo kiểm tra mới nhất, hãy điều chỉnh lại để đủ điều kiện lưu.");
  }

  return {
    message: reasons.slice(0, 2).join(" "),
    recovery,
  };
}

/** All-PASS schedules only (`toSaveProposal` is null otherwise); kept for callers that must not offer unchecked Save. */
export const chatSaveProposal = (result: PlannerResult): TripProposal | null => toSaveProposal(result);

/**
 * ADR-58 (Q1, Q5): Checks whether a conversation's latest cost estimate matches the current
 * `accessLegId` and itinerary duration, and merges it into `pinnedItems` as a `COST` snapshot
 * (replacing any older pinned `COST` item). Never fabricates or recomputes numbers.
 */
export function isCostEstimateMatchingSave(input: {
  latestCost?: CostPart | null;
  accessLeg?: AccessLegPart | null;
  proposal: PlannerResult;
}): boolean {
  const { latestCost, accessLeg, proposal } = input;
  if (!latestCost) return false;
  if (accessLeg) {
    if (latestCost.accessLegId && accessLeg.id && latestCost.accessLegId !== accessLeg.id) {
      return false;
    }
    if (!latestCost.accessLegId && !latestCost.lines.some(line => line.label === "Chặng tiếp cận (đi và về)")) {
      return false;
    }
  }
  const costSightseeingDays = latestCost.sightseeingDays ?? latestCost.days;
  if (costSightseeingDays !== proposal.requirement.durationDays) {
    return false;
  }
  return true;
}

export function mergeLatestCostForSave(input: {
  pinnedItems?: readonly PinnedItem[];
  latestCost?: CostPart | null;
  accessLeg?: AccessLegPart | null;
  proposal: PlannerResult;
}): PinnedItem[] {
  const base = input.pinnedItems ? [...input.pinnedItems] : [];
  if (!input.latestCost || !isCostEstimateMatchingSave(input)) {
    return base;
  }
  const withoutOldCost = base.filter(item => item.kind !== "COST");
  const capped = withoutOldCost.slice(0, MAX_PINNED_ITEMS - 1);
  return [...capped, costPin(input.latestCost)];
}

/**
 * What the Save box may offer: an all-PASS schedule (no unchecked items) or, after explicit confirmation, a schedule whose only
 * gaps are unchecked data of external places (Ticket 09). A FAILED check or other missing data gives null.
 */
export function chatSavePlan(result: PlannerResult): { proposal: TripProposal; unchecked: UncheckedItem[] } | null {
  const pass = toSaveProposal(result);
  if (pass) return { proposal: pass, unchecked: [] };
  return toUncheckedSavePlan(result);
}

/**
 * Point 6: deterministic Idempotency-Key derived from `(proposalId, signature)` so clicking Save
 * on the identical itinerary across reloads or tabs replays the existing Trip instead of creating a duplicate.
 */
export function deterministicSaveIdempotencyKey(proposalId: string, signature: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < signature.length; i += 1) {
    const code = signature.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const safeProposal = proposalId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 48) || "plan";
  const digest = `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
  return `tripsage-save-${safeProposal}-${digest}`;
}

/**
 * Save is a separate JSON call to the existing `POST /api/trips` (never part of the stream). The server rebuilds the
 * validation from its own destination, Google and routing data; this controller keeps the request and Idempotency-Key
 * deterministic for a given proposal + payload, so retries after UNKNOWN and repeat clicks after reload cannot create a
 * second Trip. For unchecked items it sends nothing until the user confirms, and it echoes the list the user saw; the
 * server decides whether it matches.
 */
export function createChatSaveController(options: { fetcher?: typeof fetch; newKey?: () => string } = {}) {
  const customNewKey = options.newKey;
  let attempt: {
    signature: string;
    key: string;
    proposal: TripProposal;
    acknowledged: UncheckedItem[] | undefined;
    chosenLodgings: ChosenLodgingSaveItem[] | undefined;
    nearby: NearbySuggestionSaveItem[] | undefined;
    pinned: PinnedItem[] | undefined;
  } | null = null;
  let serverList: UncheckedItem[] | null = null;
  let inFlight = false;
  let view: ChatSaveView = { state: "idle", message: "", tripId: null, unchecked: [] };

  async function save(
    result: PlannerResult,
    signal?: AbortSignal,
    choice: { confirmUnchecked?: boolean; chosenLodgings?: readonly ChosenLodgingSaveItem[]; nearbySuggestions?: readonly NearbySuggestionSaveItem[]; pinnedItems?: readonly PinnedItem[] } = {},
  ): Promise<ChatSaveView> {
    if (inFlight || view.state === "success") return view;
    const plan = chatSavePlan(result);
    if (!plan) return view;
    const shown = serverList ?? plan.unchecked;
    if (shown.length > 0 && choice.confirmUnchecked !== true) return view;
    const acknowledged = shown.length > 0 ? shown : undefined;
    const chosenLodgings = choice.chosenLodgings?.length
      ? [...choice.chosenLodgings]
          .filter(item => item.nightIndex >= 1 && item.nightIndex < plan.proposal.durationDays)
          .sort((a, b) => a.nightIndex - b.nightIndex)
      : undefined;
    const effectiveLodgings = chosenLodgings?.length ? chosenLodgings : undefined;
    const nearby = choice.nearbySuggestions?.length ? [...choice.nearbySuggestions] : undefined;
    const pinned = choice.pinnedItems?.length ? [...choice.pinnedItems] : undefined;
    const signature = JSON.stringify({ proposal: plan.proposal, acknowledged, chosenLodgings: effectiveLodgings, nearby, pinned });
    // Retry after UNKNOWN reuses the stored payload and key; identical proposal+payload across reloads derives the same key.
    if (!attempt || attempt.signature !== signature) {
      const key = customNewKey ? customNewKey() : deterministicSaveIdempotencyKey(result.proposalId, signature);
      attempt = { signature, key, proposal: plan.proposal, acknowledged, chosenLodgings: effectiveLodgings, nearby, pinned };
    }
    inFlight = true;
    view = { state: "pending", message: "Đang lưu hành trình…", tripId: null, unchecked: shown };
    let outcome: TripSaveClientResult;
    try {
      outcome = await submitTripSave(
        attempt.proposal,
        attempt.key,
        signal,
        options.fetcher,
        attempt.acknowledged,
        attempt.chosenLodgings,
        attempt.nearby,
        attempt.pinned,
      );
    } finally {
      inFlight = false;
    }
    if (outcome.status === "SUCCESS") view = { state: "success", message: "Đã lưu hành trình.", tripId: outcome.tripId, unchecked: outcome.unchecked };
    else if (outcome.status === "FAILED") {
      // The server refused the confirmation: show ITS list and require a fresh confirmation.
      if (outcome.unchecked) serverList = outcome.unchecked;
      const described = describeSaveValidationFailure(outcome.validation, outcome.message, result);
      view = {
        state: "failed",
        message: described.message,
        tripId: null,
        unchecked: outcome.unchecked ?? shown,
        ...(described.recovery.length ? { recovery: described.recovery } : {}),
      };
    } else view = { state: "unknown", message: outcome.message, tripId: null, unchecked: shown };
    return view;
  }
  return { save, get view() { return view; }, get locked() { return isTripSaveNavigationLocked(view.state); } };
}
