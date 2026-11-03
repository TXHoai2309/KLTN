import { LoaderCircle } from "lucide-react";
import "@/app/trip-companions/companion.css";

export default function CompanionLoading() {
  return (
    <main className="companion-page" lang="vi">
      <div className="companion-container">
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <LoaderCircle size={36} className="animate-spin text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-sm font-medium">Đang tải thông tin chuyến đi…</p>
        </div>
      </div>
    </main>
  );
}
