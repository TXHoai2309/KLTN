"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, MapPin, TriangleAlert } from "lucide-react";
import type { PublicCulturePage } from "@/modules/culture/public-culture-list";
import { destinationDetailHref } from "@/modules/map/map-model";
import { culturePageHref } from "./public-section";

export default function CultureResults({ data, error }: { data?: PublicCulturePage; error?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const firstResult = data && data.items.length > 0 ? (data.page - 1) * 25 + 1 : 0;
  const lastResult = data ? firstResult + data.items.length - 1 : 0;

  return (
    <section aria-labelledby="explore-culture-title" className="explore-domain explore-culture">
      <header className="explore-section-heading">
        <div><span className="explore-eyebrow">NỘI DUNG VĂN HÓA</span><h2 id="explore-culture-title">Những câu chuyện vùng cao</h2>
          <p>Tư liệu và câu chuyện về con người, phong tục, nghề truyền thống Hà Giang.</p></div>
        {data && <p className="explore-result-count"><strong>{data.items.length}</strong> nội dung <span>·</span> trang {data.page}</p>}
      </header>

      {error ? <section className="explore-state explore-error" role="alert">
        <TriangleAlert aria-hidden="true" size={22} /><div><h3>Không thể tải nội dung văn hóa</h3><p>{error}</p></div>
        <button type="button" onClick={() => router.refresh()}>Thử lại</button>
      </section> : data && <>
        {data.items.length === 0 ? <div className="explore-state explore-empty" role="status">
          <span className="explore-empty-icon explore-book-icon"><BookOpen aria-hidden="true" size={22} /></span>
          <h3>Chưa có nội dung văn hóa công khai</h3><p>Các câu chuyện văn hóa sẽ xuất hiện tại đây khi được công khai.</p>
        </div> : <ul className={`explore-cards explore-culture-cards${data.items.length === 1 ? " explore-cards-single" : ""}`}>
          {data.items.map((item, index) => <li className="explore-culture-card" key={item.id} style={{ "--card-index": index } as React.CSSProperties}>
            <div className="explore-culture-art" aria-hidden="true"><BookOpen size={25} strokeWidth={1.6} /><span>TƯ LIỆU VĂN HÓA</span><i /><i /><i /></div>
            <div className="explore-culture-card-body"><h3>{item.title}</h3><p className="explore-culture-excerpt">{item.excerpt}</p>
              {(item.sourceTitle || item.sourceUrl) && <p className="explore-culture-source"><BookOpen aria-hidden="true" size={14} /><span>Nguồn:</span>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceTitle || "Xem nguồn tham khảo"}<ExternalLink aria-hidden="true" size={13} /><span className="sr-only"> (mở tab mới)</span></a> : <span>{item.sourceTitle}</span>}</p>}
              {item.relatedDestinations.length > 0 && <div className="explore-related"><h4>Địa danh liên quan</h4><ul>{item.relatedDestinations.map(destination => <li key={destination.id}><Link href={destinationDetailHref(destination.id)}><MapPin aria-hidden="true" size={13} />{destination.name}</Link></li>)}</ul></div>}
            </div>
          </li>)}
        </ul>}
        <nav className="explore-pagination" aria-label="Phân trang nội dung văn hóa">
          <p>{data.items.length === 0 ? "Không có kết quả trên trang này" : <>Hiển thị <strong>{firstResult}–{lastResult}</strong> nội dung</>}<span> · Trang {data.page}</span></p>
          <div>
            {data.page > 1 ? <Link href={culturePageHref(new URLSearchParams(params), data.page - 1)} aria-label="Trang văn hóa trước"><ChevronLeft aria-hidden="true" size={17} /> Trước</Link> : <span className="explore-page-disabled"><ChevronLeft aria-hidden="true" size={17} /> Trước</span>}
            {data.hasMore ? <Link href={culturePageHref(new URLSearchParams(params), data.page + 1)} aria-label="Trang văn hóa sau">Sau <ChevronRight aria-hidden="true" size={17} /></Link> : <span className="explore-page-disabled">Sau <ChevronRight aria-hidden="true" size={17} /></span>}
          </div>
        </nav>
      </>}
    </section>
  );
}
