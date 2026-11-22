import type { ReactNode } from "react";
import {
  readTripsageResultPart,
  type BudgetPart,
  type FlightsPart,
  type HotelsPart,
} from "../../modules/tripsage-chat/tripsage-chat-parts";
import { flightPin, hotelPin } from "../../modules/trip-save/trip-pin-builders";
import { PinButton, type PinControl } from "./tripsage-pin-button";
import { agodaUrl, bookingComUrl, googleHotelsUrl, TRAVELOKA_HOTELS_URL } from "./booking-links";
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

const FLIGHT_OFFERS_SHOWN = 3;
type FlightOffer = FlightsPart["offers"][number];

function durationLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ""}` : `${minutes} phút`;
}

/** Search link-out only: Google Flights opens the real booking options, the app itself never books. */
export function googleFlightsUrl(data: FlightsPart): string | null {
  const outbound = data.offers[0]?.itineraries[0]?.segments;
  if (!outbound) return null;
  const from = outbound[0]!.from;
  const to = outbound[outbound.length - 1]!.to;
  const departDate = outbound[0]!.departAt.slice(0, 10);
  const query = `Flights from ${from} to ${to} on ${departDate}${data.roundTrip && data.returnDate ? ` through ${data.returnDate}` : ""}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}&curr=${data.offers[0]!.price.currency}&hl=vi`;
}

/** Skyscanner takes lowercase airport codes and yymmdd dates in the path. */
export function skyscannerUrl(data: FlightsPart): string | null {
  const outbound = data.offers[0]?.itineraries[0]?.segments;
  if (!outbound) return null;
  const day = (value: string) => value.slice(2, 4) + value.slice(5, 7) + value.slice(8, 10);
  const path = [outbound[0]!.from, outbound[outbound.length - 1]!.to].map(code => code.toLowerCase());
  path.push(day(outbound[0]!.departAt));
  if (data.roundTrip && data.returnDate) path.push(day(data.returnDate));
  const adults = data.adults && data.adults > 1 ? `&adultsv2=${data.adults}` : "";
  return `https://www.skyscanner.com.vn/transport/flights/${path.join("/")}/?currency=VND${adults}`;
}

/** Traveloka flight search: airport pair, dd-mm-yyyy dates (`null` return for one way), passenger count. */
export function travelokaFlightsUrl(data: FlightsPart): string | null {
  const outbound = data.offers[0]?.itineraries[0]?.segments;
  if (!outbound) return null;
  const day = (value: string) => `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`;
  const returnDay = data.roundTrip && data.returnDate ? day(data.returnDate) : "null";
  return `https://www.traveloka.com/vi-vn/flight/fullsearch?ap=${outbound[0]!.from}.${outbound[outbound.length - 1]!.to}&dt=${day(outbound[0]!.departAt)}.${returnDay}&ps=${data.adults ?? 1}.0.0&sc=ECONOMY`;
}

/** Airlines have no search deep link (booking is a form), so the carrier's own site opens and the traveler re-enters the trip. */
const AIRLINE_SITES = [
  { match: /vietnam\s*airlines/iu, label: "Vietnam Airlines", href: "https://www.vietnamairlines.com/vn/vi/home" },
  { match: /viet\s*jet/iu, label: "Vietjet Air", href: "https://www.vietjetair.com/vi" },
  { match: /bamboo/iu, label: "Bamboo Airways", href: "https://www.bambooairways.com/vn-vi" },
];

function airlineSites(data: FlightsPart) {
  const names = data.offers.flatMap(offer => offer.itineraries.flatMap(it => it.segments.map(segment => segment.airline)));
  return AIRLINE_SITES.filter(site => names.some(name => site.match.test(name)));
}

