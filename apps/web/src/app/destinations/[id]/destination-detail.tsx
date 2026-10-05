import React, { type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock, MapPin, Mountain, CalendarDays, Compass } from "lucide-react";
import { weekdayLabels } from "@/modules/destination/destination-contract";
import { formatSuggestedDuration, type PublicDestinationDetail } from "@/modules/destination/public-destination-contract";

function Shell({ children }: { children: ReactNode }) {
  return <main className="public-detail" lang="vi"><div className="public-detail-container">
    <Link href="/" className="public-detail-back"><ArrowLeft size={17} aria-hidden="true" />Về trang chủ</Link>
    {children}
  </div></main>;
}

export function DetailState({ state, children }: { state: "missing" | "unavailable" | "loading" | "error"; children?: ReactNode }) {
  const copy = {
    missing: ["Không tìm thấy điểm đến", "Điểm đến bạn tìm kiếm không tồn tại. Hãy kiểm tra lại đường dẫn."],
    unavailable: ["Điểm đến không còn khả dụng", "Điểm đến này hiện không được hiển thị trong khu vực công khai."],
    loading: ["Đang tải điểm đến…", "Thông tin tham quan sẽ xuất hiện trong giây lát."],
    error: ["Không thể tải thông tin điểm đến", "Không thể tải thông tin điểm đến. Vui lòng thử lại."],
  }[state];
  return <Shell><section className="public-detail-state" role={state === "loading" ? "status" : state === "error" ? "alert" : undefined} aria-busy={state === "loading"}>
    <span className="public-detail-symbol" aria-hidden="true"><Mountain size={32} /></span>
    <h1>{copy[0]}</h1><p>{copy[1]}</p>{children}
  </section></Shell>;
}

export default function DestinationDetail({ destination: d }: { destination: PublicDestinationDetail }) {
  return <Shell>
    <header className="public-detail-hero">
      <span className="public-detail-eyebrow"><Mountain size={18} aria-hidden="true" />Hà Giang · Điểm đến</span>
      <div className="public-detail-tags"><span><MapPin size={14} aria-hidden="true" />{d.area}</span><span>{d.category}</span></div>
      <h1>{d.name}</h1><p className="public-detail-description">{d.description}</p>
    </header>
    <div className="public-detail-grid">
      <div className="public-detail-main">
        <section className="public-detail-card" aria-labelledby="visit-title">
          <h2 id="visit-title"><Compass size={21} aria-hidden="true" />Thông tin tham quan</h2>
          <dl className="public-detail-facts"><div><dt>Khu vực</dt><dd>{d.area}</dd></div><div><dt>Danh mục</dt><dd>{d.category}</dd></div>
            <div><dt><Clock size={15} aria-hidden="true" />Thời lượng tham quan gợi ý</dt><dd>{formatSuggestedDuration(d.suggestedDurationMinutes)}</dd></div></dl>
        </section>
        <section className="public-detail-card public-detail-location" aria-labelledby="location-title">
          <h2 id="location-title"><MapPin size={21} aria-hidden="true" />Vị trí</h2><p>{d.area}</p>
          <dl className="public-detail-coordinates"><div><dt>Vĩ độ</dt><dd>{d.latitude}</dd></div><div><dt>Kinh độ</dt><dd>{d.longitude}</dd></div></dl>
        </section>
        <section className="public-detail-card" aria-labelledby="culture-title">
          <h2 id="culture-title"><BookOpen size={21} aria-hidden="true" />Nội dung văn hóa liên quan</h2>
          {d.relatedCulture.length === 0 ? <p className="public-detail-empty">Chưa có nội dung văn hóa liên quan.</p> : <div className="public-culture-list">{d.relatedCulture.map(item => <article key={item.id}><h3>{item.title}</h3><p>{item.excerpt}</p>{(item.sourceTitle || item.sourceUrl) && <p className="public-detail-muted">Nguồn: {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceTitle || item.sourceUrl}</a> : item.sourceTitle}</p>}</article>)}</div>}
        </section>
      </div>
      <section className="public-detail-card public-detail-hours" aria-labelledby="hours-title">
        <h2 id="hours-title"><CalendarDays size={21} aria-hidden="true" />Giờ hoạt động</h2>
        <p className="public-detail-muted">Giờ địa phương Hà Giang (Asia/Ho_Chi_Minh)</p>
        <dl>{d.openingDays.map((day, index) => <div key={day.dayOfWeek} className={`public-detail-day ${day.status === "OPEN" ? "is-open" : ""}`}>
          <dt>{weekdayLabels[index]}</dt><dd>{day.status === "CLOSED" ? "Đóng cửa cả ngày" : day.status === "UNKNOWN" ? "Chưa có dữ liệu" : day.intervals.map(interval => <span key={interval.opensAt}>{interval.opensAt} – {interval.closesAt}</span>)}</dd>
        </div>)}</dl>
      </section>
    </div>
  </Shell>;
}
