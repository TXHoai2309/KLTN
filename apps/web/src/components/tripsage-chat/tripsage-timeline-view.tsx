"use client";

import { BedDouble, Car, Check, Clock, Eye, Flag, Home, Lightbulb, MapPin, Moon, Sparkles, UtensilsCrossed } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import { mealPin } from "@/modules/trip-save/trip-pin-builders";
import { PinButton, type PinControl } from "./tripsage-pin-button";
import { TripsageAccessLegCard } from "./tripsage-access-leg-card";
import type { AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";

// Travel days to and from the meeting hub sit as their own tabs around the Hà Giang days.
const OUTBOUND_TAB = 0, RETURN_TAB = -1;
const shiftDate = (iso: string | null | undefined, days: number) => {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const shortDate = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
import { canPreviewPlace, type PlacePreviewTarget } from "@/lib/place-preview-url";
import { cleanPlaceDisplayName, cleanTravelerDisplay } from "@/lib/traveler-display-clean";
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
  const displayName = cleanPlaceDisplayName(item.label) || item.label;
  if (item.placeId) {
    const candidate: PlacePreviewTarget = { kind: "GOOGLE_PLACE", name: displayName, placeId: item.placeId };
    return canPreviewPlace(candidate) ? candidate : null;
  }
  if (typeof item.latitude === "number" && typeof item.longitude === "number") {
    const candidate: PlacePreviewTarget = {
      kind: "CATALOG",
      name: displayName,
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
  const rawName = suggestion.place?.name || suggestion.title;
  const candidate: PlacePreviewTarget = {
    kind: "GOOGLE_PLACE",
    name: cleanPlaceDisplayName(rawName) || rawName,
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
  pins,
  accessLeg,
  travel,
  onAskAccess,
}: {
  timeline: TimelinePart;
  suggestions: readonly TimelineSuggestion[];
  initialDay?: number;
  chosenLodgings?: ChosenLodgingMap;
  onToggleChosenLodging?: (nightIndex: number, placeId: string) => void;
  /** Asks the assistant for lunch places on that day; the button shows only on a lunch row without meal suggestions. */
  onRequestMeals?: (day: number) => void;
  /** ADR-47: when set, each meal suggestion offers "Ghim vào chuyến đi". */
  pins?: PinControl;
  /** The way from home to the meeting hub and back, shown as "Ngày đi" / "Ngày về" tabs. */
  accessLeg?: AccessLegPart | null;
  /** Home city and hub when the trip starts far from home but the way there is not planned yet: the tabs still show. */
  travel?: { homeCity: string; hubName: string } | null;
  onAskAccess?: () => void;
}) {
  const [selectedDay, setSelectedDay] = useState(initialDay ?? timeline.days[0]?.day ?? 1);
  const [preview, setPreview] = useState<{
    target: PlacePreviewTarget;
    trigger: HTMLElement | null;
    lodgingChoice?: { nightIndex: number; placeId: string; placeName: string };
  } | null>(null);
  const firstDate = timeline.days[0]?.date ?? null, lastDate = timeline.days.at(-1)?.date ?? null;
  const hasTravel = Boolean(accessLeg || travel);
  const tabs = [
    ...(hasTravel ? [{ key: OUTBOUND_TAB, label: "Ngày đi", date: shiftDate(firstDate, -1) }] : []),
    ...timeline.days.map(day => ({ key: day.day, label: `Ngày ${day.day}`, date: day.date ?? null })),
    ...(hasTravel ? [{ key: RETURN_TAB, label: "Ngày về", date: shiftDate(lastDate, 1) }] : []),
  ];
  const travelTab = hasTravel && (selectedDay === OUTBOUND_TAB || selectedDay === RETURN_TAB) ? selectedDay : null;
  const activeDay = timeline.days.find(day => day.day === selectedDay) ?? timeline.days[0];
  if (!activeDay) return null;
  const activeKey = travelTab !== null ? travelTab : activeDay.day;

  const bySlot = new Map<string, TimelineSuggestion[]>();
  for (const suggestion of suggestions) bySlot.set(suggestion.slotId, [...(bySlot.get(suggestion.slotId) ?? []), suggestion]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setSelectedDay(tabs[next]!.key);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }

  return (
    <section className="tripsage-timeline" aria-label="Timeline từng ngày">
      <div className="tripsage-day-tabs" role="tablist" aria-label="Chọn ngày trong lịch trình">
        {tabs.map((tab, index) => {
          const active = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              id={`tripsage-day-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tripsage-day-panel-${tab.key}`}
              tabIndex={active ? 0 : -1}
              className={`tripsage-day-tab${active ? " is-active" : ""}`}
              onClick={() => setSelectedDay(tab.key)}
              onKeyDown={event => onTabKeyDown(event, index)}
            >
              <span>{tab.label}</span>
              {tab.date && <small>{shortDate(tab.date)}</small>}
            </button>
          );
        })}
      </div>

      {travelTab !== null && !accessLeg && travel && (
        <div id={`tripsage-day-panel-${travelTab}`} role="tabpanel" aria-labelledby={`tripsage-day-tab-${travelTab}`} className="tripsage-timeline-day">
          <h4 className="tripsage-timeline-heading">{travelTab === OUTBOUND_TAB ? `Ngày đi · ${travel.homeCity} → ${travel.hubName}` : `Ngày về · ${travel.hubName} → ${travel.homeCity}`}</h4>
          <p className="assistant-muted">Chưa chọn cách đi giữa {travel.homeCity} và {travel.hubName}. Trợ lý có thể so sánh máy bay, tàu hỏa và xe khách cho cả đoàn (giá tham khảo, ứng dụng không đặt vé).</p>
          {onAskAccess && <button type="button" className="tripsage-preview-btn" onClick={onAskAccess}>So sánh cách đi</button>}
        </div>
      )}
      {travelTab !== null && accessLeg && (
        <div id={`tripsage-day-panel-${travelTab}`} role="tabpanel" aria-labelledby={`tripsage-day-tab-${travelTab}`} className="tripsage-timeline-day">
          <h4 className="tripsage-timeline-heading">
            {travelTab === OUTBOUND_TAB ? `Ngày đi · ${accessLeg.homeCity} → ${accessLeg.hubName}` : `Ngày về · ${accessLeg.hubName} → ${accessLeg.homeCity}`}
            {tabs.find(tab => tab.key === travelTab)?.date ? ` · ${tabs.find(tab => tab.key === travelTab)!.date!.split("-").reverse().join("/")}` : ""}
          </h4>
          <TripsageAccessLegCard leg={accessLeg} only={travelTab === OUTBOUND_TAB ? "outbound" : "return"} />
          <p className="assistant-muted text-xs">Tổng tham khảo cả nhóm {accessLeg.travelers} người (đi và về): {accessLeg.totalVnd > 0 ? `${accessLeg.totalVnd.toLocaleString("vi-VN")}đ` : "chưa có giá"}. Ước tính, ứng dụng không đặt vé.</p>
        </div>
      )}
      {travelTab === null && (

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
          {[...activeDay.items]
            .map((item, originalIndex) => ({
              item,
              originalIndex,
              sortKey:
                item.startMinute !== null
                  ? item.startMinute
                  : item.kind === "DRIVE" && item.endMinute !== null
                    ? item.endMinute - 0.5
                    : item.kind === "OVERNIGHT"
                      ? Number.POSITIVE_INFINITY
                      : Number.POSITIVE_INFINITY - 1,
            }))
            .sort((a, b) => (a.sortKey !== b.sortKey ? a.sortKey - b.sortKey : a.originalIndex - b.originalIndex))
            .map(({ item }) => {
            const itemPreview = timelineItemPreviewTarget(item);
            const cleanItemLabel = cleanPlaceDisplayName(item.label) || item.label;
            const cleanItemDesc = cleanTravelerDisplay(item.description);
            return (
              <li key={item.slotId} className={`tripsage-timeline-item tripsage-timeline-${item.kind.toLowerCase()}`}>
                <span className="tripsage-timeline-time">{time(item)}</span>
                <span className="tripsage-timeline-rail" aria-hidden="true">
                  <span className="tripsage-timeline-dot">{ITEM_ICON[item.kind]}</span>
                  <span className="tripsage-timeline-line" />
                </span>
                <div className="tripsage-timeline-body">
                  <div className="tripsage-timeline-title-row">
                    <span className="tripsage-timeline-title">{cleanItemLabel}</span>
                    {itemPreview && (
                      <button
                        type="button"
                        className="tripsage-preview-btn"
                        aria-label={`Xem nhanh ${cleanItemLabel}`}
                        onClick={event => setPreview({ target: itemPreview, trigger: event.currentTarget })}
                      >
                        <Eye size={12} aria-hidden="true" />
                        <span>Xem nhanh</span>
                      </button>
                    )}
                  </div>
                  {cleanItemDesc && <p className="tripsage-timeline-desc">{cleanItemDesc}</p>}
                  {item.kind === "LUNCH" && onRequestMeals && !(bySlot.get(item.slotId) ?? []).some(suggestion => suggestion.kind === "MEAL") && (
                    <button type="button" className="tripsage-preview-btn" onClick={() => onRequestMeals(activeDay.day)}>
                      <UtensilsCrossed size={12} aria-hidden="true" />
                      <span>Gợi ý quán ăn trưa</span>
                    </button>
                  )}
                  {(() => {
                    const nearby = (bySlot.get(item.slotId) ?? []).filter(isNearbyActivity);
                    if (item.kind === "OVERNIGHT") {
                      return (
                        <div className="tripsage-nearby" data-testid={`evening-plan-day-${activeDay.day}`}>
                          <strong>Tối nay</strong>
                          <span className="tripsage-nearby-note"> · gợi ý từ Google Maps, chưa kiểm tra</span>
                          {nearby.length > 0 ? (
                            <ul>
                              {nearby.slice(0, 3).map(suggestion => {
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
                          ) : (
                            <p className="assistant-muted text-xs">Chưa tìm được gợi ý buổi tối</p>
                          )}
                        </div>
                      );
                    }
                    if (!nearby.length) return null;
                    return (
                      <div className="tripsage-nearby">
                        <strong>{item.kind === "FREE_TIME" ? "Chiều rảnh, có thể ghé" : "Gần đây có thể ghé"}</strong>
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
                        {suggestion.kind === "MEAL" && <PinButton item={mealPin(suggestion)} control={pins} label={suggestion.title} />}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      )}
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
