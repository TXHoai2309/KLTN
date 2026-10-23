"use client";
import type { KeyboardEvent } from "react";
import { formatVietnameseDate } from "@/lib/date-only";
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, Bike, CalendarDays, Car, CheckCircle2, Clock3, Flag, Heart, MapPin, Mountain, Route, ShieldCheck, Users, XCircle } from "lucide-react";
import { COMPANION_OPTIONS, INTEREST_OPTIONS, PACE_OPTIONS, type TripRequirementInput } from "@/modules/trip-requirement/trip-requirement-contract";
import type { CheckStatus, PlannerDay, PlannerResult, PlannerStop } from "@/modules/trip-planner/planner-contract";

export const clockText = (minute: number | null) => minute === null ? "Chưa xác định" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const durationText = (minutes: number) => `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} giờ ` : ""}${minutes % 60 ? `${minutes % 60} phút` : ""}`.trim();
const statuses: Record<CheckStatus, { label: string; Icon: typeof CheckCircle2 }> = { PASS: { label: "Đáp ứng", Icon: CheckCircle2 }, VIOLATION: { label: "Vi phạm", Icon: XCircle }, INSUFFICIENT_DATA: { label: "Chưa đủ dữ liệu", Icon: AlertTriangle } };
export function ValidationBadge({ status }: { status: CheckStatus }) { const { label, Icon } = statuses[status]; return <span className={`planner-badge planner-badge-${status.toLowerCase()}`}><Icon size={13} aria-hidden="true" />{label}</span>; }
export function DestinationImage({ stop, large = false }: { stop: PlannerStop; large?: boolean }) {
  return stop.destination.image ? <img className={large ? "planner-photo planner-photo-large" : "planner-photo"} src={stop.destination.image.url} alt={stop.destination.image.alt} loading="lazy" /> :
    <div className={large ? "planner-photo planner-photo-large planner-photo-empty" : "planner-photo planner-photo-empty"} role="img" aria-label="Chưa có ảnh điểm đến"><Mountain size={large ? 44 : 28} aria-hidden="true" /><span>Chưa có ảnh</span></div>;
}
export function TripSummaryBar({ requirement, days, embedded = false }: { requirement: TripRequirementInput; days?: PlannerDay[]; embedded?: boolean }) {
  const { durationDays, transport, pace, companions, interests, startDate } = requirement;
  const endDate = days?.at(-1)?.date;
  const Heading = embedded ? "h2" : "h1";
  return <section className="planner-summary" aria-label="Tóm tắt nhu cầu chuyến đi">
    <div className="planner-summary-title"><span className="planner-summary-mark"><Mountain size={30} aria-hidden="true" /></span><div><p className="planner-eyebrow">Hành trình của bạn</p><Heading>Hà Giang · {durationDays} ngày khám phá</Heading><p>Đề xuất sơ bộ · Chưa xác nhận hoặc lưu chính thức</p></div></div>
    <div className="planner-summary-chips">
      <div className="planner-chip"><CalendarDays /><span><strong>{durationDays} ngày</strong><small>{startDate ? `${formatVietnameseDate(startDate)} – ${endDate ? formatVietnameseDate(endDate) : "theo ngày bắt đầu"}` : `Ngày 1 – Ngày ${durationDays}`}</small></span></div>
      <div className="planner-chip planner-chip-teal">{transport === "CAR" ? <Car /> : <Bike />}<span><strong>{transport === "CAR" ? "Ô tô" : "Xe máy"}</strong><small>Phương tiện đã chọn</small></span></div>
      <div className="planner-chip planner-chip-sand"><Activity /><span><strong>{pace ? PACE_OPTIONS.find(option => option.value === pace)?.label : "Chưa chọn nhịp độ"}</strong><small>{pace ? "Nhịp độ chuyến đi" : "Đề xuất dùng nhịp vừa phải"}</small></span></div>
      <div className="planner-chip planner-chip-violet"><Users /><span><strong>{companions ? `${companions.groupSize} người` : "Chưa chọn nhóm"}</strong><small>{COMPANION_OPTIONS.find(option => option.value === companions?.type)?.label ?? "Thông tin tùy chọn"}</small></span></div>
      <div className="planner-chip planner-chip-rose"><Heart /><span><strong>Sở thích</strong><small>{interests.length ? interests.map(interest => INTEREST_OPTIONS.find(option => option.value === interest)?.label).join(" · ") : "Chưa chọn sở thích"}</small></span></div>
    </div>
  </section>;
}
export function ItineraryDayTabs({ days, selectedDay, onChange }: { days: PlannerDay[]; selectedDay: number; onChange: (day: number) => void }) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % days.length;
    else if (event.key === "ArrowLeft") next = (index + days.length - 1) % days.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = days.length - 1;
    else return;
    event.preventDefault(); onChange(days[next]!.day);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }
  return <div className="planner-day-tabs" role="tablist" aria-label="Chọn ngày trong lịch trình">{days.map((day, index) => <button id={`planner-tab-${day.day}`} key={day.day} role="tab" aria-selected={selectedDay === day.day} aria-controls="planner-day-panel" tabIndex={selectedDay === day.day ? 0 : -1} onClick={() => onChange(day.day)} onKeyDown={event => navigate(event, index)}>
    <Mountain size={21} aria-hidden="true" /><span><strong>Ngày {day.day}</strong><small>{day.date ? formatVietnameseDate(day.date) : "Ngày tương đối"}</small></span></button>)}</div>;
}
export function ItineraryStopCard({ stop, selected, onSelect }: { stop: PlannerStop; selected: boolean; onSelect: (id: string) => void }) {
  return <li className={`planner-stop ${selected ? "is-selected" : ""}`}>
    <span className="planner-stop-number" aria-hidden="true">{stop.order}</span>
    <button type="button" className="planner-stop-select" aria-pressed={selected} onClick={() => onSelect(stop.destination.id)}>
      <DestinationImage stop={stop} />
      <span className="planner-stop-content"><span className="planner-stop-heading"><strong>{stop.destination.name}</strong><ValidationBadge status={stop.validationStatus} /></span>
        <span className="planner-stop-description">{stop.destination.description || "Chưa có mô tả điểm đến."}</span>
        <span className="planner-stop-meta"><span><Clock3 />{clockText(stop.arrivalMinute)}</span><span><Flag />{clockText(stop.departureMinute)}</span><span><Activity />{durationText(stop.visitDurationMinutes)}</span></span>
        {stop.inbound && <span className="planner-stop-travel"><Car size={14} aria-hidden="true" />{stop.inbound.status === "VERIFIED" ? `${durationText(Math.ceil(stop.inbound.durationSeconds! / 60))} · ${(stop.inbound.distanceMeters! / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km (Stadia Maps)` : "Chưa có thời gian di chuyển đã xác minh"}</span>}
      </span>
    </button>
  </li>;
}
export function ItineraryValidationPanel({ checks }: { checks: PlannerResult["checks"] }) {
  const labels = { OPENING_HOURS: "Giờ mở cửa", MINIMUM_DURATION: "Thời lượng tối thiểu", TRAVEL_TIME: "Thời gian di chuyển", SCHEDULE_CONFLICTS: "Xung đột lịch trình", MOBILITY: "Khả năng tiếp cận" };
  return <section className="planner-validation" aria-labelledby="planner-validation-title"><h3 id="planner-validation-title"><ShieldCheck size={18} aria-hidden="true" />Kiểm tra lịch trình</h3>
    <div className="planner-validation-grid">{checks.map(check => <details key={check.key} className={`planner-check planner-check-${check.status.toLowerCase()}`}><summary><strong>{labels[check.key]}</strong><ValidationBadge status={check.status} /></summary>
      {check.issues.length ? <ul>{check.issues.map((issue, index) => <li key={index}>{issue.day ? `Ngày ${issue.day}: ` : ""}{issue.message}</li>)}</ul> : <p>Kiểm tra máy chủ đáp ứng ràng buộc này.</p>}</details>)}</div>
  </section>;
}
export function TripOverviewCard({ day }: { day: PlannerDay }) {
  return <section className="planner-overview" aria-label="Tổng quan hành trình"><div><Route /><span><small>Quãng đường ngày {day.day}</small><strong>{day.distanceMeters === null ? "Chưa đủ dữ liệu" : `${(day.distanceMeters / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`}</strong></span></div>
    <div><Clock3 /><span><small>Thời gian di chuyển</small><strong>{day.travelSeconds === null ? "Chưa đủ dữ liệu" : day.travelSeconds ? durationText(Math.ceil(day.travelSeconds / 60)) : "Không có chặng nối"}</strong></span></div><div><MapPin /><span><small>Điểm dừng</small><strong>{day.stops.length} điểm</strong></span></div>
    {day.stops.some(stop => stop.inbound?.provider === "STADIA_MAPS") && <p className="planner-provider-credit">Stadia Maps · Ước tính đường bộ, không gồm giao thông thời gian thực.</p>}
  </section>;
}
export function DestinationPreviewCard({ stop }: { stop: PlannerStop | undefined }) {
  if (!stop) return <section className="planner-preview planner-preview-empty"><MapPin size={26} /><p>Chọn một điểm dừng để xem thông tin.</p></section>;
  return <section className="planner-preview" aria-label={`Thông tin ${stop.destination.name}`}><DestinationImage stop={stop} large />
    <div><div className="planner-preview-heading"><span className="planner-preview-number">{stop.order}</span><h2>{stop.destination.name}</h2><ValidationBadge status={stop.validationStatus} /></div>
      <details className="planner-preview-description"><summary>Giới thiệu điểm đến</summary><p>{stop.destination.description || "Chưa có mô tả điểm đến."}</p></details><ul className="planner-preview-meta"><li><MapPin />{stop.destination.address || stop.destination.area}</li><li><Clock3 />{clockText(stop.arrivalMinute)} – {clockText(stop.departureMinute)} · {durationText(stop.visitDurationMinutes)}</li>
        {stop.inbound && <li><Car />{stop.inbound.status === "VERIFIED" ? `Stadia Maps · ${durationText(Math.ceil(stop.inbound.durationSeconds! / 60))} · ${(stop.inbound.distanceMeters! / 1000).toFixed(1)} km` : "Chưa có dữ liệu di chuyển phù hợp"}</li>}</ul>
      {stop.destination.image?.author && <p className="planner-image-credit">Ảnh: {stop.destination.image.author}{stop.destination.image.sourceUrl && <> · <a href={stop.destination.image.sourceUrl} target="_blank" rel="noopener noreferrer">Nguồn ảnh</a></>}</p>}
      <a className="planner-detail-link" href={`/destinations/${encodeURIComponent(stop.destination.id)}`} target="_blank" rel="noopener noreferrer">Xem chi tiết <ArrowRight size={16} aria-hidden="true" /></a>
    </div>
  </section>;
}
export function PlannerActions({ busy, disabled = false, onBack, onRegenerate }: { busy: boolean; disabled?: boolean; onBack: () => void; onRegenerate: () => void }) {
  return <div className="planner-actions"><button type="button" onClick={onBack} disabled={busy || disabled}><ArrowLeft size={17} aria-hidden="true" />Chỉnh sửa nhu cầu</button><button type="button" onClick={onRegenerate} disabled={busy || disabled}><Route size={17} aria-hidden="true" />{busy ? "Đang tạo đề xuất…" : "Tạo lại lịch trình"}</button></div>;
}
