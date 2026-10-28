import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanionDiscoveryView } from "@/components/trip-companions/companion-discovery-view";
import "@/app/trip-companions/companion.css";

export const metadata: Metadata = {
  title: "Tìm bạn đồng hành Hà Giang — Khám phá chuyến đi",
  description: "Khám phá các chuyến đi sắp khởi hành tại Hà Giang, tìm thêm bạn cùng chung cung đường hoặc công khai lời mời đồng hành.",
  openGraph: {
    title: "Tìm bạn đồng hành Hà Giang",
    description: "Khám phá các chuyến đi sắp khởi hành tại Hà Giang và tìm bạn cùng chung hành trình.",
  },
};

export default function TripCompanionsDiscoveryPage() {
  return (
    <main className="companion-page" lang="vi">
      <div className="companion-container">
        {/* ─── Breadcrumbs ─── */}
        <div className="companion-breadcrumbs">
          <Link href="/">Trang chủ</Link>
          <span className="companion-breadcrumbs-sep">/</span>
          <span>Tìm bạn đồng hành</span>
        </div>

        {/* ─── Discovery View with Suspense for URL search params ─── */}
        <Suspense fallback={<DiscoveryLoadingFallback />}>
          <CompanionDiscoveryView />
        </Suspense>
      </div>
    </main>
  );
}

function DiscoveryLoadingFallback() {
  return (
    <div className="companion-discovery-root" aria-busy="true" role="status">
      <div className="companion-discovery-hero">
        <div className="companion-discovery-hero-copy">
          <div className="companion-skeleton-line w-32 h-4 mb-2" />
          <div className="companion-skeleton-line w-3/4 h-8 mb-3" />
          <div className="companion-skeleton-line w-full h-4 mb-2" />
        </div>
      </div>
      <div className="companion-card p-6 my-6">
        <div className="companion-skeleton-line w-full h-12" />
      </div>
      <div className="companion-discovery-grid">
        {[1, 2, 3, 4].map((id) => (
          <div key={id} className="companion-card companion-item-card is-skeleton">
            <div className="companion-skeleton-media" />
            <div className="companion-item-body">
              <div className="companion-skeleton-line w-24 h-4 mb-2" />
              <div className="companion-skeleton-line w-3/4 h-6 mb-3" />
              <div className="companion-skeleton-line w-full h-4 mb-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
