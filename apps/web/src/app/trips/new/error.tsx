"use client";

import { Button } from "@KLTN/ui/components/button";

export default function NewTripError({ reset }: { reset: () => void }) {
  return (
    <main className="trip-form-page" lang="vi">
      <div className="trip-error-card" role="alert">
        <h1>Không thể mở biểu mẫu</h1>
        <p>Đã xảy ra lỗi kỹ thuật. Dữ liệu chưa được lưu; bạn có thể thử tải lại trang.</p>
        <Button type="button" variant="outline" className="trip-secondary-button" onClick={reset}>Thử lại</Button>
      </div>
    </main>
  );
}

