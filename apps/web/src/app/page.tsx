import { mvpFeatures } from "@/lib/mvp-features";
import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import type { Route } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Compass,
  FileText,
  Map,
  MapPin,
  PlusCircle,
  Route as RouteIcon,
  Sparkles,
} from "lucide-react";
import HomeScrollReveal from "@/components/home-scroll-reveal";
import { BrandLogo } from "@/components/brand-logo";
import { db } from "@/services";
import { listPublicHomeDestinations } from "@/modules/destination/public-home-destinations";
import HomeExploreMap, { HomeExploreMapLoading } from "@/components/home-explore-map";
import HomeHeroVideo from "@/components/home-hero-video";
import HomeHeroMetrics from "@/components/home-hero-metrics";
import HomeGallery from "@/components/home-gallery";
import HomeSeasonBanner from "@/components/home-season-banner";
import { HomeAssistantSection, HomeItinerarySection } from "@/components/home-sections";
import { HomeFaqSection, HomeRoutesSection } from "@/components/home-extra-sections";
import HomeBackToTop from "@/components/home-back-to-top";
import { ProtectedLink } from "@/components/protected-link";
import "./home.css";
import "@/components/home-polish.css";
import "@/components/home-wow.css";
import "@/components/home-sections.css";

export const metadata: Metadata = {
  title: "Hà Giang Travel Assistant | Khám phá Hà Giang theo cách của bạn",
  description:
    "Khám phá những điểm đến đặc sắc, tìm hiểu câu chuyện văn hóa và xây dựng hành trình phù hợp với sở thích của riêng bạn trên cao nguyên đá Hà Giang.",
};

