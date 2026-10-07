import { Skeleton } from "@KLTN/ui/components/skeleton";

import "./culture-detail.css";

export default function Loading() {
  return (
    <main className="culture-detail-page" lang="vi" aria-busy="true">
      <div className="culture-detail-shell">
        <Skeleton className="culture-detail-skeleton-back" />
        <article className="culture-detail-article">
          <Skeleton className="culture-detail-skeleton-cover" />
          <header className="culture-detail-header">
            <Skeleton className="culture-detail-skeleton-eyebrow" />
            <Skeleton className="culture-detail-skeleton-title" />
            <Skeleton className="culture-detail-skeleton-summary" />
          </header>
          <div className="culture-detail-skeleton-body" aria-label="Đang tải nội dung văn hóa">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        </article>
      </div>
    </main>
  );
}
