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
  Eye,
  MapPin,
  Moon,
  UtensilsCrossed,
} from "lucide-react";

import { travelerDayColorVar } from "@/components/traveler-ui/traveler-day-tabs";
import { getDestinationVisual } from "@/lib/destination-visuals";
import { canPreviewPlace, type PlacePreviewTarget } from "@/lib/place-preview-url";
import {
  cleanAreaDisplayLabel,
  cleanPlaceDisplayName,
  cleanTravelerDisplay,
} from "@/lib/traveler-display-clean";

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

function PreviewLink({
  target,
  name,
  onPreview,
}: {
  target?: PlacePreviewTarget | null;
  name: string;
  onPreview?: (target: PlacePreviewTarget, trigger: HTMLElement) => void;
}) {
  if (!target || !onPreview || !canPreviewPlace(target)) return null;
  return (
    <button
      type="button"
      className="tripsage-preview-btn tv-quick-link"
      aria-label={`Xem nhanh ${name}`}
      onClick={(event) => {
        event.stopPropagation();
        onPreview(target, event.currentTarget);
      }}
    >
      <Eye size={13} aria-hidden="true" />
      <span>Xem nhanh</span>
    </button>
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
      <div className="dt-day-heading">
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

      {day.stops.length === 0 && !day.departureCard && !day.returnCard ? (
        <div className="dt-day-empty">
          <p>{day.emptyMessage ?? "Ngày này chưa có điểm dừng."}</p>
        </div>
      ) : (
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
                  className={`dt-visit-item${isSelected ? " is-selected-item" : ""}`}
                  onClick={onSelectDestination ? () => onSelectDestination(stop.destinationId) : undefined}
                >
                  <span className="dt-timeline-node my-trips-timeline-node" aria-hidden="true" />
                  <div className="dt-visit-time">
                    <strong>{minuteLabel(stop.startMinute)}</strong>
                    {stop.durationMinutes !== null && <span>{stop.durationMinutes} phút</span>}
                  </div>

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

                      {stop.nearbyAfter && stop.nearbyAfter.length > 0 && (
                        <div className="dt-sunken-box" aria-label={`Gần đây có thể ghé quanh ${cleanName}`}>
                          <div className="dt-sunken-head">
                            <span>Gần đây có thể ghé</span>
                            <span className="dt-sunken-note">gợi ý, chưa kiểm tra</span>
                          </div>
                          <ul className="dt-sunken-list">
                            {stop.nearbyAfter.map((item) => (
                              <li key={item.key}>
                                <span className="dt-sunken-item-name">{cleanPlaceDisplayName(item.name)}</span>
                                {item.distanceKm != null && (
                                  <span className="dt-sunken-dist">
                                    {item.distanceKm.toLocaleString("vi-VN")} km
                                  </span>
                                )}
                                <PreviewLink
                                  target={item.previewTarget}
                                  name={cleanPlaceDisplayName(item.name)}
                                  onPreview={onPreview}
                                />
                                {item.actionSlot}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </article>
                </li>

                {resolvedLunch && (
                  <li className="dt-break-item">
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
                        <div className="dt-sunken-box">
                          <ul className="dt-sunken-list">
                            {resolvedLunch.suggestions.map((meal) => (
                              <li key={meal.key}>
                                <span className="dt-sunken-item-name">{cleanPlaceDisplayName(meal.name)}</span>
                                {meal.detail && <span className="dt-sunken-dist">{cleanTravelerDisplay(meal.detail)}</span>}
                                {meal.distanceKm != null && (
                                  <span className="dt-sunken-dist">
                                    {meal.distanceKm.toLocaleString("vi-VN")} km
                                  </span>
                                )}
                                <PreviewLink
                                  target={meal.previewTarget}
                                  name={cleanPlaceDisplayName(meal.name)}
                                  onPreview={onPreview}
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

      {day.eveningPlan ? (
        <div
          className="dt-sunken-box dt-evening-box"
          role="note"
          data-testid={`evening-plan-day-${day.dayIndex}`}
          aria-label={`Tối nay ngày ${day.dayIndex}`}
        >
          <div className="dt-sunken-head">
            <span className="dt-evening-title">
              <Moon size={14} aria-hidden="true" />
              Tối nay{day.eveningPlan.overnightArea ? ` · nghỉ ở ${day.eveningPlan.overnightArea}` : ""}
            </span>
            <span className="dt-sunken-note">gợi ý, chưa kiểm tra</span>
          </div>

          {day.eveningPlan.chosenLodging ? (
            <div className="dt-evening-lodging">
              <BedDouble size={14} aria-hidden="true" />
              <span>
                Chỗ nghỉ đã chọn (Đêm {day.eveningPlan.nightIndex}):{" "}
                <strong>{cleanPlaceDisplayName(day.eveningPlan.chosenLodging.name)}</strong>
                {" · "}
                <span className="dt-sunken-note">Chưa kiểm tra · Không phải đặt phòng</span>
              </span>
              <PreviewLink
                target={day.eveningPlan.chosenLodging.previewTarget}
                name={cleanPlaceDisplayName(day.eveningPlan.chosenLodging.name)}
                onPreview={onPreview}
              />
            </div>
          ) : day.eveningPlan.lodgingSuggestions && day.eveningPlan.lodgingSuggestions.length > 0 ? (
            <div className="dt-evening-lodging-list">
              <span className="dt-sunken-note">Gợi ý chỗ nghỉ:</span>
              <ul className="dt-sunken-list">
                {day.eveningPlan.lodgingSuggestions.slice(0, 3).map((item) => (
                  <li key={item.key}>
                    <span className="dt-sunken-item-name">{cleanPlaceDisplayName(item.name)}</span>
                    {item.distanceKm != null && (
                      <span className="dt-sunken-dist">{item.distanceKm.toLocaleString("vi-VN")} km</span>
                    )}
                    <PreviewLink
                      target={item.previewTarget}
                      name={cleanPlaceDisplayName(item.name)}
                      onPreview={onPreview}
                    />
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
                ))}
              </ul>
            </div>
          ) : null}

          {day.eveningPlan.eveningPlaces.length > 0 ? (
            <ul className="dt-sunken-list">
              {day.eveningPlan.eveningPlaces.slice(0, 3).map((place) => (
                <li key={place.key}>
                  <span className="dt-sunken-item-name">{cleanPlaceDisplayName(place.name)}</span>
                  {place.distanceKm != null && (
                    <span className="dt-sunken-dist">{place.distanceKm.toLocaleString("vi-VN")} km</span>
                  )}
                  <PreviewLink
                    target={place.previewTarget}
                    name={cleanPlaceDisplayName(place.name)}
                    onPreview={onPreview}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="dt-sunken-empty">Chưa tìm được gợi ý buổi tối</p>
          )}
        </div>
      ) : (
        day.chosenLodging && (
          <div
            className="dt-sunken-box my-trips-chosen-lodging"
            role="note"
            aria-label={`Chỗ nghỉ đã chọn đêm ${day.chosenLodging.nightIndex}`}
          >
            <BedDouble size={15} aria-hidden="true" />
            <span>
              <strong>Chỗ nghỉ đã chọn (Đêm {day.chosenLodging.nightIndex}):</strong>{" "}
              {cleanPlaceDisplayName(day.chosenLodging.name)} ·{" "}
              <span className="dt-sunken-note">Chưa kiểm tra · Không phải đặt phòng</span>
            </span>
            <PreviewLink
              target={day.chosenLodging.previewTarget}
              name={cleanPlaceDisplayName(day.chosenLodging.name)}
              onPreview={onPreview}
            />
          </div>
        )
      )}

      {day.nearbySuggestions && day.nearbySuggestions.length > 0 && (
        <div
          className="dt-sunken-box my-trips-nearby"
          role="note"
          aria-label={`Gợi ý vui chơi quanh đây ngày ${day.dayIndex}`}
        >
          <div className="dt-sunken-head">
            <span>Gần đây có thể ghé</span>
            <span className="dt-sunken-note">Từ Google Maps · Chưa kiểm tra · Không nằm trong lịch</span>
          </div>
          <ul className="dt-sunken-list">
            {day.nearbySuggestions.map((item) => (
              <li key={item.key}>
                <span className="dt-sunken-item-name">{cleanPlaceDisplayName(item.name)}</span>
                {item.distanceKm != null && (
                  <span className="dt-sunken-dist">
                    {item.distanceKm.toLocaleString("vi-VN")} km{item.tag ? ` ${item.tag}` : ""}
                  </span>
                )}
                <PreviewLink
                  target={item.previewTarget}
                  name={cleanPlaceDisplayName(item.name)}
                  onPreview={onPreview}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
