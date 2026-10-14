export default function NewTripLoading() {
  return (
    <main className="trip-form-page" lang="vi" aria-busy="true">
      <div className="trip-form-intro trip-skeleton-block">
        <span className="trip-skeleton trip-skeleton-eyebrow" />
        <span className="trip-skeleton trip-skeleton-title" />
        <span className="trip-skeleton trip-skeleton-copy" />
      </div>
      <div className="trip-loading-card" role="status">
        <span className="sr-only">Đang tải biểu mẫu nhu cầu chuyến đi</span>
        <span className="trip-skeleton trip-skeleton-line" />
        <span className="trip-skeleton trip-skeleton-line trip-skeleton-short" />
        <span className="trip-skeleton trip-skeleton-input" />
      </div>
    </main>
  );
}

