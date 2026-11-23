"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Map, X } from "lucide-react";

import { travelerButtonClassName } from "@/components/traveler-ui/traveler-button";
import { TravelerDayTabs, type TravelerDayTabItem } from "@/components/traveler-ui/traveler-day-tabs";
import { DayTimeline, type DayTimelineDay, type DayTimelineNearbyItem, type DayTimelineStop } from "@/components/trip-timeline/day-timeline";
import { buildDayEveningPlan } from "@/components/trip-timeline/evening-plan";
import { ItineraryMap } from "@/components/trip-planner/itinerary-map";
import { ItineraryValidationPanel } from "@/components/trip-planner/planner-presentation";
import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import { buildDataTripTitle } from "@/lib/traveler-trip-title";
import { canPreviewPlace, type PlacePreviewTarget } from "@/lib/place-preview-url";
import { cleanPlaceDisplayName, cleanTravelerDisplay } from "@/lib/traveler-display-clean";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import type { PinnedItem } from "@/modules/trip-save/trip-pin-contract";
import type { SaveState } from "@/modules/trip-save/trip-save-state";
import type { AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";
import { itineraryDistanceKm, type TripsageTripInfo } from "@/modules/tripsage-chat/tripsage-chat-context";
import type { CostPart } from "@/modules/tripsage-chat/tripsage-cost";
import {
  isEligibleLodgingSuggestion,
  resolveDayLunchBreak,
  type ChosenLodgingMap,
  type TimelinePart,
  type TimelineSuggestion,
} from "@/modules/tripsage-chat/tripsage-timeline";
import { TripsageAccessLegCard } from "./tripsage-access-leg-card";
import { TripsageCostCard } from "./tripsage-cost-card";
import type { PinControl } from "./tripsage-pin-button";
import { TripsageSaveSection } from "./tripsage-save-section";

export type PlanPanelSubTab = "itinerary" | "map" | "cost" | "checks";

export interface TripsagePlanPanelProps {
  proposal: PlannerResult;
  timeline?: TimelinePart | null;
  suggestions: readonly TimelineSuggestion[];
  cost?: CostPart | null;
  accessLeg?: AccessLegPart | null;
  travel?: { homeCity: string; hubName: string } | null;
  tripInfo?: TripsageTripInfo | null;
  chosenLodgings: ChosenLodgingMap;
  pinnedItems: readonly PinnedItem[];
  pins?: PinControl;
  busy?: boolean;
  noticePresent?: boolean;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onToggleChosenLodging: (nightIndex: number, placeId: string) => void;
  onRequestMeals: (day: number) => void;
  onAskAccess: () => void;
  onSelectSavingsOption: (prompt: string) => void;
  onSaved: (tripId: string) => void;
  onSaveStateChange: (state: SaveState) => void;
}

function shiftIsoDate(iso: string | null | undefined, deltaDays: number): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

const shortDayMonth = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function previewTargetForStop(stop: PlannerResult["days"][number]["stops"][number]): PlacePreviewTarget | null {
  const cleanName = cleanPlaceDisplayName(stop.destination.name) || stop.destination.name;
  if (stop.destination.id.startsWith("ext:")) {
    const target: PlacePreviewTarget = {
      kind: "GOOGLE_PLACE",
      name: cleanName,
      placeId: stop.destination.id.slice(4),
    };
    return canPreviewPlace(target) ? target : null;
  }
  const target: PlacePreviewTarget = {
    kind: "CATALOG",
    name: cleanName,
    latitude: stop.destination.latitude,
    longitude: stop.destination.longitude,
    address: stop.destination.address ?? null,
    description: cleanTravelerDisplay(stop.destination.description) || null,
    verifiedGoogleMapsUrl: stop.destination.googleMapsUrl ?? null,
  };
  return canPreviewPlace(target) ? target : null;
}

function previewTargetForSuggestion(suggestion: TimelineSuggestion): PlacePreviewTarget | null {
  const placeId = suggestion.place?.placeId;
  if (!placeId) return null;
  const rawName = suggestion.place?.name || suggestion.title;
  const target: PlacePreviewTarget = {
    kind: "GOOGLE_PLACE",
    name: cleanPlaceDisplayName(rawName) || rawName,
    placeId,
  };
  return canPreviewPlace(target) ? target : null;
}

/**
 * Sticky desktop plan panel (>= 1200px), 560px tablet drawer (768–1199px), and mobile sheet (< 768px).
 * Memoized by current proposal so subsequent non-plan chat messages never remount the timeline or map (slim BR-3).
 */
export const TripsagePlanPanel = memo(function TripsagePlanPanel({
  proposal,
  timeline,
  suggestions,
  cost,
  accessLeg,
  travel,
  tripInfo,
  chosenLodgings,
  pinnedItems,
  pins,
  busy = false,
  noticePresent = false,
  drawerOpen,
  onCloseDrawer,
  onToggleChosenLodging,
  onRequestMeals,
  onAskAccess,
  onSelectSavingsOption,
  onSaved,
  onSaveStateChange,
}: TripsagePlanPanelProps) {
  const [subTab, setSubTab] = useState<PlanPanelSubTab>("itinerary");
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => `day-${proposal.days[0]?.day ?? 1}`);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ target: PlacePreviewTarget; trigger: HTMLElement | null } | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pushedHistoryRef = useRef(false);
  const savedScrollTopRef = useRef<number | null>(null);

  // Ticket 11 (design §3.9): Android Back closes the mobile sheet instead of leaving the page,
  // and restores the chat transcript scroll position when closed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const transcript = document.querySelector<HTMLElement>(".assistant-transcript");
    if (drawerOpen) {
      savedScrollTopRef.current = transcript ? transcript.scrollTop : null;
      if (window.innerWidth < 768 && !pushedHistoryRef.current) {
        try {
          window.history.pushState({ tripsagePlanSheet: true }, "");
          pushedHistoryRef.current = true;
        } catch {
          /* ignore history errors in sandboxed frames */
        }
      }
      const onPopState = () => {
        if (pushedHistoryRef.current) {
          pushedHistoryRef.current = false;
          onCloseDrawer();
        }
      };
      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
    }
    if (pushedHistoryRef.current) {
      pushedHistoryRef.current = false;
      try {
        window.history.back();
      } catch {
        /* ignore */
      }
    }
    if (savedScrollTopRef.current !== null && transcript) {
      transcript.scrollTop = savedScrollTopRef.current;
      savedScrollTopRef.current = null;
    }
  }, [drawerOpen, onCloseDrawer]);

  const firstDate = proposal.days[0]?.date ?? proposal.requirement.startDate ?? "";
  const lastDate = proposal.days.at(-1)?.date ?? firstDate;
  const firstStop = proposal.days.flatMap((d) => d.stops)[0];
  const lastStop = proposal.days.flatMap((d) => d.stops).at(-1);
  const totalStops = proposal.days.reduce((sum, d) => sum + d.stops.length, 0);
  const totalKm = itineraryDistanceKm(proposal);
  const travelers = accessLeg?.travelers ?? tripInfo?.travelers ?? cost?.travelers ?? 2;
  const transportText = proposal.requirement.transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô";

  const panelTitle = useMemo(
    () =>
      buildDataTripTitle({
        homeCity: accessLeg?.homeCity ?? tripInfo?.homeCity ?? null,
        originLabel: proposal.requirement.journey?.origin?.label ?? null,
        firstArea: firstStop?.destination.area ?? null,
        lastArea: lastStop?.destination.area ?? null,
        startDate: firstDate || "2026-12-01",
        endDate: lastDate || firstDate || "2026-12-01",
        durationDays: proposal.days.length,
      }),
    [
      accessLeg?.homeCity,
      tripInfo?.homeCity,
      proposal.requirement.journey?.origin?.label,
      firstStop?.destination.area,
      lastStop?.destination.area,
      firstDate,
      lastDate,
      proposal.days.length,
    ],
  );

  const hasTravel = Boolean(accessLeg || travel);
  const outboundDate = shiftIsoDate(firstDate, -1);
  const returnDate = shiftIsoDate(lastDate, 1);

  const dayTabs: TravelerDayTabItem[] = useMemo(() => {
    const items: TravelerDayTabItem[] = [];
    if (hasTravel) {
      items.push({
        id: "travel-outbound",
        label: outboundDate ? `Ngày đi ${shortDayMonth(outboundDate)}` : "Ngày đi",
        kind: "travel",
      });
    }
    for (const day of proposal.days) {
      items.push({
        id: `day-${day.day}`,
        label: `Ngày ${day.day}`,
        count: day.stops.length,
        dayNumber: day.day,
        kind: "trip",
      });
    }
    if (hasTravel) {
      items.push({
        id: "travel-return",
        label: returnDate ? `Ngày về ${shortDayMonth(returnDate)}` : "Ngày về",
        kind: "travel",
      });
    }
    return items;
  }, [hasTravel, outboundDate, returnDate, proposal.days]);

  const activeDayNumber = selectedDayKey.startsWith("day-")
    ? Number(selectedDayKey.slice(4))
    : (proposal.days[0]?.day ?? 1);
  const activePlannerDay = proposal.days.find((d) => d.day === activeDayNumber) ?? proposal.days[0];

  const bySlot = useMemo(() => {
    const map = new globalThis.Map<string, TimelineSuggestion[]>();
    for (const item of suggestions) {
      map.set(item.slotId, [...(map.get(item.slotId) ?? []), item]);
    }
    return map;
  }, [suggestions]);

  const activeTimelineDay: DayTimelineDay | null = useMemo(() => {
    if (!activePlannerDay) return null;
    const totalDays = proposal.days.length;
    const overnightSlot = `d${activePlannerDay.day}-overnight`;
    const overnightSuggestions = bySlot.get(overnightSlot) ?? [];
    const eveningPlaces: DayTimelineNearbyItem[] = overnightSuggestions
      .filter((s) => s.kind === "EVENING" && s.place)
      .slice(0, 3)
      .map((s) => ({
        key: s.place!.placeId ?? s.title,
        name: s.title,
        distanceKm: s.place!.distanceKm,
        previewTarget: previewTargetForSuggestion(s),
      }));
    const lodgingChoices = overnightSuggestions
      .filter((s) => isEligibleLodgingSuggestion(s, activePlannerDay.day))
      .slice(0, 3)
      .map((s) => {
        const placeId = s.place!.placeId!;
        const isChosen = chosenLodgings[activePlannerDay.day]?.placeId === placeId;
        return {
          key: placeId,
          name: s.place?.name || s.title,
          distanceKm: s.place?.distanceKm ?? null,
          chosen: isChosen,
          onChoose: () => onToggleChosenLodging(activePlannerDay.day, placeId),
          previewTarget: previewTargetForSuggestion(s),
        };
      });
    const chosen = chosenLodgings[activePlannerDay.day];
    const lastDayStop = activePlannerDay.stops.at(-1);

    const lunchSlot = `d${activePlannerDay.day}-lunch`;
    const lunchMeals = (bySlot.get(lunchSlot) ?? []).filter((s) => s.kind === "MEAL");
    const activeTimelinePartDay = timeline?.days.find((d) => d.day === activePlannerDay.day) ?? null;
    const resolvedLunch = resolveDayLunchBreak({
      stops: activePlannerDay.stops.map((s) => ({
        destinationId: s.destination.id,
        arrivalMinute: s.arrivalMinute,
        departureMinute: s.departureMinute,
      })),
      timelineDay: activeTimelinePartDay,
      lunchMinutes: proposal.requirement.dayRhythm?.lunchMinutes,
      journeyPlan: proposal.journeyPlan,
    });

    const stops: DayTimelineStop[] = activePlannerDay.stops.map((stop, idx) => {
      const visitSlot = `d${activePlannerDay.day}-visit-${idx + 1}`;
      const visitSuggestions = bySlot.get(visitSlot) ?? [];
      const nearbyAfter: DayTimelineNearbyItem[] = visitSuggestions
        .filter((s) => s.kind === "ACTIVITY" && s.place)
        .map((s) => ({
          key: s.place!.placeId ?? s.title,
          name: s.title,
          distanceKm: s.place!.distanceKm,
          previewTarget: previewTargetForSuggestion(s),
        }));
      const preferenceBadges = visitSuggestions
        .filter((s) => s.kind === "TIP" && /săn mây/iu.test(s.title))
        .map((s) => s.title);

      const showLunchAfter = resolvedLunch !== null && idx === resolvedLunch.afterStopIndex;

      return {
        id: `${proposal.proposalId}-${activePlannerDay.day}-${stop.destination.id}`,
        destinationId: stop.destination.id,
        order: stop.order,
        name: stop.destination.name,
        area: stop.destination.area,
        startMinute: stop.arrivalMinute,
        durationMinutes: stop.visitDurationMinutes,
        image: stop.destination.image ? { url: stop.destination.image.url, alt: stop.destination.image.alt } : null,
        external: stop.destination.id.startsWith("ext:"),
        description: cleanTravelerDisplay(stop.destination.description) || null,
        preferenceBadges: preferenceBadges.length > 0 ? preferenceBadges : undefined,
        previewTarget: previewTargetForStop(stop),
        nearbyAfter: nearbyAfter.length > 0 ? nearbyAfter : undefined,
        lunchAfter: showLunchAfter && resolvedLunch
          ? {
              fromMinute: resolvedLunch.fromMinute,
              toMinute: resolvedLunch.toMinute,
              durationMinutes: resolvedLunch.durationMinutes,
              suggestions: lunchMeals.map((m, mIdx) => ({
                key: m.place?.placeId ?? `${lunchSlot}-${mIdx}`,
                name: m.title,
                detail: m.detail,
                distanceKm: m.place?.distanceKm ?? null,
                previewTarget: previewTargetForSuggestion(m),
              })),
              onRequestMeals: lunchMeals.length === 0 ? () => onRequestMeals(activePlannerDay.day) : undefined,
            }
          : null,
      };
    });

    const freeNearby = (bySlot.get(`d${activePlannerDay.day}-free`) ?? [])
      .filter((s) => s.kind === "ACTIVITY" && s.place)
      .map((s) => ({
        key: s.place!.placeId ?? s.title,
        name: s.title,
        distanceKm: s.place!.distanceKm,
        tag: "(chiều rảnh)",
        previewTarget: previewTargetForSuggestion(s),
      }));

    return {
      dayIndex: activePlannerDay.day,
      localDate: activePlannerDay.date,
      transportLabel: transportText,
      stops,
      eveningPlan: buildDayEveningPlan({
        dayIndex: activePlannerDay.day,
        totalDays,
        lastStopArea: lastDayStop?.destination.area,
        lastStopName: lastDayStop?.destination.name,
        chosenLodging: chosen
          ? {
              name: chosen.name,
              previewTarget: { kind: "GOOGLE_PLACE", name: chosen.name, placeId: chosen.placeId },
            }
          : null,
        lodgingSuggestions: lodgingChoices,
        eveningPlaces,
      }),
      nearbySuggestions: freeNearby.length > 0 ? freeNearby : undefined,
    };
  }, [
    activePlannerDay,
    proposal.days.length,
    proposal.proposalId,
    proposal.journeyPlan,
    proposal.requirement.dayRhythm?.lunchMinutes,
    timeline,
    bySlot,
    chosenLodgings,
    transportText,
    onToggleChosenLodging,
    onRequestMeals,
  ]);

  const metaLine = [
    `${travelers} người`,
    transportText,
    `${totalStops} điểm`,
    totalKm !== null ? `${Math.round(totalKm)} km` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const passedChecks = proposal.checks.filter((c) => c.status === "PASS").length;

  return (
    <>
      {drawerOpen && (
        <div
          className="tripsage-panel-backdrop"
          aria-hidden="true"
          onClick={onCloseDrawer}
        />
      )}
      <aside
        className={`tripsage-plan-panel${drawerOpen ? " is-open" : ""}`}
        data-testid="tripsage-plan-panel"
        data-proposal-id={proposal.proposalId}
        aria-label="Panel lịch trình hiện hành"
      >
        <div
          className="tripsage-sheet-drag-zone"
          onTouchStart={(event) => {
            touchStartYRef.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(event) => {
            const startY = touchStartYRef.current;
            touchStartYRef.current = null;
            const endY = event.changedTouches[0]?.clientY;
            if (startY !== null && typeof endY === "number" && endY - startY > 64) {
              onCloseDrawer();
            }
          }}
        >
          <div className="tripsage-sheet-handle" aria-hidden="true" />
        </div>
        <header className="tripsage-panel-header">
          <div className="tripsage-panel-title-wrap">
            <h2 className="tripsage-panel-title">{panelTitle}</h2>
            <p className="tripsage-panel-meta">{metaLine}</p>
          </div>
          <div className="tripsage-panel-header-actions">
            <div className="tripsage-panel-save-desktop">
              {!busy && (
                noticePresent ? (
                  <p role="note" className="assistant-muted">Lịch trình chưa được lưu.</p>
                ) : (
                  <TripsageSaveSection
                    result={proposal}
                    tripInfo={tripInfo}
                    chosenLodgings={chosenLodgings}
                    suggestions={suggestions}
                    pinnedItems={pinnedItems}
                    primaryLabel="Lưu chuyến"
                    onSaved={onSaved}
                    onStateChange={onSaveStateChange}
                  />
                )
              )}
            </div>
            <button
              type="button"
              className={travelerButtonClassName({ variant: "icon", size: "sm", className: "tripsage-panel-close" })}
              aria-label="Đóng panel lịch trình"
              onClick={onCloseDrawer}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <nav className="tripsage-panel-subtabs" role="tablist" aria-label="Chế độ xem bản lịch">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "itinerary"}
            className={`tripsage-panel-subtab${subTab === "itinerary" ? " is-active" : ""}`}
            onClick={() => setSubTab("itinerary")}
          >
            Lịch trình
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "map"}
            className={`tripsage-panel-subtab tripsage-panel-subtab--map${subTab === "map" ? " is-active" : ""}`}
            onClick={() => setSubTab("map")}
          >
            <Map size={13} aria-hidden="true" />
            <span>Bản đồ</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "cost"}
            className={`tripsage-panel-subtab${subTab === "cost" ? " is-active" : ""}`}
            onClick={() => setSubTab("cost")}
          >
            Chi phí
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "checks"}
            className={`tripsage-panel-subtab${subTab === "checks" ? " is-active" : ""}`}
            onClick={() => setSubTab("checks")}
          >
            Kiểm tra ({passedChecks}/{proposal.checks.length})
          </button>
        </nav>

        <div className="tripsage-panel-body">
          {subTab === "itinerary" && (
            <>
              <TravelerDayTabs
                tabs={dayTabs}
                activeId={selectedDayKey}
                onSelect={setSelectedDayKey}
                ariaLabel="Chọn ngày trong panel lịch trình"
              />
              <div className="tripsage-panel-split">
                <div className="tripsage-panel-timeline-col">
                  {selectedDayKey === "travel-outbound" || selectedDayKey === "travel-return" ? (
                    accessLeg ? (
                      <TripsageAccessLegCard
                        leg={accessLeg}
                        only={selectedDayKey === "travel-outbound" ? "outbound" : "return"}
                      />
                    ) : travel ? (
                      <div className="dt-travel-day">
                        <h3>
                          {selectedDayKey === "travel-outbound"
                            ? `Ngày đi · ${travel.homeCity} → ${travel.hubName}`
                            : `Ngày về · ${travel.hubName} → ${travel.homeCity}`}
                        </h3>
                        <p className="assistant-muted">
                          Chưa chọn cách đi giữa {travel.homeCity} và {travel.hubName}.
                        </p>
                        <button
                          type="button"
                          className={travelerButtonClassName({ variant: "secondary", size: "sm" })}
                          onClick={onAskAccess}
                        >
                          So sánh cách đi
                        </button>
                      </div>
                    ) : null
                  ) : (
                    activeTimelineDay && (
                      <DayTimeline
                        day={activeTimelineDay}
                        variant="full"
                        selectedDestinationId={selectedDestinationId}
                        onSelectDestination={setSelectedDestinationId}
                        onPreview={(target, trigger) => setPreview({ target, trigger })}
                      />
                    )
                  )}
                </div>
                <div className="tripsage-panel-map-col">
                  {activePlannerDay && proposal.days.some((d) => d.stops.length > 0) && (
                    <ItineraryMap
                      day={activePlannerDay}
                      days={proposal.days}
                      selectedDestinationId={selectedDestinationId}
                      focusSelection={Boolean(selectedDestinationId)}
                      onSelect={setSelectedDestinationId}
                      journeyPlan={proposal.journeyPlan}
                      origin={proposal.requirement.journey?.origin}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {subTab === "map" && activePlannerDay && (
            <div className="tripsage-panel-map-tab">
              <TravelerDayTabs
                tabs={dayTabs.filter((t) => t.kind === "trip")}
                activeId={selectedDayKey.startsWith("day-") ? selectedDayKey : `day-${activePlannerDay.day}`}
                onSelect={setSelectedDayKey}
                ariaLabel="Lọc ngày trên bản đồ"
              />
              {proposal.days.some((d) => d.stops.length > 0) ? (
                <ItineraryMap
                  day={activePlannerDay}
                  days={proposal.days}
                  selectedDestinationId={selectedDestinationId}
                  focusSelection={Boolean(selectedDestinationId)}
                  onSelect={setSelectedDestinationId}
                  journeyPlan={proposal.journeyPlan}
                  origin={proposal.requirement.journey?.origin}
                />
              ) : (
                <p className="assistant-muted">Chưa có điểm dừng để hiển thị trên bản đồ.</p>
              )}
            </div>
          )}

          {subTab === "cost" && (
            cost ? (
              <TripsageCostCard
                cost={cost}
                pins={pins}
                accessLeg={accessLeg}
                onSelectSavingsOption={onSelectSavingsOption}
              />
            ) : (
              <p className="assistant-muted">Chưa có bảng chi phí ước tính cho bản lịch này.</p>
            )
          )}

          {subTab === "checks" && (
            <div className="tripsage-panel-checks">
              <ItineraryValidationPanel checks={proposal.checks} />
              {proposal.warnings.length > 0 && (
                <ul className="tripsage-panel-warnings">
                  {proposal.warnings.map((w, i) => (
                    <li key={`${w.code}-${i}`}>{w.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Sticky mobile bottom save bar (design §3.9 & §4.1) */}
        <div className="tripsage-sheet-footer">
          {!busy && !noticePresent && (
            <TripsageSaveSection
              result={proposal}
              tripInfo={tripInfo}
              chosenLodgings={chosenLodgings}
              suggestions={suggestions}
              pinnedItems={pinnedItems}
              primaryLabel="Lưu chuyến"
              buttonSize="lg"
              onSaved={onSaved}
              onStateChange={onSaveStateChange}
            />
          )}
        </div>

        <PlacePreviewModal
          target={preview?.target ?? null}
          returnFocusTo={preview?.trigger ?? null}
          onClose={() => setPreview(null)}
        />
      </aside>
    </>
  );
});
