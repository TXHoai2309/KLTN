import type { Route } from "next";
import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  Clock3,
  Lock,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import type { CompanionIntroduction } from "@/modules/trip-companions/companion-contract";

export interface CompanionIntroductionViewProps {
  introduction: CompanionIntroduction;
  publicationId?: string;
  tripId?: string;
  isHost?: boolean;
  isPreview?: boolean;
}

function formatDateVi(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

function formatRangeVi(startStr: string, endStr: string): string {
  const [sY, sM, sD] = startStr.split("-");
  const [eY, eM, eD] = endStr.split("-");
  if (!sY || !eY) return `${startStr} – ${endStr}`;
  if (sY === eY && sM === eM) {
    return `${sD} – ${eD}/${sM}/${sY}`;
  }
  if (sY === eY) {
    return `${sD}/${sM} – ${eD}/${eM}/${sY}`;
  }
  return `${sD}/${sM}/${sY} – ${eD}/${eM}/${eY}`;
}

export function CompanionIntroductionView({
  introduction,
  publicationId,
  tripId,
  isHost = false,
  isPreview = false,
}: CompanionIntroductionViewProps) {
  const transportLabel = introduction.transport === "CAR" ? "Ô tô" : "Xe máy";
  const dateRangeLabel = formatRangeVi(introduction.startDate, introduction.endDate);
  const hostInitial = introduction.host.displayName.slice(0, 1).toUpperCase();

  return (
    <div className="companion-layout" data-testid="companion-introduction-view">
      {/* ─── Main Column: Visual & Story Content ─── */}
      <div className="companion-main-col">
        {/* Title & Eyebrow */}
        <header className="companion-header mb-1">
          <p className="companion-eyebrow">
            <Users size={14} aria-hidden="true" />
            <span>Tìm bạn đồng hành</span>
          </p>
          <h1 className="companion-title" data-testid="companion-title">
            {introduction.title}
          </h1>
        </header>

        {/* Visual Media Header (if present and usable) */}
        {introduction.image && (
          <div className="companion-hero-image-wrap">
            <img
              src={introduction.image.url}
              alt={introduction.image.alt}
              className="companion-hero-image"
              loading="lazy"
            />
          </div>
        )}

        {/* Story Section: Title & Introduction */}
        <section className="companion-card" aria-labelledby="companion-about-heading">
          <h2 id="companion-about-heading" className="companion-section-title">
            Về chuyến đi
          </h2>
          <div className="companion-prose" data-testid="companion-prose">
            {introduction.introduction}
          </div>
        </section>

        {/* Expected Route Summary */}
        <section className="companion-card" aria-labelledby="companion-route-heading">
          <h2 id="companion-route-heading" className="companion-section-title">
            Tuyến dự kiến
          </h2>
          {introduction.routeSummary.length > 0 ? (
            <div className="companion-route-track" aria-label="Các điểm đến trong tuyến">
              {introduction.routeSummary.map((point, index) => (
                <span key={`${point.destinationId}-${index}`} className="companion-route-node">
                  {index > 0 && <span className="companion-route-arrow" aria-hidden="true">→</span>}
                  <MapPin size={14} className="text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <span>{point.name}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="companion-sub-note text-left">Chưa có điểm dừng cụ thể cho hành trình này.</p>
          )}
        </section>

        {/* Member-Only Itinerary & Chat Disclosure */}
        <div className="companion-lock-banner" role="note" aria-label="Thông tin quyền xem lịch trình">
          <div className="companion-lock-icon" aria-hidden="true">
            <Lock size={20} />
          </div>
          <div className="companion-lock-copy">
            <strong>Lịch trình chi tiết và thảo luận nhóm dành cho thành viên</strong>
            <p>
              Tham gia chuyến đi để xem lịch trình từng ngày và trao đổi trong không gian trò chuyện nhóm. Lịch sử trao đổi được giữ nguyên vẹn cho thành viên mới.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Side Column: Action & Details Rail ─── */}
      <aside className="companion-side-panel" aria-label="Thông số và tham gia chuyến đi">
        {/* Capacity Spotlight */}
        <div className="companion-capacity-highlight">
          <span className="companion-capacity-badge" data-testid="companion-places-badge">
            Còn {introduction.availablePlaces} chỗ tìm thêm
          </span>
          <p className="companion-capacity-sub">
            Số chỗ tìm thêm: {introduction.additionalCapacity} (chưa tính chủ chuyến)
          </p>
        </div>

        {/* Key Trip Metadata */}
        <div className="companion-meta-rows">
          <div className="companion-meta-row">
            <span className="companion-meta-label">
              <CalendarDays size={16} aria-hidden="true" />
              <span>Thời gian</span>
            </span>
            <span className="companion-meta-val">{dateRangeLabel}</span>
          </div>

          <div className="companion-meta-row">
            <span className="companion-meta-label">
              <Clock3 size={16} aria-hidden="true" />
              <span>Thời lượng</span>
            </span>
            <span className="companion-meta-val">{introduction.durationDays} ngày</span>
          </div>

          <div className="companion-meta-row">
            <span className="companion-meta-label">
              <CarFront size={16} aria-hidden="true" />
              <span>Phương tiện</span>
            </span>
            <span className="companion-meta-val">{transportLabel}</span>
          </div>
        </div>

        {/* Host Identity Card */}
        <div className="companion-host-card">
          {introduction.host.avatarUrl ? (
            <img
              src={introduction.host.avatarUrl}
              alt=""
              className="companion-host-avatar"
            />
          ) : (
            <div className="companion-host-avatar" aria-hidden="true">
              {hostInitial}
            </div>
          )}
          <div className="companion-host-info">
            <strong>{introduction.host.displayName}</strong>
            <span>Chủ chuyến</span>
          </div>
        </div>

        {/* Scope-Guarded Call to Action & Notice (No fake join mutation in TC-01) */}
        {isPreview ? (
          <div className="companion-action-notice" role="status">
            <div className="flex items-center gap-2 font-medium mb-1">
              <Sparkles size={16} aria-hidden="true" />
              <span>Góc nhìn người xem trước</span>
            </div>
            <p className="m-0 text-xs text-muted-foreground">
              Đây là giao diện người dùng và khách sẽ nhìn thấy khi bạn công khai chuyến đi.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="companion-action-notice" role="status">
              <p className="m-0 text-xs">
                Chuyến đi đang nhận tìm bạn đồng hành. Thành viên mới sẽ được xem đầy đủ lịch trình và lịch sử nhóm.
              </p>
            </div>

            {isHost && tripId ? (
              <Link
                href={`/trips/${tripId}` as Route}
                className="companion-cta-button"
              >
                <span>Quay lại quản lý chuyến đi</span>
              </Link>
            ) : null}

            <p className="companion-sub-note">
              Tham gia ngay khi còn chỗ · Không cần chờ duyệt
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
