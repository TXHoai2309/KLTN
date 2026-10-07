import React from "react";
import "./explore.css";

function LoadingSection({ label }: { label: string }) {
  return <section className="explore-domain explore-loading-domain" role="status" aria-busy="true" aria-label={`Đang tải ${label}`}>
    <div className="explore-section-heading"><div><span className="explore-skeleton-line explore-skeleton-eyebrow" /><span className="explore-skeleton-line explore-skeleton-title" /><span className="explore-skeleton-line explore-skeleton-copy" /></div><span className="explore-skeleton-pill" /></div>
    <div className="explore-skeleton-grid"><span /><span /><span /></div>
  </section>;
}

export default function Loading() {
  return <main className="explore-page" lang="vi">
    <header className="explore-intro explore-loading-intro" aria-hidden="true"><div className="explore-intro-copy">
      <span className="explore-skeleton-line explore-skeleton-eyebrow" /><span className="explore-skeleton-line explore-skeleton-title" /><span className="explore-skeleton-line explore-skeleton-copy" />
    </div><div className="explore-topography" /></header>
    <LoadingSection label="điểm đến" />
    <LoadingSection label="nội dung văn hóa" />
  </main>;
}
