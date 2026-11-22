"use client";

import { BedDouble, Car, Check, Clock, Eye, Flag, Home, Lightbulb, MapPin, Moon, Sparkles, UtensilsCrossed } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import { canPreviewPlace, type PlacePreviewTarget } from "@/lib/place-preview-url";
import {
  clockLabel,
  isEligibleLodgingSuggestion,
  nightIndexFromSlotId,
  type ChosenLodgingMap,
  type TimelineItem,
  type TimelinePart,
  type TimelineSuggestion,
} from "@/modules/tripsage-chat/tripsage-timeline";

const ITEM_ICON: Record<TimelineItem["kind"], ReactNode> = {
  DEPART: <Flag size={13} aria-hidden="true" />, DRIVE: <Car size={13} aria-hidden="true" />, VISIT: <MapPin size={13} aria-hidden="true" />,
  LUNCH: <UtensilsCrossed size={13} aria-hidden="true" />, FREE_TIME: <Clock size={13} aria-hidden="true" />, OVERNIGHT: <Moon size={13} aria-hidden="true" />, ARRIVE_HOME: <Home size={13} aria-hidden="true" />,
};
const SUGGESTION_ICON: Record<TimelineSuggestion["kind"], ReactNode> = {
  MEAL: <UtensilsCrossed size={13} aria-hidden="true" />, EVENING: <Moon size={13} aria-hidden="true" />, LODGING: <BedDouble size={13} aria-hidden="true" />, TIP: <Lightbulb size={13} aria-hidden="true" />, ACTIVITY: <Sparkles size={13} aria-hidden="true" />,
};
const SUGGESTION_LABEL: Record<TimelineSuggestion["kind"], string> = { MEAL: "Ăn uống", EVENING: "Buổi tối", LODGING: "Chỗ nghỉ", TIP: "Mẹo", ACTIVITY: "Vui chơi" };

/** Older answers wrote only the source label into `detail`; the footnote already states it once. */
const SOURCE_ONLY_DETAIL = /^\s*(gợi ý\s+)?ngoài danh mục[\s,.;·-]*(chưa (được )?kiểm tra)?[\s.]*$/iu;

const time = (item: TimelineItem) => item.startMinute === null && item.endMinute === null ? "" : item.endMinute === null || item.kind === "DEPART" ? clockLabel(item.startMinute) : item.startMinute === null ? `→ ${clockLabel(item.endMinute)}` : `${clockLabel(item.startMinute)}–${clockLabel(item.endMinute)}`;

/** Nearby activity suggestions (ACTIVITY and EVENING with a place) render as one compact list per slot. */
const isNearbyActivity = (suggestion: TimelineSuggestion) => (suggestion.kind === "ACTIVITY" || suggestion.kind === "EVENING") && Boolean(suggestion.place);

const norm = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/gu, " ").trim();

/** Formats place metadata without duplicating the suggestion title (e.g. "Homestay A · cách khoảng 0.3 km"). */
export function formatSuggestionPlaceMeta(title: string, place: NonNullable<TimelineSuggestion["place"]>): string {
  const sameOrIncluded = norm(title) === norm(place.name) || norm(title).includes(norm(place.name));
  return sameOrIncluded
    ? ` · cách khoảng ${place.distanceKm} km`
    : ` · ${place.name}, cách khoảng ${place.distanceKm} km`;
}

/** Builds a Place preview target from a timeline VISIT item only when valid coordinates or placeId exist. */
export function timelineItemPreviewTarget(item: TimelineItem): PlacePreviewTarget | null {
  if (item.kind !== "VISIT") return null;
  if (item.placeId) {
    const candidate: PlacePreviewTarget = { kind: "GOOGLE_PLACE", name: item.label, placeId: item.placeId };
    return canPreviewPlace(candidate) ? candidate : null;
  }
  if (typeof item.latitude === "number" && typeof item.longitude === "number") {
    const candidate: PlacePreviewTarget = {
      kind: "CATALOG",
      name: item.label,
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.address ?? null,
      verifiedGoogleMapsUrl: item.googleMapsUrl ?? null,
    };
    return canPreviewPlace(candidate) ? candidate : null;
  }
  return null;
}

/** Builds a Place preview target from a Google Places suggestion only when a valid placeId exists. */
export function suggestionPreviewTarget(suggestion: TimelineSuggestion): PlacePreviewTarget | null {
  const placeId = suggestion.place?.placeId;
  if (!placeId) return null;
  const candidate: PlacePreviewTarget = {
    kind: "GOOGLE_PLACE",
    name: suggestion.place?.name || suggestion.title,
    placeId,
  };
  return canPreviewPlace(candidate) ? candidate : null;
}

