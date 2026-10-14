import { mvpFeatures } from "@/lib/mvp-features";
import PublishedContentProfile from "@/components/published-content-profile";
import React, { type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import DestinationMap from "@/components/map/destination-map";
import FavoriteButton from "@/components/favorite-button";
import { resolveExploreReturnTo, type ExploreReturnHref } from "@/modules/destination/destination-detail-navigation";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  MapPin,
  Mountain,
  CalendarDays,
  Compass,
  Sparkles,
  Tag,
} from "lucide-react";
import { weekdayLabels } from "@/modules/destination/destination-contract";
import { formatSuggestedDuration, type PublicDestinationDetail } from "@/modules/destination/public-destination-contract";

function Shell({ children, returnTo }: { children: ReactNode; returnTo: ExploreReturnHref }) {
  return (
    <main className="public-detail" lang="vi">
      <div className="public-detail-container">
        <Link href={returnTo as Route} className="public-detail-back">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Quay lại Khám phá</span>
        </Link>
        {children}
      </div>
    </main>
  );
}

export function DetailState({
  state,
  children,
  returnTo,
}: {
  state: "missing" | "unavailable" | "loading" | "error";
  children?: ReactNode;
  returnTo?: ExploreReturnHref;
}) {
  const copy = {
    missing: [
      "Không tìm thấy điểm đến",
      "Điểm đến bạn tìm kiếm không tồn tại. Hãy kiểm tra lại đường dẫn.",
    ],
    unavailable: [
      "Điểm đến không còn khả dụng",
      "Điểm đến này hiện không được hiển thị trong khu vực công khai.",
    ],
    loading: [
      "Đang tải điểm đến…",
      "Thông tin tham quan sẽ xuất hiện trong giây lát.",
    ],
    error: [
      "Không thể tải thông tin điểm đến",
      "Không thể tải thông tin điểm đến. Vui lòng thử lại.",
    ],
  }[state];

  return (
    <Shell returnTo={resolveExploreReturnTo(returnTo)}>
      <section
        className="public-detail-state"
        role={state === "loading" ? "status" : state === "error" ? "alert" : undefined}
        aria-busy={state === "loading"}
      >
        <span className="public-detail-symbol" aria-hidden="true">
          <Mountain size={36} />
        </span>
        <h1>{copy[0]}</h1>
        <p>{copy[1]}</p>
        {children}
      </section>
    </Shell>
  );
}

