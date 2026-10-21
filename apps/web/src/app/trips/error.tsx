"use client";

import { Button } from "@KLTN/ui/components/button";

export default function MyTripsError({ reset }: { reset: () => void }) {
  return <main className="my-trips-page" lang="vi">
    <div className="my-trips-state" role="alert">
      <h1>Không thể tải danh sách chuyến đi</h1>
      <p>Dữ liệu chưa thể tải lúc này. Vui lòng thử lại.</p>
      <Button variant="outline" onClick={reset}>Thử lại</Button>
    </div>
  </main>;
}
