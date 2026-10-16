import { Skeleton } from "@KLTN/ui/components/skeleton";

export default function MyTripsLoading() {
  return <main className="my-trips-page" lang="vi" role="status" aria-busy="true">
    <span className="sr-only">Đang tải chuyến đi của bạn</span>
    <Skeleton className="my-trips-loading-title" />
    <div className="my-trips-grid">{[0, 1, 2].map(index => <Skeleton key={index} className="my-trips-loading-card" />)}</div>
  </main>;
}
