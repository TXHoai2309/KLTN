"use client";
import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DestinationMap from "@/components/map/destination-map";
import type { PublicLocationPage } from "@/modules/destination/public-destination-list";
import { destinationDetailHref, exploreView, exploreViewHref } from "@/modules/map/map-model";

export default function ExploreResults({ data, error }: { data?: PublicLocationPage; error?: string }) {
  const params = useSearchParams(); const router = useRouter(); const view = exploreView(new URLSearchParams(params));
  function pageHref(page: number): `/explore?${string}` { const next = new URLSearchParams(params); next.set("page", String(page)); return `/explore?${next}`; }
  return <section className="explore-domain" aria-labelledby="explore-destination-title"><header><h2 id="explore-destination-title">Điểm đến</h2><p>Chọn điểm đến từ danh sách hoặc xem vị trí trên bản đồ.</p></header>
    <div className="explore-toolbar"><div role="group" aria-label="Chế độ xem điểm đến">{(["list", "map"] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => { if (view !== mode) window.history.pushState(null, "", exploreViewHref(new URLSearchParams(params), mode)); }}>{mode === "list" ? "Danh sách" : "Bản đồ"}</button>)}</div>
      {data && <p>{data.items.length} điểm đến trên trang {data.page}</p>}
    </div>
    {error ? <section className="explore-state" role="alert"><h3>Không thể tải dữ liệu điểm đến</h3><p>{error}</p><button type="button" onClick={() => router.refresh()}>Thử lại dữ liệu</button><Link href="/explore">Về khám phá</Link></section> : data && <>
      {view === "map" ? <DestinationMap destinations={data.items} /> : data.items.length === 0 ? <section className="explore-state" role="status">Chưa có điểm đến công khai.</section> : <ul className="explore-cards">{data.items.map(item => <li key={item.id}><h3>{item.name}</h3><p>{item.area} · {item.category}</p><Link href={destinationDetailHref(item.id)}>Xem chi tiết</Link></li>)}</ul>}
      <nav className="explore-pagination" aria-label="Phân trang điểm đến">{data.page > 1 && <Link href={pageHref(data.page - 1)}>Trang trước</Link>}<span>Trang {data.page}</span>{data.hasMore && <Link href={pageHref(data.page + 1)}>Trang sau</Link>}</nav>
    </>}
  </section>;
}
