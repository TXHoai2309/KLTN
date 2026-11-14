import type { PlannerResult } from "../trip-planner/planner-contract";
import { toSaveProposal } from "../trip-save/trip-save-adapter";
import { submitTripSave, type TripSaveClientResult } from "../trip-save/trip-save-client";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import { isTripSaveNavigationLocked, type SaveState } from "../trip-save/trip-save-state";

export type ChatSaveView = { state: SaveState; message: string; tripId: string | null };

/** The Save button exists only for a schedule whose every check is PASS (`toSaveProposal` is null otherwise). */
export const chatSaveProposal = (result: PlannerResult): TripProposal | null => toSaveProposal(result);

/**
 * Save is a separate JSON call to the existing `POST /api/trips` (never part of the stream). The server rebuilds the
 * validation from its own destination and routing data; this controller only keeps the proposal and Idempotency-Key
 * stable, so an UNKNOWN retry sends the identical payload and key and cannot create a second Trip.
 */
export function createChatSaveController(options: { fetcher?: typeof fetch; newKey?: () => string } = {}) {
  const newKey = options.newKey ?? (() => crypto.randomUUID());
  let attempt: { signature: string; key: string; proposal: TripProposal } | null = null;
  let inFlight = false;
  let view: ChatSaveView = { state: "idle", message: "", tripId: null };

  async function save(result: PlannerResult, signal?: AbortSignal): Promise<ChatSaveView> {
    if (inFlight || view.state === "success") return view;
    const fresh = chatSaveProposal(result);
    if (!fresh) return view;
    const signature = JSON.stringify(fresh);
    // Retry after UNKNOWN reuses the stored payload and key; a changed schedule gets a new key.
    if (!attempt || attempt.signature !== signature) attempt = { signature, key: newKey(), proposal: fresh };
    inFlight = true;
    view = { state: "pending", message: "Đang lưu hành trình…", tripId: null };
    let outcome: TripSaveClientResult;
    try { outcome = await submitTripSave(attempt.proposal, attempt.key, signal, options.fetcher); } finally { inFlight = false; }
    if (outcome.status === "SUCCESS") view = { state: "success", message: "Đã lưu hành trình.", tripId: outcome.tripId };
    else if (outcome.status === "FAILED") view = { state: "failed", message: outcome.message, tripId: null };
    else view = { state: "unknown", message: outcome.message, tripId: null };
    return view;
  }
  return { save, get view() { return view; }, get locked() { return isTripSaveNavigationLocked(view.state); } };
}
