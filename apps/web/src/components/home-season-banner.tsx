import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { ProtectedLink } from "@/components/protected-link";
import "./home-gallery.css";

// Dải nổi bật theo mùa. Khi hết mùa hoa, đổi nội dung (hoặc ảnh) tại đây.
export default function HomeSeasonBanner() {
  return (
    <section className="home-season-section" aria-labelledby="home-season-title">
      <div className="home-season-card" data-home-reveal>
        <div className="home-season-copy">
          <p className="home-season-tag">
            <span className="home-season-dot" aria-hidden="true" />
            Mùa hoa tháng 10 – tháng 11
          </p>
          <h2 id="home-season-title">Hoa tam giác mạch đang gọi bạn lên cao nguyên đá</h2>
          <p className="home-season-desc">
            Những thảm hoa hồng – trắng phủ kín sườn núi thường nở rộ vào khoảng tháng 10 đến tháng 11, thời điểm cụ thể
            thay đổi theo thời tiết từng năm. Hỏi trợ lý AI để biết nên đi đâu, hoặc lập luôn hành trình ngắm hoa.
          </p>
          <div className="home-season-actions">
            <Link className="home-cta home-cta-primary" href={"/assistant" as Route}>
              <Sparkles size={18} aria-hidden="true" />
              <span>Hỏi trợ lý về mùa hoa</span>
              <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
            </Link>
            <ProtectedLink className="home-cta home-season-secondary" href="/trips/new" intent="planner">
              <CalendarDays size={18} aria-hidden="true" />
              <span>Lập hành trình ngắm hoa</span>
            </ProtectedLink>
          </div>
        </div>

        <div className="home-season-photo">
          <Image
            src="/images/gallery/ha-giang-season-buckwheat.webp"
            alt="Cánh đồng hoa tam giác mạch hồng trắng trải dài đến những ngọn núi xanh"
            fill
            sizes="(max-width: 900px) 100vw, 46vw"
          />
        </div>
      </div>
    </section>
  );
}
