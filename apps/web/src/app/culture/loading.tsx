import { Skeleton } from "@KLTN/ui/components/skeleton";

import "./culture.css";

export default function Loading() {
  return (
    <main className="culture-page" lang="vi" aria-busy="true">
      <header className="culture-page-header">
        <Skeleton className="culture-skeleton-eyebrow" />
        <Skeleton className="culture-skeleton-title" />
        <Skeleton className="culture-skeleton-copy" />
      </header>
      <section className="culture-filter culture-filter-skeleton" aria-label="Đang tải bộ lọc">
        <Skeleton className="culture-skeleton-input" />
        <Skeleton className="culture-skeleton-input" />
        <Skeleton className="culture-skeleton-button" />
      </section>
      <ul className="culture-grid" aria-label="Đang tải nội dung văn hóa">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index}>
            <Skeleton className="culture-skeleton-card" />
          </li>
        ))}
      </ul>
    </main>
  );
}
