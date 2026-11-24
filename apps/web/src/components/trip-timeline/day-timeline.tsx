"use client";

import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  BedDouble,
  CarFront,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  Eye,
  Info,
  MapPin,
  Moon,
  UtensilsCrossed,
} from "lucide-react";
import { buildDaySuggestionMarkers, type TimelineSuggestionMarker } from "./suggestion-markers";

import { travelerDayColorVar } from "@/components/traveler-ui/traveler-day-tabs";
import { getDestinationVisual } from "@/lib/destination-visuals";
import { canPreviewPlace, type PlacePreviewTarget } from "@/lib/place-preview-url";
import {
  cleanAreaDisplayLabel,
  cleanPlaceDisplayName,
  cleanTravelerDisplay,
} from "@/lib/traveler-display-clean";
import { formatDistanceKm } from "@/lib/traveler-number-format";

export type DayTimelineVariant = "full" | "compact";

export interface DayTimelineNearbyItem {
  key: string;
  name: string;
  distanceKm?: number | null;
  tag?: string;
  detail?: string;
  previewTarget?: PlacePreviewTarget | null;
  actionSlot?: ReactNode;
}

export interface DayTimelineLunch {
  fromMinute: number;
  toMinute: number;
  durationMinutes?: number;
  suggestions?: readonly DayTimelineNearbyItem[];
  onRequestMeals?: () => void;
}

export interface DayTimelineStop {
  id: string;
  destinationId: string;
  order: number;
  name: string;
  area?: string | null;
  startMinute: number | null;
  durationMinutes: number | null;
  image?: { url: string; alt: string } | null;
  fallbackVisual?: { src: string; alt: string };
  href?: string | null;
  external?: boolean;
  unavailable?: boolean;
  description?: string | null;
  preferenceBadges?: readonly string[];
  weatherSlot?: ReactNode;
  previewTarget?: PlacePreviewTarget | null;
  nearbyAfter?: readonly DayTimelineNearbyItem[];
  lunchAfter?: DayTimelineLunch | null;
}

export interface DayTimelineChosenLodging {
  nightIndex: number;
  name: string;
  placeId?: string;
  previewTarget?: PlacePreviewTarget | null;
}

export interface DayTimelineEveningPlan {
  nightIndex: number;
  overnightArea: string;
  chosenLodging?: { name: string; previewTarget?: PlacePreviewTarget | null } | null;
  lodgingSuggestions?: readonly {
    key: string;
    name: string;
    distanceKm?: number | null;
    chosen?: boolean;
    onChoose?: () => void;
    previewTarget?: PlacePreviewTarget | null;
  }[];
  eveningPlaces: readonly DayTimelineNearbyItem[];
}

export interface DayTimelineDay {
  dayIndex: number;
  localDate?: string | null;
  transportLabel?: string;
  sunSlot?: ReactNode;
  departureCard?: ReactNode;
  breakfast?: { minute: number; durationMinutes: number; text: string } | null;
  stops: readonly DayTimelineStop[];
  returnCard?: ReactNode;
  nightRest?: { startMinute: number | null; text: string } | null;
  chosenLodging?: DayTimelineChosenLodging | null;
  nearbySuggestions?: readonly DayTimelineNearbyItem[];
  freeTimeSuggestions?: readonly DayTimelineNearbyItem[];
  estimatedCheckinTravelMinutes?: number | null;
  eveningPlan?: DayTimelineEveningPlan | null;
  emptyMessage?: string;
}

