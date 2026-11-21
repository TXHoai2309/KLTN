import type { PlannerResult } from "../trip-planner/planner-contract";
import { toSaveProposal, toUncheckedSavePlan } from "../trip-save/trip-save-adapter";
import { submitTripSave, type TripSaveClientResult } from "../trip-save/trip-save-client";
import type { ChosenLodgingSaveItem } from "../trip-save/trip-save-contract";
import type { UncheckedItem } from "../trip-save/unchecked-checks";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import { isTripSaveNavigationLocked, type SaveState } from "../trip-save/trip-save-state";

/** `unchecked` lists the items the saved/saving Trip records as NOT checked; empty for an all-PASS schedule. */
export type ChatSaveView = { state: SaveState; message: string; tripId: string | null; unchecked: UncheckedItem[] };

/** All-PASS schedules only (`toSaveProposal` is null otherwise); kept for callers that must not offer unchecked Save. */
export const chatSaveProposal = (result: PlannerResult): TripProposal | null => toSaveProposal(result);

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
 * Save is a separate JSON call to the existing `POST /api/trips` (never part of the stream). The server rebuilds the
 * validation from its own destination, Google and routing data; this controller only keeps the request and Idempotency-Key
 * stable, so an UNKNOWN retry sends the identical payload and key and cannot create a second Trip. For unchecked items it
 * sends nothing until the user confirms, and it echoes the list the user saw; the server decides whether it matches.
 */
export function createChatSaveController(options: { fetcher?: typeof fetch; newKey?: () => string } = {}) {
  const newKey = options.newKey ?? (() => crypto.randomUUID());
  let attempt: {
    signature: string;
    key: string;
    proposal: TripProposal;
    acknowledged: UncheckedItem[] | undefined;
    chosenLodgings: ChosenLodgingSaveItem[] | undefined;
  } | null = null;
  let serverList: UncheckedItem[] | null = null;
  let inFlight = false;
  let view: ChatSaveView = { state: "idle", message: "", tripId: null, unchecked: [] };

  async function save(
    result: PlannerResult,
    signal?: AbortSignal,
    choice: { confirmUnchecked?: boolean; chosenLodgings?: readonly ChosenLodgingSaveItem[] } = {},
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
    const signature = JSON.stringify({ proposal: plan.proposal, acknowledged, chosenLodgings: effectiveLodgings });
    // Retry after UNKNOWN reuses the stored payload and key; a changed schedule, confirmation, or chosen lodging gets a new key.
    if (!attempt || attempt.signature !== signature) {
      attempt = { signature, key: newKey(), proposal: plan.proposal, acknowledged, chosenLodgings: effectiveLodgings };
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
      );
    } finally {
      inFlight = false;
    }
    if (outcome.status === "SUCCESS") view = { state: "success", message: "Đã lưu hành trình.", tripId: outcome.tripId, unchecked: outcome.unchecked };
    else if (outcome.status === "FAILED") {
      // The server refused the confirmation: show ITS list and require a fresh confirmation.
      if (outcome.unchecked) serverList = outcome.unchecked;
      view = { state: "failed", message: outcome.message, tripId: null, unchecked: outcome.unchecked ?? shown };
    } else view = { state: "unknown", message: outcome.message, tripId: null, unchecked: shown };
    return view;
  }
  return { save, get view() { return view; }, get locked() { return isTripSaveNavigationLocked(view.state); } };
}
