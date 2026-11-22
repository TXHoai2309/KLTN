"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import type { TripsageTripInfo } from "@/modules/tripsage-chat/tripsage-chat-context";
import { chatSavePlan, createChatSaveController, type ChatSaveView } from "@/modules/tripsage-chat/tripsage-chat-save";
import { chosenLodgingMapToList, type ChosenLodgingMap, type TimelineSuggestion } from "@/modules/tripsage-chat/tripsage-timeline";
import type { PinnedItem } from "@/modules/trip-save/trip-pin-contract";
import type { SaveState } from "@/modules/trip-save/trip-save-state";
import { uncheckedItemLabel } from "@/modules/trip-save/unchecked-checks";
import { blockingAssumedFields, formatAssumedConfirmationMessage } from "@/modules/trip-validation/trip-proposal-contract";

/**
 * Save box under a chat itinerary. An all-PASS schedule saves with one click. A schedule whose only gaps are unchecked data of
 * places outside the catalogue (Ticket 09) lists each unchecked item and saves only after an explicit tick; the server
 * re-validates, compares the list and records the items as unchecked. An Assumed draft with unconfirmed origin or startDate
 * (ADR-44) cannot be saved until those fields are confirmed. A FAILED check never reaches this button.
 */
export function TripsageSaveSection({
  result,
  tripInfo,
  chosenLodgings,
  suggestions,
  pinnedItems,
  onSaved,
  onStateChange,
}: {
  result: PlannerResult;
  tripInfo?: TripsageTripInfo | null;
  chosenLodgings?: ChosenLodgingMap;
  /** ADR-45: all suggestions of the conversation; only ACTIVITY/EVENING places are saved with the trip. */
  suggestions?: readonly TimelineSuggestion[];
  /** ADR-47: items pinned before saving; they are stored with the trip. */
  pinnedItems?: readonly PinnedItem[];
  onSaved?: (tripId: string) => void;
  onStateChange?: (state: SaveState) => void;
}) {
  const controllerRef = useRef<ReturnType<typeof createChatSaveController> | null>(null);
  controllerRef.current ??= createChatSaveController();
  const [view, setView] = useState<ChatSaveView>({ state: "idle", message: "", tripId: null, unchecked: [] });
  const [confirmed, setConfirmed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const currentAssumed = tripInfo ? tripInfo.assumedFields : result.assumedFields;
  const blockingAssumed = blockingAssumedFields(currentAssumed);
  if (blockingAssumed.length > 0) {
    return (
      <div className="tripsage-save" aria-live="polite">
        <button type="button" className="assistant-save-button" disabled>
          Lưu hành trình
        </button>
        <p role="note" className="assistant-muted">{formatAssumedConfirmationMessage(blockingAssumed)}</p>
      </div>
    );
  }
  const effectiveResult: PlannerResult = result.assumedFields?.length
    ? {
        ...result,
        assumedFields: currentAssumed?.length ? [...currentAssumed] : undefined,
        eligibleForFinalConfirmation: result.status === "PROPOSAL_READY" && Boolean(result.requirement.startDate),
      }
    : result;

  const plan = chatSavePlan(effectiveResult);
  if (!plan) {
    return <p role="note" className="assistant-muted">Lịch này có mục chưa được kiểm tra hoặc chưa đạt, nên chưa thể lưu.</p>;
  }
  const controller = controllerRef.current;
  // After the server refused a confirmation, its list replaces ours and must be confirmed again.
  const items = view.unchecked.length ? view.unchecked : plan.unchecked;
  const names = new Map(effectiveResult.days.flatMap(day => day.stops.map(stop => [stop.destination.id, stop.destination.name] as const)));

  async function save() {
    if (controller.view.state === "pending" || controller.view.state === "success") return;
    if (items.length > 0 && !confirmed) return;
    abortRef.current = new AbortController();
    setView({ state: "pending", message: "Đang lưu hành trình…", tripId: null, unchecked: items });
    onStateChange?.("pending");
    const chosenList = chosenLodgings ? chosenLodgingMapToList(chosenLodgings) : [];
    const nearbyList = (suggestions ?? []).flatMap(item => (item.kind === "ACTIVITY" || item.kind === "EVENING") && item.place?.placeId
      ? [{ slotId: item.slotId, kind: item.kind, placeId: item.place.placeId, name: item.place.name, distanceKm: item.place.distanceKm }]
      : []);
    const next = await controller.save(effectiveResult, abortRef.current.signal, {
      confirmUnchecked: confirmed,
      ...(chosenList.length ? { chosenLodgings: chosenList } : {}),
      ...(nearbyList.length ? { nearbySuggestions: nearbyList } : {}),
      ...(pinnedItems?.length ? { pinnedItems } : {}),
    });
    if (next.state === "failed" && next.unchecked.length) setConfirmed(false);
    setView({ ...next });
    onStateChange?.(next.state);
    if (next.state === "success" && next.tripId) onSaved?.(next.tripId);
  }

  if (view.state === "success" && view.tripId) {
    return (
      <div className="tripsage-save" aria-live="polite">
        <p role="status">Đã lưu hành trình. <Link href={`/trips/${encodeURIComponent(view.tripId)}`}>Mở chuyến đi</Link></p>
        {view.unchecked.length > 0 && <p role="note" className="assistant-muted">Hành trình được lưu kèm {view.unchecked.length} mục chưa kiểm; các mục này không được tính là đã đạt.</p>}
      </div>
    );
  }
  const unresolved = items.length > 0;
  return (
    <div className="tripsage-save" aria-live="polite">
      {unresolved && (
        <div role="group" aria-label="Các mục chưa kiểm" className="tripsage-unchecked">
          <p><strong>Có mục chưa kiểm.</strong> KLTN chưa kiểm tra được các mục sau; chúng không được tính là đã đạt:</p>
          <ul>
            {items.map(item => <li key={`${item.check}|${item.reasonCode}|${item.placeId}`}>{names.get(item.placeId) ?? "Địa điểm ngoài danh mục"} (ngoài danh mục) — {uncheckedItemLabel(item)}</li>)}
          </ul>
          <label>
            <input type="checkbox" checked={confirmed} disabled={view.state === "pending"} onChange={event => setConfirmed(event.target.checked)} />{" "}
            Tôi hiểu các mục trên chưa được KLTN kiểm tra và hành trình sẽ được lưu kèm nhãn &quot;chưa kiểm&quot;.
          </label>
        </div>
      )}
      <button type="button" className="assistant-save-button" disabled={view.state === "pending" || (unresolved && !confirmed)} onClick={() => void save()}>
        {view.state === "pending" ? "Đang lưu…" : view.state === "unknown" ? "Kiểm tra lại kết quả lưu" : unresolved ? "Xác nhận và lưu hành trình" : "Lưu hành trình"}
      </button>
      {view.state === "idle" && <p role="note" className="assistant-muted">Lịch trình chưa được lưu.</p>}
      {view.state === "failed" && <p role="alert" style={{ color: "#b42318" }}>{view.message}</p>}
      {view.state === "unknown" && <p role="status">{view.message}</p>}
    </div>
  );
}
