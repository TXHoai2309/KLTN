"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { EXTERNAL_PLACE_LABEL, EXTERNAL_PLACE_SOURCE_LABEL, EXTERNAL_STAY_ESTIMATE_LABEL, plannerResultSchema, type PlannerResult } from "@/modules/trip-planner/planner-contract";
import { formatTravelOnlyDayLabel } from "@/modules/tripsage-chat/tripsage-timeline";
import { ItineraryDayTabs, ItineraryStopCard, ItineraryValidationPanel, TripOverviewCard, TripSummaryBar, ValidationSheet, WarningNoticeRow } from "@/components/trip-planner/planner-presentation";
import "@/components/trip-planner/trip-planner.css";

const ItineraryMap = lazy(() => import("@/components/trip-planner/itinerary-map").then(m => ({ default: m.ItineraryMap })));

/** Parses the streamed `data-itinerary` payload; anything off-schema is dropped, never rendered. */
export function parseItineraryPart(data: unknown): PlannerResult | null {
  const parsed = plannerResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

const CHECK_LABELS: Record<string, string> = { OPENING_HOURS: "Giờ mở cửa", MINIMUM_DURATION: "Thời lượng tối thiểu", TRAVEL_TIME: "Thời gian di chuyển", SCHEDULE_CONFLICTS: "Xung đột lịch trình", MOBILITY: "Khả năng tiếp cận" };
/** Lists, per place outside the catalogue, the checks that could not be run. Plain text only: no logo, no outside link. */
function ExternalPlacesNotice({ proposal }: { proposal: PlannerResult }) {
  const external = proposal.days.flatMap(d => d.stops).filter(s => s.destination.external);
  if (!external.length) return null;
  return (
    <section className="planner-external-notice" aria-label="Địa điểm ngoài danh mục">
      <p role="note"><strong>Địa điểm {EXTERNAL_PLACE_LABEL}</strong> · {EXTERNAL_PLACE_SOURCE_LABEL}. Thời gian ở lại chỉ là {EXTERNAL_STAY_ESTIMATE_LABEL}. Lịch có địa điểm này chưa thể lưu.</p>
      <ul>
        {external.map(stop => (
          <li key={stop.destination.id}><strong>{stop.destination.name}</strong>
            <ul>
              {proposal.checks.filter(c => c.issues.some(i => i.destinationId === stop.destination.id)).map(c => (
                <li key={c.key}>{CHECK_LABELS[c.key] ?? c.key}: chưa kiểm được ({c.issues.filter(i => i.destinationId === stop.destination.id).map(i => i.message).join(" ")})</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Existing KLTN presentation components render the validated result; `children` is the optional Save section. */
export function TripsageItineraryView({ proposal, children }: { proposal: PlannerResult; children?: ReactNode }) {
  const [selectedDay, setSelectedDay] = useState(proposal.days[0]?.day ?? 1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const day = proposal.days.find(d => d.day === selectedDay) ?? proposal.days[0];
  if (!day) return null;
  return (
    <div className="planner-page" lang="vi" data-proposal-id={proposal.proposalId}>
      <TripSummaryBar requirement={proposal.requirement} days={proposal.days} embedded />
      <WarningNoticeRow proposal={proposal} />
      <p role="note" className="assistant-muted">Mục khác “Đáp ứng” nghĩa là chưa được xác nhận.</p>
      <div className="planner-day-tabs-wrapper"><ItineraryDayTabs days={proposal.days} selectedDay={day.day} onChange={setSelectedDay} /></div>
      <TripOverviewCard day={day} journeyPlan={proposal.journeyPlan} />
      {day.stops.length ? (
        <ol className="planner-timeline">
          {day.stops.map((stop, index) => (
            <ItineraryStopCard key={stop.destination.id} stop={stop} nextStop={day.stops[index + 1]} selected={stop.destination.id === selectedId} onSelect={setSelectedId} />
          ))}
        </ol>
      ) : (
        <p className="tripsage-travel-only-day">{formatTravelOnlyDayLabel(day, proposal.journeyPlan) ?? "Chưa có điểm phù hợp cho ngày này."}</p>
      )}
      <div className="tripsage-map-collapse">
        <button
          type="button"
          className="tripsage-map-toggle"
          aria-expanded={mapOpen}
          onClick={() => setMapOpen(open => !open)}
        >
          <span aria-hidden="true">🗺️</span>{" "}
          {mapOpen ? "Ẩn bản đồ lộ trình" : "Xem bản đồ lộ trình"}
        </button>
        {mapOpen && (
          <div className="planner-map-panel">
            <Suspense fallback={<p role="status">Đang mở bản đồ…</p>}>
              <ItineraryMap day={day} days={proposal.days} selectedDestinationId={selectedId} focusSelection={false} onSelect={setSelectedId} journeyPlan={proposal.journeyPlan} origin={proposal.requirement.journey?.origin} />
            </Suspense>
          </div>
        )}
      </div>
      <ItineraryValidationPanel checks={proposal.checks} onOpenSheet={() => setSheetOpen(true)} />
      {sheetOpen && <ValidationSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} checks={proposal.checks} warnings={proposal.warnings} />}
      <ExternalPlacesNotice proposal={proposal} />
      {children}
    </div>
  );
}