/** Reusable action button rendered both on a lodging suggestion card and inside its Place preview modal. */
export function ChosenLodgingButton({
  nightIndex,
  placeName,
  selected,
  onClick,
}: {
  nightIndex: number;
  placeName: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tripsage-choose-lodging-btn${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={selected ? `Bỏ chọn ${placeName} cho đêm ${nightIndex}` : `Chọn ${placeName} cho đêm ${nightIndex}`}
      onClick={onClick}
    >
      {selected && <Check size={12} aria-hidden="true" />}
      <span>{selected ? `Đã chọn cho đêm ${nightIndex}` : `Chọn cho đêm ${nightIndex}`}</span>
    </button>
  );
}

/** Day-tabbed vertical timeline (planner times) with assistant suggestions under their slots, labeled unchecked. */
export function TripsageTimelineView({
  timeline,
  suggestions,
  initialDay,
  chosenLodgings,
  onToggleChosenLodging,
  onRequestMeals,
}: {
  timeline: TimelinePart;
  suggestions: readonly TimelineSuggestion[];
  initialDay?: number;
  chosenLodgings?: ChosenLodgingMap;
  onToggleChosenLodging?: (nightIndex: number, placeId: string) => void;
  /** Asks the assistant for lunch places on that day; the button shows only on a lunch row without meal suggestions. */
  onRequestMeals?: (day: number) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(initialDay ?? timeline.days[0]?.day ?? 1);
  const [preview, setPreview] = useState<{
    target: PlacePreviewTarget;
    trigger: HTMLElement | null;
    lodgingChoice?: { nightIndex: number; placeId: string; placeName: string };
  } | null>(null);
  const activeDay = timeline.days.find(day => day.day === selectedDay) ?? timeline.days[0];
  if (!activeDay) return null;

  const bySlot = new Map<string, TimelineSuggestion[]>();
  for (const suggestion of suggestions) bySlot.set(suggestion.slotId, [...(bySlot.get(suggestion.slotId) ?? []), suggestion]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % timeline.days.length;
    else if (event.key === "ArrowLeft") next = (index + timeline.days.length - 1) % timeline.days.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = timeline.days.length - 1;
    else return;
    event.preventDefault();
    setSelectedDay(timeline.days[next]!.day);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }

  return (
    <section className="tripsage-timeline" aria-label="Timeline từng ngày">
      <div className="tripsage-day-tabs" role="tablist" aria-label="Chọn ngày trong lịch trình">
        {timeline.days.map((day, index) => {
          const active = day.day === activeDay.day;
          return (
            <button
              key={day.day}
              id={`tripsage-day-tab-${day.day}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tripsage-day-panel-${day.day}`}
              tabIndex={active ? 0 : -1}
              className={`tripsage-day-tab${active ? " is-active" : ""}`}
              onClick={() => setSelectedDay(day.day)}
              onKeyDown={event => onTabKeyDown(event, index)}
            >
              <span>Ngày {day.day}</span>
              {day.date && <small>{day.date.split("-").reverse().slice(0, 2).join("/")}</small>}
            </button>
          );
        })}
      </div>

      <div
        id={`tripsage-day-panel-${activeDay.day}`}
        role="tabpanel"
        aria-labelledby={`tripsage-day-tab-${activeDay.day}`}
        className="tripsage-timeline-day"
      >
        <h4 className="tripsage-timeline-heading">
          Ngày {activeDay.day}{activeDay.date ? ` · ${activeDay.date.split("-").reverse().join("/")}` : ""}
        </h4>
        <ol className="tripsage-timeline-list">
          {activeDay.items.map(item => {
            const itemPreview = timelineItemPreviewTarget(item);
            return (
              <li key={item.slotId} className={`tripsage-timeline-item tripsage-timeline-${item.kind.toLowerCase()}`}>
                <span className="tripsage-timeline-time">{time(item)}</span>
                <span className="tripsage-timeline-rail" aria-hidden="true">
                  <span className="tripsage-timeline-dot">{ITEM_ICON[item.kind]}</span>
                  <span className="tripsage-timeline-line" />
                </span>
                <div className="tripsage-timeline-body">
                  <div className="tripsage-timeline-title-row">
                    <span className="tripsage-timeline-title">{item.label}</span>
                    {itemPreview && (
                      <button
                        type="button"
                        className="tripsage-preview-btn"
                        aria-label={`Xem nhanh ${item.label}`}
                        onClick={event => setPreview({ target: itemPreview, trigger: event.currentTarget })}
                      >
                        <Eye size={12} aria-hidden="true" />
                        <span>Xem nhanh</span>
                      </button>
                    )}
                  </div>
                  {item.description && <p className="tripsage-timeline-desc">{item.description}</p>}
                  {item.kind === "LUNCH" && onRequestMeals && !(bySlot.get(item.slotId) ?? []).some(suggestion => suggestion.kind === "MEAL") && (
                    <button type="button" className="tripsage-preview-btn" onClick={() => onRequestMeals(activeDay.day)}>
                      <UtensilsCrossed size={12} aria-hidden="true" />
                      <span>Gợi ý quán ăn trưa</span>
                    </button>
                  )}
                  {(() => {
                    const nearby = (bySlot.get(item.slotId) ?? []).filter(isNearbyActivity);
                    if (!nearby.length) return null;
                    return (
                      <div className="tripsage-nearby">
                        <strong>{item.kind === "OVERNIGHT" ? "Buổi tối quanh chỗ nghỉ" : "Gần đây có thể ghé"}</strong>
                        <span className="tripsage-nearby-note"> · gợi ý từ Google Maps, chưa kiểm tra</span>
                        <ul>
                          {nearby.map(suggestion => {
                            const target = suggestionPreviewTarget(suggestion);
                            return (
                              <li key={suggestion.place!.placeId ?? suggestion.title}>
                                <span>{suggestion.title}</span>
                                <span className="tripsage-suggestion-meta"> · cách khoảng {suggestion.place!.distanceKm} km</span>
                                {target && (
                                  <button type="button" className="tripsage-preview-btn" aria-label={`Xem nhanh ${target.name}`} onClick={event => setPreview({ target, trigger: event.currentTarget })}>
                                    <Eye size={12} aria-hidden="true" /><span>Xem nhanh</span>
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}
                  {(bySlot.get(item.slotId) ?? []).filter(suggestion => !isNearbyActivity(suggestion)).map((suggestion, index) => {
                    const sPreview = suggestionPreviewTarget(suggestion);
                    const nightIndex = nightIndexFromSlotId(suggestion.slotId);
                    const canChoose = nightIndex !== null && isEligibleLodgingSuggestion(suggestion, nightIndex);
                    const lodgingPlaceId = canChoose ? suggestion.place!.placeId! : null;
                    const lodgingName = suggestion.place?.name || suggestion.title;
                    const isChosen = nightIndex !== null && lodgingPlaceId !== null && chosenLodgings?.[nightIndex]?.placeId === lodgingPlaceId;
                    return (
                      <div key={index} className={`tripsage-suggestion${isChosen ? " is-chosen-lodging" : ""}`}>
                        {SUGGESTION_ICON[suggestion.kind]}
                        <strong>{SUGGESTION_LABEL[suggestion.kind]}:</strong> {suggestion.title}
                        {suggestion.place && (
                          <span className="tripsage-suggestion-meta">
                            {formatSuggestionPlaceMeta(suggestion.title, suggestion.place)}
                          </span>
                        )}
                        {suggestion.detail && !SOURCE_ONLY_DETAIL.test(suggestion.detail) && <span className="tripsage-suggestion-detail"> — {suggestion.detail}</span>}
                        {sPreview && (
                          <button
                            type="button"
                            className="tripsage-preview-btn"
                            aria-label={`Xem nhanh ${sPreview.name}`}
                            onClick={event =>
                              setPreview({
                                target: sPreview,
                                trigger: event.currentTarget,
                                ...(canChoose && lodgingPlaceId
                                  ? { lodgingChoice: { nightIndex, placeId: lodgingPlaceId, placeName: lodgingName } }
                                  : {}),
                              })
                            }
                          >
                            <Eye size={12} aria-hidden="true" />
                            <span>Xem nhanh</span>
                          </button>
                        )}
                        {canChoose && lodgingPlaceId && onToggleChosenLodging && (
                          <ChosenLodgingButton
                            nightIndex={nightIndex}
                            placeName={lodgingName}
                            selected={isChosen}
                            onClick={() => onToggleChosenLodging(nightIndex, lodgingPlaceId)}
                          />
                        )}
                        {isChosen && (
                          <span className="tripsage-chosen-badge">
                            Đã chọn cho đêm {nightIndex} · Không phải đặt phòng
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {suggestions.length > 0 && (
        <p className="assistant-muted tripsage-timeline-footnote">
          Chỗ nghỉ, ăn uống và vui chơi là gợi ý từ Google Maps, ứng dụng chưa kiểm tra và không đặt chỗ. Giờ giấc do hệ thống lập lịch và kiểm tra.
        </p>
      )}
      <PlacePreviewModal
        target={preview?.target ?? null}
        returnFocusTo={preview?.trigger ?? null}
        onClose={() => setPreview(null)}
        footerAction={
          preview?.lodgingChoice && onToggleChosenLodging ? (
            <ChosenLodgingButton
              nightIndex={preview.lodgingChoice.nightIndex}
              placeName={preview.lodgingChoice.placeName}
              selected={chosenLodgings?.[preview.lodgingChoice.nightIndex]?.placeId === preview.lodgingChoice.placeId}
              onClick={() => onToggleChosenLodging(preview.lodgingChoice!.nightIndex, preview.lodgingChoice!.placeId)}
            />
          ) : null
        }
      />
    </section>
  );
}
