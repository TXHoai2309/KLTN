"use client";

import { DaySun, StopWeather, TripWeatherFootnote } from "@/modules/trip-weather/trip-weather-inline";
import { TripWeatherProvider } from "@/modules/trip-weather/trip-weather-state";
import Link from "next/link";
import { BREAKFAST_MINUTES, MORNING_DEPARTURE_MINUTE } from "@/modules/trip-planner/planner-engine";
import { Fragment, useEffect, useRef, useState, useMemo, type CSSProperties } from "react";
import { travelerButtonClassName } from "@/components/traveler-ui/traveler-button";
import { TravelerDayTabs, travelerDayColorVar, type TravelerDayTabItem } from "@/components/traveler-ui/traveler-day-tabs";
import { DayTimeline, type DayTimelineDay, type DayTimelineNearbyItem, type DayTimelineStop } from "@/components/trip-timeline/day-timeline";
import { buildDayEveningPlan } from "@/components/trip-timeline/evening-plan";
import { RouteStrip } from "@/components/trip-timeline/route-strip";
import { buildDataTripTitle, daysUntilTrip } from "@/lib/traveler-trip-title";
import { uncheckedItemLabel } from "@/modules/trip-save/unchecked-checks";
import { useRouter, useSearchParams } from "next/navigation";
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
  Users,
  LogOut,
  LoaderCircle,
  Home,
  Flag,
  Coffee,
  Moon,
  Search,
  UtensilsCrossed,
  BedDouble,
  Eye,
  MoreHorizontal,
  X,
} from "lucide-react";

import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import { TripPinnedSection } from "@/components/trip-pinned/trip-pinned-section";
import { TripsageAccessLegCard } from "@/components/tripsage-chat/tripsage-access-leg-card";
import type { PinnedItem } from "@/modules/trip-save/trip-pin-contract";
import { canPreviewPlace, type PlacePreviewTarget } from "@/lib/place-preview-url";

import {
  lunchBreakAfter,
  breakfastText,
  nightRestText,
  ItineraryOriginDepartureCard,
  ItineraryOriginReturnCard,
  durationText,
} from "@/components/trip-planner/planner-presentation";
import { formatMinuteLabel } from "@/modules/trip-origin/journey-time-utils";
import { TripJourneyEditModal } from "@/components/trip-origin/trip-journey-edit-modal";

import { Card } from "@KLTN/ui/components/card";
import { Empty } from "@KLTN/ui/components/empty";
import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { toast } from "sonner";
import type { TripDetail, TripSummary } from "@/modules/trip-read/trip-read-service";
import type { TripStatus } from "@/modules/trip-read/trip-status";
import { applyTripChange, type TripChange } from "@/modules/trip-read/trip-management-client";
import { leaveCompanionTrip } from "@/modules/trip-companions/companion-client";
import { CompanionDiscoveryView } from "@/components/trip-companions/companion-discovery-view";
import { TripManagementActions } from "./trip-management-actions";
import TripFavoriteButton from "./trip-favorite-button";
import { ItineraryMap } from "@/components/trip-planner/itinerary-map";
import type { PlannerDay, PlannerStop, TravelLeg } from "@/modules/trip-planner/planner-contract";
import { getDestinationCoordinates, getDestinationVisual } from "@/lib/destination-visuals";
import { cleanAreaDisplayLabel, cleanPlaceDisplayName, cleanTravelerDisplay } from "@/lib/traveler-display-clean";

function MemberLeaveAction({
  trip,
  onLeft,
}: {
  trip: TripSummary;
  onLeft: (tripId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      cancelBtnRef.current?.focus();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  async function handleConfirmLeave() {
    if (!trip.publicationId || pending) return;
    setPending(true);
    setErrorMsg("");

    const key = crypto.randomUUID();
    const result = await leaveCompanionTrip(trip.publicationId, key);
    setPending(false);

    if (result.status === "SUCCESS") {
      setOpen(false);
      toast.success("Đã rời chuyến đi đồng hành thành công.");
      onLeft(trip.id);
    } else {
      setErrorMsg(
        result.status === "UNKNOWN"
          ? "Kết quả chưa chắc chắn. Vui lòng thử lại."
          : result.error?.message || "Không thể rời chuyến đi lúc này."
      );
    }
  }

  return (
    <>
      <div className="my-trips-management">
        <Button
          variant="outline"
          className="my-trips-leave-button"
          onClick={() => {
            setErrorMsg("");
            setOpen(true);
          }}
          disabled={pending}
        >
          <LogOut size={14} aria-hidden="true" />
          <span>Rời chuyến</span>
        </Button>
      </div>

      <dialog
        ref={dialogRef}
        className="my-trips-dialog"
        onCancel={(e) => {
          if (pending) e.preventDefault();
          else setOpen(false);
        }}
      >
        <h2>Rời chuyến đi đồng hành?</h2>
        <p className="my-trips-dialog-trip">
          Chuyến đi {trip.durationDays} ngày · {dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}
        </p>
        <p>
          Bạn sẽ trả lại 1 chỗ cho đoàn {trip.hostName ? `của ${trip.hostName}` : ""} và không còn quyền truy cập nhóm trò chuyện. Chuyến đi sẽ được gỡ khỏi danh sách của bạn.
        </p>
        {errorMsg && (
          <p role="alert" className="my-trips-mutation-feedback">
            {errorMsg}
          </p>
        )}
        <div className="my-trips-dialog-actions">
          <Button
            ref={cancelBtnRef}
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Hủy
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => void handleConfirmLeave()}
            aria-busy={pending}
          >
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {pending ? "Đang rời nhóm…" : "Xác nhận rời chuyến"}
          </Button>
        </div>
      </dialog>
    </>
  );
}

const groups: { status: TripStatus; label: string; desc: string }[] = [
  { status: "UPCOMING", label: "Sắp tới", desc: "Hành trình đã lên lịch và sẵn sàng khởi hành" },
  { status: "ONGOING", label: "Đang diễn ra", desc: "Chuyến đi đang trong thời gian khám phá Hà Giang" },
  { status: "COMPLETED", label: "Đã hoàn thành", desc: "Các chuyến đi đã hoàn thành và lưu giữ kỷ niệm" },
];

const transportLabel = (transport: TripSummary["transport"]) =>
  transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô";
const tripTitle = (trip: TripSummary) =>
  buildDataTripTitle({
    companionTitle: trip.companionTitle,
    homeCity: trip.homeCity,
    originLabel: trip.originLabel,
    firstArea: trip.firstArea,
    lastArea: trip.lastArea,
    startDate: trip.startDate,
    endDate: trip.endDate,
    durationDays: trip.durationDays,
  });
const dateLabel = (date: string) =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
function shiftIsoDate(iso: string | undefined, deltaDays: number): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}
const shortDayMonth = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const minuteLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const visitLabel = (count: number) => `${count} điểm dừng`;

