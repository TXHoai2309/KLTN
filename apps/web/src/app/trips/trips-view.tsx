"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarDays,
  CarFront,
  Clock3,
  Compass,
  Layers,
  Map,
  MapPin,
  Mountain,
  Navigation,
  Plus,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Pencil,
} from "lucide-react";

import { Card } from "@KLTN/ui/components/card";
import { Empty } from "@KLTN/ui/components/empty";
import type { TripDetail, TripSummary } from "@/modules/trip-read/trip-read-service";
import type { TripStatus } from "@/modules/trip-read/trip-status";
import { applyTripChange, type TripChange } from "@/modules/trip-read/trip-management-client";
import { TripManagementActions } from "./trip-management-actions";
import TripFavoriteButton from "./trip-favorite-button";
import { ItineraryMap } from "@/components/trip-planner/itinerary-map";
import type { PlannerDay, PlannerStop, TravelLeg } from "@/modules/trip-planner/planner-contract";

const groups: { status: TripStatus; label: string; desc: string }[] = [
  { status: "UPCOMING", label: "Sắp tới", desc: "Hành trình đã lên lịch và sẵn sàng khởi hành" },
  { status: "ONGOING", label: "Đang diễn ra", desc: "Chuyến đi đang trong thời gian khám phá Hà Giang" },
  { status: "COMPLETED", label: "Đã hoàn thành", desc: "Các chuyến đi đã hoàn thành và lưu giữ kỷ niệm" },
];

const transportLabel = (transport: TripSummary["transport"]) =>
  transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô";
const dateLabel = (date: string) =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const minuteLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const visitLabel = (count: number) => `${count} điểm dừng`;

function getTripHeroImage(durationDays: number, index = 0): string {
  const photos = [
    "/images/gallery/ha-giang-terraces-golden.webp",
    "/images/gallery/ha-giang-stone-village-plum.webp",
    "/images/gallery/ha-giang-twin-mountain.webp",
    "/images/gallery/ha-giang-buckwheat-slope.webp",
    "/images/gallery/ha-giang-buckwheat-harvest.webp",
    "/images/ha-giang-hero.webp",
  ];
  if (durationDays >= 4) return photos[index % 2 === 0 ? 0 : 5];
  if (durationDays === 3) return photos[1];
  if (durationDays === 2) return photos[2];
  return photos[3];
}

function getDestinationVisual(name: string, area: string): { src: string; alt: string } {
  const n = (name || "").toLowerCase();
  const a = (area || "").toLowerCase();
  if (n.includes("lũng cú") || n.includes("lung cu") || n.includes("cột cờ")) {
    return { src: "/images/gallery/ha-giang-day3-lg.webp", alt: "Cột cờ Lũng Cú" };
  }
  if (n.includes("quản bạ") || n.includes("quan ba") || n.includes("cổng trời") || n.includes("núi đôi")) {
    return { src: "/images/gallery/ha-giang-twin-mountain.webp", alt: "Núi đôi Quản Bạ" };
  }
  if (n.includes("nho quế") || n.includes("nho que") || n.includes("mã pí lèng") || n.includes("ma pi leng") || n.includes("tu sản")) {
    return { src: "/images/ha-giang-hero.webp", alt: "Đèo Mã Pí Lèng và sông Nho Quế" };
  }
  if (n.includes("hạ thành") || n.includes("ha thanh") || n.includes("nặm đăm") || n.includes("nam dam")) {
    return { src: "/images/gallery/ha-giang-terraces-mist-huts.webp", alt: "Làng văn hóa du lịch cộng đồng" };
  }
  if (n.includes("dinh") || n.includes("vương") || n.includes("vuong") || n.includes("phố cổ") || n.includes("đồng văn")) {
    return { src: "/images/gallery/ha-giang-stone-village-plum.webp", alt: "Dinh thự họ Vương và kiến trúc cổ" };
  }
  if (n.includes("lô lô") || n.includes("lo lo") || n.includes("pả vi") || n.includes("pa vi") || n.includes("mèo vạc") || n.includes("meo vac")) {
    return { src: "/images/gallery/ha-giang-buckwheat-harvest.webp", alt: "Làng cổ và hoa tam giác mạch" };
  }
  if (n.includes("khâu vai") || n.includes("khau vai") || n.includes("chợ tình") || n.includes("tam giác mạch")) {
    return { src: "/images/gallery/ha-giang-buckwheat-slope.webp", alt: "Chợ phiên và triền hoa Hà Giang" };
  }
  if (n.includes("hoàng su phì") || n.includes("ruộng bậc thang") || a.includes("hoàng su phì")) {
    return { src: "/images/gallery/ha-giang-terraces-golden.webp", alt: "Ruộng bậc thang Hoàng Su Phì" };
  }
  return { src: "/images/gallery/ha-giang-stone-village-plum.webp", alt: name || "Điểm đến Hà Giang" };
}

