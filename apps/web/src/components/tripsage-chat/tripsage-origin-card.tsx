"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";

import TripJourneyEditor from "@/components/trip-origin/trip-journey-editor";
import { JOURNEY_MISSING_LABELS, missingJourneyFields, type TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import { hubOrigin, TRIP_HUBS } from "@/modules/tripsage-chat/trip-hubs";

/**
 * In-chat origin card opened by `requestOrigin` (ADR-42). Reuses the KLTN origin picker (search, map pin, Vietnam check)
 * with clocks prefilled from the assistant's suggestion, plus one-click trip hubs. Only the traveler's click confirms.
 */
export function TripsageOriginCard({ suggestion, journey, disabled, onConfirm }: {
  suggestion: { departureMinute: number; returnDeadlineMinute: number };
  journey: TripJourney | null;
  disabled: boolean;
  onConfirm: (journey: TripJourney) => void;
}) {
  const [draft, setDraft] = useState<TripJourney>(() => ({
    origin: journey?.origin ?? null,
    departureMinute: journey?.departureMinute ?? suggestion.departureMinute,
    returnDeadlineMinute: journey?.returnDeadlineMinute ?? suggestion.returnDeadlineMinute,
    returnDepartureMinute: journey?.returnDepartureMinute ?? null,
  }));
  const missing = missingJourneyFields(draft);
  return (
    <section className="tripsage-origin-card" aria-label="Chọn điểm xuất phát">
      <h4><MapPin size={16} aria-hidden="true" className="inline mr-1" />Bạn xuất phát từ đâu?</h4>
      <div className="tripsage-origin-hubs">
        {TRIP_HUBS.map(hub => (
          <Button key={hub.id} type="button" variant="outline" size="sm" disabled={disabled}
            onClick={() => onConfirm({ ...draft, origin: hubOrigin(hub.id) })}>
            Bắt đầu từ {hub.name}
          </Button>
        ))}
      </div>
      <TripJourneyEditor journey={draft} onChange={setDraft} disabled={disabled} />
      {missing.length > 0 && <p role="status" className="text-xs text-muted-foreground">{missing.map(field => JOURNEY_MISSING_LABELS[field]).join(" ")}</p>}
      <Button type="button" disabled={disabled || missing.length > 0} onClick={() => onConfirm(draft)}>Dùng điểm xuất phát này</Button>
    </section>
  );
}
