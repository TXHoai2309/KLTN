"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route as NextRoute } from "next";
import { AlertCircle, ArrowLeft, LoaderCircle, Mountain, Route, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { ConfirmedTripRequirement } from "@/modules/trip-requirement/trip-requirement-review";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { requestTripProposal, type PlannerClientResult } from "@/lib/trip-planner-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { ItineraryMap } from "./itinerary-map";
import { TripConfirmationSection } from "./trip-confirmation-section";
import { isTripSaveNavigationLocked, type SaveState } from "@/modules/trip-save/trip-save-state";
import { DestinationPreviewCard, ItineraryDayTabs, ItineraryStopCard, ItineraryValidationPanel, PlannerActions, TripOverviewCard, TripSummaryBar } from "./planner-presentation";
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
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(proposal.days[0]?.stops[0]?.destination.id ?? null);
  const [focusSelection, setFocusSelection] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const handleSaveStateChange = useCallback((state: SaveState) => {
    setSaveState(state);
    onSaveStateChange?.(state);
  }, [onSaveStateChange]);
  const heading = useRef<HTMLHeadingElement>(null);
  const day = proposal.days.find(item => item.day === dayNumber) ?? proposal.days[0]!;
  useEffect(() => { setDayNumber(1); setSelectedDestinationId(proposal.days[0]?.stops[0]?.destination.id ?? null); setFocusSelection(false); setSaveState("idle"); heading.current?.focus(); }, [proposal]);
  const select = (id: string) => { setSelectedDestinationId(id); setFocusSelection(true); };
  const changeDay = (number: number) => { setDayNumber(number); setSelectedDestinationId(proposal.days.find(item => item.day === number)?.stops[0]?.destination.id ?? null); setFocusSelection(false); };
  const selected = day.stops.find(stop => stop.destination.id === selectedDestinationId);
  const PlannerContainer = embedded ? "div" : "main";

  return <PlannerContainer className="planner-page" lang="vi" aria-busy={busy}>
    <TripSummaryBar requirement={proposal.requirement} days={proposal.days} embedded={embedded} />
    <div className={`planner-result-notice planner-result-${proposal.status.toLowerCase()}`} role="status" aria-live="polite"><ShieldCheck size={18} aria-hidden="true" /><span>{proposal.status === "PROPOSAL_READY" ? "Đề xuất đáp ứng các kiểm tra hiện tại; chưa được lưu chính thức." : proposal.status === "NO_FEASIBLE_ITINERARY" ? "Chưa thể bố trí một lịch trình đáp ứng tất cả ràng buộc. Hãy xem các mục cần điều chỉnh." : "Đề xuất còn dữ liệu chưa được xác minh. Hãy xem các cảnh báo trước khi sử dụng."}</span></div>
    <div className="planner-grid">
      <section className="planner-timeline-panel" aria-labelledby="planner-timeline-title"><h2 ref={heading} id="planner-timeline-title" tabIndex={-1}><Route size={23} aria-hidden="true" />Lịch trình đề xuất</h2>
        <ItineraryDayTabs days={proposal.days} selectedDay={day.day} onChange={changeDay} />
        <div id="planner-day-panel" role="tabpanel" aria-labelledby={`planner-tab-${day.day}`}>
          {day.stops.length ? <ol className="planner-timeline">{day.stops.map(stop => <ItineraryStopCard key={stop.destination.id} stop={stop} selected={stop.destination.id === selectedDestinationId} onSelect={select} />)}</ol> : <PlannerEmptyState onBack={onBack} />}
        </div>
        <ItineraryValidationPanel checks={proposal.checks} />
        <details className="planner-warnings"><summary><AlertCircle size={16} />Lưu ý cho đề xuất này ({proposal.warnings.length})</summary><ul>{proposal.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul></details>
        <TripConfirmationSection result={proposal} disabled={busy} onSaved={onSaved} onSaveStateChange={handleSaveStateChange} onUpdateStartDate={onUpdateStartDate} secondaryActions={<PlannerActions busy={busy} disabled={isTripSaveNavigationLocked(saveState)} onBack={onBack} onRegenerate={onRegenerate} />} />
      </section>
      <div className="planner-map-panel"><TripOverviewCard day={day} /><ItineraryMap day={day} selectedDestinationId={selectedDestinationId} focusSelection={focusSelection} onSelect={select} /><DestinationPreviewCard stop={selected} /></div>
    </div>
    <p className="planner-selection-status" role="status" aria-live="polite">Ngày {day.day}{selected ? ` · Đang chọn ${selected.destination.name}` : " · Chưa có điểm dừng"}</p>
  </PlannerContainer>;
}
export function PlannerEmptyState({ onBack }: { onBack: () => void }) { return <div className="planner-empty" role="status"><Mountain size={34} aria-hidden="true" /><h3>Chưa đủ điểm đến phù hợp</h3><p>Chưa có đủ điểm đến công khai, tọa độ hoặc thời lượng tham quan để lập ngày này. Hệ thống không bổ sung địa điểm giả.</p><button onClick={onBack} type="button">Điều chỉnh nhu cầu</button></div>; }
export function PlannerLoadingState() {
  return (
    <div className="planner-loading" role="status" aria-live="polite" aria-busy="true">
      <LoaderCircle className="trip-spinner" size={28} />
      <div>
        <strong>Đang tạo hành trình cho bạn…</strong>
        <p>AI đang chọn điểm đến phù hợp và sắp xếp lịch trình dựa trên thời lượng, phương tiện và sở thích của bạn.</p>
      </div>
      <div className="planner-skeleton-row" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default function TripPlannerFlow({ confirmed, onBack, onSaveStateChange, onUpdateStartDate, embedded = false }: { confirmed: ConfirmedTripRequirement; onBack: () => void; onSaveStateChange?: (state: SaveState) => void; onUpdateStartDate?: (newDate: string) => void; embedded?: boolean }) {
  const router = useRouter();
  const [currentRequirement, setCurrentRequirement] = useState(confirmed.requirement);
  const [proposal, setProposal] = useState<PlannerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Extract<PlannerClientResult, { ok: false }> | null>(null);
  const lock = useRef(false), mounted = useRef(false), sequence = useRef(0);
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
    if (lock.current) return; lock.current = true;
    const req = updatedRequirement ?? currentRequirement;
    if (updatedRequirement) setCurrentRequirement(updatedRequirement);
    const seq = ++sequence.current;
    const controller = new AbortController(); abort.current = controller;
    if (!retry || !attempt.current || updatedRequirement) attempt.current = { key: createIdempotencyKey(), requirement: structuredClone(req) };
    const current = attempt.current;
    setBusy(true); setError(null);
    try {
      const result = await requestTripProposal(current.requirement, current.key, controller.signal);
      if (!mounted.current || seq !== sequence.current) return;
      if (result.ok) setProposal(result.proposal); else setError(result);
    } finally { if (seq === sequence.current) { lock.current = false; if (mounted.current) setBusy(false); } }
  }

  const back = () => { abort.current?.abort(); sequence.current++; attempt.current = null; setProposal(null); onBack(); };

  if (proposal) return <><TripPlannerScreen proposal={proposal} busy={busy} onBack={back} onRegenerate={() => { void generate(); }} onUpdateStartDate={(newDate) => { onUpdateStartDate?.(newDate); void generate(false, { ...currentRequirement, startDate: newDate }); }} onSaveStateChange={onSaveStateChange} onSaved={tripId => completeTripSave(
    tripId,
    message => toast.success(message, { id: "trip-saved", position: "bottom-right", duration: 5000 }),
    href => router.replace(href),
  )} embedded={embedded} />{error && <PlannerErrorState error={error} onBack={back} onRetry={() => { void generate(true); }} />}{busy && <div className="planner-progress" role="status"><LoaderCircle className="trip-spinner" />Đang tạo lại lịch trình…</div>}</>;

  const PlannerContainer = embedded ? "div" : "main";
  return (
    <PlannerContainer className="planner-page" lang="vi">
      {error ? (
        <PlannerErrorState error={error} onBack={back} onRetry={() => { void generate(true); }} />
      ) : (
        <PlannerLoadingState />
      )}
    </PlannerContainer>
  );
}

export function PlannerErrorState({ error, onBack, onRetry }: { error: Extract<PlannerClientResult, { ok: false }>; onBack: () => void; onRetry: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [error]);
  return (
    <section className="planner-error" role="alert">
      <AlertCircle size={28} />
      <h2 ref={title} tabIndex={-1}>Chưa thể tạo lịch trình</h2>
      <p>{error.message || "Đã xảy ra lỗi khi tạo phương án cho chuyến đi này."}</p>
      <div>
        {error.code === "UNAUTHENTICATED" ? (
          <a href={buildAuthLoginHref("/trips/new")}>Đăng nhập lại</a>
        ) : !["FORBIDDEN", "TRIP_REQUIREMENT_UNCLEAR", "PLANNER_DATA_CHANGED", "PLANNER_NOT_CONFIGURED"].includes(error.code) && (
          <button type="button" className="planner-primary" onClick={onRetry}>Thử lại</button>
        )}
        <button type="button" onClick={onBack}>Quay lại chỉnh sửa</button>
      </div>
    </section>
  );
}
