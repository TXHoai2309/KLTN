"use client";

import { Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { EXTERNAL_PLACE_LABEL, EXTERNAL_PLACE_SOURCE_LABEL, EXTERNAL_STAY_ESTIMATE_LABEL, plannerResultSchema, type PlannerResult } from "@/modules/trip-planner/planner-contract";
import { ItineraryValidationPanel, ValidationSheet, WarningNoticeRow } from "@/components/trip-planner/planner-presentation";
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

/**
 * Checks, map and Save for the validated result. The day-by-day schedule itself is the timeline above it,
 * so this view no longer repeats the title, day tabs or stop list. `children` is the optional Save section.
 */
export function TripsageItineraryView({ proposal, children }: { proposal: PlannerResult; children?: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const day = proposal.days[0];
  if (!day) return null;
  return (
    <div className="planner-page tripsage-itinerary-actions" lang="vi" data-proposal-id={proposal.proposalId}>
      <WarningNoticeRow proposal={proposal} />
      <ItineraryValidationPanel checks={proposal.checks} onOpenSheet={() => setSheetOpen(true)} />
      {sheetOpen && <ValidationSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} checks={proposal.checks} warnings={proposal.warnings} />}
      <div className="tripsage-map-collapse">
        <button type="button" className="tripsage-map-toggle" aria-expanded={mapOpen} onClick={() => setMapOpen(open => !open)}>
          <MapIcon size={15} aria-hidden="true" />
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
      <ExternalPlacesNotice proposal={proposal} />
      {children}
    </div>
  );
}