function FlightOfferRow({ offer, roundTrip, pin }: { offer: FlightOffer; roundTrip: boolean; pin?: ReactNode }) {
  const { price, itineraries, totalDurationMinutes } = offer;
  return (
    <li>
      <p className={styles.price}>
        <strong>{money(price.total, price.currency)}</strong>{" "}
        <span>{roundTrip ? "Giá khứ hồi tham khảo" : "Giá tham khảo"}</span>
        {totalDurationMinutes ? <span> · {durationLabel(totalDurationMinutes)}</span> : null}
      </p>
      {itineraries.map(({ connections, segments }, index) => (
        <div key={index} className={styles.direction}>
          <p><strong>{index === 0 ? "Chiều đi" : "Chiều về"}</strong> · {connections === 0 ? "Bay thẳng" : `${connections} lần nối chuyến`}</p>
          <ul className={styles.legs}>
            {segments.map(({ from, to, departAt, arriveAt, airline, flight }, legIndex) => (
              <li key={legIndex}>
                <p>
                  <time dateTime={departAt}>{departAt.slice(11, 16)}</time> {from} → <time dateTime={arriveAt}>{arriveAt.slice(11, 16)}</time> {to}
                  {arriveAt.slice(0, 10) > departAt.slice(0, 10) && <> (+1 ngày)</>}
                </p>
                <p className={styles.detail}>{dateLabel(departAt)} · {airline} · {flight}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {roundTrip && itineraries.length === 1 && (
        <p className={styles.detail}>Chiều về: xem chi tiết chiều về trên Google Flights.</p>
      )}
      {pin}
    </li>
  );
}

function FlightsCard({ data, pins }: { data: FlightsPart; pins?: PinControl }) {
  const today = new Date().toISOString().slice(0, 10);
  const pinFor = (index: number) => <PinButton item={flightPin(data, index, today)} control={pins} label="chuyến bay" />;
  const { offers, roundTrip = false, adults, typicalPriceRange } = data;
  const shown = offers.slice(0, FLIGHT_OFFERS_SHOWN);
  const more = offers.slice(FLIGHT_OFFERS_SHOWN);
  const bookingUrl = googleFlightsUrl(data);
  const cheapest = offers[0]!.price;
  return (
    <section className={styles.card} aria-label="Vé máy bay tham khảo">
      <h3>Vé máy bay tham khảo</h3>
      <p className={styles.summary}>
        <strong>{money(cheapest.total, cheapest.currency)}</strong>{" "}
        <span>{roundTrip ? "khứ hồi" : "một chiều"}{adults && adults > 1 ? `, tổng cho ${adults} người` : ""}</span>
      </p>
      {typicalPriceRange && (
        <p className={styles.detail}>
          Khoảng giá thường gặp: {money(typicalPriceRange.min, typicalPriceRange.currency)} – {money(typicalPriceRange.max, typicalPriceRange.currency)}
        </p>
      )}
      <ul className={styles.rows} aria-label="Các lựa chọn chuyến bay">
        {shown.map((offer, index) => <FlightOfferRow key={index} offer={offer} roundTrip={roundTrip} pin={pinFor(index)} />)}
      </ul>
      {more.length > 0 && (
        <details className={styles.more}>
          <summary>Xem thêm {more.length} chuyến</summary>
          <ul className={styles.rows} aria-label="Các lựa chọn chuyến bay khác">
            {more.map((offer, index) => <FlightOfferRow key={index} offer={offer} roundTrip={roundTrip} pin={pinFor(FLIGHT_OFFERS_SHOWN + index)} />)}
          </ul>
        </details>
      )}
      {bookingUrl && (
        <div className={styles.links}>
          <a className={styles.bookLink} href={bookingUrl} target="_blank" rel="noopener noreferrer">Đặt vé trên Google Flights ↗</a>
          <a className={styles.altLink} href={skyscannerUrl(data)!} target="_blank" rel="noopener noreferrer">Skyscanner ↗</a>
          <a className={styles.altLink} href={travelokaFlightsUrl(data)!} target="_blank" rel="noopener noreferrer">Traveloka ↗</a>
        </div>
      )}
      {bookingUrl && airlineSites(data).length > 0 && (
        <p className={styles.detail}>
          Trang hãng (nhập lại chuyến bay):{" "}
          {airlineSites(data).map((site, index) => (
            <span key={site.label}>{index > 0 && " · "}<a className={styles.altLink} href={site.href} target="_blank" rel="noopener noreferrer">{site.label} ↗</a></span>
          ))}
        </p>
      )}
      <p className={styles.detail}>Giờ địa phương tại từng sân bay. Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.</p>
    </section>
  );
}

function HotelRow({ hotel, nights, near, adults, pin }: { hotel: HotelsPart["hotels"][number]; nights: number; near: string; adults?: number; pin?: ReactNode }) {
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
      <div className={styles.links}>
        <a className={styles.rowLink} href={googleHotelsUrl(name, near)} target="_blank" rel="noopener noreferrer">Google Hotels ↗</a>
        <a className={styles.rowLink} href={bookingComUrl(name, near, checkInDate, checkOutDate, adults)} target="_blank" rel="noopener noreferrer">Booking.com ↗</a>
        <a className={styles.rowLink} href={agodaUrl(name, near, checkInDate, checkOutDate, adults)} target="_blank" rel="noopener noreferrer">Agoda ↗</a>
      </div>
      {pin}
    </li>
  );
}

function HotelsCard({ data, pins }: { data: HotelsPart; pins?: PinControl }) {
  const today = new Date().toISOString().slice(0, 10);
  const pinFor = (hotel: HotelsPart["hotels"][number]) => <PinButton item={hotelPin(data, hotel, today)} control={pins} label={hotel.name} />;
  const priced = data.hotels.filter(hotel => hotel.price !== null);
  const unpriced = data.hotels.filter(hotel => hotel.price === null);
  return (
    <section className={styles.card} aria-label="Chỗ ở tham khảo">
      <h3>Chỗ ở tham khảo</h3>
      <p className={styles.detail}>Gần {data.near} · {data.nights} đêm</p>
      {priced.length > 0 && (
        <ul className={styles.rows} aria-label="Các lựa chọn chỗ ở có giá">
          {priced.map((hotel, index) => <HotelRow key={`priced-${index}`} hotel={hotel} nights={data.nights} near={data.near} adults={data.adults} pin={pinFor(hotel)} />)}
        </ul>
      )}
      {unpriced.length > 0 && (
        <div className={styles.group}>
          <p className={styles.groupTitle}>Chưa có giá online</p>
          <ul className={styles.rows} aria-label="Các chỗ ở chưa có giá online">
            {unpriced.map((hotel, index) => <HotelRow key={`unpriced-${index}`} hotel={hotel} nights={data.nights} near={data.near} adults={data.adults} pin={pinFor(hotel)} />)}
          </ul>
        </div>
      )}
      <p className={styles.detail}>
        Tìm thêm:{" "}
        <a className={styles.altLink} href={TRAVELOKA_HOTELS_URL} target="_blank" rel="noopener noreferrer">Traveloka ↗</a> (nhập lại nơi ở và ngày)
      </p>
      <p className={styles.detail}>Chưa kiểm tra bằng bộ kiểm tra lịch trình.</p>
      <p className={styles.detail}>Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.</p>
    </section>
  );
}

export function TripsageResultCards({ parts, pins }: { parts: readonly ResultPart[]; pins?: PinControl }) {
  const latestBudget = parts.findLastIndex(part => part.type === "data-budget");
  return parts.map((part, index) => {
    switch (part.type) {
      case "data-budget": return index === latestBudget ? <BudgetCard key={part.id} data={part.data} /> : null;
      case "data-flights": return <FlightsCard key={part.id} data={part.data} pins={pins} />;
      case "data-hotels": return <HotelsCard key={part.id} data={part.data} pins={pins} />;
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

export { bookingComUrl, googleHotelsUrl, agodaUrl };
