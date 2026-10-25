"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, CalendarDays, CarFront, Clock3, MapPin, Mountain, Plus } from "lucide-react";

import { Card } from "@KLTN/ui/components/card";
import { Empty } from "@KLTN/ui/components/empty";
import type { TripDetail, TripSummary } from "@/modules/trip-read/trip-read-service";
import type { TripStatus } from "@/modules/trip-read/trip-status";
import { applyTripChange, type TripChange } from "@/modules/trip-read/trip-management-client";
import { TripManagementActions } from "./trip-management-actions";
import TripFavoriteButton from "./trip-favorite-button";

const groups: { status: TripStatus; label: string }[] = [
  { status: "UPCOMING", label: "Sắp tới" },
  { status: "ONGOING", label: "Đang diễn ra" },
  { status: "COMPLETED", label: "Đã hoàn thành" },
];

const transportLabel = (transport: TripSummary["transport"]) => transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô";
const dateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const minuteLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const visitLabel = (count: number) => `${count} điểm dừng`;

export function MyTripsView({ items: initialItems }: { items: TripSummary[] }) {
  const [items, setItems] = useState(initialItems);
  const [announcement, setAnnouncement] = useState("");
  const focusGroup = useRef<TripStatus | null>(null);
  const router = useRouter();
  useEffect(() => { setItems(initialItems); }, [initialItems]);
  useEffect(() => { if (focusGroup.current) { document.getElementById(`trips-${focusGroup.current}`)?.focus(); focusGroup.current = null; } }, [items]);
  function confirmed(change: TripChange) {
    setItems(current => applyTripChange(current, { status: "SUCCESS", data: change }));
    focusGroup.current = "deleted" in change ? null : change.status;
    setAnnouncement("deleted" in change ? "Đã xóa chuyến đi khỏi danh sách." : `Đã cập nhật chuyến đi vào nhóm ${groups.find(group => group.status === change.status)!.label}.`);
    router.refresh();
  }
  return <main className="my-trips-page" lang="vi">
    <div className="my-trips-heading">
      <div><p className="my-trips-eyebrow">Hành trình đã lưu</p><h1>Chuyến đi của tôi</h1><p>Xem các hành trình đã lưu và tiếp tục chuẩn bị cho chuyến đi.</p></div>
      <Link className="my-trips-action" href="/trips/new"><Plus size={18} aria-hidden="true" />Tạo chuyến đi</Link>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {items.length === 0 ? <Empty className="my-trips-state" role="status">
      <h2>Bạn chưa có chuyến đi nào.</h2>
      <p>Khi bạn xác nhận và lưu một hành trình, chuyến đi sẽ xuất hiện ở đây.</p>
      <Link className="my-trips-action" href="/trips/new"><Plus size={18} aria-hidden="true" />Tạo chuyến đi đầu tiên</Link>
    </Empty> : groups.map(group => {
      const trips = items.filter(item => item.status === group.status);
      return <section className="my-trips-group" key={group.status} aria-labelledby={`trips-${group.status}`}>
        <div className="my-trips-group-heading"><h2 id={`trips-${group.status}`} tabIndex={-1}>{group.label}</h2><span>{trips.length}</span></div>
        {trips.length === 0 ? <p className="my-trips-group-empty">Chưa có chuyến đi trong nhóm này.</p> : <ul className="my-trips-list">
          {trips.map(trip => <li key={trip.id}><Card className={`my-trips-card my-trips-card-${trip.status.toLowerCase()}`}>
            <div className="my-trips-card-thumb" aria-hidden="true">
              <img
                src={trip.durationDays >= 3 ? "/images/gallery/ha-giang-day3-lg.webp" : trip.durationDays === 2 ? "/images/gallery/ha-giang-day2-lg.webp" : "/images/gallery/ha-giang-day1-lg.webp"}
                alt={`Chuyến đi ${trip.durationDays} ngày`}
                className="my-trips-thumb-img"
                loading="lazy"
              />
              <div className="my-trips-thumb-overlay" />
              <span className="my-trips-thumb-tag">{transportLabel(trip.transport)}</span>
            </div>
            <div className="my-trips-card-main">
              <div className="my-trips-card-actions">
                <span className={`my-trips-badge my-trips-badge-${trip.status.toLowerCase()}`}>{group.label}</span>
                <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />
              </div>
              <h3>Chuyến đi {trip.durationDays} ngày</h3>
              <p className="my-trips-completion-note">{trip.manuallyCompletedAt ? "Bạn đã đánh dấu hoàn thành thủ công." : trip.status === "COMPLETED" ? "Đã hoàn thành theo ngày kế hoạch; chưa đánh dấu thủ công." : "Trạng thái theo ngày kế hoạch."}</p>
              <div className="my-trips-meta" aria-label="Thông tin chuyến đi">
                <span><CalendarDays size={15} aria-hidden="true" />{dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}</span>
                <span><Clock3 size={15} aria-hidden="true" />{trip.durationDays} ngày</span>
                <span><CarFront size={15} aria-hidden="true" />{transportLabel(trip.transport)}</span>
                <span><MapPin size={15} aria-hidden="true" />{visitLabel(trip.visitCount)}</span>
              </div>
            </div>
            <div className="my-trips-card-controls"><Link className="my-trips-open" prefetch={false} href={`/trips/${trip.id}` as Route} aria-label={`Mở chuyến đi từ ${dateLabel(trip.startDate)}`}>Xem chi tiết <ArrowRight size={16} aria-hidden="true" /></Link><TripManagementActions trip={trip} onConfirmed={confirmed} /></div>
          </Card></li>)}
        </ul>}
      </section>;
    })}
  </main>;
}

