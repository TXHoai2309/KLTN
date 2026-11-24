import { mvpFeatures } from "@/lib/mvp-features";
import { DestinationWeatherCard } from "@/modules/trip-weather/destination-weather-card";
import EditorialRenderer from "@/components/editorial/editorial-renderer";
import type { ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import PublishedContentProfile from "@/components/published-content-profile";
import React, { type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import DestinationDetailIframeMap from "@/components/map/destination-detail-iframe-map";
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
  Tag,
} from "lucide-react";
import { DestinationAiFab } from "@/components/destination-ai-fab";
import { DestinationSummaryCard } from "./destination-summary-card";
import { cleanAreaDisplayLabel, cleanCategoryDisplayLabel, cleanDocumentSourceTitle, cleanPlaceDisplayName, cleanTravelerDisplay } from "@/lib/traveler-display-clean";
import { editorialValue, editorialVisitData, hasEditorialCoordinates, hasEditorialFacts } from "@/modules/destination-editorial/editorial-display-policy";
import { formatPlannerDurationSummary, type PublicDestinationDetail } from "@/modules/destination/public-destination-contract";
import type { PublicDestinationPlannerDuration } from "@/modules/destination/public-destination-duration";

function Shell({
  children,
  returnTo,
  topActions,
}: {
  children: ReactNode;
  returnTo: ExploreReturnHref;
  topActions?: ReactNode;
}) {
  return (
    <main className="public-detail" lang="vi">
      <div className="public-detail-container">
        <div className="public-detail-top-bar">
          <Link href={returnTo as Route} className="public-detail-back">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Quay lại Khám phá</span>
          </Link>
          {topActions && <div className="public-detail-top-actions">{topActions}</div>}
        </div>
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
  editorial,
  plannerDuration,
}: {
  destination: PublicDestinationDetail;
  returnTo?: ExploreReturnHref;
  editorial?: ResolvedEditorial | null;
  plannerDuration?: PublicDestinationPlannerDuration | null;
}) {
  const visit = editorialVisitData(d);
  const displayName = cleanPlaceDisplayName(d.name) || d.name;
  const displayCategory = cleanCategoryDisplayLabel(editorialValue(d.category) || d.category);
  const cleanArea = cleanAreaDisplayLabel(d.area);
  const effectiveSuggestedDuration = plannerDuration?.suggestedDurationMinutes ?? d.suggestedDurationMinutes;
  const effectiveMinimumDuration = plannerDuration?.minimumDurationMinutes ?? null;
  const formattedPlannerDuration = formatPlannerDurationSummary({
    suggestedDurationMinutes: effectiveSuggestedDuration,
    minimumDurationMinutes: effectiveMinimumDuration,
  });

  const summaryCard = (
    <DestinationSummaryCard
      destinationId={d.id}
      destinationName={displayName}
      area={d.area}
      hours={visit.hours}
      suggestedDurationMinutes={effectiveSuggestedDuration}
      minimumDurationMinutes={effectiveMinimumDuration}
      ticketPrice={d.profile?.ticketPrice ?? null}
      hasCoordinates={hasEditorialCoordinates(d)}
      mapSlot={
        <DestinationDetailIframeMap
          destination={{ name: displayName, area: d.area, latitude: d.latitude, longitude: d.longitude, profile: d.profile }}
          label={`Bản đồ vị trí ${displayName}`}
          compact
        />
      }
    />
  );

  if (editorial) return (
    <Shell
      returnTo={resolveExploreReturnTo(returnTo)}
      topActions={<FavoriteButton targetType="destinations" targetId={d.id} />}
    >
      <EditorialRenderer data={d} editorial={editorial} summarySlot={summaryCard} />
      <div id="thoi-tiet-chi-tiet" className="public-detail-weather-editorial"><DestinationWeatherCard destinationId={d.id} /></div>
      <DestinationAiFab destinationId={d.id} destinationName={displayName} />
    </Shell>
  );
  return (
    <Shell
      returnTo={resolveExploreReturnTo(returnTo)}
      topActions={<FavoriteButton targetType="destinations" targetId={d.id} />}
    >
      <header className="public-detail-hero">
        <h1>{displayName}</h1>
        {displayCategory && <p className="public-detail-category-sub">{displayCategory}</p>}
        {cleanArea && <p className="public-detail-area-sub"><MapPin size={14} aria-hidden="true" /><span>{cleanArea}</span></p>}
        <p className="public-detail-description">{cleanTravelerDisplay(d.description)}</p>
      </header>

      {summaryCard}

      <div className="public-detail-grid">
        <div className="public-detail-main">
          <PublishedContentProfile profile={d.profile} hideEmptyValues />

          {hasEditorialCoordinates(d) && <section className="public-detail-card public-detail-location" aria-labelledby="location-title">
            <div className="public-detail-card-header">
              <h2 id="location-title">
                <MapPin size={21} aria-hidden="true" />
                Vị trí
              </h2>
              {cleanArea && <span className="public-detail-location-sub">{cleanArea}</span>}
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
          </section>}

          <div id="thoi-tiet-chi-tiet"><DestinationWeatherCard destinationId={d.id} /></div>

          {mvpFeatures.culture && d.relatedCulture.length > 0 && (
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
                {d.relatedCulture.map((item) => {
                  const sourceTitle = cleanDocumentSourceTitle(item.sourceTitle) || item.sourceTitle;
                  return (
                    <article key={item.id} className="public-culture-card">
                      <h3>{cleanPlaceDisplayName(item.title) || item.title}</h3>
                      <p>{cleanTravelerDisplay(item.excerpt)}</p>
                      {(sourceTitle || item.sourceUrl) && (
                        <p className="public-detail-muted">
                          Nguồn:{" "}
                          {item.sourceUrl ? (
                            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                              {sourceTitle || item.sourceUrl}
                            </a>
                          ) : (
                            sourceTitle
                          )}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          )}
        </div>

        <aside className="public-detail-sidebar">
          {hasEditorialFacts(d) && <section className="public-detail-card public-detail-facts-card" aria-labelledby="visit-title">
            <h2 id="visit-title">
              <Compass size={21} aria-hidden="true" />
              Thông tin tham quan
            </h2>
            <dl className="public-detail-facts">
              {editorialValue(d.area) && <div className="public-detail-fact-row">
                <dt>
                  <MapPin size={15} aria-hidden="true" />
                  Khu vực
                </dt>
                <dd>{editorialValue(d.area)}</dd>
              </div>}
              {editorialValue(d.category) && <div className="public-detail-fact-row">
                <dt>
                  <Tag size={15} aria-hidden="true" />
                  Danh mục
                </dt>
                <dd>{cleanCategoryDisplayLabel(editorialValue(d.category))}</dd>
              </div>}
              {formattedPlannerDuration && <div className="public-detail-fact-row">
                <dt>
                  <Clock size={15} aria-hidden="true" />
                  Thời lượng tham quan gợi ý
                </dt>
                <dd>{formattedPlannerDuration}</dd>
              </div>}
            </dl>
          </section>}

          {visit.hours.length > 0 && <section className="public-detail-card public-detail-hours" aria-labelledby="hours-title">
            <div className="public-detail-card-header">
              <h2 id="hours-title">
                <CalendarDays size={21} aria-hidden="true" />
                Giờ hoạt động
              </h2>
              <p className="public-detail-muted">Giờ địa phương Hà Giang (Asia/Ho_Chi_Minh)</p>
            </div>
            <dl className="public-detail-schedule-list">
              {visit.hours.map(day => <div key={day.label} className="public-detail-day"><dt>{day.label}</dt><dd><span className={`schedule-status-badge ${day.value === "Đóng cửa" ? "closed" : "open"}`}>{day.value === "Đóng cửa" ? "Đóng cửa cả ngày" : day.value.replaceAll("–", " – ")}</span></dd></div>)}
            </dl>
          </section>}
        </aside>
      </div>
      <DestinationAiFab destinationId={d.id} destinationName={d.name} />
    </Shell>
  );
}