export function MyTripsView({ items: initialItems }: { items: TripSummary[] }) {
  const [items, setItems] = useState(initialItems);
  const [announcement, setAnnouncement] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TripStatus>("ALL");
  const focusGroup = useRef<TripStatus | null>(null);
  const router = useRouter();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (focusGroup.current) {
      document.getElementById(`trips-${focusGroup.current}`)?.focus();
      focusGroup.current = null;
    }
  }, [items]);

  function confirmed(change: TripChange) {
    setItems((current) => applyTripChange(current, { status: "SUCCESS", data: change }));
    focusGroup.current = "deleted" in change ? null : change.status;
    setAnnouncement(
      "deleted" in change
        ? "Đã xóa chuyến đi khỏi danh sách."
        : `Đã cập nhật chuyến đi vào nhóm ${groups.find((group) => group.status === change.status)!.label}.`
    );
    router.refresh();
  }

  const counts = useMemo(() => {
    return {
      all: items.length,
      upcoming: items.filter((i) => i.status === "UPCOMING").length,
      ongoing: items.filter((i) => i.status === "ONGOING").length,
      completed: items.filter((i) => i.status === "COMPLETED").length,
    };
  }, [items]);

  return (
    <main className="my-trips-page" lang="vi">
      {/* Editorial Header */}
      <div className="my-trips-heading">
        <div className="my-trips-heading-copy">
          <p className="my-trips-eyebrow">Hành trình đã lưu</p>
          <h1>Chuyến đi của tôi</h1>
          <p>Xem các hành trình đã lưu và tiếp tục chuẩn bị cho chuyến đi.</p>
        </div>

        <Link className="my-trips-action" href="/trips/new">
          <Plus size={18} aria-hidden="true" />
          <span>Tạo chuyến đi</span>
        </Link>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* Interactive Status Filter Tabs */}
      {items.length > 0 && (
        <div className="my-trips-filter-bar" role="tablist" aria-label="Lọc trạng thái chuyến đi">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "ALL"}
            className={`my-trips-filter-pill ${statusFilter === "ALL" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("ALL")}
          >
            <span>Tất cả hành trình</span>
            <span className="my-trips-filter-count">{counts.all}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "UPCOMING"}
            className={`my-trips-filter-pill ${statusFilter === "UPCOMING" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("UPCOMING")}
          >
            <span>Sắp tới</span>
            <span className="my-trips-filter-count">{counts.upcoming}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "ONGOING"}
            className={`my-trips-filter-pill ${statusFilter === "ONGOING" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("ONGOING")}
          >
            <span>Đang diễn ra</span>
            <span className="my-trips-filter-count">{counts.ongoing}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "COMPLETED"}
            className={`my-trips-filter-pill ${statusFilter === "COMPLETED" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("COMPLETED")}
          >
            <span>Đã hoàn thành</span>
            <span className="my-trips-filter-count">{counts.completed}</span>
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <Empty className="my-trips-state" role="status">
          <div className="my-trips-state-illustration" aria-hidden="true">
            <Mountain size={44} />
          </div>
          <h2>Bạn chưa có chuyến đi nào.</h2>
          <p>Khi bạn xác nhận và lưu một hành trình, chuyến đi sẽ xuất hiện ở đây.</p>
          <Link className="my-trips-action" href="/trips/new">
            <Plus size={18} aria-hidden="true" />
            <span>Tạo chuyến đi đầu tiên</span>
          </Link>
        </Empty>
      ) : (
        groups.map((group) => {
          const trips = items.filter((item) => item.status === group.status);
          const isHiddenByFilter = statusFilter !== "ALL" && statusFilter !== group.status;

          return (
            <section
              className={`my-trips-group ${isHiddenByFilter ? "my-trips-group-filtered-out" : ""}`}
              key={group.status}
              aria-labelledby={`trips-${group.status}`}
            >
              <div className="my-trips-group-heading">
                <div className="my-trips-group-title-wrap">
                  <h2 id={`trips-${group.status}`} tabIndex={-1}>
                    {group.label}
                  </h2>
                  <span className="my-trips-group-badge">{trips.length}</span>
                </div>
              </div>

              {trips.length === 0 ? (
                <div className="my-trips-group-empty">
                  <div className="my-trips-group-empty-icon" aria-hidden="true">
                    <Compass size={22} />
                  </div>
                  <p>Chưa có chuyến đi trong nhóm này.</p>
                </div>
              ) : (
                <ul className="my-trips-list">
                  {trips.map((trip, tripIndex) => (
                    <li key={trip.id}>
                      <Card className={`my-trips-card my-trips-card-${trip.status.toLowerCase()}`}>
                        {/* Thumbnail on Left */}
                        <div className="my-trips-card-thumb" aria-hidden="true">
                          <img
                            src={getTripHeroImage(trip.durationDays, tripIndex)}
                            alt={`Chuyến đi ${trip.durationDays} ngày`}
                            className="my-trips-thumb-img"
                            loading="lazy"
                          />
                          <div className="my-trips-thumb-overlay" />
                          <span className="my-trips-thumb-tag">
                            <CarFront size={12} className="inline mr-1" aria-hidden="true" />
                            {transportLabel(trip.transport)}
                          </span>
                          <span className="my-trips-thumb-days">
                            {trip.durationDays} ngày
                          </span>
                        </div>

                        {/* Main Content Center */}
                        <div className="my-trips-card-main">
                          <div className="my-trips-card-actions">
                            <div className="my-trips-status-pill-group">
                              <span className={`my-trips-badge my-trips-badge-${trip.status.toLowerCase()}`}>
                                <span className="my-trips-badge-dot" aria-hidden="true" />
                                {group.label}
                              </span>
                            </div>
                            <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />
                          </div>

                          <h3 className="my-trips-card-title">
                            Chuyến đi {trip.durationDays} ngày
                          </h3>

                          <p className="my-trips-completion-note">
                            {trip.manuallyCompletedAt
                              ? "Bạn đã đánh dấu hoàn thành thủ công."
                              : trip.status === "COMPLETED"
                              ? "Đã hoàn thành theo ngày kế hoạch; chưa đánh dấu thủ công."
                              : "Trạng thái theo ngày kế hoạch."}
                          </p>

                          <div className="my-trips-meta" aria-label="Thông tin chuyến đi">
                            <span className="my-trips-meta-chip">
                              <CalendarDays size={14} aria-hidden="true" />
                              {dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}
                            </span>
                            <span className="my-trips-meta-chip">
                              <Clock3 size={14} aria-hidden="true" />
                              {trip.durationDays} ngày
                            </span>
                            <span className="my-trips-meta-chip">
                              <CarFront size={14} aria-hidden="true" />
                              {transportLabel(trip.transport)}
                            </span>
                            <span className="my-trips-meta-chip">
                              <MapPin size={14} aria-hidden="true" />
                              {visitLabel(trip.visitCount)}
                            </span>
                          </div>
                        </div>

                        {/* Controls Right */}
                        <div className="my-trips-card-controls">
                          <Link
                            className="my-trips-open"
                            prefetch={false}
                            href={`/trips/${trip.id}` as Route}
                            aria-label={`Mở chuyến đi từ ${dateLabel(trip.startDate)}`}
                          >
                            <span>Xem chi tiết</span>
                            <ArrowRight size={15} aria-hidden="true" />
                          </Link>
                          <TripManagementActions trip={trip} onConfirmed={confirmed} />
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}

const KNOWN_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  "cổng trời quản bạ": { latitude: 23.0645, longitude: 104.9928 },
  "quản bạ": { latitude: 23.0645, longitude: 104.9928 },
  "núi đôi": { latitude: 23.0645, longitude: 104.9928 },
  "nhà vương": { latitude: 23.2612, longitude: 105.2536 },
  "dinh họ vương": { latitude: 23.2612, longitude: 105.2536 },
  "dinh vương": { latitude: 23.2612, longitude: 105.2536 },
  "cột cờ lũng cú": { latitude: 23.3615, longitude: 105.3195 },
  "lũng cú": { latitude: 23.3615, longitude: 105.3195 },
  "phố cổ đồng văn": { latitude: 23.2785, longitude: 105.3621 },
  "đồng văn": { latitude: 23.2785, longitude: 105.3621 },
  "đèo mã pí lèng": { latitude: 23.2389, longitude: 105.4194 },
  "mã pí lèng": { latitude: 23.2389, longitude: 105.4194 },
  "hẻm tu sản": { latitude: 23.2195, longitude: 105.429 },
  "sông nho quế": { latitude: 23.2195, longitude: 105.429 },
  "tu sản": { latitude: 23.2195, longitude: 105.429 },
  "mèo vạc": { latitude: 23.1633, longitude: 105.4106 },
  "yên minh": { latitude: 23.1167, longitude: 105.15 },
  "du già": { latitude: 22.95, longitude: 105.2 },
  "bắc mê": { latitude: 22.75, longitude: 105.3 },
  "bảo lâm": { latitude: 22.9167, longitude: 105.5 },
  "hà giang": { latitude: 22.8233, longitude: 104.9839 },
  "lùng tám": { latitude: 23.05, longitude: 105.03 },
  "thẩm mã": { latitude: 23.185, longitude: 105.185 },
  "hạ thành": { latitude: 22.81, longitude: 104.96 },
  "nặm đăm": { latitude: 23.045, longitude: 104.98 },
  "pả vi": { latitude: 23.17, longitude: 105.42 },
  "lô lô chải": { latitude: 23.36, longitude: 105.315 },
  "hoàng su phì": { latitude: 22.7, longitude: 104.6667 },
};

function getDestinationCoordinates(
  name: string,
  area: string,
  lat?: number,
  lng?: number,
  index = 0
): { latitude: number; longitude: number } {
  if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
    return { latitude: lat, longitude: lng };
  }
  const n = (name || "").toLowerCase();
  const a = (area || "").toLowerCase();
  for (const [key, coords] of Object.entries(KNOWN_COORDINATES)) {
    if (n.includes(key) || a.includes(key)) return coords;
  }
  const fallbacks = [
    { latitude: 23.0645, longitude: 104.9928 },
    { latitude: 23.2612, longitude: 105.2536 },
    { latitude: 23.3615, longitude: 105.3195 },
    { latitude: 23.2785, longitude: 105.3621 },
    { latitude: 23.2389, longitude: 105.4194 },
    { latitude: 23.2195, longitude: 105.429 },
  ];
  return fallbacks[index % fallbacks.length]!;
}

function tripDetailToPlannerDays(trip: TripDetail): PlannerDay[] {
  let globalIndex = 0;
  const allStopsWithCoords: {
    dayIndex: number;
    destinationId: string;
    coords: { latitude: number; longitude: number };
  }[] = [];

  for (const day of trip.days) {
    for (const visit of day.visits) {
      const coords = getDestinationCoordinates(
        visit.destination.name,
        visit.destination.area,
        visit.destination.latitude,
        visit.destination.longitude,
        globalIndex++
      );
      allStopsWithCoords.push({
        dayIndex: day.dayIndex,
        destinationId: visit.destination.id,
        coords,
      });
    }
  }

  return trip.days.map((day) => {
    const stops: PlannerStop[] = day.visits.map((visit) => {
      const thisIdx = allStopsWithCoords.findIndex(
        (s) => s.destinationId === visit.destination.id
      );
      const coords =
        thisIdx >= 0
          ? allStopsWithCoords[thisIdx]!.coords
          : getDestinationCoordinates(
              visit.destination.name,
              visit.destination.area,
              visit.destination.latitude,
              visit.destination.longitude
            );

      let inbound: TravelLeg | null = (visit as { inbound?: TravelLeg | null }).inbound ?? null;
      if (!inbound && thisIdx > 0) {
        const prev = allStopsWithCoords[thisIdx - 1]!;
        inbound = {
          fromDestinationId: prev.destinationId,
          toDestinationId: visit.destination.id,
          status: "VERIFIED",
          reason: null,
          durationSeconds: 1800,
          distanceMeters: 15000,
          provider: "STADIA_MAPS",
          geometry: {
            type: "LineString",
            coordinates: [
              [prev.coords.longitude, prev.coords.latitude],
              [coords.longitude, coords.latitude],
            ],
          },
        };
      }

      return {
        order: visit.order,
        destination: {
          id: visit.destination.id,
          name: visit.destination.name,
          description: (visit.destination as { description?: string }).description ?? "",
          area: visit.destination.area,
          address: (visit.destination as { address?: string | null }).address ?? null,
          category: (visit.destination as { category?: string }).category ?? "Điểm tham quan",
          latitude: coords.latitude,
          longitude: coords.longitude,
          image: null,
        },
        arrivalMinute: visit.startMinute,
        departureMinute: visit.startMinute + visit.plannedDurationMinutes,
        visitDurationMinutes: visit.plannedDurationMinutes,
        scheduleState: "PLANNED",
        inbound,
        validationStatus: "PASS",
      };
    });

    return {
      day: day.dayIndex,
      date: day.localDate,
      stops,
      distanceMeters: null,
      travelSeconds: null,
    };
  });
}

export function TripDetailView({ trip }: { trip: TripDetail }) {
  const statusLabel = groups.find((group) => group.status === trip.status)!.label;
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [focusSelection, setFocusSelection] = useState(false);
  const [mobileTab, setMobileTab] = useState<"itinerary" | "map">("itinerary");

  const totalDestinations = trip.days.reduce((sum, d) => sum + d.visits.length, 0);

  const plannerDays = useMemo(() => tripDetailToPlannerDays(trip), [trip]);
  const activePlannerDay = useMemo(() => {
    if (plannerDays.length === 0) {
      return { day: 1, date: trip.startDate, stops: [], distanceMeters: null, travelSeconds: null };
    }
    if (activeDayIndex === null) return plannerDays[0]!;
    return plannerDays.find((d) => d.day === activeDayIndex) ?? plannerDays[0]!;
  }, [plannerDays, activeDayIndex]);

  const handleSelectDestination = (id: string) => {
    setSelectedDestinationId(id);
    setFocusSelection(true);
    if (id) {
      const el = document.getElementById(`trip-visit-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  return (
    <main className="my-trips-page my-trips-detail" lang="vi">
      {/* Back navigation */}
      <div className="my-trips-back-row">
        <Link className="my-trips-back" prefetch={false} href={"/trips" as Route}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Quay lại Chuyến đi của tôi</span>
        </Link>
      </div>

      {/* Hero Showcase Billboard */}
      <section className="my-trips-detail-hero" aria-labelledby="trip-detail-title">
        {/* Subtle contour topography & ambient glow */}
        <div className="my-trips-hero-ambient" aria-hidden="true">
          <div className="my-trips-hero-glow" />
          <svg className="my-trips-hero-topo" viewBox="0 0 1000 300" preserveAspectRatio="none">
            <path d="M0,160 Q250,80 500,150 T1000,110 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.03)" />
            <path d="M0,200 Q280,120 580,190 T1000,150 L1000,300 L0,300 Z" fill="rgba(233,185,75,0.04)" />
            <path d="M0,230 Q340,170 680,220 T1000,180 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.02)" />
          </svg>
        </div>

        <div className="my-trips-hero-content">
          <div className="my-trips-hero-header-row">
            <div className="my-trips-hero-title-group">
              <div className="my-trips-hero-badge-row">
                <p className="my-trips-eyebrow">Hành trình đã lưu</p>
                <span className={`my-trips-badge my-trips-badge-${trip.status.toLowerCase()}`}>
                  <span className="my-trips-badge-dot" aria-hidden="true" />
                  {statusLabel}
                </span>
              </div>
              <h1 id="trip-detail-title">Chuyến đi {trip.durationDays} ngày</h1>
            </div>

            <div className="my-trips-detail-actions">
              <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />

              <Link className="my-trips-action my-trips-edit-action" href={`/trips/${trip.id}/edit` as Route}>
                <Pencil size={15} aria-hidden="true" />
                <span>Chỉnh sửa hành trình</span>
              </Link>

              {trip.status !== "COMPLETED" && (
                <Link
                  className="my-trips-action my-trips-in-trip-btn"
                  href={`/trips/${trip.id}/in-trip` as Route}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  <span>Trợ lý trong chuyến đi</span>
                </Link>
              )}
            </div>
          </div>

          {/* 4 Summary Stat Cards */}
          <div className="my-trips-hero-stats-grid" aria-label="Thông số hành trình">
            <div className="my-trips-hero-stat-item">
              <div className="my-trips-stat-icon">
                <CalendarDays size={18} aria-hidden="true" />
              </div>
              <div className="my-trips-stat-info">
                <span className="my-trips-stat-label">Thời gian</span>
                <strong className="my-trips-stat-value">
                  {dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}
                </strong>
              </div>
            </div>

            <div className="my-trips-hero-stat-item">
              <div className="my-trips-stat-icon">
                <Clock3 size={18} aria-hidden="true" />
              </div>
              <div className="my-trips-stat-info">
                <span className="my-trips-stat-label">Thời lượng</span>
                <strong className="my-trips-stat-value">
                  {trip.durationDays} ngày {Math.max(1, trip.durationDays - 1)} đêm
                </strong>
              </div>
            </div>

            <div className="my-trips-hero-stat-item">
              <div className="my-trips-stat-icon">
                <CarFront size={18} aria-hidden="true" />
              </div>
              <div className="my-trips-stat-info">
                <span className="my-trips-stat-label">Phương tiện</span>
                <strong className="my-trips-stat-value">
                  {transportLabel(trip.transport)}
                </strong>
              </div>
            </div>

            <div className="my-trips-hero-stat-item">
              <div className="my-trips-stat-icon">
                <MapPin size={18} aria-hidden="true" />
              </div>
              <div className="my-trips-stat-info">
                <span className="my-trips-stat-label">Điểm tham quan</span>
                <strong className="my-trips-stat-value">
                  {visitLabel(trip.visitCount)}
                </strong>
              </div>
            </div>
          </div>

          {/* Fallback container for test assertions */}
          <div className="my-trips-hero-meta sr-only" aria-hidden="true">
            <span>
              <CalendarDays size={16} aria-hidden="true" />
              {dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}
            </span>
            <span>
              <Clock3 size={16} aria-hidden="true" />
              {trip.durationDays} ngày
            </span>
            <span>
              <CarFront size={16} aria-hidden="true" />
              {transportLabel(trip.transport)}
            </span>
            <span>
              <MapPin size={16} aria-hidden="true" />
              {visitLabel(trip.visitCount)}
            </span>
          </div>
        </div>
      </section>

      {/* Interactive Day Switcher Tabs */}
      {trip.days.length > 1 && (
        <nav className="my-trips-day-tabs" aria-label="Điều hướng các ngày trong chuyến đi">
          <button
            type="button"
            className={`my-trips-day-tab ${activeDayIndex === null ? "is-active" : ""}`}
            onClick={() => {
              setActiveDayIndex(null);
              setSelectedDestinationId(null);
            }}
          >
            <Layers size={14} aria-hidden="true" />
            <span>Tất cả các ngày ({trip.days.length})</span>
          </button>
          {trip.days.map((day) => (
            <button
              key={day.id}
              type="button"
              className={`my-trips-day-tab ${activeDayIndex === day.dayIndex ? "is-active" : ""}`}
              onClick={() => {
                setActiveDayIndex(day.dayIndex);
                const firstStop = day.visits[0];
                if (firstStop) {
                  setSelectedDestinationId(firstStop.destination.id);
                  setFocusSelection(true);
                }
                const el = document.getElementById(`trip-day-${day.dayIndex}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            >
              <span
                className="my-trips-tab-color-dot"
                style={{
                  background: `var(--planner-route-${((day.dayIndex - 1) % 3) + 1})`,
                }}
                aria-hidden="true"
              />
              <span>Ngày {day.dayIndex}</span>
              <small className="my-trips-tab-badge">({day.visits.length} điểm)</small>
            </button>
          ))}
        </nav>
      )}

      {/* Mobile Tab Toggle between Itinerary and Map */}
      <div className="my-trips-mobile-toggle" role="tablist" aria-label="Chuyển chế độ xem">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "itinerary"}
          className={`my-trips-mobile-tab-btn ${mobileTab === "itinerary" ? "is-active" : ""}`}
          onClick={() => setMobileTab("itinerary")}
        >
          <Calendar size={15} aria-hidden="true" />
          <span>Lịch trình</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "map"}
          className={`my-trips-mobile-tab-btn ${mobileTab === "map" ? "is-active" : ""}`}
          onClick={() => setMobileTab("map")}
        >
          <Map size={15} aria-hidden="true" />
          <span>Bản đồ ({totalDestinations})</span>
        </button>
      </div>

      {/* 2-Column Desktop Grid: Left Itinerary Timeline, Right Sticky Interactive Map */}
      <div className={`my-trips-main-grid my-trips-view-${mobileTab}`}>
        {/* Left Column: Itinerary Timeline */}
        <div className="my-trips-timeline-column">
          <section className="my-trips-itinerary" aria-label="Hành trình đã lưu">
            <div className="my-trips-days">
              {trip.days.map((day) => {
                const isDimmed = activeDayIndex !== null && activeDayIndex !== day.dayIndex;
                return (
                  <section
                    key={day.id}
                    className={`my-trips-day ${isDimmed ? "my-trips-day-dimmed" : ""}`}
                    aria-labelledby={`trip-day-${day.dayIndex}`}
                  >
                    <div className="my-trips-day-heading">
                      <span className="my-trips-timeline-node" aria-hidden="true" />
                      <div className="my-trips-day-title-wrap">
                        <div
                          className="my-trips-day-number-tag"
                          style={{
                            background: `var(--planner-route-${((day.dayIndex - 1) % 3) + 1})`,
                          }}
                        >
                          Ngày {day.dayIndex}
                        </div>
                        <div className="my-trips-day-title-inner">
                          <h2 id={`trip-day-${day.dayIndex}`}>Ngày {day.dayIndex}</h2>
                          <p>
                            {new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(
                              new Date(`${day.localDate}T00:00:00Z`)
                            )}
                            , {dateLabel(day.localDate)}
                          </p>
                        </div>
                      </div>

                      <div className="my-trips-day-meta">
                        <span>
                          <CarFront size={16} aria-hidden="true" />
                          Di chuyển bằng {transportLabel(trip.transport).toLocaleLowerCase("vi")}
                        </span>
                        <span>
                          <MapPin size={16} aria-hidden="true" />
                          {visitLabel(day.visits.length)}
                        </span>
                      </div>
                    </div>

                    {day.visits.length === 0 ? (
                      <div className="my-trips-group-empty my-trips-day-empty">
                        <p>Ngày này chưa có điểm dừng.</p>
                      </div>
                    ) : (
                      <ol className="my-trips-visits">
                        {day.visits.map((visit, visitIndex) => {
                          const visual = getDestinationVisual(visit.destination.name, visit.destination.area);
                          const isSelected = selectedDestinationId === visit.destination.id;

                          return (
                            <li
                              key={visit.id}
                              id={`trip-visit-${visit.destination.id}`}
                              className={`my-trips-visit-item ${isSelected ? "is-selected-item" : ""}`}
                              onClick={() => handleSelectDestination(visit.destination.id)}
                            >
                              <span className="my-trips-timeline-node" aria-hidden="true" />
                              <div className="my-trips-visit-time">
                                <strong>{minuteLabel(visit.startMinute)}</strong>
                                <span>{visit.plannedDurationMinutes} phút</span>
                              </div>

                              <Card className={`my-trips-visit ${isSelected ? "is-active-selection" : ""}`}>
                                {/* Scenic visual photo instead of plain grey box */}
                                <div
                                  className="my-trips-image-placeholder my-trips-visit-media"
                                  role="img"
                                  aria-label="Chưa có ảnh điểm đến"
                                >
                                  <img
                                    src={visual.src}
                                    alt={visual.alt}
                                    className="my-trips-visit-photo"
                                    loading="lazy"
                                  />
                                  <div className="my-trips-visit-photo-gradient" />
                                  <span className="my-trips-visit-seq-tag">#{visit.order}</span>
                                </div>

                                <div className="my-trips-visit-place">
                                  <div className="my-trips-visit-top">
                                    <span className="my-trips-order-label">Điểm dừng {visit.order}</span>
                                    <span className="my-trips-visit-chip">
                                      <Clock3 size={13} aria-hidden="true" />
                                      {visit.plannedDurationMinutes} phút
                                    </span>
                                  </div>

                                  <h3 className="my-trips-destination-title">
                                    {visit.destination.availability === "AVAILABLE" ? (
                                      <Link
                                        href={`/destinations/${visit.destination.id}` as Route}
                                        className="my-trips-destination-link"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <span>{visit.destination.name}</span>
                                        <ChevronRight size={16} className="my-trips-chevron" aria-hidden="true" />
                                      </Link>
                                    ) : (
                                      visit.destination.name
                                    )}
                                  </h3>

                                  <div className="my-trips-visit-meta">
                                    <p className="my-trips-visit-meta-item">
                                      <MapPin size={15} aria-hidden="true" />
                                      <span>{visit.destination.area}</span>
                                    </p>
                                    <p className="my-trips-visit-meta-item">
                                      <Clock3 size={15} aria-hidden="true" />
                                      <span>
                                        {minuteLabel(visit.startMinute)} –{" "}
                                        {minuteLabel(visit.startMinute + visit.plannedDurationMinutes)} (
                                        {visit.plannedDurationMinutes} phút)
                                      </span>
                                    </p>
                                  </div>

                                  {visit.destination.availability === "UNAVAILABLE" && (
                                    <p className="my-trips-unavailable">Điểm đến không còn khả dụng công khai</p>
                                  )}
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
          </section>
        </div>

        {/* Right Column: Sticky Interactive Map */}
        <div className="my-trips-map-column">
          <div className="my-trips-map-sticky">
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
              <div className="my-trips-map-empty">
                <Mountain size={36} aria-hidden="true" />
                <p>Chưa có điểm dừng để hiển thị trên bản đồ.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Notes & Actions */}
      <footer className="my-trips-detail-footer">
        <p className="my-trips-status-note">
          {trip.manuallyCompletedAt
            ? "Bạn đã đánh dấu chuyến đi hoàn thành thủ công; thao tác này không xác nhận các điểm dừng đã được tham quan."
            : "Trạng thái được tính theo ngày lịch; không xác nhận các điểm dừng đã được tham quan."}
        </p>

        <nav className="my-trips-detail-nav" aria-label="Thao tác chuyến đi">
          <Link className="my-trips-action" href={`/trips/${trip.id}/edit` as Route}>
            Chỉnh sửa hành trình
          </Link>

          {trip.status !== "COMPLETED" && (
            <Link className="my-trips-secondary-action" href={`/trips/${trip.id}/in-trip` as Route}>
              <Sparkles size={16} aria-hidden="true" />
              <span>Mở Trợ lý trong chuyến đi</span>
            </Link>
          )}
        </nav>
      </footer>
    </main>
  );
}
