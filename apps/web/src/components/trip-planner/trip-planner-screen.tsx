"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, LoaderCircle, MapPinned, Mountain, Route, ShieldCheck } from "lucide-react";
import type { ConfirmedTripRequirement } from "@/modules/trip-requirement/trip-requirement-review";
import type { PlannerResult } from "@/modules/trip-planner/planner-contract";
import { requestTripProposal, type PlannerClientResult } from "@/lib/trip-planner-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { ItineraryMap } from "./itinerary-map";
import { DestinationPreviewCard, ItineraryDayTabs, ItineraryStopCard, ItineraryValidationPanel, PlannerActions, TripOverviewCard, TripSummaryBar } from "./planner-presentation";
import "./trip-planner.css";

export function TripPlannerScreen({ proposal, busy = false, onBack, onRegenerate, embedded = false }: { proposal: PlannerResult; busy?: boolean; onBack: () => void; onRegenerate: () => void; embedded?: boolean }) {
  const [dayNumber, setDayNumber] = useState(1);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(proposal.days[0]?.stops[0]?.destination.id ?? null);
  const [focusSelection, setFocusSelection] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const day = proposal.days.find(item => item.day === dayNumber) ?? proposal.days[0]!;
  useEffect(() => { setDayNumber(1); setSelectedDestinationId(proposal.days[0]?.stops[0]?.destination.id ?? null); setFocusSelection(false); heading.current?.focus(); }, [proposal]);
  const select = (id: string) => { setSelectedDestinationId(id); setFocusSelection(true); };
  const changeDay = (number: number) => { setDayNumber(number); setSelectedDestinationId(proposal.days.find(item => item.day === number)?.stops[0]?.destination.id ?? null); setFocusSelection(false); };
  const selected = day.stops.find(stop => stop.destination.id === selectedDestinationId);
  const PlannerContainer = embedded ? "div" : "main";
  return <PlannerContainer className="planner-page" lang="vi" aria-busy={busy}>
    <TripSummaryBar requirement={proposal.requirement} days={proposal.days} />
    <div className={`planner-result-notice planner-result-${proposal.status.toLowerCase()}`} role="status" aria-live="polite"><ShieldCheck size={18} aria-hidden="true" /><span>{proposal.status === "PROPOSAL_READY" ? "Đề xuất đáp ứng các kiểm tra hiện tại; chưa được lưu chính thức." : proposal.status === "NO_FEASIBLE_ITINERARY" ? "Chưa thể bố trí một lịch trình đáp ứng tất cả ràng buộc. Hãy xem các mục cần điều chỉnh." : "Đề xuất còn dữ liệu chưa được xác minh. Hãy xem các cảnh báo trước khi sử dụng."}</span></div>
    <div className="planner-grid">
      <section className="planner-timeline-panel" aria-labelledby="planner-timeline-title"><h2 ref={heading} id="planner-timeline-title" tabIndex={-1}><Route size={23} aria-hidden="true" />Lịch trình đề xuất</h2>
        <ItineraryDayTabs days={proposal.days} selectedDay={day.day} onChange={changeDay} />
        <div id="planner-day-panel" role="tabpanel" aria-labelledby={`planner-tab-${day.day}`}>
          {day.stops.length ? <ol className="planner-timeline">{day.stops.map(stop => <ItineraryStopCard key={stop.destination.id} stop={stop} selected={stop.destination.id === selectedDestinationId} onSelect={select} />)}</ol> : <PlannerEmptyState onBack={onBack} />}
        </div>
        <ItineraryValidationPanel checks={proposal.checks} />
        <details className="planner-warnings"><summary><AlertCircle size={16} />Lưu ý cho đề xuất này ({proposal.warnings.length})</summary><ul>{proposal.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul></details>
        <PlannerActions busy={busy} onBack={onBack} onRegenerate={onRegenerate} />
      </section>
      <div className="planner-map-panel"><TripOverviewCard day={day} /><ItineraryMap day={day} selectedDestinationId={selectedDestinationId} focusSelection={focusSelection} onSelect={select} /><DestinationPreviewCard stop={selected} /></div>
    </div>
    <p className="planner-selection-status" role="status" aria-live="polite">Ngày {day.day}{selected ? ` · Đang chọn ${selected.destination.name}` : " · Chưa có điểm dừng"}</p>
  </PlannerContainer>;
}
export function PlannerEmptyState({ onBack }: { onBack: () => void }) { return <div className="planner-empty" role="status"><Mountain size={34} aria-hidden="true" /><h3>Chưa đủ điểm đến phù hợp</h3><p>Chưa có đủ điểm đến công khai, tọa độ hoặc thời lượng tham quan để lập ngày này. Hệ thống không bổ sung địa điểm giả.</p><button onClick={onBack} type="button">Điều chỉnh nhu cầu</button></div>; }
export function PlannerLoadingState() { return <div className="planner-loading" role="status" aria-live="polite" aria-busy="true"><LoaderCircle className="trip-spinner" size={25} /><div><strong>Đang sắp xếp hành trình của bạn</strong><p>Đối chiếu điểm đến, dữ liệu di chuyển và các ràng buộc…</p></div><div className="planner-skeleton-row" aria-hidden="true"><span /><span /><span /></div></div>; }
export default function TripPlannerFlow({ confirmed, onBack, embedded = false }: { confirmed: ConfirmedTripRequirement; onBack: () => void; embedded?: boolean }) {
  const [proposal, setProposal] = useState<PlannerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Extract<PlannerClientResult, { ok: false }> | null>(null);
  const lock = useRef(false), mounted = useRef(false), sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const attempt = useRef<{ key: string; requirement: ConfirmedTripRequirement["requirement"] } | null>(null);
  const snapshot = JSON.stringify(confirmed.requirement);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); sequence.current++; }; }, []);
  useEffect(() => { abort.current?.abort(); sequence.current++; lock.current = false; attempt.current = null; setProposal(null); setError(null); setBusy(false); }, [snapshot]);
  async function generate(retry = false) {
    if (lock.current) return; lock.current = true;
    const seq = ++sequence.current;
    const controller = new AbortController(); abort.current = controller;
    if (!retry || !attempt.current) attempt.current = { key: createIdempotencyKey(), requirement: structuredClone(confirmed.requirement) };
    const current = attempt.current;
    setBusy(true); setError(null);
    try {
      const result = await requestTripProposal(current.requirement, current.key, controller.signal);
      if (!mounted.current || seq !== sequence.current) return;
      if (result.ok) setProposal(result.proposal); else setError(result);
    } finally { if (seq === sequence.current) { lock.current = false; if (mounted.current) setBusy(false); } }
  }
  const back = () => { abort.current?.abort(); sequence.current++; attempt.current = null; setProposal(null); onBack(); };
  if (proposal) return <><TripPlannerScreen proposal={proposal} busy={busy} onBack={back} onRegenerate={() => { void generate(); }} embedded={embedded} />{error && <PlannerErrorState error={error} onBack={back} onRetry={() => { void generate(true); }} />}{busy && <div className="planner-progress" role="status"><LoaderCircle className="trip-spinner" />Đang tạo lại lịch trình…</div>}</>;
  const PlannerContainer = embedded ? "div" : "main";
  return <PlannerContainer className="planner-page" lang="vi"><TripSummaryBar requirement={confirmed.requirement} />{busy ? <PlannerLoadingState /> : error ? <PlannerErrorState error={error} onBack={back} onRetry={() => { void generate(true); }} /> :
     <section className="planner-start"><span className="planner-start-icon"><MapPinned size={36} /></span><p className="planner-eyebrow">Nhu cầu đã được kiểm tra</p><h2 data-trip-panel-heading tabIndex={-1}>Sẵn sàng khám phá Hà Giang?</h2><p>Chúng tôi sẽ sắp xếp các điểm đến hiện có thành lịch trình theo ngày, rồi kiểm tra thời lượng, giờ mở cửa và dữ liệu di chuyển.</p><button type="button" className="planner-primary" onClick={() => { void generate(); }}><Route size={18} />Tạo lịch trình đề xuất</button><button type="button" className="planner-start-back" onClick={back}><ArrowLeft size={16} />Quay lại chỉnh nhu cầu</button><small>Đây là đề xuất trong phiên hiện tại, chưa tạo hành trình chính thức.</small></section>}</PlannerContainer>;
}
export function PlannerErrorState({ error, onBack, onRetry }: { error: Extract<PlannerClientResult, { ok: false }>; onBack: () => void; onRetry: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [error]);
  return <section className="planner-error" role="alert"><AlertCircle size={28} /><h2 ref={title} tabIndex={-1}>Chưa thể tạo đề xuất lúc này</h2><p>{error.message}</p><div>{error.code === "UNAUTHENTICATED" ? <a href={buildAuthLoginHref("/trips/new")}>Đăng nhập lại</a> : !["FORBIDDEN", "TRIP_REQUIREMENT_UNCLEAR", "PLANNER_DATA_CHANGED", "PLANNER_NOT_CONFIGURED"].includes(error.code) && <button type="button" className="planner-primary" onClick={onRetry}>Thử lại cùng yêu cầu</button>}<button type="button" onClick={onBack}>Quay lại chỉnh nhu cầu</button></div></section>;
}
