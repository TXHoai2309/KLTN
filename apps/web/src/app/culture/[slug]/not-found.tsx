import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import "./culture-detail.css";

export default function NotFound() {
  return (
    <main className="culture-detail-page" lang="vi">
      <div className="culture-detail-shell">
        <section className="culture-detail-state" role="status">
          <h1>Nội dung không khả dụng</h1>
          <p>
            Nội dung văn hóa này không tồn tại hoặc hiện không được công khai.
          </p>
          <Link className="culture-detail-back" href="/culture">
            <ArrowLeft aria-hidden="true" />
            <span>Về danh sách văn hóa</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
