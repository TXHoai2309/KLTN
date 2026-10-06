"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight, List, Map, MapPin, TriangleAlert } from "lucide-react";
import DestinationMap from "@/components/map/destination-map";
import type { PublicLocationPage } from "@/modules/destination/public-destination-list";
import { destinationDetailHref, exploreView, exploreViewHref } from "@/modules/map/map-model";

export default function ExploreResults({ data, error }: { data?: PublicLocationPage; error?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const view = exploreView(new URLSearchParams(params));

  function pageHref(page: number): `/explore?${string}` {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return `/explore?${next}`;
  }

  const firstResult = data && data.items.length > 0 ? (data.page - 1) * 25 + 1 : 0;
  const lastResult = data ? firstResult + data.items.length - 1 : 0;

  return (
    <section className="explore-domain explore-destinations" aria-labelledby="explore-destination-title">
      <header className="explore-section-heading">
        <div>
          <span className="explore-eyebrow">HỒ SƠ ĐỊA DANH</span>
          <h2 id="explore-destination-title">Điểm đến Hà Giang</h2>
          <p>Chọn một địa danh để xem thông tin và vị trí trên bản đồ.</p>
        </div>
        <div className="explore-section-tools">
          {data && <p className="explore-result-count" aria-live="polite">
            <strong>{data.items.length}</strong> điểm đến <span>·</span> trang {data.page}
          </p>}
          <div className="explore-view-switch" role="group" aria-label="Chế độ xem điểm đến">
            <button type="button" aria-pressed={view === "list"} onClick={() => {
              if (view !== "list") window.history.pushState(null, "", exploreViewHref(new URLSearchParams(params), "list"));
            }}><List aria-hidden="true" size={17} /> Danh sách</button>
            <button type="button" aria-pressed={view === "map"} onClick={() => {
              if (view !== "map") window.history.pushState(null, "", exploreViewHref(new URLSearchParams(params), "map"));
            }}><Map aria-hidden="true" size={17} /> Bản đồ</button>
          </div>
        </div>
      </header>

      {error ? <section className="explore-state explore-error" role="alert">
        <TriangleAlert aria-hidden="true" size={22} />
        <div><h3>Không thể tải dữ liệu điểm đến</h3><p>{error}</p></div>
        <button type="button" onClick={() => router.refresh()}>Thử lại</button>
        <Link href="/explore">Về khám phá</Link>
      </section> : data && <div key={view} className="explore-view-content">
        {view === "map" ? <div className="explore-map-workspace">
          <div className="explore-map-panel">
            <div className="explore-map-heading"><Map aria-hidden="true" size={18} /><span>Bản đồ Hà Giang</span><span className="explore-map-meta">{data.items.length} địa danh</span></div>
            <DestinationMap destinations={data.items} />
          </div>
          <aside className="explore-map-results" aria-label="Danh sách điểm đến trên bản đồ">
            <h3>Địa danh trên trang</h3>
            {data.items.length === 0 ? <p className="explore-map-empty">Chưa có điểm đến công khai.</p> :
              <ul>{data.items.map(item => <li key={item.id}>
                <Link href={destinationDetailHref(item.id)} className="explore-map-result">
                  <span className="explore-map-result-mark" aria-hidden="true"><MapPin size={18} /></span>
                  <span className="explore-map-result-copy"><strong>{item.name}</strong><span>{item.area}</span><small>{item.category}</small></span>
                  <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
              </li>)}</ul>}
          </aside>
        </div> : data.items.length === 0 ? <section className="explore-state explore-empty" role="status">
          <span className="explore-empty-icon"><MapPin aria-hidden="true" size={22} /></span>
          <h3>Chưa có điểm đến công khai</h3><p>Các địa danh được hiển thị tại đây khi có dữ liệu công khai.</p>
        </section> : <ul className={`explore-cards${data.items.length === 1 ? " explore-cards-single" : ""}`}>
          {data.items.map((item, index) => <li className="explore-destination-card" key={item.id} style={{ "--card-index": index } as React.CSSProperties}>
            <div className="explore-card-visual" aria-hidden="true"><span className="explore-card-kicker">HỒ SƠ ĐỊA DANH</span><MapPin size={29} strokeWidth={1.6} /><span className="explore-card-area">{item.area}</span></div>
            <div className="explore-card-body"><span className="explore-category">{item.category}</span><h3>{item.name}</h3><p><MapPin aria-hidden="true" size={15} />{item.area}</p>
              <Link href={destinationDetailHref(item.id)} className="explore-card-link">Xem chi tiết <ArrowUpRight aria-hidden="true" size={16} /></Link>
            </div>
          </li>)}
        </ul>}

        <nav className="explore-pagination" aria-label="Phân trang điểm đến">
          <p>{data.items.length === 0 ? "Không có kết quả trên trang này" : <>Hiển thị <strong>{firstResult}–{lastResult}</strong> điểm đến</>}<span> · Trang {data.page}</span></p>
          <div>
            {data.page > 1 ? <Link href={pageHref(data.page - 1)} aria-label="Trang trước"><ChevronLeft aria-hidden="true" size={17} /> Trước</Link> : <span className="explore-page-disabled"><ChevronLeft aria-hidden="true" size={17} /> Trước</span>}
            {data.hasMore ? <Link href={pageHref(data.page + 1)} aria-label="Trang sau">Sau <ChevronRight aria-hidden="true" size={17} /></Link> : <span className="explore-page-disabled">Sau <ChevronRight aria-hidden="true" size={17} /></span>}
          </div>
        </nav>
      </div>}
    </section>
  );
}
