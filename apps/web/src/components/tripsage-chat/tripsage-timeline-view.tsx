import { BedDouble, Car, Flag, Home, Lightbulb, MapPin, Moon, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";

import { clockLabel, type TimelineItem, type TimelinePart, type TimelineSuggestion } from "@/modules/tripsage-chat/tripsage-timeline";

const ITEM_ICON: Record<TimelineItem["kind"], ReactNode> = {
  DEPART: <Flag size={15} aria-hidden="true" />, DRIVE: <Car size={15} aria-hidden="true" />, VISIT: <MapPin size={15} aria-hidden="true" />,
  LUNCH: <UtensilsCrossed size={15} aria-hidden="true" />, OVERNIGHT: <Moon size={15} aria-hidden="true" />, ARRIVE_HOME: <Home size={15} aria-hidden="true" />,
};
const SUGGESTION_ICON: Record<TimelineSuggestion["kind"], ReactNode> = {
  MEAL: <UtensilsCrossed size={13} aria-hidden="true" />, EVENING: <Moon size={13} aria-hidden="true" />, LODGING: <BedDouble size={13} aria-hidden="true" />, TIP: <Lightbulb size={13} aria-hidden="true" />,
};
const SUGGESTION_LABEL: Record<TimelineSuggestion["kind"], string> = { MEAL: "Ăn uống", EVENING: "Buổi tối", LODGING: "Chỗ nghỉ", TIP: "Mẹo" };

const time = (item: TimelineItem) => item.startMinute === null && item.endMinute === null ? "" : item.endMinute === null || item.kind === "DEPART" ? clockLabel(item.startMinute) : item.startMinute === null ? `→ ${clockLabel(item.endMinute)}` : `${clockLabel(item.startMinute)}–${clockLabel(item.endMinute)}`;

/** Day-by-day timeline (planner times) with the assistant's suggestions under their slots, labeled unchecked (ADR-42). */
export function TripsageTimelineView({ timeline, suggestions }: { timeline: TimelinePart; suggestions: readonly TimelineSuggestion[] }) {
  const bySlot = new Map<string, TimelineSuggestion[]>();
  for (const suggestion of suggestions) bySlot.set(suggestion.slotId, [...(bySlot.get(suggestion.slotId) ?? []), suggestion]);
  return (
    <section className="tripsage-timeline" aria-label="Timeline từng ngày">
      {timeline.days.map(day => (
        <div key={day.day} className="tripsage-timeline-day">
          <h4>Ngày {day.day}{day.date ? ` · ${day.date.split("-").reverse().join("/")}` : ""}</h4>
          <ol>
            {day.items.map(item => (
              <li key={item.slotId} className={`tripsage-timeline-item tripsage-timeline-${item.kind.toLowerCase()}`}>
                <span className="tripsage-timeline-time">{time(item)}</span>
                <span className="tripsage-timeline-icon">{ITEM_ICON[item.kind]}</span>
                <div className="tripsage-timeline-body">
                  <span>{item.label}</span>
                  {(bySlot.get(item.slotId) ?? []).map((suggestion, index) => (
                    <p key={index} className="tripsage-suggestion">
                      {SUGGESTION_ICON[suggestion.kind]}
                      <strong>{SUGGESTION_LABEL[suggestion.kind]}:</strong> {suggestion.title}
                      {suggestion.place && <span className="tripsage-suggestion-meta"> · {suggestion.place.name}, cách khoảng {suggestion.place.distanceKm} km</span>}
                      {suggestion.detail && <span className="tripsage-suggestion-detail"> — {suggestion.detail}</span>}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {suggestions.length > 0 && <p className="assistant-muted text-xs">Gợi ý ăn uống, chỗ nghỉ, vui chơi là gợi ý chưa kiểm tra (nguồn Google Maps hoặc tài liệu địa phương); giá chỉ là ước tính, ứng dụng không đặt chỗ. Giờ giấc do hệ thống lập lịch và kiểm tra.</p>}
    </section>
  );
}
