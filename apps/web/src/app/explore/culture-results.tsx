"use client";
import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { PublicCulturePage } from "@/modules/culture/public-culture-list";
import { destinationDetailHref } from "@/modules/map/map-model";
import { culturePageHref } from "./public-section";
export default function CultureResults({ data, error }: { data?: PublicCulturePage; error?: string }) {
  const router = useRouter(); const params = useSearchParams();
  return <section aria-labelledby="explore-culture-title" className="explore-domain">
    <header><h2 id="explore-culture-title">Nội dung văn hóa</h2><p>Tìm hiểu văn hóa Hà Giang qua những nội dung và nguồn tham khảo.</p></header>
    {error ? <div className="explore-state" role="alert"><h3>Không thể tải nội dung văn hóa</h3><p>{error}</p><button type="button" onClick={() => router.refresh()}>Thử lại nội dung văn hóa</button></div> : data && <>
      {data.items.length === 0 ? <div className="explore-state" role="status">Chưa có nội dung văn hóa công khai.</div> : <ul className="explore-cards">{data.items.map(item => <li key={item.id}>
        <h3>{item.title}</h3><p>{item.excerpt}</p>
        {(item.sourceTitle || item.sourceUrl) && <p className="culture-source">Nguồn: {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceTitle || "Xem nguồn tham khảo"}<span className="sr-only"> (mở tab mới)</span></a> : item.sourceTitle}</p>}
        {item.relatedDestinations.length > 0 && <div><h4>Điểm đến liên quan</h4><ul className="culture-related">{item.relatedDestinations.map(destination => <li key={destination.id}><Link href={destinationDetailHref(destination.id)}>{destination.name}</Link></li>)}</ul></div>}
      </li>)}</ul>}
      <nav className="explore-pagination" aria-label="Phân trang nội dung văn hóa">{data.page > 1 && <Link href={culturePageHref(new URLSearchParams(params), data.page - 1)}>Trang văn hóa trước</Link>}<span>Trang văn hóa {data.page}</span>{data.hasMore && <Link href={culturePageHref(new URLSearchParams(params), data.page + 1)}>Trang văn hóa sau</Link>}</nav>
    </>}
  </section>;
}
