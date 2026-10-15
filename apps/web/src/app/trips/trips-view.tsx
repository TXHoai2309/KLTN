import Link from "next/link";
import type { Route } from "next";

import { Card } from "@KLTN/ui/components/card";
import { Empty } from "@KLTN/ui/components/empty";
import type { TripDetail, TripSummary } from "@/modules/trip-read/trip-read-service";
import type { TripStatus } from "@/modules/trip-read/trip-status";
import TripFavoriteButton from "./trip-favorite-button";

const groups: { status: TripStatus; label: string }[] = [
  { status: "UPCOMING", label: "Sắp tới" },
  { status: "ONGOING", label: "Đang diễn ra" },
  { status: "COMPLETED", label: "Đã hoàn thành" },
];

const transportLabel = (transport: TripSummary["transport"]) => transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô";
const dateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const minuteLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function MyTripsView({ items }: { items: TripSummary[] }) {
  return <main className="my-trips-page" lang="vi">
    <div className="my-trips-heading">
      <div><p className="my-trips-eyebrow">Hành trình đã lưu</p><h1>Chuyến đi của tôi</h1><p>Xem lại lịch trình đã xác nhận và các điểm dừng theo từng ngày.</p></div>
      <Link className="my-trips-action" href="/trips/new">Tạo chuyến đi</Link>
    </div>
    {items.length === 0 ? <Empty className="my-trips-state" role="status">
      <h2>Bạn chưa có chuyến đi đã lưu</h2>
      <p>Khi bạn xác nhận và lưu một hành trình, chuyến đi sẽ xuất hiện ở đây.</p>
      <Link className="my-trips-action" href="/trips/new">Tạo chuyến đi</Link>
    </Empty> : groups.map(group => {
      const trips = items.filter(item => item.status === group.status);
      return <section className="my-trips-group" key={group.status} aria-labelledby={`trips-${group.status}`}>
        <div className="my-trips-group-heading"><h2 id={`trips-${group.status}`}>{group.label}</h2><span>{trips.length}</span></div>
        {trips.length === 0 ? <p className="my-trips-group-empty">Chưa có chuyến đi trong nhóm này.</p> : <ul className="my-trips-grid">
          {trips.map(trip => <li key={trip.id}><Card className="my-trips-card">
            <div className="my-trips-card-actions">
              <span className={`my-trips-badge my-trips-badge-${trip.status.toLowerCase()}`}>{group.label}</span>
              <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />
            </div>
            <h3>Chuyến đi {trip.durationDays} ngày</h3>
            <p>{dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}</p>
            <p>{transportLabel(trip.transport)}</p>
            <Link className="my-trips-open" prefetch={false} href={`/trips/${trip.id}` as Route} aria-label={`Mở chuyến đi từ ${dateLabel(trip.startDate)}`}>Xem hành trình <span aria-hidden="true">→</span></Link>
          </Card></li>)}
        </ul>}
      </section>;
    })}
  </main>;
}

export function TripDetailView({ trip }: { trip: TripDetail }) {
  const statusLabel = groups.find(group => group.status === trip.status)!.label;
  return <main className="my-trips-page my-trips-detail" lang="vi">
    <Link className="my-trips-back" prefetch={false} href={"/trips" as Route}>← Chuyến đi của tôi</Link>
    <div className="my-trips-heading">
      <div><p className="my-trips-eyebrow">Hành trình đã lưu</p><h1>Chuyến đi {trip.durationDays} ngày</h1><p>{dateLabel(trip.startDate)} – {dateLabel(trip.endDate)} · {transportLabel(trip.transport)}</p></div>
      <div className="my-trips-detail-actions">
        <span className={`my-trips-badge my-trips-badge-${trip.status.toLowerCase()}`}>{statusLabel}</span>
        <TripFavoriteButton tripId={trip.id} isFavorite={trip.isFavorite} />
      </div>
    </div>
    <p className="my-trips-status-note">Trạng thái chuyến đi được tính theo ngày lịch, không xác nhận các điểm dừng đã được tham quan.</p>
    <div className="my-trips-days">{trip.days.map(day => <section key={day.id} className="my-trips-day" aria-labelledby={`trip-day-${day.dayIndex}`}>
      <div className="my-trips-group-heading"><h2 id={`trip-day-${day.dayIndex}`}>Ngày {day.dayIndex}</h2><span>{dateLabel(day.localDate)}</span></div>
      {day.visits.length === 0 ? <p className="my-trips-group-empty">Ngày này chưa có điểm dừng.</p> : <ol className="my-trips-visits">
        {day.visits.map(visit => <li key={visit.id}>
          <Card className="my-trips-visit">
            <div className="my-trips-visit-time"><strong>{minuteLabel(visit.startMinute)}</strong><span>{visit.plannedDurationMinutes} phút</span></div>
            <div className="my-trips-visit-place">
              <h3>{visit.destination.visibility === "VISIBLE" ? <Link href={`/destinations/${visit.destination.id}` as Route}>{visit.destination.name}</Link> : visit.destination.name}</h3>
              <p>Điểm đến · {visit.destination.area}</p>
              {visit.destination.visibility === "HIDDEN" && <p className="my-trips-unavailable">Không còn công khai</p>}
            </div>
          </Card>
        </li>)}
      </ol>}
    </section>)}</div>
  </main>;
}
