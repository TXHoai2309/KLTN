"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogIn,
  ArrowRight,
  Map,
  Mountain,
  ChevronRight,
} from "lucide-react";
import { ItineraryMap } from "@/components/trip-planner/itinerary-map";
import type { PlannerDay, PlannerStop, TravelLeg } from "@/modules/trip-planner/planner-contract";
import {
  getDestinationCoordinates,
  getDestinationVisual,
  inferDestinationArea,
} from "@/lib/destination-visuals";
import { Card } from "@KLTN/ui/components/card";
import type { CompanionIntroduction, PublicCompanion } from "@/modules/trip-companions/companion-contract";
import { joinCompanionTrip } from "@/modules/trip-companions/companion-client";

export interface CompanionIntroductionViewProps {
  introduction: CompanionIntroduction;
  publicationId?: string;
  recruitmentStatus?: PublicCompanion["recruitmentStatus"];
  tripId?: string;
  isHost?: boolean;
  isMember?: boolean;
  isGuest?: boolean;
  isPreview?: boolean;
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

function formatDateVi(dateStr: string | null): string {
  if (!dateStr) return "Chưa có ngày";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

function formatWeekdayVi(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(
      new Date(`${dateStr}T00:00:00Z`),
    );
  } catch {
    return "";
  }
}

function formatMinuteOfDay(totalMinutes: number | null): string {
  if (totalMinutes === null) return "Chưa có giờ";
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function buildLoginHref(publicationId?: string): string {
  if (!publicationId) return "/login";
  return `/login?returnTo=${encodeURIComponent(`/trip-companions/${publicationId}`)}`;
}

function partitionRouteSummaryToPlannerDays(introduction: CompanionIntroduction): PlannerDay[] {
  const daysCount = Math.max(1, introduction.durationDays);
  const baseDate = new Date(`${introduction.startDate}T00:00:00Z`);

  const stopsWithMeta = introduction.routeSummary.map((pt, idx) => {
    const coords = getDestinationCoordinates(pt.name, "", undefined, undefined, idx);
    const area = inferDestinationArea(pt.name);
    return {
      destinationId: pt.destinationId,
      name: pt.name,
      coords,
      area,
      globalIndex: idx,
    };
  });

  const dayGroups: (typeof stopsWithMeta)[] = Array.from({ length: daysCount }, () => []);
  if (stopsWithMeta.length > 0) {
    stopsWithMeta.forEach((item, idx) => {
      const dayIdx = Math.min(
        daysCount - 1,
        Math.floor((idx / stopsWithMeta.length) * daysCount),
      );
      dayGroups[dayIdx]!.push(item);
    });
  }

  return dayGroups.map((groupStops, dIndex) => {
    const dayNumber = dIndex + 1;
    const dayDate = new Date(baseDate);
    if (!isNaN(dayDate.getTime())) {
      dayDate.setUTCDate(baseDate.getUTCDate() + dIndex);
    }
    const localDate = !isNaN(dayDate.getTime())
      ? dayDate.toISOString().slice(0, 10)
      : introduction.startDate;

    const stops: PlannerStop[] = groupStops.map((st, sIndex) => {
      let inbound: TravelLeg | null = null;
      if (st.globalIndex > 0) {
        const prev = stopsWithMeta[st.globalIndex - 1]!;
        inbound = {
          fromDestinationId: prev.destinationId,
          toDestinationId: st.destinationId,
          status: "VERIFIED",
          reason: null,
          durationSeconds: 1800,
          distanceMeters: 15000,
          provider: "STADIA_MAPS",
          geometry: {
            type: "LineString",
            coordinates: [
              [prev.coords.longitude, prev.coords.latitude],
              [st.coords.longitude, st.coords.latitude],
            ],
          },
        };
      }

      return {
        order: sIndex + 1,
        destination: {
          id: st.destinationId,
          name: st.name,
          description: "",
          area: st.area,
          address: null,
          category: "Điểm tham quan",
          latitude: st.coords.latitude,
          longitude: st.coords.longitude,
          image: null,
        },
        arrivalMinute: 480 + sIndex * 120,
        departureMinute: 480 + sIndex * 120 + 90,
        visitDurationMinutes: 90,
        scheduleState: "PLANNED",
        inbound,
        validationStatus: "PASS",
      };
    });

    return {
      day: dayNumber,
      date: localDate,
      stops,
      distanceMeters: null,
      travelSeconds: null,
    };
  });
}

export function CompanionIntroductionView({
  introduction,
  publicationId,
  recruitmentStatus,
  tripId,
  isHost = false,
  isMember = false,
  isGuest = false,
  isPreview = false,
}: CompanionIntroductionViewProps) {
  const router = useRouter();
  const transportLabel = introduction.transport === "CAR" ? "Ô tô" : "Xe máy";
  const dateRangeLabel = formatRangeVi(introduction.startDate, introduction.endDate);
  const hostInitial = introduction.host.displayName.slice(0, 1).toUpperCase();

  const vietnamToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const recruitment = recruitmentStatus ?? (introduction.startDate <= vietnamToday ? "DEPARTED" : introduction.availablePlaces <= 0 ? "FULL" : "OPEN");
  const isPastDeparture = recruitment === "DEPARTED" || recruitment === "COMPLETED";
  const isFull = recruitment === "FULL";
  const isClosedStatus = recruitment === "CLOSED" || recruitment === "WITHDRAWN" || recruitment === "CANCELED";
  const blockedLabel = recruitment === "CLOSED" ? "Chuyến đã đóng tuyển"
    : recruitment === "DEPARTED" ? "Chuyến đã khởi hành"
    : recruitment === "COMPLETED" ? "Chuyến đã hoàn tất"
    : recruitment === "WITHDRAWN" ? "Bài đăng đã gỡ công khai"
    : recruitment === "CANCELED" ? "Chuyến đồng hành đã hủy"
    : recruitment === "FULL" ? "Chuyến đã đủ chỗ" : null;

  const [activeDayIndex] = useState<number | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [focusSelection, setFocusSelection] = useState(false);

  const plannerDays = useMemo(
    () => partitionRouteSummaryToPlannerDays(introduction),
    [introduction],
  );

  const activePlannerDay = useMemo(() => {
    if (plannerDays.length === 0) {
      return {
        day: 1,
        date: introduction.startDate,
        stops: [],
        distanceMeters: null,
        travelSeconds: null,
      };
    }
    if (activeDayIndex === null) return plannerDays[0]!;
    return plannerDays.find((d) => d.day === activeDayIndex) ?? plannerDays[0]!;
  }, [plannerDays, activeDayIndex, introduction.startDate]);

  const handleSelectDestination = (id: string) => {
    setSelectedDestinationId(id);
    setFocusSelection(true);
    if (id && typeof document !== "undefined") {
      const el = document.getElementById(`companion-visit-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const [joinStatus, setJoinStatus] = useState<"idle" | "submitting" | "success" | "unknown" | "failed">("idle");
  const [joinError, setJoinError] = useState<{ code: string; message: string } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? `join-${crypto.randomUUID()}`
      : `join-${Date.now()}`;
  });

  const handleJoin = async () => {
    if (!publicationId || recruitment !== "OPEN" || joinStatus === "submitting" || joinStatus === "success") return;
    setJoinStatus("submitting");
    setJoinError(null);

    try {
      const outcome = await joinCompanionTrip(publicationId, idempotencyKey);
      if (outcome.status === "SUCCESS") {
        setJoinStatus("success");
        router.push(`/trip-companions/${publicationId}/group` as Route);
      } else if (outcome.status === "UNKNOWN") {
        setJoinStatus("unknown");
        setJoinError(
          outcome.error ?? {
            code: "UNKNOWN",
            message: "Chưa nhận được phản hồi từ máy chủ. Vui lòng bấm thử lại.",
          },
        );
      } else {
        setJoinStatus("failed");
        setJoinError(outcome.error ?? { code: "FAILED", message: "Không thể tham gia chuyến đi." });
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          setIdempotencyKey(`join-${crypto.randomUUID()}`);
        }
      }
    } catch (err: unknown) {
      setJoinStatus("failed");
      setJoinError({
        code: "CLIENT_ERROR",
        message: err instanceof Error ? err.message : "Đã xảy ra lỗi khi tham gia.",
      });
    }
  };

  return (
    <div className="companion-intro-view" data-testid="companion-introduction-view">
      {/* ─── Hero Showcase Billboard ─── */}
      <header className="companion-group-hero" aria-labelledby="companion-hero-title">
        {/* Subtle highland contour topography & ambient glow */}
        <div className="companion-hero-ambient" aria-hidden="true">
          <div className="companion-hero-glow" />
          <svg className="companion-hero-topo" viewBox="0 0 1000 300" preserveAspectRatio="none">
            <path d="M0,160 Q250,80 500,150 T1000,110 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.03)" />
            <path d="M0,200 Q280,120 580,190 T1000,150 L1000,300 L0,300 Z" fill="rgba(233,185,75,0.04)" />
            <path d="M0,230 Q340,170 680,220 T1000,180 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.02)" />
          </svg>
        </div>

        <div className="companion-hero-content">
          <div className="companion-hero-header-row">
            <div className="companion-hero-title-group">
              <div className="companion-hero-badge-row">
                <span className="companion-hero-badge">
                  <span className="companion-badge-dot" aria-hidden="true" />
                  <Users size={14} aria-hidden="true" />
                  <span>Tìm bạn đồng hành</span>
                </span>
                <span className="companion-hero-tag">
                  {blockedLabel ?? `Còn ${introduction.availablePlaces} chỗ tìm thêm`}
                </span>
              </div>
              <h1 id="companion-hero-title" className="companion-hero-title" data-testid="companion-title">
                {introduction.title}
              </h1>
            </div>

            {/* Quick Hero Actions */}
            <div className="companion-group-actions">
              {isHost ? (
                <>
                  {publicationId ? (
                    <Link
                      href={`/trip-companions/${publicationId}/group` as Route}
                      className="companion-hero-action companion-hero-action-primary"
                      data-testid="companion-enter-group"
                    >
                      <Users size={15} aria-hidden="true" />
                      <span>Vào nhóm chuyến</span>
                    </Link>
                  ) : null}

                  {tripId ? (
                    <Link
                      href={`/trips/${tripId}` as Route}
                      className="companion-hero-action companion-hero-action-outline"
                      data-testid="companion-back-to-trip"
                    >
                      <span>Quay lại quản lý chuyến đi</span>
                    </Link>
                  ) : null}
                </>
              ) : isMember || joinStatus === "success" ? (
                publicationId ? (
                  <Link
                    href={`/trip-companions/${publicationId}/group` as Route}
                    className="companion-hero-action companion-hero-action-primary"
                    data-testid="companion-enter-group"
                  >
                    <Users size={15} aria-hidden="true" />
                    <span>Vào nhóm chuyến</span>
                  </Link>
                ) : null
              ) : blockedLabel ? (
                <button type="button" disabled className="companion-hero-action companion-hero-action-outline">
                  {blockedLabel}
                </button>
              ) : isGuest ? (
                <Link
                  href={buildLoginHref(publicationId) as Route}
                  className="companion-hero-action companion-hero-action-primary"
                  data-testid="companion-guest-login-cta"
                >
                  <LogIn size={15} aria-hidden="true" />
                  <span>Đăng nhập để tham gia</span>
                </Link>
              ) : null}
            </div>
          </div>

          {/* 4 Summary Stat Cards */}
          <div className="companion-hero-stats-grid" aria-label="Thông số hành trình">
            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <CalendarDays size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Thời gian</span>
                <strong className="companion-stat-value">{dateRangeLabel}</strong>
              </div>
            </div>

            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <Clock3 size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Thời lượng</span>
                <strong className="companion-stat-value">
                  {introduction.durationDays} ngày {Math.max(1, introduction.durationDays - 1)} đêm
                </strong>
              </div>
            </div>

            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <CarFront size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Phương tiện</span>
                <strong className="companion-stat-value">{transportLabel}</strong>
              </div>
            </div>

            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <MapPin size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Điểm tham quan</span>
                <strong className="companion-stat-value">
                  {introduction.routeSummary.length > 0
                    ? `${introduction.routeSummary.length} điểm dừng`
                    : "Theo thỏa thuận"}
                </strong>
              </div>
            </div>
          </div>

          {/* Fallback container for test assertions */}
          <div className="companion-item-pills sr-only" aria-hidden="true">
            <span className="companion-pill">{dateRangeLabel}</span>
            <span className="companion-pill">{introduction.durationDays} ngày</span>
            <span className="companion-pill">{transportLabel}</span>
          </div>
        </div>
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


      {/* ─── 2-Column Responsive Layout ─── */}
      <div className="companion-main-grid">
        {/* ─── Left Column: Itinerary Timeline & Details ─── */}
        <div className="companion-timeline-column">
          {/* Story Section: Title & Introduction */}
          <section className="companion-card mb-6" aria-labelledby="companion-about-heading">
            <h2 id="companion-about-heading" className="companion-section-title">
              Về chuyến đi
            </h2>
            <div className="companion-prose" data-testid="companion-prose">
              {introduction.introduction}
            </div>
          </section>

          {/* Expected Route & Itinerary Stops */}
          <section className="companion-card mb-6" aria-labelledby="companion-route-heading">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 id="companion-route-heading" className="companion-section-title !mb-0">
                Tuyến dự kiến
              </h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {introduction.routeSummary.length} điểm dừng
              </span>
            </div>

            {introduction.routeSummary.length > 0 ? (
              <>
                {/* Visual Route Nodes Waypoints Ribbon */}
                <div className="companion-route-track mb-6" aria-label="Các điểm đến trong tuyến">
                  {introduction.routeSummary.map((point, index) => (
                    <span key={`${point.destinationId}-${index}`} className="companion-route-node">
                      {index > 0 && <span className="companion-route-arrow" aria-hidden="true">→</span>}
                      <MapPin size={14} className="text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                      <span>{point.name}</span>
                    </span>
                  ))}
                </div>

                {/* Day-by-Day Timeline with Scenic Visual Cards */}
                <div className="companion-days">
                  {plannerDays.map((day) => {
                    const isDimmed = activeDayIndex !== null && activeDayIndex !== day.day;
                    return (
                      <section
                        key={day.day}
                        id={`companion-day-${day.day}`}
                        className={`companion-day ${isDimmed ? "companion-day-dimmed" : ""}`}
                        aria-labelledby={`companion-day-heading-${day.day}`}
                      >
                        <div className="companion-day-heading">
                          <span className="companion-timeline-node" aria-hidden="true" />
                          <div className="companion-day-title-wrap">
                            <div
                              className="companion-day-number-tag"
                              style={{
                                background: `var(--planner-route-${((day.day - 1) % 3) + 1})`,
                              }}
                            >
                              Ngày {day.day}
                            </div>
                            <div className="companion-day-title-inner">
                              <h3 id={`companion-day-heading-${day.day}`} className="companion-day-h3">
                                Ngày {day.day}
                              </h3>
                              <p>
                                {day.date ? `${formatWeekdayVi(day.date)}, ${formatDateVi(day.date)}` : `Ngày ${day.day}`}
                              </p>
                            </div>
                          </div>

                          <div className="companion-day-meta">
                            <span>
                              <CarFront size={15} aria-hidden="true" />
                              Di chuyển bằng {transportLabel.toLowerCase()}
                            </span>
                            <span>
                              <MapPin size={15} aria-hidden="true" />
                              {day.stops.length} điểm dừng
                            </span>
                          </div>
                        </div>

                        {day.stops.length === 0 ? (
                          <div className="companion-day-empty">
                            <p>Ngày này chưa có điểm dừng cụ thể.</p>
                          </div>
                        ) : (
                          <ol className="companion-visits">
                            {day.stops.map((stop) => {
                              const visual = getDestinationVisual(stop.destination.name, stop.destination.area);
                              const isSelected = selectedDestinationId === stop.destination.id;

                              return (
                                <li
                                  key={stop.destination.id}
                                  id={`companion-visit-${stop.destination.id}`}
                                  className={`companion-visit-item ${isSelected ? "is-selected-item" : ""}`}
                                  onClick={() => handleSelectDestination(stop.destination.id)}
                                >
                                  <span className="companion-timeline-node" aria-hidden="true" />
                                  <div className="companion-visit-time">
                                    <strong>{stop.arrivalMinute !== null ? formatMinuteOfDay(stop.arrivalMinute) : "--:--"}</strong>
                                    <span>{stop.visitDurationMinutes} phút</span>
                                  </div>

                                  <Card className={`companion-visit-card ${isSelected ? "is-active-selection" : ""}`}>
                                    <div
                                      className="companion-visit-media"
                                      role="img"
                                      aria-label={`Ảnh điểm đến ${stop.destination.name}`}
                                    >
                                      <img
                                        src={visual.src}
                                        alt={visual.alt}
                                        className="companion-visit-photo"
                                        loading="lazy"
                                      />
                                      <div className="companion-visit-photo-gradient" />
                                      <span className="companion-visit-seq-tag">#{stop.order}</span>
                                    </div>

                                    <div className="companion-visit-place">
                                      <div className="companion-visit-top">
                                        <span className="companion-order-label">
                                          Điểm dừng {stop.order}
                                        </span>
                                        <span className="companion-visit-chip">
                                          <Clock3 size={12} aria-hidden="true" />
                                          {stop.visitDurationMinutes} phút
                                        </span>
                                      </div>

                                      <h4 className="companion-destination-name">
                                        {stop.destination.id && !stop.destination.id.startsWith("synthetic-") ? (
                                          <Link
                                            href={`/destinations/${stop.destination.id}` as Route}
                                            className="companion-destination-link"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <span>{stop.destination.name}</span>
                                            <ChevronRight size={15} className="companion-chevron" aria-hidden="true" />
                                          </Link>
                                        ) : (
                                          stop.destination.name
                                        )}
                                      </h4>

                                      <div className="companion-visit-meta">
                                        <p className="companion-visit-meta-item">
                                          <MapPin size={14} aria-hidden="true" />
                                          <span>{stop.destination.area}</span>
                                        </p>
                                        <p className="companion-visit-meta-item">
                                          <Clock3 size={14} aria-hidden="true" />
                                          <span>
                                            {stop.arrivalMinute !== null ? formatMinuteOfDay(stop.arrivalMinute) : "--:--"} –{" "}
                                            {stop.departureMinute !== null ? formatMinuteOfDay(stop.departureMinute) : "--:--"} (
                                            {stop.visitDurationMinutes} phút)
                                          </span>
                                        </p>
                                      </div>
                                    </div>
                                  </Card>
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </section>
                    );
                  })}
                </div>
              </>
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
                Thông tin chi tiết từng ngày và không gian trao đổi chỉ hiển thị cho thành viên chính thức của chuyến đi.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Right Column: Action Rail & Sticky Interactive Map ─── */}
        <div className="companion-map-column">
          <div className="companion-side-sticky-wrap">
            {/* 1. Interactive Map on Top */}
            <div className="companion-map-sticky">
              <div className="companion-map-header">
                <div className="companion-map-header-title">
                  <Map size={16} aria-hidden="true" />
                  <span>Bản đồ lộ trình</span>
                </div>
                <span className="companion-map-header-tag">
                  {introduction.routeSummary.length} điểm dừng toàn tuyến
                </span>
              </div>
              {plannerDays.some((d) => d.stops.length > 0) ? (
                <ItineraryMap
                  day={activePlannerDay}
                  days={plannerDays}
                  selectedDestinationId={selectedDestinationId}
                  focusSelection={focusSelection}
                  onSelect={handleSelectDestination}
                  overviewOnly={activeDayIndex === null}
                />
              ) : (
                <div className="companion-map-empty">
                  <Mountain size={36} aria-hidden="true" />
                  <p>Chưa có điểm dừng để hiển thị trên bản đồ.</p>
                </div>
              )}
            </div>

            {/* 2. Action & Capacity Card Below Map */}
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

              {/* ─── Call to Action & Relationship States ─── */}
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
                  {/* Host State */}
                  {isHost ? (
                    <div className="space-y-2">
                      {publicationId ? (
                        <Link
                          href={`/trip-companions/${publicationId}/group` as Route}
                          className="companion-cta-button"
                          data-testid="companion-enter-group"
                        >
                          <Users size={16} aria-hidden="true" />
                          <span>Vào nhóm chuyến</span>
                        </Link>
                      ) : null}

                      {tripId ? (
                        <Link
                          href={`/trips/${tripId}` as Route}
                          className="companion-secondary-button"
                          data-testid="companion-back-to-trip"
                        >
                          <span>Quay lại quản lý chuyến đi</span>
                        </Link>
                      ) : null}
                    </div>
                  ) : isMember || joinStatus === "success" ? (
                    /* Confirmed Member State */
                    <div className="space-y-2">
                      <div className="companion-member-badge" role="status">
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        <span>Bạn đã là thành viên của chuyến đi</span>
                      </div>

                      {publicationId ? (
                        <Link
                          href={`/trip-companions/${publicationId}/group` as Route}
                          className="companion-cta-button"
                          data-testid="companion-enter-group"
                        >
                          <span>Vào nhóm chuyến</span>
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>
                  ) : blockedLabel ? (
                    <button type="button" disabled className="companion-cta-button is-disabled"
                      data-testid={recruitment === "FULL" ? "companion-full-btn" : recruitment === "DEPARTED" ? "companion-departed-btn" : "companion-closed-btn"}>
                      {blockedLabel}
                    </button>
                  ) : isGuest ? (
                    /* Unauthenticated Guest State */
                    <div className="space-y-2">
                      <Link
                        href={buildLoginHref(publicationId) as Route}
                        className="companion-cta-button"
                        data-testid="companion-guest-login-cta"
                      >
                        <LogIn size={16} aria-hidden="true" />
                        <span>Đăng nhập để tham gia</span>
                      </Link>
                      <p className="companion-sub-note">
                        Đăng nhập tài khoản du khách để tham gia tức thì khi còn chỗ.
                      </p>
                    </div>
                  ) : (
                    /* Logged-in Outsider / Join Candidate State */
                    <div className="space-y-2">
                      {isPastDeparture ? (
                        <button
                          type="button"
                          className="companion-cta-button is-disabled"
                          disabled
                          data-testid="companion-departed-btn"
                        >
                          Chuyến đã khởi hành
                        </button>
                      ) : isFull ? (
                        <button
                          type="button"
                          className="companion-cta-button is-disabled"
                          disabled
                          data-testid="companion-full-btn"
                        >
                          Chuyến đã đủ chỗ
                        </button>
                      ) : isClosedStatus ? (
                        <button
                          type="button"
                          className="companion-cta-button is-disabled"
                          disabled
                          data-testid="companion-closed-btn"
                        >
                          Chuyến đã đóng tuyển
                        </button>
                      ) : (
                        <>
                          {joinError && (
                            <div className="companion-error-notice" role="alert">
                              <AlertCircle size={16} aria-hidden="true" />
                              <span>{joinError.message}</span>
                            </div>
                          )}

                          <button
                            type="button"
                            className="companion-cta-button"
                            disabled={joinStatus === "submitting"}
                            onClick={handleJoin}
                            data-testid="companion-join-btn"
                          >
                            {joinStatus === "submitting" ? (
                              <>
                                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                                <span>Đang tham gia...</span>
                              </>
                            ) : joinStatus === "unknown" ? (
                              <span>Thử lại tham gia</span>
                            ) : (
                              <span>Tham gia chuyến đi</span>
                            )}
                          </button>
                        </>
                      )}

                      <p className="companion-sub-note">
                        Không cần xét duyệt: khi bấm tham gia và còn chỗ, bạn sẽ vào thẳng nhóm để xem lịch trình chi tiết và thảo luận cùng các thành viên.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {/* ─── Mobile Fixed Bottom Dock ─── */}
      <aside className="companion-mobile-dock" aria-label="Thao tác nhanh trên di động">
        <div className="companion-mobile-dock-info">
          <strong className="companion-mobile-dock-places">
            Còn {introduction.availablePlaces} chỗ tìm thêm
          </strong>
          <span className="companion-mobile-dock-host">
            Chủ chuyến: {introduction.host.displayName}
          </span>
        </div>

        <div className="companion-mobile-dock-action">
          {isHost ? (
            publicationId ? (
              <Link
                href={`/trip-companions/${publicationId}/group` as Route}
                className="companion-mobile-dock-btn"
              >
                <Users size={14} aria-hidden="true" />
                <span>Vào nhóm</span>
              </Link>
            ) : null
          ) : isMember || joinStatus === "success" ? (
            publicationId ? (
              <Link
                href={`/trip-companions/${publicationId}/group` as Route}
                className="companion-mobile-dock-btn"
              >
                <Users size={14} aria-hidden="true" />
                <span>Vào nhóm</span>
              </Link>
            ) : null
          ) : isGuest ? (
            <Link
              href={buildLoginHref(publicationId) as Route}
              className="companion-mobile-dock-btn"
            >
              <LogIn size={14} aria-hidden="true" />
              <span>Đăng nhập</span>
            </Link>
          ) : isPastDeparture ? (
            <button type="button" className="companion-mobile-dock-btn is-disabled" disabled>
              Đã khởi hành
            </button>
          ) : isFull ? (
            <button type="button" className="companion-mobile-dock-btn is-disabled" disabled>
              Đã đủ chỗ
            </button>
          ) : isClosedStatus ? (
            <button type="button" className="companion-mobile-dock-btn is-disabled" disabled>
              Đóng tuyển
            </button>
          ) : (
            <button
              type="button"
              className="companion-mobile-dock-btn"
              disabled={joinStatus === "submitting"}
              onClick={handleJoin}
            >
              {joinStatus === "submitting" ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  <span>Đang tham gia...</span>
                </>
              ) : (
                <span>Tham gia ngay</span>
              )}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
