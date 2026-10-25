"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route as NextRoute } from "next";
import { AlertCircle, Calendar, LoaderCircle, Map, Mountain, Route } from "lucide-react";
import { toast } from "sonner";
import type { ConfirmedTripRequirement } from "@/modules/trip-requirement/trip-requirement-review";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { requestTripProposal, type PlannerClientResult } from "@/lib/trip-planner-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { ItineraryMap } from "./itinerary-map";
import { TripConfirmationSection } from "./trip-confirmation-section";
import { isTripSaveNavigationLocked, type SaveState } from "@/modules/trip-save/trip-save-state";
import {
  ItineraryDayTabs,
  ItineraryStopCard,
  TripOverviewCard,
  TripSummaryBar,
  ValidationSheet,
  WarningNoticeRow,
} from "./planner-presentation";
import "./trip-planner.css";

export function completeTripSave(
  tripId: string,
  notify: (message: string) => void,
  navigate: (href: NextRoute) => void,
) {
  notify("Đã lưu chuyến đi thành công.");
  navigate("/trips");
}

export function TripPlannerScreen({
  proposal,
  busy = false,
  onBack,
  onRegenerate,
  onSaved,
  onSaveStateChange,
  onUpdateStartDate,
  embedded = false,
}: {
  proposal: PlannerResult;
  busy?: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  onSaved: (tripId: string) => void;
  onSaveStateChange?: (state: SaveState) => void;
  onUpdateStartDate?: (newDate: string) => void;
  embedded?: boolean;
}) {
  const [dayNumber, setDayNumber] = useState(1);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(
    proposal.days[0]?.stops[0]?.destination.id ?? null,
  );
  const [focusSelection, setFocusSelection] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [validationSheetOpen, setValidationSheetOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"itinerary" | "map">("itinerary");

  const handleSaveStateChange = useCallback(
    (state: SaveState) => {
      setSaveState(state);
      onSaveStateChange?.(state);
    },
    [onSaveStateChange],
  );

  const heading = useRef<HTMLHeadingElement>(null);
  const day = proposal.days.find((item) => item.day === dayNumber) ?? proposal.days[0]!;

  useEffect(() => {
    setDayNumber(1);
    setSelectedDestinationId(proposal.days[0]?.stops[0]?.destination.id ?? null);
    setFocusSelection(false);
    setSaveState("idle");
    setMobileTab("itinerary");
    heading.current?.focus();
  }, [proposal]);

  const select = (id: string) => {
    setSelectedDestinationId(id);
    setFocusSelection(true);
  };

  const changeDay = (number: number) => {
    setDayNumber(number);
    setSelectedDestinationId(
      proposal.days.find((item) => item.day === number)?.stops[0]?.destination.id ?? null,
    );
    setFocusSelection(false);
  };

  const selected = day.stops.find((stop) => stop.destination.id === selectedDestinationId);
  const PlannerContainer = embedded ? "div" : "main";

  return (
    <PlannerContainer className="planner-page" lang="vi" aria-busy={busy}>
      {/* 1. Compact Header */}
      <TripSummaryBar
        requirement={proposal.requirement}
        days={proposal.days}
        embedded={embedded}
        onBack={onBack}
        disabled={isTripSaveNavigationLocked(saveState)}
      />

      {/* 2. Status notice (sr-only for screen readers) */}
      <WarningNoticeRow proposal={proposal} />

      {/* 3. Day Tabs spanning the itinerary view */}
      <div className="planner-day-tabs-wrapper">
        <ItineraryDayTabs
          days={proposal.days}
          selectedDay={day.day}
          onChange={changeDay}
        />
      </div>

      {/* Mobile Tab Switcher */}
      <div className="planner-mobile-tabs" role="tablist" aria-label="Chuyển chế độ xem">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "itinerary"}
          className={`planner-mobile-tab ${mobileTab === "itinerary" ? "is-active" : ""}`}
          onClick={() => setMobileTab("itinerary")}
        >
          <Calendar size={14} aria-hidden="true" />
          <span>Lịch trình</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "map"}
          className={`planner-mobile-tab ${mobileTab === "map" ? "is-active" : ""}`}
          onClick={() => setMobileTab("map")}
        >
          <Map size={14} aria-hidden="true" />
          <span>Bản đồ ({day.stops.length})</span>
        </button>
      </div>

      {/* 4. Main 2-Column Desktop Grid */}
      <div className={`planner-grid planner-view-${mobileTab}`}>
        {/* Left Column: Itinerary Timeline */}
        <section
          className="planner-timeline-panel"
          aria-labelledby="planner-timeline-title"
        >
          <div className="planner-timeline-header">
            <h2 ref={heading} id="planner-timeline-title" className="sr-only" tabIndex={-1}>
              <Route size={20} aria-hidden="true" />
              <span>Chi tiết hành trình</span>
            </h2>

            {/* Compact route metrics under day tabs */}
            <TripOverviewCard day={day} />
          </div>

          <div
            id="planner-day-panel"
            role="tabpanel"
            aria-labelledby={`planner-tab-${day.day}`}
          >
            {day.stops.length ? (
              <ol className="planner-timeline">
                {day.stops.map((stop, index) => (
                  <ItineraryStopCard
                    key={stop.destination.id}
                    stop={stop}
                    nextStop={day.stops[index + 1]}
                    selected={stop.destination.id === selectedDestinationId}
                    onSelect={select}
                  />
                ))}
              </ol>
            ) : (
              <PlannerEmptyState onBack={onBack} />
            )}
          </div>


        </section>

        {/* Right Column: Sticky Map */}
        <div className="planner-map-panel">
          <ItineraryMap
            day={day}
            selectedDestinationId={selectedDestinationId}
            focusSelection={focusSelection}
            onSelect={select}
          />
        </div>
      </div>

      {/* 5. Slide-over Side Sheet for Validation & Warnings */}
      <ValidationSheet
        isOpen={validationSheetOpen}
        onClose={() => setValidationSheetOpen(false)}
        checks={proposal.checks}
        warnings={proposal.warnings}
      />

      {/* 6. Sticky Bottom Action Bar with Save Flow */}
      <TripConfirmationSection
        result={proposal}
        disabled={busy}
        onSaved={onSaved}
        onSaveStateChange={handleSaveStateChange}
        onUpdateStartDate={onUpdateStartDate}
        onBack={onBack}
        onRegenerate={onRegenerate}
      />

      <p className="planner-selection-status sr-only" role="status" aria-live="polite">
        Ngày {day.day}
        {selected ? ` · Đang chọn ${selected.destination.name}` : " · Chưa có điểm dừng"}
      </p>
    </PlannerContainer>
  );
}