function normalizeTripSearch(value: string) {
  return value.normalize("NFD").toLowerCase().replace(/\p{M}/gu, "").replace(/đ/g, "d")
    .replace(/\s+/g, " ").trim();
}

export function filterTripsBySearch(items: TripSummary[], query: string) {
  const search = normalizeTripSearch(query);
  if (!search) return items;

  return items.filter((trip) => [
    tripTitle(trip),
    dateLabel(trip.startDate),
    dateLabel(trip.endDate),
    transportLabel(trip.transport),
  ].some((value) => normalizeTripSearch(value).includes(search)));
}

/** The destination's own photo; a broken link falls back to the scenic picture. */
function VisitPhoto({ image, fallback }: { image?: { url: string; alt: string }; fallback: { src: string; alt: string } }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const usable = image && image.url !== failedUrl;
  return (
    <img
      src={usable ? image.url : fallback.src}
      alt={usable ? image.alt : fallback.alt}
      className="my-trips-visit-photo"
      loading="lazy"
      onError={() => { if (usable) setFailedUrl(image.url); }}
    />
  );
}

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


export function MyTripsView({
  items: initialItems,
  isGuest = false,
  initialTab,
}: {
  items: TripSummary[];
  isGuest?: boolean;
  initialTab?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [announcement, setAnnouncement] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TripStatus>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusGroup = useRef<TripStatus | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") ?? initialTab;
  const isCompanionScope =
    tabParam === "companions" ||
    tabParam === "explore" ||
    tabParam === "mine" ||
    tabParam === "joined";

  const [mainTab, setMainTab] = useState<"my-trips" | "companions">(
    isCompanionScope ? "companions" : "my-trips"
  );

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    const isComp =
      currentTab === "companions" ||
      currentTab === "explore" ||
      currentTab === "mine" ||
      currentTab === "joined";
    setMainTab(isComp ? "companions" : "my-trips");
  }, [searchParams]);

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

  function handleSelectMainTab(next: "my-trips" | "companions") {
    if (next === "my-trips" && isGuest) {
      router.push("/login?returnTo=%2Ftrips" as Route);
      return;
    }
    setMainTab(next);
    if (next === "my-trips") {
      router.replace("/trips" as Route, { scroll: false });
    } else {
      router.replace("/trips?tab=companions" as Route, { scroll: false });
    }
  }

  const matchingItems = useMemo(() => filterTripsBySearch(items, searchQuery), [items, searchQuery]);

  const counts = useMemo(() => {
    return {
      ALL: matchingItems.length,
      UPCOMING: matchingItems.filter((i) => i.status === "UPCOMING").length,
      ONGOING: matchingItems.filter((i) => i.status === "ONGOING").length,
      COMPLETED: matchingItems.filter((i) => i.status === "COMPLETED").length,
    };
  }, [matchingItems]);
  const visibleCount = counts[statusFilter];
  const searchResult = visibleCount > 0
    ? `Tìm thấy ${visibleCount} chuyến đi.`
    : "Không tìm thấy chuyến đi phù hợp.";

  return (
    <main className="my-trips-page" lang="vi">
      {/* Top 2-Level Main Tabs: Hành trình của tôi vs Tìm bạn đồng hành */}
      <div className="my-trips-segmented-nav" role="tablist" aria-label="Phân loại quản lý chuyến đi">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "my-trips"}
          className={`my-trips-tab-button ${mainTab === "my-trips" ? "is-active" : ""}`}
          onClick={() => handleSelectMainTab("my-trips")}
        >
          <CalendarDays size={18} aria-hidden="true" />
          <span>Hành trình của tôi</span>
          {items.length > 0 && <span className="my-trips-tab-count">{items.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "companions"}
          className={`my-trips-tab-button ${mainTab === "companions" ? "is-active" : ""}`}
          onClick={() => handleSelectMainTab("companions")}
        >
          <Users size={18} aria-hidden="true" />
          <span>Tìm bạn đồng hành</span>
        </button>
      </div>

      {mainTab === "companions" ? (
        <div className="my-trips-companions-section">
          <CompanionDiscoveryView
            initialTab={
              tabParam === "mine"
                ? "mine"
                : tabParam === "joined"
                  ? "joined"
                  : "explore"
            }
          />
        </div>
      ) : (
        <>
          {/* Editorial Header */}
          <div className="my-trips-heading">
            <div className="my-trips-heading-copy">
              <h1>Chuyến đi của tôi</h1>
              <p>Xem các hành trình đã lưu và tiếp tục chuẩn bị cho chuyến đi.</p>
            </div>

            <Link className={travelerButtonClassName({ variant: "primary", size: "md" })} href="/trips/new">
              <Plus size={16} aria-hidden="true" />
              <span>Tạo chuyến đi</span>
            </Link>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {searchQuery ? searchResult : ""}
          </p>
          <p className="sr-only" role="status">
            {announcement}
          </p>

          {/* Compact toolbar: filter chips + icon search toggle (design §4.3) */}
          <div className="my-trips-toolbar">
            {items.length > 0 && (
              <div className="my-trips-filter-bar" role="tablist" aria-label="Lọc trạng thái chuyến đi">
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "ALL"}
                  className={`my-trips-filter-pill ${statusFilter === "ALL" ? "is-active" : ""}`}
                  onClick={() => setStatusFilter("ALL")}
                >
                  <span>Tất cả</span>
                  <span className="my-trips-filter-count">{counts.ALL}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "UPCOMING"}
                  className={`my-trips-filter-pill ${statusFilter === "UPCOMING" ? "is-active" : ""}`}
                  onClick={() => setStatusFilter("UPCOMING")}
                >
                  <span>Sắp tới</span>
                  <span className="my-trips-filter-count">{counts.UPCOMING}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "ONGOING"}
                  className={`my-trips-filter-pill ${statusFilter === "ONGOING" ? "is-active" : ""}`}
                  onClick={() => setStatusFilter("ONGOING")}
                >
                  <span>Đang diễn ra</span>
                  <span className="my-trips-filter-count">{counts.ONGOING}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "COMPLETED"}
                  className={`my-trips-filter-pill ${statusFilter === "COMPLETED" ? "is-active" : ""}`}
                  onClick={() => setStatusFilter("COMPLETED")}
                >
                  <span>Đã hoàn thành</span>
                  <span className="my-trips-filter-count">{counts.COMPLETED}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              className={travelerButtonClassName({ variant: "icon", size: "md", className: "my-trips-search-toggle" })}
              aria-label="Mở tìm kiếm chuyến đi"
              aria-expanded={searchOpen || Boolean(searchQuery)}
              onClick={() => {
                setSearchOpen((prev) => !prev);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
            >
              <Search size={16} aria-hidden="true" />
            </button>
          </div>

          <form
            className={`my-trips-search${searchOpen || searchQuery ? "" : " is-collapsed"}`}
            role="search"
            aria-label="Tìm kiếm chuyến đi đã lưu"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchQuery(searchInput.trim());
            }}
          >
            <Input
              ref={searchInputRef}
              type="search"
              className="my-trips-search-input"
              aria-label="Tên chuyến, ngày đi hoặc phương tiện"
              placeholder="Tên chuyến, ngày đi hoặc phương tiện"
              value={searchInput}
              onChange={(event) => {
                const value = event.target.value;
                setSearchInput(value);
                if (!value) setSearchQuery("");
              }}
            />
            <Button className="my-trips-search-button" variant="outline" type="submit">
              <Search size={16} aria-hidden="true" />
              Tìm chuyến đi
            </Button>
          </form>

          {searchQuery && (
            <div className="my-trips-search-summary">
              <p>{searchResult}</p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
              >
                Xóa tìm kiếm
              </Button>
            </div>
          )}

          {items.length === 0 && !searchQuery ? (
            <Empty className="my-trips-state" role="status">
              <div className="my-trips-state-illustration" aria-hidden="true">
                <Mountain size={44} />
              </div>
              <h2>Bạn chưa có chuyến đi nào.</h2>
              <p>Chưa có chuyến nào. Bắt đầu với trợ lý hoặc tự tạo lịch trình Hà Giang.</p>
              <Link className={travelerButtonClassName({ variant: "primary", size: "md" })} href="/trips/new">
                <Plus size={16} aria-hidden="true" />
                <span>Tạo chuyến đi đầu tiên</span>
              </Link>
            </Empty>
          ) : (
            groups.map((group) => {
              const trips = matchingItems.filter((item) => item.status === group.status);
              if (searchQuery && trips.length === 0) return null;
              const isHiddenByFilter = statusFilter !== "ALL" && statusFilter !== group.status;
              const featuredTrip =
                group.status === "UPCOMING" && !searchQuery && trips.length > 0 ? trips[0]! : null;
              const rowTrips = featuredTrip ? trips.slice(1) : trips;

              const renderOverflow = (trip: TripSummary) => (
                <details className="tv-overflow-menu">
                  <summary
                    className={travelerButtonClassName({ variant: "icon", size: "sm" })}
                    aria-label={`Thao tác cho ${tripTitle(trip)}`}
                  >
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </summary>
                  <div className="tv-overflow-menu-panel">
                    {trip.role === "MEMBER" && trip.publicationId ? (
                      <>
                        <Link
                          className="tv-overflow-item"
                          prefetch={false}
                          href={`/trip-companions/${trip.publicationId}/group` as Route}
                        >
                          <Users size={15} aria-hidden="true" />
                          <span>Vào nhóm đồng hành</span>
                        </Link>
                        <MemberLeaveAction
                          trip={trip}
                          onLeft={(tripId) => {
                            setItems((current) => current.filter((item) => item.id !== tripId));
                            router.refresh();
                          }}
                        />
                      </>
                    ) : (
                      <TripManagementActions trip={trip} onConfirmed={confirmed} />
                    )}
                  </div>
                </details>
              );

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
                    <>
                      {featuredTrip && (
                        <article className="my-trips-featured">
                          <div className="my-trips-featured-media" aria-hidden="true">
                            <img
                              src={featuredTrip.firstStopImage?.url ?? getTripHeroImage(featuredTrip.durationDays, 0)}
                              alt={featuredTrip.firstStopImage?.alt ?? tripTitle(featuredTrip)}
                              loading="eager"
                            />
                          </div>
                          <div className="my-trips-featured-body">
                            <div className="my-trips-featured-top">
                              <div className="my-trips-featured-text">
                                <h3 className="my-trips-featured-title">
                                  <Link
                                    className="my-trips-card-link"
                                    prefetch={false}
                                    href={
                                      featuredTrip.role === "MEMBER" && featuredTrip.publicationId
                                        ? (`/trip-companions/${featuredTrip.publicationId}/group` as Route)
                                        : (`/trips/${featuredTrip.id}` as Route)
                                    }
                                  >
                                    {tripTitle(featuredTrip)}
                                  </Link>
                                </h3>
                                <p className="my-trips-row-meta">
                                  {[
                                    `${dateLabel(featuredTrip.startDate)} – ${dateLabel(featuredTrip.endDate)}`,
                                    transportLabel(featuredTrip.transport),
                                    visitLabel(featuredTrip.visitCount),
                                    daysUntilTrip(featuredTrip.startDate) !== null
                                      ? `còn ${daysUntilTrip(featuredTrip.startDate)} ngày`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </div>
                              <div className="my-trips-row-actions">
                                <TripFavoriteButton tripId={featuredTrip.id} isFavorite={featuredTrip.isFavorite} />
                                {renderOverflow(featuredTrip)}
                              </div>
                            </div>
                          </div>
                        </article>
                      )}

                      {rowTrips.length > 0 && (
                        <ul className="my-trips-compact-list">
                          {rowTrips.map((trip, tripIndex) => {
                            const href =
                              trip.role === "MEMBER" && trip.publicationId
                                ? (`/trip-companions/${trip.publicationId}/group` as Route)
                                : (`/trips/${trip.id}` as Route);
                            const completionNote =
                              trip.role === "MEMBER"
                                ? `Tham gia cùng ${trip.hostName || "chủ chuyến"}`
                                : trip.manuallyCompletedAt
                                  ? "Bạn đã đánh dấu hoàn thành thủ công."
                                  : trip.status === "COMPLETED"
                                    ? "Đã hoàn thành theo ngày kế hoạch; chưa đánh dấu thủ công."
                                    : null;
                            return (
                              <li key={trip.id} className="my-trips-row">
                                <div className="my-trips-row-thumb" aria-hidden="true">
                                  <img
                                    src={trip.firstStopImage?.url ?? getTripHeroImage(trip.durationDays, tripIndex + 1)}
                                    alt={trip.firstStopImage?.alt ?? tripTitle(trip)}
                                    loading="lazy"
                                  />
                                </div>
                                <div className="my-trips-row-main">
                                  <h3 className="my-trips-row-title">
                                    <Link className="my-trips-card-link" prefetch={false} href={href}>
                                      {tripTitle(trip)}
                                    </Link>
                                  </h3>
                                  <p className="my-trips-row-meta">
                                    {dateLabel(trip.startDate)} – {dateLabel(trip.endDate)} · {transportLabel(trip.transport)} ·{" "}
                                    {visitLabel(trip.visitCount)}
                                    {completionNote ? ` · ${completionNote}` : ""}
                                  </p>
                                </div>
                                <div className="my-trips-row-actions">
                                  <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />
                                  {renderOverflow(trip)}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </section>
              );
            })
          )}
        </>
      )}
    </main>
  );
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
          status: "INSUFFICIENT_DATA",
          reason: "UNAVAILABLE",
          durationSeconds: null,
          distanceMeters: null,
          provider: null,
        };
      }

      return {
        order: visit.order,
        destination: {
          id: visit.destination.id,
          name: cleanPlaceDisplayName(visit.destination.name) || visit.destination.name,
          description: cleanTravelerDisplay((visit.destination as { description?: string }).description),
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

export function TripDetailView({ trip, calendarEnabled = false }: { trip: TripDetail; calendarEnabled?: boolean }) {
  const router = useRouter();
  const statusLabel = groups.find((group) => group.status === trip.status)!.label;
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [activeTravelTab, setActiveTravelTab] = useState<"outbound" | "return" | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [focusSelection, setFocusSelection] = useState(false);
  const [mobileTab, setMobileTab] = useState<"itinerary" | "map">("itinerary");
  const [mobileMapSheetOpen, setMobileMapSheetOpen] = useState(false);
  const [journeyEditModalOpen, setJourneyEditModalOpen] = useState(false);
  const [isLegacyOptInMode, setIsLegacyOptInMode] = useState(false);
  const [preview, setPreview] = useState<{ target: PlacePreviewTarget; trigger: HTMLElement | null } | null>(null);
  const chosenLodgingByNight = useMemo(
    () => new globalThis.Map((trip.chosenLodgings ?? []).map(item => [item.nightIndex, item] as const)),
    [trip.chosenLodgings],
  );

  const isOwner = trip.role !== "MEMBER";
  const hasJourney = Boolean(trip.journey && trip.journey.journey.origin);
  const accessLeg = useMemo(() => {
    if (!isOwner) return null;
    const accessPins = (trip.pinnedItems ?? []).filter(
      (item): item is Extract<PinnedItem, { kind: "ACCESS" }> => item.kind === "ACCESS",
    );
    return accessPins.at(-1)?.leg ?? null;
  }, [isOwner, trip.pinnedItems]);
  const nonAccessPins = useMemo(
    () => (trip.pinnedItems ?? []).filter((item) => item.kind !== "ACCESS"),
    [trip.pinnedItems],
  );
  const outboundDate = useMemo(() => shiftIsoDate(trip.days[0]?.localDate ?? trip.startDate, -1), [trip.days, trip.startDate]);
  const returnDate = useMemo(() => shiftIsoDate(trip.days.at(-1)?.localDate ?? trip.endDate, 1), [trip.days, trip.endDate]);

  const totalDestinations = trip.days.reduce((sum, d) => sum + d.visits.length, 0);

  const firstStop = trip.days.flatMap((d) => d.visits)[0] ?? null;
  const lastStop = trip.days.flatMap((d) => d.visits).at(-1) ?? null;
  const detailTitle = useMemo(
    () =>
      buildDataTripTitle({
        companionTitle: trip.companionTitle,
        homeCity: accessLeg?.homeCity ?? null,
        originLabel: trip.journey?.journey.origin?.label ?? null,
        firstArea: firstStop?.destination.area ?? null,
        lastArea: lastStop?.destination.area ?? null,
        startDate: trip.startDate,
        endDate: trip.endDate,
        durationDays: trip.durationDays,
      }),
    [
      trip.companionTitle,
      accessLeg?.homeCity,
      trip.journey?.journey.origin?.label,
      firstStop?.destination.area,
      lastStop?.destination.area,
      trip.startDate,
      trip.endDate,
      trip.durationDays,
    ],
  );

  const routeStripDays = useMemo(() => {
    const legDistanceByDay = new globalThis.Map<number, number>();
    for (const leg of trip.journey?.plan?.legs ?? []) {
      if (leg.route.distanceMeters != null && leg.route.distanceMeters > 0) {
        legDistanceByDay.set(leg.day, (legDistanceByDay.get(leg.day) ?? 0) + leg.route.distanceMeters / 1000);
      }
    }
    return trip.days.map((day) => {
      let km = legDistanceByDay.get(day.dayIndex) ?? 0;
      if (km === 0) {
        for (const visit of day.visits) {
          if (visit.inbound?.distanceMeters && visit.inbound.distanceMeters > 0) {
            km += visit.inbound.distanceMeters / 1000;
          }
        }
      }
      return {
        dayIndex: day.dayIndex,
        stopCount: day.visits.length,
        distanceKm: km > 0 ? km : null,
      };
    });
  }, [trip.days, trip.journey?.plan?.legs]);

  const totalKm = useMemo(() => {
    const planMeters = trip.journey?.plan?.totals.distanceMeters;
    if (typeof planMeters === "number" && planMeters > 0) return Math.round(planMeters / 1000);
    const sum = routeStripDays.reduce((acc, d) => acc + (d.distanceKm ?? 0), 0);
    return sum > 0 ? Math.round(sum) : null;
  }, [trip.journey?.plan?.totals.distanceMeters, routeStripDays]);

  const daysUntil = trip.status === "UPCOMING" ? daysUntilTrip(trip.startDate) : null;
  const metaParts = [
    accessLeg?.travelers ? `${accessLeg.travelers} người` : null,
    transportLabel(trip.transport),
    visitLabel(trip.visitCount),
    totalKm !== null ? `${totalKm.toLocaleString("vi-VN")} km` : null,
    daysUntil !== null ? `còn ${daysUntil} ngày` : statusLabel,
  ].filter(Boolean);

  const heroFallback = firstStop
    ? getDestinationVisual(cleanPlaceDisplayName(firstStop.destination.name) || firstStop.destination.name, firstStop.destination.area)
    : { src: getTripHeroImage(trip.durationDays, 0), alt: detailTitle };
  const heroImageUrl = firstStop?.destination.image?.url ?? heroFallback.src;
  const heroImageAlt = cleanTravelerDisplay(firstStop?.destination.image?.alt) || heroFallback.alt;

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

  const handleJumpToDay = (dayIndex: number) => {
    setActiveTravelTab(null);
    const nextDay = activeDayIndex === dayIndex ? null : dayIndex;
    setActiveDayIndex(nextDay);
    if (nextDay !== null) {
      const targetDay = trip.days.find((d) => d.dayIndex === nextDay);
      const firstStopOfDay = targetDay?.visits[0];
      if (firstStopOfDay) {
        setSelectedDestinationId(firstStopOfDay.destination.id);
        setFocusSelection(true);
      }
      const el = document.getElementById(`trip-day-${nextDay}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <main className="my-trips-page my-trips-detail" lang="vi">
      {/* Mobile top bar (design §4.2): ← · "Chuyến đi" · ⋯ */}
      <div className="my-trips-mobile-topbar">
        <Link
          className={travelerButtonClassName({ variant: "icon", size: "md" })}
          prefetch={false}
          href={"/trips" as Route}
          aria-label="Quay lại Chuyến đi của tôi"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <span className="my-trips-mobile-topbar-title">Chuyến đi</span>
        <details className="tv-overflow-menu">
          <summary
            className={travelerButtonClassName({ variant: "icon", size: "md" })}
            aria-label="Thao tác khác"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </summary>
          <div className="tv-overflow-menu-panel">
            {isOwner && trip.status !== "COMPLETED" && (
              <Link className="tv-overflow-item" href={`/trips/${trip.id}/edit` as Route}>
                <Pencil size={15} aria-hidden="true" />
                <span>Chỉnh sửa hành trình</span>
              </Link>
            )}
            {isOwner && trip.status === "UPCOMING" && (
              <button
                type="button"
                className="tv-overflow-item"
                onClick={() => {
                  setIsLegacyOptInMode(!hasJourney);
                  setJourneyEditModalOpen(true);
                }}
              >
                <MapPin size={15} aria-hidden="true" />
                <span>{hasJourney ? "Đổi giờ xuất phát" : "Bổ sung nơi xuất phát"}</span>
              </button>
            )}
            {isOwner && trip.status !== "COMPLETED" && (
              <Link className="tv-overflow-item" href={`/trips/${trip.id}/publication` as Route}>
                <Users size={15} aria-hidden="true" />
                <span>Tìm bạn đồng hành</span>
              </Link>
            )}
            {calendarEnabled && (
              <a
                className="tv-overflow-item"
                href={"/api/trips/" + encodeURIComponent(trip.id) + "/calendar"}
                download
              >
                <Calendar size={15} aria-hidden="true" />
                <span>Thêm vào lịch (.ics)</span>
              </a>
            )}
          </div>
        </details>
      </div>

      {/* Desktop back navigation */}
      <div className="my-trips-back-row">
        <Link className="my-trips-back" prefetch={false} href={"/trips" as Route}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Quay lại Chuyến đi của tôi</span>
        </Link>
      </div>

      {/* Mobile 16:9 hero photo of the first stop (design §4.2) */}
      <div className="my-trips-mobile-hero">
        <img src={heroImageUrl} alt={heroImageAlt} loading="eager" />
      </div>

      {/* Slim editorial header (design §4.2, slim C13-C14) */}
      <header className="my-trips-detail-header" aria-labelledby="trip-detail-title">
        <div className="my-trips-detail-title-row">
          <h1 id="trip-detail-title" className="my-trips-detail-title">
            {detailTitle}
          </h1>
          {trip.role === "MEMBER" && (
            <span className="my-trips-role-badge">
              <Users size={12} aria-hidden="true" />
              <span>Thành viên đoàn {trip.hostName ? `của ${trip.hostName}` : ""}</span>
            </span>
          )}
        </div>

        <p className="my-trips-detail-meta">{metaParts.join(" · ")}</p>

        <div className="my-trips-detail-actions">
          {trip.role === "MEMBER" ? (
            trip.publicationId && (
              <Link
                className={travelerButtonClassName({
                  variant: "primary",
                  size: "md",
                  className: "my-trips-desktop-primary is-member-open",
                })}
                href={`/trip-companions/${trip.publicationId}/group` as Route}
              >
                <Users size={15} aria-hidden="true" />
                <span>Vào nhóm đồng hành</span>
              </Link>
            )
          ) : (
            <>
              {trip.status !== "COMPLETED" && (
                <Link
                  className={travelerButtonClassName({
                    variant: "primary",
                    size: "md",
                    className: "my-trips-desktop-primary my-trips-in-trip-btn",
                  })}
                  href={`/trips/${trip.id}/in-trip` as Route}
                  aria-label="Hỏi trợ lý · Trợ lý trong chuyến đi"
                >
                  <Sparkles size={15} aria-hidden="true" />
                  <span>Hỏi trợ lý</span>
                </Link>
              )}

              {trip.status !== "COMPLETED" && (
                <Link
                  className={travelerButtonClassName({ variant: "text", size: "md", className: "my-trips-edit-action" })}
                  href={`/trips/${trip.id}/edit` as Route}
                  aria-label="Chỉnh sửa hành trình"
                >
                  <Pencil size={15} aria-hidden="true" />
                  <span>Chỉnh sửa hành trình</span>
                </Link>
              )}

              {trip.status === "UPCOMING" && (
                <button
                  type="button"
                  className={travelerButtonClassName({ variant: "text", size: "md", className: "my-trips-origin-action" })}
                  onClick={() => {
                    setIsLegacyOptInMode(!hasJourney);
                    setJourneyEditModalOpen(true);
                  }}
                >
                  {hasJourney ? <MapPin size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                  <span>{hasJourney ? "Đổi giờ xuất phát" : "Bổ sung nơi xuất phát"}</span>
                </button>
              )}

              {trip.status !== "COMPLETED" && (
                <Link
                  className={travelerButtonClassName({ variant: "text", size: "md", className: "my-trips-companion-action" })}
                  href={`/trips/${trip.id}/publication` as Route}
                >
                  <Users size={15} aria-hidden="true" />
                  <span>Tìm bạn đồng hành</span>
                </Link>
              )}
            </>
          )}

          <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />

          <details className="tv-overflow-menu" data-testid="trip-detail-overflow-menu">
            <summary
              className={travelerButtonClassName({ variant: "icon", size: "md" })}
              aria-label="Thêm thao tác chuyến đi"
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </summary>
            <div className="tv-overflow-menu-panel">
              {calendarEnabled && (
                <div className="tv-overflow-calendar">
                  <a
                    className="tv-overflow-item"
                    href={"/api/trips/" + encodeURIComponent(trip.id) + "/calendar"}
                    download
                    aria-describedby="trip-calendar-help"
                  >
                    <Calendar size={15} aria-hidden="true" />
                    <span>Thêm vào lịch (.ics)</span>
                  </a>
                  <p id="trip-calendar-help" className="tv-overflow-help">
                    Tải file .ics, mở bằng Google Calendar, Apple Calendar hoặc Outlook.
                  </p>
                </div>
              )}
              {isOwner && (
                <TripManagementActions
                  trip={trip}
                  onConfirmed={(change) => {
                    if ("deleted" in change) {
                      router.push("/trips" as Route);
                    } else {
                      router.refresh();
                    }
                  }}
                />
              )}
            </div>
          </details>
        </div>

        {routeStripDays.length > 0 && (
          <RouteStrip
            days={routeStripDays}
            activeDayIndex={activeDayIndex}
            onSelectDay={handleJumpToDay}
          />
        )}

        {/* Screen-reader fallback meta */}
        <div className="sr-only" aria-hidden="true">
          <span>{dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}</span>
          <span>{trip.durationDays} ngày</span>
          <span>{transportLabel(trip.transport)}</span>
          <span>{visitLabel(trip.visitCount)}</span>
        </div>
      </header>

      {trip.unchecked && trip.unchecked.items.length > 0 && (
        <section className="my-trips-unchecked" data-testid="trip-unchecked-section" aria-label="Các mục chưa kiểm">
          <p><strong>Chưa kiểm</strong>: hành trình này được lưu kèm các mục KLTN chưa kiểm tra được (không được tính là đã đạt)
            {trip.unchecked.confirmedAt ? `, bạn đã xác nhận lúc ${new Date(trip.unchecked.confirmedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}.</p>
          <ul>
            {trip.unchecked.items.map((item) => (
              <li key={`${item.check}|${item.reasonCode}|${item.placeId}`}>
                {cleanPlaceDisplayName(trip.days.flatMap((d) => d.visits).find((v) => v.destination.id === item.placeId)?.destination.name ?? "") || "Địa điểm ngoài danh mục"} — {uncheckedItemLabel(item)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Journey Overview Card (for Owner when journey exists) */}
      {hasJourney && trip.journey && (
        <section className="my-trips-journey-banner" data-testid="trip-saved-journey-section" aria-label="Điểm xuất phát hành trình">
          <div className="my-trips-journey-header">
            <div className="flex items-center gap-2">
              <Home size={18} className="text-primary" aria-hidden="true" />
              <h3 className="font-semibold text-base">Điểm xuất phát hành trình</h3>
              <span className="my-trips-badge my-trips-badge-upcoming">Riêng tư</span>
            </div>
            {trip.status === "UPCOMING" && isOwner && (
              <button
                type="button"
                className="my-trips-journey-edit-btn text-xs font-medium text-primary hover:underline flex items-center gap-1"
                onClick={() => {
                  setIsLegacyOptInMode(false);
                  setJourneyEditModalOpen(true);
                }}
              >
                <Pencil size={13} aria-hidden="true" />
                <span>Thay đổi</span>
              </button>
            )}
          </div>

          {trip.journey.journey.origin && (
            <div className="my-trips-journey-body mt-2">
              <div className="font-medium text-foreground text-sm">
                {trip.journey.journey.origin.label}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Tọa độ riêng tư: ({trip.journey.journey.origin.latitude.toFixed(5)}, {trip.journey.journey.origin.longitude.toFixed(5)})
              </div>

              <div className="my-trips-journey-times mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs block">Khởi hành Ngày 1:</span>
                  <strong>{formatMinuteLabel(trip.journey.journey.departureMinute)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Hạn về Ngày {trip.durationDays}:</span>
                  <strong>{formatMinuteLabel(trip.journey.journey.returnDeadlineMinute)}</strong>
                </div>
              </div>

              {trip.journey.plan ? (
                <div className="my-trips-journey-plan mt-3 pt-3 border-t border-border/50 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {trip.journey.plan.totals.drivingSeconds != null && (
                      <span>
                        Chạy xe: <strong>{durationText(Math.ceil(trip.journey.plan.totals.drivingSeconds / 60))}</strong>
                      </span>
                    )}
                    {trip.journey.plan.totals.restMinutes != null && (
                      <span>
                        Nghỉ ven đường: <strong>+{trip.journey.plan.totals.restMinutes} phút</strong>
                      </span>
                    )}
                    {trip.journey.plan.totals.distanceMeters != null && (
                      <span>
                        Quãng đường:{" "}
                        <strong>
                          {(trip.journey.plan.totals.distanceMeters / 1000).toLocaleString("vi-VN", {
                            maximumFractionDigits: 1,
                          })}{" "}
                          km
                        </strong>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 italic">
                    * Lịch trình chưa bao gồm thời gian nhận/trả phòng lưu trú (homestay/khách sạn).
                  </p>
                </div>
              ) : (
                <p className="text-xs text-amber-600 mt-2">
                  Kế hoạch di chuyển chi tiết cần được cập nhật lại do các điểm dừng đã thay đổi.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {isOwner && nonAccessPins.length > 0 && <TripPinnedSection items={nonAccessPins} />}

      {/* Legacy Trip Disclosure Banner (for Owner when journey does not exist) */}
      {isOwner && !hasJourney && (
        <section className="my-trips-legacy-banner" data-testid="legacy-trip-disclosure" aria-label="Thông báo hành trình tiêu chuẩn cũ">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground">
              <strong>Lưu ý:</strong> Chuyến đi này được lập theo chuẩn cũ chưa có nơi xuất phát và thời gian di chuyển đi/về.
            </div>
            {trip.status === "UPCOMING" && (
              <button
                type="button"
                className="my-trips-action my-trips-legacy-optin-btn"
                onClick={() => {
                  setIsLegacyOptInMode(true);
                  setJourneyEditModalOpen(true);
                }}
              >
                <Plus size={14} className="mr-1" aria-hidden="true" />
                <span>Bổ sung nơi xuất phát</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Interactive Day Switcher Tabs */}
      {(trip.days.length > 1 || Boolean(accessLeg)) && (
        <TravelerDayTabs
          sticky
          useTabRole={false}
          className="my-trips-day-tabs"
          ariaLabel="Điều hướng các ngày trong chuyến đi"
          activeId={
            activeTravelTab === "outbound"
              ? "travel-outbound"
              : activeTravelTab === "return"
                ? "travel-return"
                : activeDayIndex === null
                  ? "all"
                  : `day-${activeDayIndex}`
          }
          tabs={[
            { id: "all", label: "Tất cả", count: trip.days.length, kind: "all" } satisfies TravelerDayTabItem,
            ...(accessLeg
              ? [
                  {
                    id: "travel-outbound",
                    label: outboundDate ? `Ngày đi ${shortDayMonth(outboundDate)}` : "Ngày đi",
                    kind: "travel" as const,
                    controlsId: "trip-travel-outbound",
                  },
                ]
              : []),
            ...trip.days.map(
              (day): TravelerDayTabItem => ({
                id: `day-${day.dayIndex}`,
                label: `Ngày ${day.dayIndex}`,
                count: day.visits.length,
                dayNumber: day.dayIndex,
                kind: "trip",
              }),
            ),
            ...(accessLeg
              ? [
                  {
                    id: "travel-return",
                    label: returnDate ? `Ngày về ${shortDayMonth(returnDate)}` : "Ngày về",
                    kind: "travel" as const,
                    controlsId: "trip-travel-return",
                  },
                ]
              : []),
          ]}
          onSelect={(id) => {
            if (id === "all") {
              setActiveTravelTab(null);
              setActiveDayIndex(null);
              setSelectedDestinationId(null);
              return;
            }
            if (id === "travel-outbound" || id === "travel-return") {
              const kind = id === "travel-outbound" ? "outbound" : "return";
              setActiveTravelTab(kind);
              setActiveDayIndex(null);
              const el = document.getElementById(`trip-travel-${kind}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              return;
            }
            setActiveTravelTab(null);
            const dayNumber = Number(id.replace("day-", ""));
            const targetDay = trip.days.find((d) => d.dayIndex === dayNumber);
            if (!targetDay) return;
            setActiveDayIndex(targetDay.dayIndex);
            const firstStop = targetDay.visits[0];
            if (firstStop) {
              setSelectedDestinationId(firstStop.destination.id);
              setFocusSelection(true);
            }
            const el = document.getElementById(`trip-day-${targetDay.dayIndex}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
        />
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
            <TripWeatherProvider days={plannerDays} journeyPlan={trip.journey?.plan}>
            <div className="my-trips-days">
              {accessLeg && (
                <section
                  id="trip-travel-outbound"
                  data-testid="trip-travel-panel-outbound"
                  className={`dt-day dt-travel-day${(activeDayIndex !== null || activeTravelTab === "return") ? " dt-day--dimmed my-trips-day-dimmed" : ""}`}
                  aria-label="Ngày đi tới điểm tập kết"
                >
                  <div className="dt-travel-day-head">
                    <span className="tv-day-tab-dot" style={{ background: "var(--tv-ink-3)" }} aria-hidden="true" />
                    <h2>Ngày đi{outboundDate ? ` · ${dateLabel(outboundDate)}` : ""}</h2>
                  </div>
                  <TripsageAccessLegCard leg={accessLeg} only="outbound" />
                </section>
              )}
              {trip.days.map((day) => {
                const isDimmed = activeTravelTab !== null || (activeDayIndex !== null && activeDayIndex !== day.dayIndex);
                const chosen = chosenLodgingByNight.get(day.dayIndex);
                const nearbyForDay = (trip.nearbySuggestions ?? []).filter(
                  item => item.dayIndex === day.dayIndex && item.kind === "ACTIVITY",
                );
                const eveningForDay = (trip.nearbySuggestions ?? []).filter(
                  item => item.dayIndex === day.dayIndex && item.kind === "EVENING",
                );
                const nextDay = trip.days.find((item) => item.dayIndex === day.dayIndex + 1);
                const lastVisit = day.visits.at(-1);
                const lastDeparture = lastVisit ? lastVisit.startMinute + lastVisit.plannedDurationMinutes : null;
                const nightText = lastDeparture !== null && trip.journey?.plan && nextDay ? nightRestText(lastDeparture) : null;
                const eveningPlan = buildDayEveningPlan({
                  dayIndex: day.dayIndex,
                  totalDays: trip.days.length,
                  lastStopArea: lastVisit?.destination.area,
                  lastStopName: lastVisit?.destination.name,
                  chosenLodging: chosen
                    ? {
                        name: chosen.name,
                        previewTarget: { kind: "GOOGLE_PLACE", name: chosen.name, placeId: chosen.placeId },
                      }
                    : null,
                  eveningPlaces: eveningForDay.map((item) => ({
                    key: `${item.slot}|${item.placeId}`,
                    name: item.name,
                    distanceKm: item.distanceKm,
                    previewTarget: { kind: "GOOGLE_PLACE", name: item.name, placeId: item.placeId },
                  })),
                });

                const stops: DayTimelineStop[] = day.visits.map((visit, visitIndex) => {
                  const nextVisit = day.visits[visitIndex + 1];
                  const departure = visit.startMinute + visit.plannedDurationMinutes;
                  const lunch = nextVisit ? lunchBreakAfter(trip.journey?.plan, nextVisit.destination.id, departure, nextVisit.startMinute) : null;
                  return {
                    id: visit.id,
                    destinationId: visit.destination.id,
                    order: visit.order,
                    name: visit.destination.name,
                    area: visit.destination.area,
                    startMinute: visit.startMinute,
                    durationMinutes: visit.plannedDurationMinutes,
                    image: visit.destination.image,
                    href: visit.destination.availability === "AVAILABLE" && !visit.destination.external
                      ? `/destinations/${visit.destination.id}`
                      : null,
                    external: Boolean(visit.destination.external),
                    unavailable: visit.destination.availability === "UNAVAILABLE",
                    weatherSlot: <StopWeather day={day.dayIndex} destinationId={visit.destination.id} />,
                    lunchAfter: lunch ? { fromMinute: lunch.from, toMinute: lunch.to, durationMinutes: 60 } : null,
                  };
                });

                const nearbyItems: DayTimelineNearbyItem[] = nearbyForDay.map((item) => ({
                  key: `${item.slot}|${item.placeId}`,
                  name: item.name,
                  distanceKm: item.distanceKm,
                  tag: item.kind === "EVENING" ? "(buổi tối)" : item.slot === "free" ? "(chiều rảnh)" : "(gần điểm tham quan)",
                  previewTarget: { kind: "GOOGLE_PLACE", name: item.name, placeId: item.placeId },
                }));

                const timelineDay: DayTimelineDay = {
                  dayIndex: day.dayIndex,
                  localDate: day.localDate,
                  transportLabel: transportLabel(trip.transport),
                  sunSlot: <DaySun day={day.dayIndex} />,
                  departureCard:
                    day.dayIndex === 1 && trip.journey?.journey.origin ? (
                      <ItineraryOriginDepartureCard
                        originLabel={trip.journey.journey.origin.label}
                        startMinute={trip.journey.journey.departureMinute ?? null}
                        outboundLeg={
                          trip.journey.plan?.legs.find((l) => l.kind === "OUTBOUND")
                            ? {
                                route: trip.journey.plan.legs.find((l) => l.kind === "OUTBOUND")!.route,
                                restMinutes: trip.journey.plan.legs.find((l) => l.kind === "OUTBOUND")!.restMinutes,
                              }
                            : undefined
                        }
                      />
                    ) : undefined,
                  breakfast:
                    day.dayIndex > 1 && trip.journey?.plan && day.visits.length > 0
                      ? {
                          minute: MORNING_DEPARTURE_MINUTE - BREAKFAST_MINUTES,
                          durationMinutes: BREAKFAST_MINUTES,
                          text: breakfastText(),
                        }
                      : null,
                  stops,
                  nightRest: nightText ? { startMinute: lastDeparture, text: nightText } : null,
                  returnCard:
                    day.dayIndex === trip.days.length && trip.journey?.journey.origin ? (
                      <ItineraryOriginReturnCard
                        originLabel={trip.journey.journey.origin.label}
                        endMinute={
                          trip.journey.plan?.legs.find((l) => l.kind === "RETURN")?.endMinute ?? null
                        }
                        returnDeadlineMinute={trip.journey.journey.returnDeadlineMinute ?? null}
                        returnLeg={
                          trip.journey.plan?.legs.find((l) => l.kind === "RETURN")
                            ? {
                                route: trip.journey.plan.legs.find((l) => l.kind === "RETURN")!.route,
                                restMinutes: trip.journey.plan.legs.find((l) => l.kind === "RETURN")!.restMinutes,
                              }
                            : undefined
                        }
                      />
                    ) : undefined,
                  chosenLodging: !eveningPlan && chosen
                    ? {
                        nightIndex: chosen.nightIndex,
                        name: chosen.name,
                        placeId: chosen.placeId,
                        previewTarget: { kind: "GOOGLE_PLACE", name: chosen.name, placeId: chosen.placeId },
                      }
                    : null,
                  eveningPlan,
                  nearbySuggestions: nearbyItems,
                };

                return (
                  <DayTimeline
                    key={day.id}
                    day={timelineDay}
                    variant="full"
                    dimmed={isDimmed}
                    selectedDestinationId={selectedDestinationId}
                    onSelectDestination={handleSelectDestination}
                    onPreview={(target, trigger) => setPreview({ target, trigger })}
                  />
                );
              })}
              {accessLeg && (
                <section
                  id="trip-travel-return"
                  data-testid="trip-travel-panel-return"
                  className={`dt-day dt-travel-day${(activeDayIndex !== null || activeTravelTab === "outbound") ? " dt-day--dimmed my-trips-day-dimmed" : ""}`}
                  aria-label="Ngày về nhà"
                >
                  <div className="dt-travel-day-head">
                    <span className="tv-day-tab-dot" style={{ background: "var(--tv-ink-3)" }} aria-hidden="true" />
                    <h2>Ngày về{returnDate ? ` · ${dateLabel(returnDate)}` : ""}</h2>
                  </div>
                  <TripsageAccessLegCard leg={accessLeg} only="return" />
                </section>
              )}
            </div>
            <TripWeatherFootnote />
            </TripWeatherProvider>
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
                journeyPlan={trip.journey?.plan}
                origin={trip.journey?.journey.origin}
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

      {/* Footer / Notes */}
      <footer className="my-trips-detail-footer">
        <p className="my-trips-status-note">
          {trip.manuallyCompletedAt
            ? "Bạn đã đánh dấu chuyến đi hoàn thành thủ công; thao tác này không xác nhận các điểm dừng đã được tham quan."
            : "Trạng thái được tính theo ngày lịch; không xác nhận các điểm dừng đã được tham quan."}
        </p>
      </footer>

      {/* Mobile sticky bottom bar (design §4.2): secondary "Bản đồ" + primary CTA */}
      <div className="my-trips-mobile-bottombar" role="region" aria-label="Thao tác nhanh trên di động">
        <button
          type="button"
          className={travelerButtonClassName({ variant: "secondary", size: "lg", className: "my-trips-mobile-map-btn" })}
          onClick={() => setMobileMapSheetOpen(true)}
        >
          <Map size={16} aria-hidden="true" />
          <span>Bản đồ</span>
        </button>
        {trip.role === "MEMBER" ? (
          trip.publicationId && (
            <Link
              className={travelerButtonClassName({
                variant: "primary",
                size: "lg",
                className: "my-trips-mobile-primary",
              })}
              href={`/trip-companions/${trip.publicationId}/group` as Route}
            >
              <Users size={16} aria-hidden="true" />
              <span>Vào nhóm đồng hành</span>
            </Link>
          )
        ) : (
          trip.status !== "COMPLETED" && (
            <Link
              className={travelerButtonClassName({
                variant: "primary",
                size: "lg",
                className: "my-trips-mobile-primary",
              })}
              href={`/trips/${trip.id}/in-trip` as Route}
              aria-label="Hỏi trợ lý · Trợ lý trong chuyến đi"
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>Hỏi trợ lý</span>
            </Link>
          )
        )}
      </div>

      {/* Mobile map sheet filtered to active day (design §3.9 & §4.2) */}
      {mobileMapSheetOpen && (
        <div
          className="my-trips-map-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Bản đồ hành trình"
          onClick={() => setMobileMapSheetOpen(false)}
        >
          <div className="my-trips-map-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="my-trips-map-sheet-handle" aria-hidden="true" />
            <div className="my-trips-map-sheet-head">
              <strong>
                {activeDayIndex !== null ? `Bản đồ · Ngày ${activeDayIndex}` : "Bản đồ toàn chuyến"}
              </strong>
              <button
                type="button"
                className={travelerButtonClassName({ variant: "icon", size: "sm" })}
                aria-label="Đóng bản đồ"
                onClick={() => setMobileMapSheetOpen(false)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="my-trips-map-sheet-body">
              {plannerDays.some((d) => d.stops.length > 0) ? (
                <ItineraryMap
                  day={activePlannerDay}
                  days={plannerDays}
                  selectedDestinationId={selectedDestinationId}
                  focusSelection={focusSelection}
                  onSelect={(id) => {
                    setMobileMapSheetOpen(false);
                    handleSelectDestination(id);
                  }}
                  overviewOnly={activeDayIndex === null}
                  journeyPlan={trip.journey?.plan}
                  origin={trip.journey?.journey.origin}
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
      )}

      <TripJourneyEditModal
        isOpen={journeyEditModalOpen}
        onClose={() => setJourneyEditModalOpen(false)}
        tripId={trip.id}
        baseRevision={trip.baseRevision}
        initialJourney={trip.journey?.journey}
        returnOnly={trip.days.at(-1)?.visits.length === 0}
        isLegacyOptIn={isLegacyOptInMode}
        onSaved={() => {
          router.refresh();
        }}
      />
      <PlacePreviewModal
        target={preview?.target ?? null}
        returnFocusTo={preview?.trigger ?? null}
        onClose={() => setPreview(null)}
      />
    </main>
  );
}
