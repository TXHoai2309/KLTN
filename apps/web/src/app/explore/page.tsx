import { db } from "@/services";
import React, { Suspense } from "react";
import { listPublicLocations, parsePublicListQuery } from "@/modules/destination/public-destination-list";
import ExploreResults from "./explore-results";
import { DestinationResultStatus } from "./destination-search-form";
import CultureResults from "./culture-results";
import { listPublicCulture, parsePublicCultureQuery } from "@/modules/culture/public-culture-list";
import { loadPublicSection } from "./public-section";
import "./explore.css";
export const dynamic = "force-dynamic";
export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) { if (Array.isArray(value)) value.forEach(item => query.append(key, item)); else if (value !== undefined) query.set(key, value); }
  return <main className="explore-page" lang="vi"><header><h1>Khám phá Hà Giang</h1><p>Tìm điểm đến theo khu vực, danh mục và tìm hiểu văn hóa địa phương.</p></header>
    <Suspense fallback={<section className="explore-domain"><DestinationResultStatus state={{ status: "loading" }} filtered={false} /></section>}><Destinations query={query} /></Suspense>
    <Suspense fallback={<SectionLoading label="nội dung văn hóa" />}><Culture query={query} /></Suspense>
  </main>;
}
function SectionLoading({ label }: { label: string }) { return <section className="explore-state explore-domain" role="status" aria-busy="true">Đang tải {label}…</section>; }
async function Destinations({ query }: { query: URLSearchParams }) {
  const params = new URLSearchParams(query); params.delete("culturePage");
  return <ExploreResults {...await loadPublicSection(() => listPublicLocations(parsePublicListQuery(params), db), "Không thể tải dữ liệu điểm đến. Vui lòng thử lại.")} />;
}
async function Culture({ query }: { query: URLSearchParams }) {
  const params = new URLSearchParams(); query.getAll("culturePage").forEach(value => params.append("page", value));
  return <CultureResults {...await loadPublicSection(() => listPublicCulture(parsePublicCultureQuery(params), db), "Không thể tải nội dung văn hóa. Vui lòng thử lại.")} />;
}
