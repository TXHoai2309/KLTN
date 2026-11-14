"use client";

import { lazy, Suspense, useState } from "react";
import { plannerResultSchema, type PlannerResult } from "@/modules/trip-planner/planner-contract";
import { ItineraryDayTabs, ItineraryStopCard, ItineraryValidationPanel, TripOverviewCard, TripSummaryBar, WarningNoticeRow } from "@/components/trip-planner/planner-presentation";
import "@/components/trip-planner/trip-planner.css";

const ItineraryMap = lazy(() => import("@/components/trip-planner/itinerary-map").then(m => ({ default: m.ItineraryMap })));

/** Parses the streamed `data-itinerary` payload; anything off-schema is dropped, never rendered. */
export function parseItineraryPart(data: unknown): PlannerResult | null {
  const parsed = plannerResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Display only: no Save here (Save is a later ticket). Existing KLTN presentation components render the validated result. */
export function TripsageItineraryView({ proposal }: { proposal: PlannerResult }) {
  const [selectedDay, setSelectedDay] = useState(proposal.days[0]?.day ?? 1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const day = proposal.days.find(d => d.day === selectedDay) ?? proposal.days[0];
  if (!day) return null;
  return (
    <div className="planner-page" lang="vi" data-proposal-id={proposal.proposalId}>
      <TripSummaryBar requirement={proposal.requirement} days={proposal.days} embedded />
      <WarningNoticeRow proposal={proposal} />
      <p role="note" className="assistant-muted">Lịch trình chưa được lưu. Mục khác “Đáp ứng” nghĩa là chưa được xác nhận.</p>
      <div className="planner-day-tabs-wrapper"><ItineraryDayTabs days={proposal.days} selectedDay={day.day} onChange={setSelectedDay} /></div>
      <TripOverviewCard day={day} journeyPlan={proposal.journeyPlan} />
      {day.stops.length ? (
        <ol className="planner-timeline">
          {day.stops.map((stop, index) => (
            <ItineraryStopCard key={stop.destination.id} stop={stop} nextStop={day.stops[index + 1]} selected={stop.destination.id === selectedId} onSelect={setSelectedId} />
          ))}
        </ol>
      ) : <p>Chưa có điểm phù hợp cho ngày này.</p>}
      <div className="planner-map-panel">
        <Suspense fallback={<p role="status">Đang mở bản đồ…</p>}>
          <ItineraryMap day={day} days={proposal.days} selectedDestinationId={selectedId} focusSelection={false} onSelect={setSelectedId} journeyPlan={proposal.journeyPlan} origin={proposal.requirement.journey?.origin} />
        </Suspense>
      </div>
      <ItineraryValidationPanel checks={proposal.checks} />
    </div>
  );
}