export default async function Home() {
  // Destination content must reflect the current database after CMS/import writes.
  // Keep this request boundary outside the data fallback so prerender control
  // flow is not swallowed. Other routes and static assets keep their cache policy.
  await connection();
  // Start the request-fresh read now; only the map and empty state await it.
  // The hero and static sections can stream while the database is pending.
  const destinationData = listPublicHomeDestinations(db).catch(() => ({
    destinations: [], descriptions: {},
  }));

  return (
    <main className="home-page" lang="vi">
      {/* SECTION 1: HERO EXPERIENCE (Cinematic Highland Drone Video & Editorial Storytelling) */}
      <section className="home-hero" aria-labelledby="home-title">
        <HomeHeroVideo
          src="/videos/ha-giang-highland-clouds.mp4"
          poster="/images/ha-giang-highland-poster.webp"
        />

        <div className="home-hero-copy">
          <p className="home-eyebrow home-hero-enter home-delay-0">
            HÀ GIANG <span>·</span> TRAVEL ASSISTANT
          </p>
          <h1 id="home-title" className="home-hero-title home-hero-enter home-delay-1">
            Nơi đá nở hoa,
            <span>nơi mây ôm trọn núi.</span>
          </h1>
          <p className="home-hero-description home-hero-enter home-delay-2">
            Từ những tầng ruộng bậc thang kỳ vĩ uốn lượn giữa biển mây Hoàng Su Phì đến hẻm Tu Sản xanh ngọc dòng Nho Quế, trợ lý AI đồng hành giúp bạn tìm hiểu văn hóa bản địa và thiết kế hành trình khám phá trọn vẹn theo cách của riêng bạn.
          </p>

          <div className="home-hero-actions home-hero-enter home-delay-3">
            <Link className="home-cta home-cta-primary home-cta-hero-primary" href="/explore">
              <Compass size={19} aria-hidden="true" />
              <span>Khám phá điểm đến</span>
              <ArrowRight className="home-cta-arrow" size={18} aria-hidden="true" />
            </Link>
            <ProtectedLink className="home-cta home-cta-secondary home-cta-hero-secondary" href="/trips/new" intent="planner">
              <CalendarDays size={18} aria-hidden="true" />
              <span>Lập hành trình</span>
            </ProtectedLink>
            <Link className="home-cta home-cta-frosted home-cta-hero-map" href="#home-explore-title">
              <Map size={18} aria-hidden="true" />
              <span>Mở bản đồ</span>
            </Link>
          </div>

          {/* UNESCO Geopark & Culture Heritage Metrics Ribbon */}
          <HomeHeroMetrics />

          {/* AI Feature Trust Pills */}
          <ul className="home-quick-info home-hero-enter home-delay-4" aria-label="Đặc quyền trải nghiệm nền tảng">
            <li className="home-quick-coral">
              <span className="home-quick-icon-wrap" aria-hidden="true">
                <MapPin size={13} />
              </span>
              <span>
                <small>Điểm đến</small>
                <strong>Đã kiểm chứng</strong>
              </span>
            </li>
            <li className="home-quick-lavender">
              <span className="home-quick-icon-wrap" aria-hidden="true">
                <Sparkles size={13} />
              </span>
              <span>
                <small>Trợ lý AI</small>
                <strong>Có dẫn nguồn</strong>
              </span>
            </li>
            <li className="home-quick-teal">
              <span className="home-quick-icon-wrap" aria-hidden="true">
                <RouteIcon size={13} />
              </span>
              <span>
                <small>Hành trình</small>
                <strong>Cá nhân hóa</strong>
              </span>
            </li>
          </ul>
        </div>

        <aside className="home-hero-floats" aria-label="Gợi ý nổi bật">
          <Link href="/explore" className="home-float-card home-float-card-place">
            <span className="home-float-kicker"><MapPin size={12} aria-hidden="true" /> Đang nổi bật</span>
            <strong>Ruộng bậc thang Hoàng Su Phì</strong>
            <span className="home-float-meta">Mùa lúa chín · biển mây buổi sáng</span>
            <span className="home-float-go" aria-hidden="true"><ArrowRight size={14} /></span>
          </Link>
          <Link href={"/assistant" as Route} className="home-float-card home-float-card-ai">
            <span className="home-float-kicker"><Sparkles size={12} aria-hidden="true" /> Trợ lý AI</span>
            <strong>“Hà Giang đẹp nhất mùa nào?”</strong>
            <span className="home-float-meta">Hỏi ngay · có dẫn nguồn</span>
            <span className="home-float-go" aria-hidden="true"><ArrowRight size={14} /></span>
          </Link>
        </aside>

        <a href="#home-places-marquee" className="home-scroll-cue" aria-label="Cuộn xuống khám phá">
          <span className="home-scroll-cue-dot" aria-hidden="true" />
        </a>
      </section>

      <div id="home-places-marquee" className="home-marquee" aria-label="Những địa danh nổi bật của Hà Giang">
        <div className="home-marquee-track">
          {[0, 1].map((copy) => (
            <ul key={copy} className="home-marquee-list" aria-hidden={copy === 1 ? "true" : undefined}>
              {[
                "Cột cờ Lũng Cú",
                "Đèo Mã Pí Lèng",
                "Hẻm Tu Sản",
                "Sông Nho Quế",
                "Ruộng bậc thang Hoàng Su Phì",
                "Phố cổ Đồng Văn",
                "Dinh thự họ Vương",
                "Núi Đôi Quản Bạ",
              ].map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <HomeScrollReveal>

        {/* SECTION 2: ẢNH ĐIỂM ĐẾN VÀ DẢI MÙA HOA */}
        <HomeGallery />
        <HomeSeasonBanner />

        {/* SECTION 3: HOW IT WORKS / QUY TRÌNH ĐƠN GIẢN */}
        <section className="home-steps-section" aria-labelledby="home-steps-title">
          <div className="home-section-heading" data-home-reveal>
            <p className="home-eyebrow">QUY TRÌNH ĐƠN GIẢN</p>
            <h2 id="home-steps-title">Bắt đầu chuyến đi của bạn chỉ với vài bước</h2>
            <p>Ba bước liền mạch để chuẩn bị chu đáo cho hành trình chinh phục vùng đất địa đầu Tổ quốc.</p>
          </div>

          <div className="home-steps-grid">
            <article className="home-step-card home-step-card-peach" data-home-reveal>
              <div className="home-step-header">
                <span className="home-step-index">01</span>
                <span className="home-step-icon"><Compass size={22} aria-hidden="true" /></span>
              </div>
              <h3>Khám phá điểm đến</h3>
              <p>
                Tra cứu danh lam thắng cảnh theo khu vực, thời lượng tham quan khuyến nghị và tìm hiểu thông tin cảnh sắc đặc trưng.
              </p>
              <Link href="/explore" className="home-step-link">
                <span>Khám phá điểm đến</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>

            <article className="home-step-card home-step-card-lavender" data-home-reveal>
              <div className="home-step-header">
                <span className="home-step-index">02</span>
                <span className="home-step-icon"><Sparkles size={22} aria-hidden="true" /></span>
              </div>
              <h3>Tìm hiểu thông tin với trợ lý AI</h3>
              <p>
                Đặt câu hỏi về văn hóa, mùa hoa, thời tiết và nhận giải đáp có đối chiếu nguồn tài liệu uy tín từ hệ thống RAG.
              </p>
              <Link href={"/assistant" as Route} className="home-step-link">
                <span>Trò chuyện với AI</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>

            <article className="home-step-card home-step-card-teal" data-home-reveal>
              <div className="home-step-header">
                <span className="home-step-index">03</span>
                <span className="home-step-icon"><RouteIcon size={22} aria-hidden="true" /></span>
              </div>
              <h3>Xây dựng hành trình phù hợp</h3>
              <p>
                Cung cấp thời gian, phương tiện và sở thích để nhận đề xuất lộ trình tối ưu đã được kiểm tra tính khả thi.
              </p>
              <ProtectedLink href="/trips/new" intent="planner" className="home-step-link">
                <span>Lập hành trình mới</span>
                <ArrowRight size={14} aria-hidden="true" />
              </ProtectedLink>
            </article>
          </div>
        </section>

        <HomeRoutesSection />

        {/* MAP: full-width map + destination list */}
        <section className="hx-map" aria-labelledby="home-explore-title">
          <div className="hx-heading" data-home-reveal>
            <h2 id="home-explore-title">Những nơi đáng để khám phá</h2>
            <p>Kéo bản đồ để xem Hà Giang, hoặc chọn một điểm trong danh sách để đọc nhanh giới thiệu.</p>
          </div>
          <div className="hx-map-stage" data-home-reveal>
            <Suspense fallback={<HomeTerrainLoading />}>
              <HomeTerrainData data={destinationData} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <HomeEmptyDestinations data={destinationData} />
          </Suspense>
          <div className="hx-actions" data-home-reveal>
            <Link href="/explore" className="home-cta home-cta-primary">
              <Compass size={18} aria-hidden="true" />
              <span>Xem tất cả điểm đến</span>
              <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <HomeAssistantSection />
        <HomeItinerarySection />

        <HomeFaqSection />

        {/* SITE FOOTER */}
        <footer className="home-footer" role="contentinfo">
          {/* Highlights bar: Tri thức, Bản đồ, Trợ lý AI */}
          <div className="home-footer-highlights">
            <div className="home-footer-highlight-item">
              <div className="home-footer-highlight-icon">
                <BookOpen size={18} aria-hidden="true" />
              </div>
              <div className="home-footer-highlight-text">
                <strong>Tri thức đối chiếu</strong>
                <span>100% trích xuất từ dữ liệu kiểm chứng</span>
              </div>
            </div>
            <div className="home-footer-highlight-divider" aria-hidden="true" />
            <div className="home-footer-highlight-item">
              <div className="home-footer-highlight-icon">
                <MapPin size={18} aria-hidden="true" />
              </div>
              <div className="home-footer-highlight-text">
                <strong>Bản đồ số tương tác</strong>
                <span>Định tuyến chuẩn địa hình đèo dốc</span>
              </div>
            </div>
            <div className="home-footer-highlight-divider" aria-hidden="true" />
            <div className="home-footer-highlight-item">
              <div className="home-footer-highlight-icon">
                <Sparkles size={18} aria-hidden="true" />
              </div>
              <div className="home-footer-highlight-text">
                <strong>Trợ lý AI đồng hành</strong>
                <span>Giải đáp ngữ cảnh địa phương 24/7</span>
              </div>
            </div>
          </div>

          <div className="home-footer-inner">
            <div className="home-footer-brand-col">
              <Link href="/" className="home-footer-brand" aria-label="Hà Giang Travel Assistant - Trang chủ">
                <BrandLogo size={38} />
                <div className="home-footer-brand-text">
                  <strong>Hà Giang</strong>
                  <span>Travel Assistant</span>
                </div>
              </Link>
              <p className="home-footer-desc">
                Hệ thống hỗ trợ du lịch, tra cứu tri thức địa phương có dẫn nguồn và lập kế hoạch hành trình thông minh tại Hà Giang.
              </p>
              <div className="home-footer-tags">
                <span className="home-footer-tag">Tri thức bản địa</span>
                <span className="home-footer-tag">Bản đồ tương tác</span>
                <span className="home-footer-tag">Lộ trình tối ưu</span>
              </div>
            </div>

            <div className="home-footer-nav-group">
              <div className="home-footer-nav-col">
                <h4 className="home-footer-heading">Khám phá</h4>
                <ul className="home-footer-links">
                  <li><Link href="/explore">Điểm đến Hà Giang</Link></li>
                  <li><Link href="#home-explore-title">Bản đồ Hà Giang</Link></li>
                  <li><ProtectedLink href="/favorites" intent="favorites">Điểm đến yêu thích</ProtectedLink></li>
                  {mvpFeatures.culture && <li><Link href={"/culture" as Route}>Văn hóa &amp; Bản sắc</Link></li>}
                </ul>
              </div>

              <div className="home-footer-nav-col">
                <h4 className="home-footer-heading">Tính năng</h4>
                <ul className="home-footer-links">
                  <li><Link href={"/assistant" as Route}>Trợ lý AI Hà Giang</Link></li>
                  <li><ProtectedLink href="/trips/new" intent="planner">Lập hành trình mới</ProtectedLink></li>
                  <li><ProtectedLink href="/trips" intent="trips">Chuyến đi của tôi</ProtectedLink></li>
                  <li><ProtectedLink href="/dashboard" intent="dashboard">Bảng điều khiển</ProtectedLink></li>
                </ul>
              </div>

              <div className="home-footer-nav-col">
                <h4 className="home-footer-heading">Thông tin &amp; Nền tảng</h4>
                <div className="home-footer-status">
                  <span className="home-footer-status-dot" aria-hidden="true" />
                  <span>Hệ thống trực tuyến</span>
                </div>
                <ul className="home-footer-links">
                  <li><Link href={"/assistant" as Route}>Tra cứu tri thức đối chiếu</Link></li>
                  <li><ProtectedLink href="/trips/new" intent="planner">Kiểm định ràng buộc lộ trình</ProtectedLink></li>
                  <li><Link href="/explore?view=map">Dữ liệu tọa độ chuẩn hóa</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="home-footer-bottom">
            <div className="home-footer-bottom-info">
              <p>© 2026 Hà Giang Travel Assistant</p>
              <span className="home-footer-bottom-sep" aria-hidden="true">•</span>
              <p className="home-footer-bottom-meta">Hệ thống hỗ trợ du lịch &amp; tra cứu tri thức đối chiếu</p>
            </div>
            <HomeBackToTop />
          </div>
        </footer>
      </HomeScrollReveal>
    </main>
  );
}

type HomeDestinationData = Promise<Awaited<ReturnType<typeof listPublicHomeDestinations>>>;

async function HomeTerrainData({ data }: { data: HomeDestinationData }) {
  const { destinations, descriptions } = await data;
  return <HomeExploreMap destinations={destinations} descriptions={descriptions} />;
}

function HomeTerrainLoading() {
  return <HomeExploreMapLoading />;
}

async function HomeEmptyDestinations({ data }: { data: HomeDestinationData }) {
  const { destinations } = await data;
  if (destinations.length > 0) return null;
  return (
    <div className="home-card-grid" data-mvp-columns={mvpFeatures.culture ? undefined : "2"}>
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
        <div className="home-card-content">
          <h3>Khám phá điểm đến</h3>
          <p>Xem khu vực, giờ hoạt động và thời lượng tham quan để hiểu thêm về nơi bạn muốn đến.</p>
          <Link href="/explore" className="home-card-link">
            Xem các điểm đến <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </article>

      {mvpFeatures.culture && (
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
          <div className="home-card-content">
            <h3>Tìm hiểu văn hóa</h3>
            <p>Đọc những câu chuyện văn hóa Hà Giang và tham khảo nguồn thông tin khi có.</p>
            <Link href="/explore" className="home-card-link">
              Khám phá văn hóa <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </article>
      )}

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
        <div className="home-card-content">
          <h3>Xem vị trí trên bản đồ</h3>
          <p>Xem khu vực Hà Giang trên Google Maps.</p>
          <a href="https://maps.google.com/maps?q=H%C3%A0%20Giang%2C%20Vi%E1%BB%87t%20Nam" target="_blank" rel="noopener noreferrer" className="home-card-link">
            Mở bản đồ Hà Giang <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </article>
    </div>
  );
}
