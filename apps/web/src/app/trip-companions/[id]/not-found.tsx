import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import "@/app/trip-companions/companion.css";

export default function CompanionNotFound() {
  return (
    <main className="companion-page" lang="vi">
      <div className="companion-container">
        <div className="companion-card text-center py-16 px-6 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-muted/60 text-emerald-800 dark:text-emerald-400 grid place-items-center mx-auto mb-4">
            <Compass size={32} aria-hidden="true" />
          </div>
          <h1 className="companion-title !text-2xl mb-2">Không tìm thấy bài giới thiệu</h1>
          <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
            Chuyến đi bạn đang tìm kiếm không tồn tại, đã bị gỡ bỏ hoặc chưa được công khai.
          </p>
          <div className="flex justify-center">
            <Link href="/" className="companion-cta-button !w-auto">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Quay lại trang chủ</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
