import { BedDouble, Plane, UtensilsCrossed, Wallet } from "lucide-react";

import type { PinnedItem, SharedPin } from "@/modules/trip-save/trip-pin-contract";
import { bookingComUrl, googleHotelsUrl } from "@/components/tripsage-chat/booking-links";

type Item = PinnedItem | SharedPin;

const vnd = (value: number) => `${value.toLocaleString("vi-VN")}đ`;
const money = (value: string, currency: string) => new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(value as unknown as number);
const dateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const COST_LABEL = { transport: "Đi lại", lodging: "Lưu trú", food: "Ăn uống", activities: "Vé & vui chơi", other: "Khác" } as const;

function FlightCard({ item, cardLevel = 4 }: { item: Extract<PinnedItem, { kind: "FLIGHT" }>; cardLevel?: 3 | 4 }) {
  const first = item.segments[0]!;
  const last = item.segments[item.segments.length - 1]!;
  const CardHeading = cardLevel === 3 ? "h3" : "h4";
  return (
    <li className="trip-pinned-card">
      <span className="trip-pinned-icon" aria-hidden="true"><Plane size={18} /></span>
      <div className="trip-pinned-body">
        <p className="trip-pinned-kind">Vé máy bay · {item.roundTrip ? "khứ hồi" : "một chiều"}</p>
        <CardHeading>{first.from} → {last.to}</CardHeading>
        <p>{first.departAt.slice(11, 16)} → {last.arriveAt.slice(11, 16)} · {dateLabel(item.departDate)}{item.returnDate ? ` – ${dateLabel(item.returnDate)}` : ""}</p>
        <p className="trip-pinned-muted">{first.airline} · {first.flight}{item.segments.length > 1 ? ` (+${item.segments.length - 1} chặng nối)` : ""}</p>
        <p className="trip-pinned-price"><strong>{money(item.price.total, item.price.currency)}</strong> <span>cho {item.adults} người{item.lookupDate ? ` · tra ngày ${dateLabel(item.lookupDate)}` : ""}</span></p>
      </div>
    </li>
  );
}

function HotelCard({ item, cardLevel = 4 }: { item: Extract<Item, { kind: "HOTEL" }>; cardLevel?: 3 | 4 }) {
  const CardHeading = cardLevel === 3 ? "h3" : "h4";
  return (
    <li className="trip-pinned-card">
      <span className="trip-pinned-icon" aria-hidden="true"><BedDouble size={18} /></span>
      <div className="trip-pinned-body">
        <p className="trip-pinned-kind">Chỗ ở</p>
        <CardHeading>{item.name}</CardHeading>
        <p className="trip-pinned-muted">Gần {item.near}{item.rating != null ? ` · ${item.rating}/5` : ""}</p>
        <p>{dateLabel(item.checkInDate)} – {dateLabel(item.checkOutDate)}</p>
        {item.price
          ? <p className="trip-pinned-price"><strong>{money(item.price.total, item.price.currency)}</strong> <span>{item.price.perNight ? `${money(item.price.perNight, item.price.currency)}/đêm · ` : ""}giá tham khảo</span></p>
          : <p className="trip-pinned-muted">Chưa có giá online</p>}
        <p className="trip-pinned-links">
          <a href={googleHotelsUrl(item.name, item.near)} target="_blank" rel="noopener noreferrer">Google Hotels ↗</a>
          <a href={bookingComUrl(item.name, item.near, item.checkInDate, item.checkOutDate, item.adults)} target="_blank" rel="noopener noreferrer">Booking.com ↗</a>
        </p>
      </div>
    </li>
  );
}

function MealCard({ item, cardLevel = 4 }: { item: Extract<Item, { kind: "MEAL" }>; cardLevel?: 3 | 4 }) {
  const day = item.slotId.match(/^d(\d+)-/)?.[1];
  const CardHeading = cardLevel === 3 ? "h3" : "h4";
  return (
    <li className="trip-pinned-card">
      <span className="trip-pinned-icon" aria-hidden="true"><UtensilsCrossed size={18} /></span>
      <div className="trip-pinned-body">
        <p className="trip-pinned-kind">Ăn uống{day ? ` · ngày ${day}` : ""}</p>
        <CardHeading>{item.name}</CardHeading>
        <p className="trip-pinned-muted">Cách điểm dừng khoảng {item.distanceKm} km · gợi ý Google Maps, chưa kiểm tra</p>
      </div>
    </li>
  );
}

function CostCard({ item, cardLevel = 4 }: { item: Extract<Item, { kind: "COST" }>; cardLevel?: 3 | 4 }) {
  const shared = !("cost" in item);
  const lines = shared ? item.lines : item.cost.lines;
  const total = shared ? item.subtotal : item.cost.total;
  const travelers = shared ? item.travelers : item.cost.travelers;
  const days = shared ? item.days : item.cost.days;
  const CardHeading = cardLevel === 3 ? "h3" : "h4";
  return (
    <li className="trip-pinned-card trip-pinned-wide">
      <span className="trip-pinned-icon" aria-hidden="true"><Wallet size={18} /></span>
      <div className="trip-pinned-body">
        <p className="trip-pinned-kind">Chi phí ước tính{shared ? " (lưu trú và ăn uống)" : ""}</p>
        <CardHeading>{vnd(total)} <span className="trip-pinned-muted">· {travelers} người · {days} ngày</span></CardHeading>
        <ul className="trip-pinned-costLines">
          {lines.map((line, index) => <li key={index}><span>{COST_LABEL[line.category]}: {line.label}</span><span>{vnd(line.amount)}</span></li>)}
        </ul>
        <p className="trip-pinned-muted">Ước tính, chưa phải báo giá. Ứng dụng không đặt chỗ.</p>
      </div>
    </li>
  );
}

/**
 * ADR-47 & PARITY BR-6: items pinned from the planning chat.
 * Access legs (`kind: "ACCESS"`) are shown in the Ngày đi / Ngày về tabs rather than here,
 * while remaining readable in `trip-pin-contract.ts` for owner trip detail pages.
 */
export function TripPinnedSection({
  items,
  shared = false,
  headingLevel = 3,
}: {
  items: readonly Item[];
  shared?: boolean;
  headingLevel?: 2 | 3;
}) {
  const visible = items.filter((item) => item.kind !== "ACCESS");
  if (!visible.length) return null;
  const SectionHeading = headingLevel === 2 ? "h2" : "h3";
  const cardLevel: 3 | 4 = headingLevel === 2 ? 3 : 4;
  return (
    <section className="trip-pinned-section" aria-label="Mục đã ghim" data-testid="trip-pinned-section">
      <header>
        <SectionHeading>Mục đã ghim <span className="trip-pinned-count">{visible.length}</span></SectionHeading>
        <p className="trip-pinned-muted">{shared ? "Chủ chuyến chia sẻ các gợi ý công khai này; vé máy bay và chi phí đi lại không hiển thị." : "Gợi ý bạn đã ghim từ trợ lý. Giá là tham khảo tại ngày tra, không phải đặt chỗ."}</p>
      </header>
      <ul className="trip-pinned-grid">
        {visible.map((item, index) => {
          switch (item.kind) {
            case "FLIGHT": return <FlightCard key={index} item={item} cardLevel={cardLevel} />;
            case "HOTEL": return <HotelCard key={index} item={item} cardLevel={cardLevel} />;
            case "MEAL": return <MealCard key={index} item={item} cardLevel={cardLevel} />;
            case "COST": return <CostCard key={index} item={item} cardLevel={cardLevel} />;
            default: return null;
          }
        })}
      </ul>
    </section>
  );
}
