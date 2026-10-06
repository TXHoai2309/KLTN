"use client";

import Link from "next/link";
import { Button } from "@KLTN/ui/components/button";

import "./culture.css";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="culture-page" lang="vi">
      <section className="culture-state" role="alert">
        <h1>Không thể tải nội dung văn hóa</h1>
        <p>Đã xảy ra lỗi khi tải dữ liệu. Bạn có thể thử lại.</p>
        <div className="culture-state-actions">
          <Button type="button" onClick={() => reset()}>
            Thử lại
          </Button>
          <Link className="culture-state-link" href="/culture">
            Về danh sách văn hóa
          </Link>
        </div>
      </section>
    </main>
  );
}