export function TripDetailView({ trip }: { trip: TripDetail }) {
  const statusLabel = groups.find(group => group.status === trip.status)!.label;
  return <main className="my-trips-page my-trips-detail" lang="vi">
    <div className="my-trips-back-row"><Link className="my-trips-back" prefetch={false} href={"/trips" as Route}>
      <ArrowLeft size={16} aria-hidden="true" />
      Quay lại Chuyến đi của tôi
    </Link></div>
    <section className="my-trips-detail-hero" aria-labelledby="trip-detail-title">
      <div>
        <p className="my-trips-eyebrow">Hành trình đã lưu</p>
        <h1 id="trip-detail-title">Chuyến đi {trip.durationDays} ngày</h1>
        <div className="my-trips-hero-meta">
          <span><CalendarDays size={16} aria-hidden="true" />{dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}</span>
          <span><Clock3 size={16} aria-hidden="true" />{trip.durationDays} ngày</span>
          <span><CarFront size={16} aria-hidden="true" />{transportLabel(trip.transport)}</span>
          <span><MapPin size={16} aria-hidden="true" />{visitLabel(trip.visitCount)}</span>
        </div>
      </div>
      <div className="my-trips-detail-actions">
        <span className={`my-trips-badge my-trips-badge-${trip.status.toLowerCase()}`}>{statusLabel}</span>
        <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />
        <Link className="my-trips-action" href={`/trips/${trip.id}/edit` as Route}>Chỉnh sửa hành trình</Link>
        {trip.status !== "COMPLETED" && (
          <Link className="my-trips-action my-trips-secondary-action" href={`/trips/${trip.id}/in-trip` as Route}>
            Trợ lý trong chuyến đi
          </Link>
        )}
      </div>
    </section>

    <section className="my-trips-itinerary" aria-label="Hành trình đã lưu">
        <div className="my-trips-days">{trip.days.map(day => <section key={day.id} className="my-trips-day" aria-labelledby={`trip-day-${day.dayIndex}`}>
          <div className="my-trips-day-heading">
            <span className="my-trips-timeline-node" aria-hidden="true" />
            <div><h2 id={`trip-day-${day.dayIndex}`}>Ngày {day.dayIndex}</h2><p>{new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day.localDate}T00:00:00Z`))}, {dateLabel(day.localDate)}</p></div>
            <div className="my-trips-day-meta"><span><CarFront size={18} aria-hidden="true" />Di chuyển bằng {transportLabel(trip.transport).toLocaleLowerCase("vi")}</span><span><MapPin size={18} aria-hidden="true" />{visitLabel(day.visits.length)}</span></div>
          </div>
          {day.visits.length === 0 ? <p className="my-trips-group-empty">Ngày này chưa có điểm dừng.</p> : <ol className="my-trips-visits">
            {day.visits.map(visit => <li key={visit.id}>
              <span className="my-trips-timeline-node" aria-hidden="true" />
              <div className="my-trips-visit-time"><strong>{minuteLabel(visit.startMinute)}</strong><span>{visit.plannedDurationMinutes} phút</span></div>
              <Card className="my-trips-visit">
                <div className="my-trips-image-placeholder" role="img" aria-label="Chưa có ảnh điểm đến"><Mountain size={30} aria-hidden="true" /><span>Chưa có ảnh</span></div>
                <div className="my-trips-visit-place">
                  <h3>{visit.destination.availability === "AVAILABLE" ? <Link href={`/destinations/${visit.destination.id}` as Route}>{visit.destination.name}</Link> : visit.destination.name}</h3>
                  <div className="my-trips-visit-meta">
                    <p><MapPin size={16} aria-hidden="true" />{visit.destination.area}</p>
                    <p><Clock3 size={16} aria-hidden="true" />{minuteLabel(visit.startMinute)} – {minuteLabel(visit.startMinute + visit.plannedDurationMinutes)} ({visit.plannedDurationMinutes} phút)</p>
                  </div>
                  <p className="my-trips-order-label">Điểm dừng {visit.order}</p>
                  {visit.destination.availability === "UNAVAILABLE" && <p className="my-trips-unavailable">Điểm đến không còn khả dụng công khai</p>}
                </div>
              </Card>
            </li>)}
          </ol>}
        </section>)}</div>
    </section>
    <footer className="my-trips-detail-footer">
          <p className="my-trips-status-note">{trip.manuallyCompletedAt ? "Bạn đã đánh dấu chuyến đi hoàn thành thủ công; thao tác này không xác nhận các điểm dừng đã được tham quan." : "Trạng thái được tính theo ngày lịch; không xác nhận các điểm dừng đã được tham quan."}</p>
        <nav className="my-trips-detail-nav" aria-label="Thao tác chuyến đi">
          <Link className="my-trips-action" href={`/trips/${trip.id}/edit` as Route}>Chỉnh sửa hành trình</Link>
          {trip.status !== "COMPLETED" && <Link className="my-trips-secondary-action" href={`/trips/${trip.id}/in-trip` as Route}>Mở Trợ lý trong chuyến đi</Link>}
        </nav>
    </footer>
  </main>;
}