export default function DestinationDetail({
  destination: d,
  returnTo,
}: {
  destination: PublicDestinationDetail;
  returnTo?: ExploreReturnHref;
}) {
  return (
    <Shell returnTo={resolveExploreReturnTo(returnTo)}>
      <header className="public-detail-hero">
        <div className="public-detail-hero-top">
          <span className="public-detail-eyebrow">
            <Mountain size={16} aria-hidden="true" />
            <span>Hà Giang · Điểm đến</span>
          </span>
          <div className="public-detail-tags">
            <span>
              <MapPin size={13} aria-hidden="true" />
              {d.area}
            </span>
            <span>
              <Tag size={13} aria-hidden="true" />
              {d.category}
            </span>
          </div>
        </div>

        <h1>{d.name}</h1>
        <p className="public-detail-description">{d.description}</p>

        <div className="public-detail-hero-actions">
          <Link
            className="public-detail-ai-btn"
            href={`/assistant?destinationId=${encodeURIComponent(d.id)}` as Route}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>Hỏi trợ lý AI về điểm đến này</span>
          </Link>
          <div className="public-detail-favorite">
            <FavoriteButton targetType="destinations" targetId={d.id} />
          </div>
        </div>
      </header>

      <div className="public-detail-grid">
        <div className="public-detail-main">
          <PublishedContentProfile profile={d.profile} />

          <section className="public-detail-card public-detail-location" aria-labelledby="location-title">
            <div className="public-detail-card-header">
              <h2 id="location-title">
                <MapPin size={21} aria-hidden="true" />
                Vị trí
              </h2>
              <span className="public-detail-location-sub">{d.area}</span>
            </div>
            <dl className="public-detail-coordinates">
              <div className="public-detail-coord-box">
                <dt>Vĩ độ</dt>
                <dd>{d.latitude}</dd>
              </div>
              <div className="public-detail-coord-box">
                <dt>Kinh độ</dt>
                <dd>{d.longitude}</dd>
              </div>
            </dl>
            <div className="public-detail-map-frame">
              <DestinationMap
                destinations={[{ id: d.id, name: d.name, area: d.area, category: d.category, latitude: d.latitude, longitude: d.longitude }]}
                label={`Bản đồ vị trí ${d.name}`}
                detail
              />
            </div>
          </section>

          {mvpFeatures.culture && (
<section className="public-detail-card" aria-labelledby="culture-title">
            <h2 id="culture-title">
              <BookOpen size={21} aria-hidden="true" />
              Nội dung văn hóa liên quan
            </h2>
            {d.relatedCulture.length === 0 ? (
              <div className="public-detail-empty">
                <BookOpen size={28} aria-hidden="true" className="public-detail-empty-icon" />
                <p>Chưa có nội dung văn hóa liên quan.</p>
              </div>
            ) : (
              <div className="public-culture-list">
                {d.relatedCulture.map((item) => (
                  <article key={item.id} className="public-culture-card">
                    <h3>{item.title}</h3>
                    <p>{item.excerpt}</p>
                    {(item.sourceTitle || item.sourceUrl) && (
                      <p className="public-detail-muted">
                        Nguồn:{" "}
                        {item.sourceUrl ? (
                          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                            {item.sourceTitle || item.sourceUrl}
                          </a>
                        ) : (
                          item.sourceTitle
                        )}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          )}
        </div>

        <aside className="public-detail-sidebar">
          <section className="public-detail-card public-detail-facts-card" aria-labelledby="visit-title">
            <h2 id="visit-title">
              <Compass size={21} aria-hidden="true" />
              Thông tin tham quan
            </h2>
            <dl className="public-detail-facts">
              <div className="public-detail-fact-row">
                <dt>
                  <MapPin size={15} aria-hidden="true" />
                  Khu vực
                </dt>
                <dd>{d.area}</dd>
              </div>
              <div className="public-detail-fact-row">
                <dt>
                  <Tag size={15} aria-hidden="true" />
                  Danh mục
                </dt>
                <dd>{d.category}</dd>
              </div>
              <div className="public-detail-fact-row">
                <dt>
                  <Clock size={15} aria-hidden="true" />
                  Thời lượng tham quan gợi ý
                </dt>
                <dd>{formatSuggestedDuration(d.suggestedDurationMinutes)}</dd>
              </div>
            </dl>
          </section>

          <section className="public-detail-card public-detail-hours" aria-labelledby="hours-title">
            <div className="public-detail-card-header">
              <h2 id="hours-title">
                <CalendarDays size={21} aria-hidden="true" />
                Giờ hoạt động
              </h2>
              <p className="public-detail-muted">Giờ địa phương Hà Giang (Asia/Ho_Chi_Minh)</p>
            </div>
            <dl className="public-detail-schedule-list">
              {d.openingDays.map((day, index) => (
                <div
                  key={day.dayOfWeek}
                  className={`public-detail-day ${
                    day.status === "OPEN"
                      ? "is-open"
                      : day.status === "CLOSED"
                      ? "is-closed"
                      : "is-unknown"
                  }`}
                >
                  <dt>{weekdayLabels[index]}</dt>
                  <dd>
                    {day.status === "CLOSED" ? (
                      <span className="schedule-status-badge closed">Đóng cửa cả ngày</span>
                    ) : day.status === "UNKNOWN" ? (
                      <span className="schedule-status-badge unknown">Chưa có dữ liệu</span>
                    ) : (
                      day.intervals.map((interval) => (
                        <span key={interval.opensAt} className="schedule-status-badge open">
                          {interval.opensAt} – {interval.closesAt}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
