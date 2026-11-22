import {
  readTripsageResultPart,
  type BudgetPart,
  type FlightsPart,
  type HotelsPart,
} from "../../modules/tripsage-chat/tripsage-chat-parts";
import styles from "./tripsage-result-cards.module.css";

type ResultPart = NonNullable<ReturnType<typeof readTripsageResultPart>>;

const budgetLabels: Record<BudgetPart["allocations"][number]["category"], string> = {
  transport: "Di chuyển",
  lodging: "Lưu trú",
  food: "Ăn uống",
  activities: "Hoạt động",
  other: "Chi phí khác",
};
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

function money(value: number | string, currency: string): string {
  // The validated decimal string preserves the precision of provider prices.
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency })
    .format(value as number | `${number}`);
}

function dateLabel(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function LocalTime({ value }: { value: string }) {
  return <time dateTime={value}>{value.slice(11, 16)}, {dateLabel(value)}</time>;
}

function BudgetCard({ data }: { data: BudgetPart }) {
  const { currency, total, perPersonPerDay, withinCap, overBy, allocations } = data;
  let capLabel = "Chưa có ngân sách tối đa để so sánh";
  if (withinCap === true) capLabel = "Trong ngân sách";
  if (withinCap === false && overBy !== null) capLabel = `Vượt ${money(overBy, currency)}`;
  return (
    <section className={styles.card} aria-label="Ước tính ngân sách">
      <h3>Ước tính ngân sách</h3>
      <dl className={styles.totals}>
        <div><dt>Tổng chi phí</dt><dd>{money(total, currency)}</dd></div>
        <div><dt>Mỗi người mỗi ngày</dt><dd>{money(perPersonPerDay, currency)}</dd></div>
      </dl>
      <p className={styles.cap}><strong>{capLabel}</strong></p>
      <ul className={styles.rows} aria-label="Các khoản chi">
        {allocations.map(({ category, amount, sharePercent, note }, index) => (
          <li key={`${category}-${index}`}>
            <div className={styles.line}>
              <strong>{budgetLabels[category]}</strong>
              <span>{money(amount, currency)} · ≈ {number.format(sharePercent)}%</span>
            </div>
            <div className={styles.track} aria-hidden="true"><span style={{ width: `${sharePercent}%` }} /></div>
            {note && <p className={styles.detail}>{note}</p>}
          </li>
        ))}
      </ul>
      <p className={styles.detail}>Chi phí ước tính. Ứng dụng không đặt chỗ.</p>
    </section>
  );
}

function FlightsCard({ data }: { data: FlightsPart }) {
  return (
    <section className={styles.card} aria-label="Vé máy bay tham khảo">
      <h3>Vé máy bay tham khảo</h3>
      <p className={styles.detail}>Giờ địa phương tại từng sân bay.</p>
      {data.typicalPriceRange && (
        <p className={styles.detail}>
          Khoảng giá thường gặp: {money(data.typicalPriceRange.min, data.typicalPriceRange.currency)} – {money(data.typicalPriceRange.max, data.typicalPriceRange.currency)}
        </p>
      )}
      <ul className={styles.rows} aria-label="Các lựa chọn chuyến bay">
        {data.offers.map(({ price, itineraries }, offerIndex) => (
          <li key={offerIndex}>
            <p className={styles.price}>
              <strong>{money(price.total, price.currency)}</strong>{" "}
              <span>{data.roundTrip ? "Giá khứ hồi tham khảo" : "Giá tham khảo"}</span>
            </p>
            {itineraries.map(({ connections, segments }, index) => (
              <div key={index} className={styles.direction}>
                <p><strong>{index === 0 ? "Chiều đi" : "Chiều về"}</strong> · {connections} lần nối chuyến</p>
                <ul className={styles.legs}>
                  {segments.map(({ from, to, departAt, arriveAt, airline, flight }, legIndex) => (
                    <li key={legIndex}>
                      <p><strong>{airline}</strong> · {flight}</p>
                      <p>Đi {from} <LocalTime value={departAt} /> · Đến {to} <LocalTime value={arriveAt} /></p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {data.roundTrip && itineraries.length === 1 && (
              <p className={styles.detail}>Chiều về: xem chi tiết chiều về trên Google Flights.</p>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.detail}>Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.</p>
    </section>
  );
}

function HotelRow({ hotel, nights }: { hotel: HotelsPart["hotels"][number]; nights: number }) {
  const { name, distanceKm, room, rating, reviews, price, checkInDate, checkOutDate } = hotel;
  return (
    <li>
      <p><strong>{name}</strong></p>
      <p>
        Khoảng cách: {distanceKm === null ? <span aria-label="Chưa có dữ liệu khoảng cách">—</span> : `${number.format(distanceKm)} km`}
        {rating != null && <> · Đánh giá {number.format(rating)}/5{reviews != null ? ` (${reviews})` : ""}</>}
        {room && <> · Phòng {room}</>}
      </p>
      <p>Nhận <time dateTime={checkInDate}>{dateLabel(checkInDate)}</time> · Trả <time dateTime={checkOutDate}>{dateLabel(checkOutDate)}</time></p>
      {price ? (
        <p className={styles.price}>
          <strong>{money(price.total, price.currency)}</strong> / {nights} đêm
          {price.perNight && <> ({money(price.perNight, price.currency)}/đêm)</>}
          {" "}<span>Giá tham khảo</span>
        </p>
      ) : (
        <p className={styles.unpriced}>Chưa có giá online</p>
      )}
    </li>
  );
}

function HotelsCard({ data }: { data: HotelsPart }) {
  const priced = data.hotels.filter(hotel => hotel.price !== null);
  const unpriced = data.hotels.filter(hotel => hotel.price === null);
  return (
    <section className={styles.card} aria-label="Chỗ ở tham khảo">
      <h3>Chỗ ở tham khảo</h3>
      <p className={styles.detail}>Gần {data.near} · {data.nights} đêm</p>
      {priced.length > 0 && (
        <ul className={styles.rows} aria-label="Các lựa chọn chỗ ở có giá">
          {priced.map((hotel, index) => <HotelRow key={`priced-${index}`} hotel={hotel} nights={data.nights} />)}
        </ul>
      )}
      {unpriced.length > 0 && (
        <div className={styles.group}>
          <p className={styles.groupTitle}>Chưa có giá online</p>
          <ul className={styles.rows} aria-label="Các chỗ ở chưa có giá online">
            {unpriced.map((hotel, index) => <HotelRow key={`unpriced-${index}`} hotel={hotel} nights={data.nights} />)}
          </ul>
        </div>
      )}
      <p className={styles.detail}>Chưa kiểm tra bằng bộ kiểm tra lịch trình.</p>
      <p className={styles.detail}>Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.</p>
    </section>
  );
}

export function TripsageResultCards({ parts }: { parts: readonly ResultPart[] }) {
  const latestBudget = parts.findLastIndex(part => part.type === "data-budget");
  return parts.map((part, index) => {
    switch (part.type) {
      case "data-budget": return index === latestBudget ? <BudgetCard key={part.id} data={part.data} /> : null;
      case "data-flights": return <FlightsCard key={part.id} data={part.data} />;
      case "data-hotels": return <HotelsCard key={part.id} data={part.data} />;
    }
  });
}

/** Parse each assistant turn once, preserving the streamed order of the result parts. */
export function readTripsageResultTurns(messages: readonly { id: string; role: string; parts: readonly unknown[] }[]) {
  const turns = new Map<string, ResultPart[]>();
  let latestBudgetMessageId: string | undefined;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const parts = message.parts.map(readTripsageResultPart).filter(part => part !== null);
    if (!parts.length) continue;
    turns.set(message.id, parts);
    if (parts.some(part => part.type === "data-budget")) latestBudgetMessageId = message.id;
  }
  return { turns, latestBudgetMessageId };
}