const minuteLabel = (minute: number | null) =>
  minute === null
    ? "--:--"
    : `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

const dateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

function StopPhoto({
  image,
  fallback,
}: {
  image?: { url: string; alt: string } | null;
  fallback: { src: string; alt: string };
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const usable = image && image.url !== failedUrl;
  return (
    <img
      src={usable ? image.url : fallback.src}
      alt={usable ? image.alt : fallback.alt}
      className="dt-visit-photo"
      loading="lazy"
      onError={() => {
        if (usable) setFailedUrl(image.url);
      }}
    />
  );
}

function InfoBadge({ label }: { label: string }) {
  return (
    <span
      role="img"
      tabIndex={0}
      className="dt-info-badge"
      title={label}
      aria-label={label}
    >
      <Info size={14} aria-hidden="true" />
    </span>
  );
}

function PreviewLink({
  target,
  name,
  onPreview,
  iconOnly = false,
}: {
  target?: PlacePreviewTarget | null;
  name: string;
  onPreview?: (target: PlacePreviewTarget, trigger: HTMLElement) => void;
  iconOnly?: boolean;
}) {
  if (!target || !onPreview || !canPreviewPlace(target)) return null;
  return (
    <button
      type="button"
      className={iconOnly ? "tripsage-preview-btn tv-preview-icon-btn" : "tripsage-preview-btn tv-quick-link"}
      aria-label={`Xem nhanh ${name}`}
      title={iconOnly ? `Xem nhanh ${name}` : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onPreview(target, event.currentTarget);
      }}
    >
      <Eye size={iconOnly ? 16 : 13} aria-hidden="true" />
      {!iconOnly && <span>Xem nhanh</span>}
    </button>
  );
}

function StopNearbyRow({
  items,
  stopName,
  onPreview,
}: {
  items: readonly DayTimelineNearbyItem[];
  stopName: string;
  onPreview?: (target: PlacePreviewTarget, trigger: HTMLElement) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const first = items[0]!;
  const rest = items.slice(1);
  const firstName = cleanPlaceDisplayName(first.name);

  return (
    <div
      className="dt-stop-nearby"
      aria-label={`Gần đây có thể ghé quanh ${stopName}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="dt-stop-nearby-row">
        <span className="dt-stop-nearby-label">Gần đây:</span>
        <span className="dt-suggestion-name">{firstName}</span>
        {first.distanceKm != null && (
          <span className="dt-suggestion-dist">
            · {formatDistanceKm(first.distanceKm)}
          </span>
        )}
        <PreviewLink
          target={first.previewTarget}
          name={firstName}
          onPreview={onPreview}
          iconOnly
        />
        {first.actionSlot}
        <InfoBadge label="Gợi ý, chưa kiểm tra" />
        {rest.length > 0 && (
          <button
            type="button"
            className="dt-nearby-more-btn"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          >
            {expanded ? "Thu gọn" : `+${rest.length}`}
          </button>
        )}
      </div>

      {expanded && rest.length > 0 && (
        <ul className="dt-suggestion-list dt-stop-nearby-extra">
          {rest.map((item) => {
            const itemName = cleanPlaceDisplayName(item.name);
            return (
              <li key={item.key}>
                <span className="dt-suggestion-name">{itemName}</span>
                {item.distanceKm != null && (
                  <span className="dt-suggestion-dist">
                    · {formatDistanceKm(item.distanceKm)}
                  </span>
                )}
                <PreviewLink
                  target={item.previewTarget}
                  name={itemName}
                  onPreview={onPreview}
                  iconOnly
                />
                {item.actionSlot}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SuggestionMarkerItem({
  marker,
  dayIndex,
  isDashedToNext,
  onPreview,
}: {
  marker: TimelineSuggestionMarker;
  dayIndex: number;
  isDashedToNext: boolean;
  onPreview?: (target: PlacePreviewTarget, trigger: HTMLElement) => void;
}) {
  const Icon =
    marker.kind === "CHECKIN"
      ? BedDouble
      : marker.kind === "DINNER"
        ? UtensilsCrossed
        : Compass;
  const testId =
    marker.kind === "CHECKIN"
      ? `evening-plan-day-${dayIndex}`
      : marker.kind === "DINNER"
        ? `evening-dinner-day-${dayIndex}`
        : `free-time-day-${dayIndex}`;

  return (
    <li
      className={`dt-suggestion-marker${isDashedToNext ? " dt-rail-to-suggestion" : ""}`}
      data-marker-kind={marker.kind}
      data-testid={testId}
      aria-label={marker.title}
    >
      <span className="dt-timeline-node dt-timeline-node--suggestion" aria-hidden="true" />
      <div className={`dt-visit-time${marker.timeText ? "" : " dt-marker-time--empty"}`}>
        {marker.timeText ? <strong>{marker.timeText}</strong> : null}
      </div>

      <div className="dt-marker-body" role="note">
        <div className="dt-marker-head">
          <span className="dt-marker-title">
            <Icon size={14} aria-hidden="true" />
            <span>{marker.title}</span>
          </span>
          <span className="dt-marker-badge">{marker.badgeText}</span>
          <InfoBadge label={marker.infoTooltip} />
        </div>

        {marker.kind === "FREE_TIME" && marker.freeItems && marker.freeItems.length > 0 && (
          <ul className="dt-suggestion-list">
            {marker.freeItems.map((item) => {
              const itemName = cleanPlaceDisplayName(item.name);
              return (
                <li key={item.key}>
                  <span className="dt-suggestion-name">{itemName}</span>
                  {item.distanceKm != null && (
                    <span className="dt-suggestion-dist">
                      {formatDistanceKm(item.distanceKm)}
                    </span>
                  )}
                  <PreviewLink target={item.previewTarget} name={itemName} onPreview={onPreview} iconOnly />
                  {item.actionSlot}
                </li>
              );
            })}
          </ul>
        )}

        {marker.kind === "CHECKIN" &&
          (marker.chosenLodging ? (
            <div className="dt-evening-lodging">
              <span>
                Chỗ nghỉ đã chọn (Đêm {marker.chosenLodging.nightIndex}):{" "}
                <strong className="dt-suggestion-name">{marker.chosenLodging.name}</strong>
              </span>
              <PreviewLink
                target={marker.chosenLodging.previewTarget}
                name={marker.chosenLodging.name}
                onPreview={onPreview}
                iconOnly
              />
            </div>
          ) : marker.lodgingSuggestions && marker.lodgingSuggestions.length > 0 ? (
            <div className="dt-evening-lodging-list">
              <span className="dt-suggestion-subhead">Gợi ý chỗ nghỉ:</span>
              <ul className="dt-suggestion-list">
                {marker.lodgingSuggestions.map((item) => {
                  const itemName = cleanPlaceDisplayName(item.name);
                  return (
                    <li key={item.key}>
                      <span className="dt-suggestion-name">{itemName}</span>
                      {item.distanceKm != null && (
                        <span className="dt-suggestion-dist">
                          {formatDistanceKm(item.distanceKm)}
                        </span>
                      )}
                      <PreviewLink target={item.previewTarget} name={itemName} onPreview={onPreview} iconOnly />
                      {item.onChoose && (
                        <button
                          type="button"
                          className={`tv-btn tv-btn--sm ${item.chosen ? "tv-btn--primary" : "tv-btn--secondary"}`}
                          onClick={item.onChoose}
                        >
                          {item.chosen ? "Đã chọn" : "Chọn"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="dt-suggestion-empty">Chưa chọn chỗ nghỉ</p>
          ))}

        {marker.kind === "DINNER" &&
          (marker.eveningPlaces && marker.eveningPlaces.length > 0 ? (
            <ul className="dt-suggestion-list">
              {marker.eveningPlaces.map((place) => {
                const placeName = cleanPlaceDisplayName(place.name);
                return (
                  <li key={place.key}>
                    <span className="dt-suggestion-name">{placeName}</span>
                    {place.distanceKm != null && (
                      <span className="dt-suggestion-dist">
                        {formatDistanceKm(place.distanceKm)}
                      </span>
                    )}
                    <PreviewLink target={place.previewTarget} name={placeName} onPreview={onPreview} iconOnly />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dt-suggestion-empty">
              {marker.dinnerEmptyText ?? "Chưa tìm được gợi ý buổi tối"}
            </p>
          ))}
      </div>
    </li>
  );
}

/**
 * Shared day timeline component (PARITY US 6-10, design §3.3).
 * Used by trip detail (`full`), shared companion group (`full`), desktop assistant panel (`full`),
 * and narrow chat/mobile views (`compact`).
 */
export function DayTimeline({
  day,
  variant = "full",
  dimmed = false,
  selectedDestinationId = null,
  onSelectDestination,
  onPreview,
  headingId,
  className,
}: {
  day: DayTimelineDay;
  variant?: DayTimelineVariant;
  dimmed?: boolean;
  selectedDestinationId?: string | null;
  onSelectDestination?: (destinationId: string) => void;
  onPreview?: (target: PlacePreviewTarget, trigger: HTMLElement) => void;
  headingId?: string;
  className?: string;
}) {
  const dayId = headingId ?? `trip-day-${day.dayIndex}`;
  const dayColorStyle = { "--tv-day-color": `var(${travelerDayColorVar(day.dayIndex)})` } as CSSProperties;

  // Sort stops stably by startMinute ascending (nulls last) so displayed items are always chronological.
  const orderedStops = [...day.stops]
    .map((stop, originalIndex) => ({ stop, originalIndex }))
    .sort((a, b) => {
      const aMin = a.stop.startMinute ?? Number.POSITIVE_INFINITY;
      const bMin = b.stop.startMinute ?? Number.POSITIVE_INFINITY;
      if (aMin !== bMin) return aMin - bMin;
      return a.originalIndex - b.originalIndex;
    })
    .map((entry) => entry.stop);

  // Collect any non-overlapping lunch breaks and place each strictly between its chronological neighbors.
  const lunchAfterIndex = new Map<number, DayTimelineLunch>();
  for (const stop of orderedStops) {
    const lunch = stop.lunchAfter;
    if (!lunch) continue;
    const overlapsAnyStop = orderedStops.some((s) => {
      if (s.startMinute === null || s.durationMinutes === null) return false;
      const sEnd = s.startMinute + s.durationMinutes;
      return lunch.fromMinute < sEnd && lunch.toMinute > s.startMinute;
    });
    if (overlapsAnyStop) continue;
    // Place after the last stop ending on or before lunch.fromMinute (strictly chronological).
    let targetIndex = -1;
    for (let i = 0; i < orderedStops.length; i++) {
      const s = orderedStops[i]!;
      const sEnd = s.startMinute !== null && s.durationMinutes !== null ? s.startMinute + s.durationMinutes : s.startMinute;
      if (sEnd !== null && sEnd <= lunch.fromMinute) {
        targetIndex = i;
      }
    }
    if (targetIndex >= 0 && !lunchAfterIndex.has(targetIndex)) {
      lunchAfterIndex.set(targetIndex, lunch);
    }
  }

  const suggestionMarkers = buildDaySuggestionMarkers({
    dayIndex: day.dayIndex,
    orderedStops,
    freeTimeSuggestions: day.freeTimeSuggestions,
    nearbySuggestions: day.nearbySuggestions,
    eveningPlan: day.eveningPlan,
    chosenLodging: day.chosenLodging,
    estimatedCheckinTravelMinutes: day.estimatedCheckinTravelMinutes,
  });

  const headingRailToSuggestion =
    orderedStops.length === 0 && !day.departureCard && suggestionMarkers.length > 0;

  return (
    <section
      className={["dt-day", `dt-day--${variant}`, dimmed ? "dt-day--dimmed my-trips-day-dimmed" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      data-variant={variant}
      data-day={day.dayIndex}
      style={dayColorStyle}
      aria-labelledby={dayId}
    >
      <div className={`dt-day-heading${headingRailToSuggestion ? " dt-rail-to-suggestion" : ""}`}>
        <span className="dt-timeline-node my-trips-timeline-node" aria-hidden="true" />
        <div className="dt-day-title-wrap">
          <div className="dt-day-number-tag">Ngày {day.dayIndex}</div>
          <div className="dt-day-title-inner">
            <h2 id={dayId}>Ngày {day.dayIndex}</h2>
            {day.localDate && (
              <p>
                {new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(
                  new Date(`${day.localDate}T00:00:00Z`),
                )}
                , {dateLabel(day.localDate)}
              </p>
            )}
            {day.sunSlot}
          </div>
        </div>

        {(day.transportLabel || day.stops.length > 0) && (
          <div className="dt-day-meta">
            {day.transportLabel && (
              <span>
                <CarFront size={15} aria-hidden="true" />
                Di chuyển bằng {day.transportLabel.toLocaleLowerCase("vi")}
              </span>
            )}
            <span>
              <MapPin size={15} aria-hidden="true" />
              {day.stops.length} điểm dừng
            </span>
          </div>
        )}
      </div>

      {day.stops.length === 0 && !day.departureCard && !day.returnCard && (
        <div className="dt-day-empty">
          <p>{day.emptyMessage ?? "Ngày này chưa có điểm dừng."}</p>
        </div>
      )}
      {(day.stops.length > 0 || Boolean(day.departureCard) || Boolean(day.returnCard) || suggestionMarkers.length > 0) && (
        <ol className="dt-visits">
          {day.departureCard}
          {orderedStops.map((stop, index) => {
            const cleanName = cleanPlaceDisplayName(stop.name) || stop.name;
            const cleanArea = cleanAreaDisplayLabel(stop.area);
            const cleanDescription = cleanTravelerDisplay(stop.description);
            const fallback = stop.fallbackVisual ?? getDestinationVisual(cleanName, cleanArea ?? undefined);
            const isSelected = selectedDestinationId === stop.destinationId;
            const endMinute =
              stop.startMinute !== null && stop.durationMinutes !== null
                ? stop.startMinute + stop.durationMinutes
                : null;
            const resolvedLunch = lunchAfterIndex.get(index) ?? null;

            return (
              <Fragment key={stop.id}>
                {index === 0 && day.breakfast && (
                  <li className="dt-break-item">
                    <span aria-hidden="true" />
                    <div className="dt-visit-time">
                      <strong>{minuteLabel(day.breakfast.minute)}</strong>
                      <span>{day.breakfast.durationMinutes} phút</span>
                    </div>
                    <p className="planner-break dt-break-line">
                      <Coffee size={13} aria-hidden="true" />
                      <strong>Ăn sáng</strong> {day.breakfast.text}
                    </p>
                  </li>
                )}

                <li
                  id={`trip-visit-${stop.destinationId}`}
                  className={`dt-visit-item${isSelected ? " is-selected-item" : ""}${
                    index === orderedStops.length - 1 &&
                    !resolvedLunch &&
                    suggestionMarkers.length > 0
                      ? " dt-rail-to-suggestion"
                      : ""
                  }`}
                  onClick={onSelectDestination ? () => onSelectDestination(stop.destinationId) : undefined}
                >
                  <span className="dt-timeline-node my-trips-timeline-node" aria-hidden="true" />
                  <div className="dt-visit-time">
                    <strong>{minuteLabel(stop.startMinute)}</strong>
                    {stop.durationMinutes !== null && <span>{stop.durationMinutes} phút</span>}
                  </div>

                  <div className="dt-visit-main-col">
                    <article className={`dt-visit-card${isSelected ? " is-active-selection" : ""}`}>
                    <div className="dt-visit-media" role="img" aria-label={cleanName}>
                      <StopPhoto image={stop.image} fallback={fallback} />
                      <div className="dt-visit-photo-gradient" aria-hidden="true" />
                      <span className="dt-visit-seq-tag">#{stop.order}</span>
                    </div>

                    <div className="dt-visit-body">
                      <div className="dt-visit-top">
                        <span className="dt-order-label">
                          Điểm dừng {stop.order}
                          {stop.external ? " · ngoài danh mục (chưa kiểm)" : ""}
                        </span>
                        {stop.preferenceBadges?.map((badge) => (
                          <span key={badge} className="dt-pref-badge">
                            {badge}
                          </span>
                        ))}
                        <PreviewLink target={stop.previewTarget} name={cleanName} onPreview={onPreview} />
                      </div>

                      <h3 className="dt-destination-title">
                        {stop.href && !stop.unavailable && !stop.external ? (
                          <Link
                            href={stop.href as Route}
                            className="dt-destination-link"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span>{cleanName}</span>
                            <ChevronRight size={15} className="dt-chevron" aria-hidden="true" />
                          </Link>
                        ) : (
                          cleanName
                        )}
                      </h3>

                      <div className="dt-visit-meta">
                        {cleanArea && (
                          <p className="dt-visit-meta-item">
                            <MapPin size={14} aria-hidden="true" />
                            <span>{cleanArea}</span>
                          </p>
                        )}
                        {stop.startMinute !== null && stop.durationMinutes !== null && (
                          <p className="dt-visit-meta-item">
                            <Clock3 size={14} aria-hidden="true" />
                            <span>
                              {minuteLabel(stop.startMinute)} – {minuteLabel(endMinute)} ({stop.durationMinutes} phút)
                            </span>
                          </p>
                        )}
                      </div>

                      {cleanDescription && (
                        <div className="dt-visit-desc-wrap">
                          <p className="dt-visit-desc">{cleanDescription}</p>
                          {cleanDescription.length > (variant === "compact" ? 90 : 140) &&
                            (stop.previewTarget && onPreview && canPreviewPlace(stop.previewTarget) ? (
                              <button
                                type="button"
                                className="dt-visit-more-link"
                                aria-label={`Xem thêm về ${cleanName}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onPreview(stop.previewTarget!, event.currentTarget);
                                }}
                              >
                                Xem thêm
                              </button>
                            ) : stop.href && !stop.unavailable && !stop.external ? (
                              <Link
                                href={stop.href as Route}
                                className="dt-visit-more-link"
                                onClick={(event) => event.stopPropagation()}
                              >
                                Xem thêm
                              </Link>
                            ) : null)}
                        </div>
                      )}
                      {stop.weatherSlot}

                      {stop.unavailable && (
                        <p className="dt-unavailable">Điểm đến không còn khả dụng công khai</p>
                      )}
                    </div>
                  </article>

                    {stop.nearbyAfter && stop.nearbyAfter.length > 0 && (
                      <StopNearbyRow
                        items={stop.nearbyAfter}
                        stopName={cleanName}
                        onPreview={onPreview}
                      />
                    )}
                  </div>
                </li>

                {resolvedLunch && (
                  <li
                    className={`dt-break-item${
                      index === orderedStops.length - 1 && suggestionMarkers.length > 0
                        ? " dt-rail-to-suggestion"
                        : ""
                    }`}
                  >
                    <span aria-hidden="true" />
                    <div className="dt-visit-time">
                      <strong>{minuteLabel(resolvedLunch.fromMinute)}</strong>
                      <span>{resolvedLunch.durationMinutes ?? (resolvedLunch.toMinute - resolvedLunch.fromMinute)} phút</span>
                    </div>
                    <div className="dt-lunch-wrap">
                      <p className="planner-break dt-break-line">
                        <UtensilsCrossed size={13} aria-hidden="true" />
                        <strong>Nghỉ trưa</strong> {minuteLabel(resolvedLunch.fromMinute)} –{" "}
                        {minuteLabel(resolvedLunch.toMinute)}
                        {resolvedLunch.onRequestMeals && (
                          <button
                            type="button"
                            className="tv-quick-link dt-lunch-req"
                            onClick={resolvedLunch.onRequestMeals}
                          >
                            Tìm quán ăn trưa
                          </button>
                        )}
                      </p>
                      {resolvedLunch.suggestions && resolvedLunch.suggestions.length > 0 && (
                        <div className="dt-suggestion-box">
                          <ul className="dt-suggestion-list">
                            {resolvedLunch.suggestions.map((meal) => (
                              <li key={meal.key}>
                                <span className="dt-suggestion-name">{cleanPlaceDisplayName(meal.name)}</span>
                                {meal.detail && <span className="dt-suggestion-dist">{cleanTravelerDisplay(meal.detail)}</span>}
                                {meal.distanceKm != null && (
                                  <span className="dt-suggestion-dist">
                                    {formatDistanceKm(meal.distanceKm)}
                                  </span>
                                )}
                                <PreviewLink
                                  target={meal.previewTarget}
                                  name={cleanPlaceDisplayName(meal.name)}
                                  onPreview={onPreview}
                                  iconOnly
                                />
                                {meal.actionSlot}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </li>
                )}
              </Fragment>
            );
          })}

          {suggestionMarkers.map((marker, markerIdx) => {
            const nextMarker = suggestionMarkers[markerIdx + 1];
            const isDashedToNext = nextMarker !== undefined;
            return (
              <SuggestionMarkerItem
                key={marker.id}
                marker={marker}
                dayIndex={day.dayIndex}
                isDashedToNext={isDashedToNext}
                onPreview={onPreview}
              />
            );
          })}

          {day.nightRest && !day.chosenLodging && !day.eveningPlan && (
            <li className="dt-break-item">
              <span aria-hidden="true" />
              <div className="dt-visit-time">
                <strong>{minuteLabel(day.nightRest.startMinute)}</strong>
                <span>Hết ngày</span>
              </div>
              <p className="planner-break dt-break-line">
                <Moon size={13} aria-hidden="true" />
                <strong>Nghỉ tối</strong> {day.nightRest.text} · chưa chọn nơi nghỉ
              </p>
            </li>
          )}

          {day.returnCard}
        </ol>
      )}
    </section>
  );
}