export function PlannerEmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="planner-empty" role="status">
      <Mountain size={32} aria-hidden="true" />
      <h3>Chưa đủ điểm đến phù hợp</h3>
      <p>
        Chưa có đủ điểm đến công khai, tọa độ hoặc thời lượng tham quan để lập ngày này. Hệ thống không bổ sung địa điểm giả.
      </p>
      <button onClick={onBack} type="button">
        Điều chỉnh nhu cầu
      </button>
    </div>
  );
}

export function PlannerLoadingState() {
  return (
    <div className="planner-loading" role="status" aria-live="polite" aria-busy="true">
      <LoaderCircle className="trip-spinner" size={26} />
      <div>
        <strong>Đang tạo hành trình cho bạn…</strong>
        <p>
          AI đang chọn điểm đến phù hợp và sắp xếp lịch trình dựa trên thời lượng, phương tiện và sở thích của bạn.
        </p>
      </div>
      <div className="planner-skeleton-row" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default function TripPlannerFlow({
  confirmed,
  onBack,
  onSaveStateChange,
  onUpdateStartDate,
  embedded = false,
}: {
  confirmed: ConfirmedTripRequirement;
  onBack: () => void;
  onSaveStateChange?: (state: SaveState) => void;
  onUpdateStartDate?: (newDate: string) => void;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [currentRequirement, setCurrentRequirement] = useState(confirmed.requirement);
  const [proposal, setProposal] = useState<PlannerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Extract<PlannerClientResult, { ok: false }> | null>(null);
  const lock = useRef(false);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const attempt = useRef<{ key: string; requirement: ConfirmedTripRequirement["requirement"] } | null>(null);
  const snapshot = JSON.stringify(confirmed.requirement);
  const isInitialMount = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void generate(false, confirmed.requirement);
    return () => {
      mounted.current = false;
      abort.current?.abort();
      sequence.current++;
    };
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    abort.current?.abort();
    sequence.current++;
    lock.current = false;
    attempt.current = null;
    setProposal(null);
    setError(null);
    setBusy(false);
    setCurrentRequirement(confirmed.requirement);
    void generate(false, confirmed.requirement);
  }, [snapshot]);

  async function generate(retry = false, updatedRequirement?: ConfirmedTripRequirement["requirement"]) {
    if (lock.current) return;
    lock.current = true;
    const req = updatedRequirement ?? currentRequirement;
    if (updatedRequirement) setCurrentRequirement(updatedRequirement);
    const seq = ++sequence.current;
    const controller = new AbortController();
    abort.current = controller;
    if (!retry || !attempt.current || updatedRequirement) {
      attempt.current = { key: createIdempotencyKey(), requirement: structuredClone(req) };
    }
    const current = attempt.current;
    setBusy(true);
    setError(null);
    try {
      const result = await requestTripProposal(current.requirement, current.key, controller.signal);
      if (!mounted.current || seq !== sequence.current) return;
      if (result.ok) setProposal(result.proposal);
      else setError(result);
    } finally {
      if (seq === sequence.current) {
        lock.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }

  const back = () => {
    abort.current?.abort();
    sequence.current++;
    attempt.current = null;
    setProposal(null);
    onBack();
  };

  if (proposal) {
    return (
      <>
        <TripPlannerScreen
          proposal={proposal}
          busy={busy}
          onBack={back}
          onRegenerate={() => {
            void generate();
          }}
          onUpdateStartDate={(newDate) => {
            onUpdateStartDate?.(newDate);
            void generate(false, { ...currentRequirement, startDate: newDate });
          }}
          onSaveStateChange={onSaveStateChange}
          onSaved={(tripId) =>
            completeTripSave(
              tripId,
              (message) =>
                toast.success(message, {
                  id: "trip-saved",
                  position: "bottom-right",
                  duration: 5000,
                }),
              (href) => router.replace(href),
            )
          }
          embedded={embedded}
        />
        {error && (
          <PlannerErrorState
            error={error}
            onBack={back}
            onRetry={() => {
              void generate(true);
            }}
          />
        )}
        {busy && (
          <div className="planner-progress" role="status">
            <LoaderCircle className="trip-spinner" size={15} />
            <span>Đang tạo lại lịch trình…</span>
          </div>
        )}
      </>
    );
  }

  const PlannerContainer = embedded ? "div" : "main";
  return (
    <PlannerContainer className="planner-page" lang="vi">
      {error ? (
        <PlannerErrorState
          error={error}
          onBack={back}
          onRetry={() => {
            void generate(true);
          }}
        />
      ) : (
        <PlannerLoadingState />
      )}
    </PlannerContainer>
  );
}

export function PlannerErrorState({
  error,
  onBack,
  onRetry,
}: {
  error: Extract<PlannerClientResult, { ok: false }>;
  onBack: () => void;
  onRetry: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, [error]);

  return (
    <section className="planner-error" role="alert">
      <AlertCircle size={26} />
      <h2 ref={title} tabIndex={-1}>
        Chưa thể tạo lịch trình
      </h2>
      <p>{error.message || "Đã xảy ra lỗi khi tạo phương án cho chuyến đi này."}</p>
      <div>
        {error.code === "UNAUTHENTICATED" ? (
          <a href={buildAuthLoginHref("/trips/new")}>Đăng nhập lại</a>
        ) : (
          !["FORBIDDEN", "TRIP_REQUIREMENT_UNCLEAR", "PLANNER_DATA_CHANGED", "PLANNER_NOT_CONFIGURED"].includes(
            error.code,
          ) && (
            <button type="button" className="planner-primary" onClick={onRetry}>
              Thử lại
            </button>
          )
        )}
        <button type="button" onClick={onBack}>
          Quay lại chỉnh sửa
        </button>
      </div>
    </section>
  );
}
