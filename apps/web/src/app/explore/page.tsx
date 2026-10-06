import { db } from "@/services";
import React, { Suspense } from "react";
import { listPublicLocations, parsePublicListQuery } from "@/modules/destination/public-destination-list";
import ExploreResults from "./explore-results";
import CultureResults from "./culture-results";
import { listPublicCulture, parsePublicCultureQuery } from "@/modules/culture/public-culture-list";
import { loadPublicSection } from "./public-section";
import "./explore.css";
export const dynamic = "force-dynamic";
export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  return <main className="explore-page" lang="vi">
    <header className="explore-intro">
      <div className="explore-intro-copy"><span className="explore-eyebrow">HÀ GIANG <i aria-hidden="true">·</i> KHÁM PHÁ</span>
        <h1>Khám phá điểm đến <span>&amp; văn hóa</span></h1>
        <p>Tìm những địa danh, xem vị trí trên bản đồ và khám phá câu chuyện văn hóa Hà Giang.</p>
      </div>
      <div className="explore-topography" aria-hidden="true"><span>Những miền đá<br />kể chuyện</span></div>
    </header>
    <Suspense fallback={<SectionLoading label="điểm đến" kind="destination" />}><Destinations query={query} /></Suspense>
    <Suspense fallback={<SectionLoading label="nội dung văn hóa" kind="culture" />}><Culture query={query} /></Suspense>
  </main>;
}
function SectionLoading({ label, kind }: { label: string; kind: "destination" | "culture" }) {
  return <section className={`explore-domain explore-loading-domain explore-loading-${kind}`} role="status" aria-busy="true" aria-label={`Đang tải ${label}`}>
    <div className="explore-section-heading"><div><span className="explore-skeleton-line explore-skeleton-eyebrow" /><span className="explore-skeleton-line explore-skeleton-title" /><span className="explore-skeleton-line explore-skeleton-copy" /></div><span className="explore-skeleton-pill" /></div>
    <div className="explore-skeleton-grid"><span /><span /><span /></div>
  </section>;
}
async function Destinations({ query }: { query: URLSearchParams }) {
  const params = new URLSearchParams(query); params.delete("culturePage");
  return <ExploreResults {...await loadPublicSection(() => listPublicLocations(parsePublicListQuery(params), db), "Không thể tải dữ liệu điểm đến. Vui lòng thử lại.")} />;
}
async function Culture({ query }: { query: URLSearchParams }) {
  const params = new URLSearchParams(); query.getAll("culturePage").forEach(value => params.append("page", value));
  return <CultureResults {...await loadPublicSection(() => listPublicCulture(parsePublicCultureQuery(params), db), "Không thể tải nội dung văn hóa. Vui lòng thử lại.")} />;
}
