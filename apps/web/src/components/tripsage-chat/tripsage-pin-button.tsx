"use client";

import { Check, Pin } from "lucide-react";

import type { PinnedItem } from "@/modules/trip-save/trip-pin-contract";

/** ADR-47: what the chat gives a card so it can offer "Ghim vào chuyến đi". Absent means the card shows no pin button. */
export type PinControl = { isPinned: (item: PinnedItem) => boolean; toggle: (item: PinnedItem) => void; saved: boolean };

export function PinButton({ item, control, label }: { item: PinnedItem | null; control?: PinControl; label: string }) {
  if (!item || !control) return null;
  const pinned = control.isPinned(item);
  return (
    <button
      type="button"
      className={`tripsage-pin-btn${pinned ? " is-pinned" : ""}`}
      aria-pressed={pinned}
      aria-label={pinned ? `Bỏ ghim ${label}` : `Ghim ${label} vào chuyến đi`}
      onClick={() => control.toggle(item)}
     
    >
      {pinned ? <Check size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}
      <span>{pinned ? (control.saved ? "Đã ghim vào chuyến đi" : "Đã ghim, sẽ lưu cùng chuyến") : "Ghim vào chuyến đi"}</span>
    </button>
  );
}
