"use client";

import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

import { travelerButtonClassName } from "@/components/traveler-ui/traveler-button";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { formatVnd, type CostPart } from "@/modules/tripsage-chat/tripsage-cost";

export interface TripsagePlanSummaryCardProps {
  version: number;
  proposal: PlannerResult;
  cost?: CostPart | null;
  isCurrent: boolean;
  isPanelOpen?: boolean;
  onOpenPanel?: () => void;
}

/**
 * Compact itinerary summary card rendered inside assistant chat messages (design §3.4, slim B6).
 * Replaces the full inline timeline/map/cost wall; opens the desktop split panel, tablet drawer, or mobile sheet.
 */
export function TripsagePlanSummaryCard({
  version,
  proposal,
  cost,
  isCurrent,
  isPanelOpen = false,
  onOpenPanel,
}: TripsagePlanSummaryCardProps) {
  const dayCount = proposal.days.length;
  const stopCount = proposal.days.reduce((sum, day) => sum + day.stops.length, 0);
  const totalChecks = proposal.checks.length;
  const passedChecks = proposal.checks.filter((check) => check.status === "PASS").length;
  const violationCount = proposal.checks.filter((check) => check.status === "VIOLATION").length;
  const hasBudgetOver = Boolean(cost && cost.budgetCap && cost.withinCap === false && (cost.overBy ?? 0) > 0);

  return (
    <section
      className={`tripsage-plan-summary${!isCurrent ? " is-stale" : ""}`}
      data-testid={isCurrent ? "plan-summary-current" : `plan-summary-v${version}`}
      data-stale={!isCurrent ? "true" : undefined}
      aria-label={`Bản lịch v${version}`}
    >
      <div className="tripsage-plan-summary-top">
        <div className="tripsage-plan-summary-heading">
          <strong>Bản lịch v{version}</strong>
          <span className="tripsage-plan-summary-meta">
            {dayCount} ngày · {stopCount} điểm
          </span>
        </div>
        {!isCurrent && <span className="tripsage-access-stale-badge">Đã có bản mới</span>}
      </div>

      <div className="tripsage-plan-summary-stats">
        {cost && (
          <span className="tripsage-plan-summary-cost">
            <span>{formatVnd(cost.total)}</span>
            {hasBudgetOver && (
              <span className="tripsage-plan-summary-warn">
                <AlertTriangle size={12} aria-hidden="true" />
                vượt {formatVnd(cost.overBy!)}
              </span>
            )}
          </span>
        )}
        <span className={`tripsage-plan-summary-check${violationCount > 0 ? " has-warn" : ""}`}>
          {violationCount > 0 ? (
            <>
              <AlertTriangle size={13} aria-hidden="true" />
              <span>{violationCount} mục cần chỉnh</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={13} aria-hidden="true" />
              <span>
                {passedChecks}/{totalChecks} kiểm tra đạt
              </span>
            </>
          )}
        </span>
      </div>

      {isCurrent && onOpenPanel && (
        <div className="tripsage-plan-summary-actions">
          <button
            type="button"
            className={travelerButtonClassName({
              variant: isPanelOpen ? "link" : "secondary",
              size: "sm",
              className: "tripsage-plan-summary-cta",
            })}
            onClick={onOpenPanel}
          >
            <span>{isPanelOpen ? "Đang mở bên phải" : "Xem lịch trình"}</span>
            {!isPanelOpen && <ChevronRight size={14} aria-hidden="true" />}
          </button>
        </div>
      )}
    </section>
  );
}
