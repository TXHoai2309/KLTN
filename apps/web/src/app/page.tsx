import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen, Compass, Map, MapPin } from "lucide-react";
import HomeScrollReveal from "@/components/home-scroll-reveal";
import "./home.css";

export const metadata: Metadata = {
  title: "Hà Giang Travel Assistant | Khám phá Hà Giang",
  description: "Tìm những điểm đến giữa núi non, khám phá văn hóa địa phương và chọn nơi bạn muốn ghé thăm.",
};

export default function Home() {
  return <main className="home-page" lang="vi">
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-visual" aria-hidden="true">
        <Image
          className="home-hero-image"
          src="/images/ha-giang-hero.webp"
          alt=""
          fill
          preload
          sizes="(max-width: 640px) calc(100vw - 28px), (max-width: 1352px) calc(100vw - 72px), 1280px"
        />
        <div className="home-scene-label"><span />Cao nguyên đá · Hà Giang</div>
      </div>
      <div className="home-hero-copy">
        <p className="home-eyebrow home-hero-enter home-delay-0">HÀ GIANG <span>·</span> TRAVEL ASSISTANT</p>
        <h1 id="home-title" className="home-hero-enter home-delay-1">Khám phá Hà Giang<span>theo cách của bạn</span></h1>
        <p className="home-hero-description home-hero-enter home-delay-2">Tìm những điểm đến giữa núi non, khám phá văn hóa địa phương và chọn nơi bạn muốn ghé thăm.</p>
        <Link className="home-cta home-hero-enter home-delay-3" href="/explore"><Compass size={19} aria-hidden="true" /><span>Khám phá Hà Giang</span><ArrowRight className="home-cta-arrow" size={18} aria-hidden="true" /></Link>
        <ul className="home-quick-info home-hero-enter home-delay-4" aria-label="Điều bạn có thể khám phá">
          <li><MapPin aria-hidden="true" /><span><small>Điểm đến</small><strong>Hùng vĩ</strong></span></li>
          <li><BookOpen aria-hidden="true" /><span><small>Văn hóa</small><strong>Đa dạng</strong></span></li>
          <li><Map aria-hidden="true" /><span><small>Bản đồ</small><strong>Trực quan</strong></span></li>
        </ul>
      </div>
    </section>

    <section className="home-explore" aria-labelledby="home-explore-title">
      <HomeScrollReveal>
        <div className="home-section-heading" data-home-reveal>
          <p className="home-eyebrow">BẮT ĐẦU HÀNH TRÌNH</p>
          <h2 id="home-explore-title">Khám phá Hà Giang</h2>
          <p>Chọn cách bạn muốn bắt đầu để khám phá những điều đặc biệt của vùng đất địa đầu Tổ quốc.</p>
        </div>

        <div className="home-card-grid">
          <article className="home-card" data-home-reveal>
            <div className="home-card-art home-card-art-destination" aria-hidden="true">
              <Image
                className="home-destination-image"
                src="/images/ha-giang-destination-card.webp"
                alt=""
                fill
                sizes="(max-width: 640px) calc(100vw - 28px), (max-width: 1020px) calc(50vw - 48px), 400px"
              />
              <span className="home-card-icon"><MapPin size={21} /></span>
            </div>
            <div className="home-card-content"><h3>Khám phá điểm đến</h3><p>Xem khu vực, giờ hoạt động và thời lượng tham quan để hiểu thêm về nơi bạn muốn đến.</p><Link href="/explore" className="home-card-link">Xem các điểm đến <ArrowRight size={16} aria-hidden="true" /></Link></div>
          </article>

          <article className="home-card" data-home-reveal>
            <div className="home-card-art home-card-art-culture" aria-hidden="true">
              <div className="home-culture-photo">
                <Image
                  className="home-culture-image"
                  src="/images/ha-giang-culture-card.webp"
                  alt=""
                  fill
                  sizes="(max-width: 640px) 140px, (max-width: 1020px) 180px, 160px"
                />
              </div>
              <span className="home-card-icon home-card-icon-warm"><BookOpen size={21} /></span>
            </div>
            <div className="home-card-content"><h3>Tìm hiểu văn hóa</h3><p>Đọc những câu chuyện văn hóa Hà Giang và tham khảo nguồn thông tin khi có.</p><Link href="/explore" className="home-card-link">Khám phá văn hóa <ArrowRight size={16} aria-hidden="true" /></Link></div>
          </article>

          <article className="home-card" data-home-reveal>
            <div className="home-card-art home-card-art-map" aria-hidden="true">
              <Image
                className="home-map-image"
                src="/images/ha-giang-map-card.webp"
                alt=""
                fill
                sizes="(max-width: 640px) 150px, (max-width: 1020px) 185px, 170px"
              />
              <span className="home-card-icon home-card-icon-blue"><Map size={21} /></span>
            </div>
            <div className="home-card-content"><h3>Xem vị trí trên bản đồ</h3><p>Khám phá vị trí các điểm đến và mở thông tin chi tiết trực tiếp từ bản đồ.</p><Link href="/explore?view=map" className="home-card-link">Mở bản đồ điểm đến <ArrowRight size={16} aria-hidden="true" /></Link></div>
          </article>
        </div>
      </HomeScrollReveal>
    </section>
  </main>;
}
