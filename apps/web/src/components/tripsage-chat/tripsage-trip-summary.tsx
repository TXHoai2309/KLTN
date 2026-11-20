"use client";

import { Pencil, Sparkles } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";

import { formatVietnameseDate } from "@/lib/date-only";
import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import { INTEREST_OPTIONS, TRANSPORT_OPTIONS } from "@/modules/trip-requirement/trip-requirement-contract";
import type { TripsageRequirement } from "@/modules/tripsage-chat/tripsage-chat-context";

/** One-line summary of the entered trip info with an edit button, or (no info yet) a prominent button to open the dialog. */
export function TripsageTripSummary({ requirement, journey, onEdit, disabled = false }: { requirement: TripsageRequirement | null; journey: TripJourney | null; onEdit: () => void; disabled?: boolean }) {
  if (!requirement) {
    return <Button type="button" size="lg" onClick={onEdit} disabled={disabled}><Sparkles aria-hidden="true" />Điền thông tin chuyến đi</Button>;
  }
  const transport = TRANSPORT_OPTIONS.find(option => option.value === requirement.transport)?.label ?? requirement.transport;
  const interests = requirement.interests.map(value => INTEREST_OPTIONS.find(option => option.value === value)?.label ?? value).join(", ");
  const parts = [transport, `${requirement.durationDays} ngày`, formatVietnameseDate(requirement.startDate), interests, journey?.origin?.label ? `Xuất phát: ${journey.origin.label}` : "Chưa chọn điểm xuất phát"];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="group" aria-label="Thông tin chuyến đi" lang="vi">
      <p className="min-w-0 flex-1">{parts.join(" · ")}</p>
      <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={disabled}><Pencil aria-hidden="true" />Sửa thông tin</Button>
    </div>
  );
}
