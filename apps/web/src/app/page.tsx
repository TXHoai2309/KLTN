import React from "react";
import Link from "next/link";
import { MapPin, BookOpen, Map } from "lucide-react";
import "./home.css";
export default function Home() {
  return <main className="home-page" lang="vi">
    <section className="home-hero"><span>Hà Giang · Travel Assistant</span><h1>Khám phá Hà Giang theo cách của bạn</h1><p>Tìm những điểm đến giữa núi non, khám phá văn hóa địa phương và chọn nơi bạn muốn ghé thăm.</p><Link className="home-cta" href="/explore">Khám phá Hà Giang <span aria-hidden="true">→</span></Link></section>
    <section aria-labelledby="home-capabilities"><h2 id="home-capabilities">Bắt đầu hành trình khám phá</h2><div className="home-features">
      <article><MapPin aria-hidden="true" /><h3>Khám phá điểm đến</h3><p>Xem khu vực, giờ hoạt động và thời lượng tham quan để hiểu thêm về nơi bạn muốn đến.</p><Link href="/explore">Xem các điểm đến</Link></article>
      <article><BookOpen aria-hidden="true" /><h3>Tìm hiểu văn hóa</h3><p>Đọc những câu chuyện văn hóa Hà Giang và tham khảo nguồn thông tin khi có.</p><Link href="/explore#explore-culture-title">Khám phá văn hóa</Link></article>
      <article><Map aria-hidden="true" /><h3>Xem vị trí trên bản đồ</h3><p>Khám phá vị trí các điểm đến và mở thông tin chi tiết từ bản đồ.</p><Link href="/explore?view=map">Mở bản đồ điểm đến</Link></article>
    </div></section>
  </main>;
}
