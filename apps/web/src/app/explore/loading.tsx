import { mvpFeatures } from "@/lib/mvp-features";
import React from "react";
import "./explore.css";

function LoadingSection({ label, kind }: { label: string; kind: "destination" | "culture" }) {
  return <section className={`explore-domain explore-loading-domain explore-loading-${kind}`} role="status" aria-busy="true" aria-label={`Đang tải ${label}`}>
    <div className="explore-section-heading"><div><span className="explore-skeleton-line explore-skeleton-eyebrow" /><span className="explore-skeleton-line explore-skeleton-title" /><span className="explore-skeleton-line explore-skeleton-copy" /></div><span className="explore-skeleton-pill" /></div>
    <div className="explore-skeleton-grid"><span /><span /><span /><span /></div>
  </section>;
}

export default function Loading() {
  return <main className="explore-page" lang="vi">
    <header className="explore-intro explore-loading-intro" aria-hidden="true"><div className="explore-intro-copy">
      <span className="explore-skeleton-line explore-skeleton-eyebrow" /><span className="explore-skeleton-line explore-skeleton-title" /><span className="explore-skeleton-line explore-skeleton-copy" />
    </div></header>
    <LoadingSection label="điểm đến" kind="destination" />
    {mvpFeatures.culture && <LoadingSection label="nội dung văn hóa" kind="culture" />}
  </main>;
}
