import Link from "next/link";
import type { Route } from "next";

export default function TripNotFound() {
  return <main className="my-trips-page" lang="vi">
    <div className="my-trips-state" role="status">
      <h1>Không tìm thấy chuyến đi</h1>
      <p>Chuyến đi này không tồn tại hoặc bạn không thể truy cập.</p>
      <Link className="my-trips-action" href={"/trips" as Route}>Về chuyến đi của tôi</Link>
    </div>
  </main>;
}
