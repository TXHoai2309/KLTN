import { mvpFeatures } from "@/lib/mvp-features";
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
import type { PublicLocation } from "@/modules/destination/public-destination-list";
import { listPublicHomeDestinations } from "@/modules/destination/public-home-destinations";
import HomeExploreMap from "@/components/home-explore-map";
import HomeHeroVideo from "@/components/home-hero-video";
import HomePlannerStory from "@/components/home-planner-story";
import HomeHeroMetrics from "@/components/home-hero-metrics";
import HomeGallery from "@/components/home-gallery";
import HomeSeasonBanner from "@/components/home-season-banner";
import HomeStepsScroll from "@/components/home-steps-scroll";
import HomeAssistantSimulation from "@/components/home-assistant-simulation";
import HomeBackToTop from "@/components/home-back-to-top";
import { ProtectedLink } from "@/components/protected-link";
import "./home.css";
import "@/components/home-polish.css";

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
  // Fetch verified public destinations from DB via existing service
  let destinations: PublicLocation[] = [];
  let descriptions: Record<string, string> = {};
  try {
    ({ destinations, descriptions } = await listPublicHomeDestinations(db));
  } catch {
    destinations = [];
  }

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
            <Link className="home-cta home-cta-frosted home-cta-hero-map" href={"/explore?view=map" as Route}>
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
      </section>

      <HomeScrollReveal>

        {/* SECTION 2: ẢNH ĐIỂM ĐẾN VÀ DẢI MÙA HOA */}
        <HomeGallery />
        <HomeSeasonBanner />

        {/* SECTION 3: HOW IT WORKS / QUY TRÌNH ĐƠN GIẢN (Section cuộn bước ghim căn giữa) */}
        <HomeStepsScroll />

        {/* SECTION 4: DISCOVER HÀ GIANG — MAP AND DESTINATION LIST */}
        <section className="home-explore" aria-labelledby="home-explore-title">
          <div className="home-section-heading" data-home-reveal>
            <p className="home-eyebrow home-eyebrow-coral">BẮT ĐẦU HÀNH TRÌNH</p>
            <h2 id="home-explore-title">Những nơi đáng để khám phá</h2>
            <p>
              Khám phá cảnh quan kỳ vĩ, danh thắng lịch sử và những nét đẹp đặc trưng của vùng cao nguyên đá địa đầu Tổ quốc.
            </p>
          </div>

          {destinations.length > 0 ? (
            <HomeExploreMap destinations={destinations} descriptions={descriptions} />
          ) : (
            /* Fallback when offline or no DB rows returned */
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
                  <p>Khám phá vị trí các điểm đến và mở thông tin chi tiết trực tiếp từ bản đồ.</p>
                  <Link href={"/explore?view=map" as Route} className="home-card-link">
                    Mở bản đồ điểm đến <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </div>
          )}

          <div className="home-explore-footer" data-home-reveal>
            <Link href={"/explore?view=map" as Route} className="home-link-pill home-map-cta-pill">
              <Map size={17} aria-hidden="true" />
              <span>Mở bản đồ khám phá</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* SECTION 3: AI TRAVEL ASSISTANT SHOWCASE (Lavender × Emerald) */}
        <section className="home-assistant-section" aria-labelledby="home-assistant-title">
          <div className="home-showcase-grid">
            <div className="home-showcase-copy" data-home-reveal>
              <p className="home-eyebrow home-eyebrow-lavender">TRỢ LÝ DU LỊCH THÔNG MINH</p>
              <h2 id="home-assistant-title" className="home-assistant-editorial-title">
                Hỏi bất kỳ điều gì về Hà Giang.
                <em>Nhận câu trả lời có dẫn chứng nguồn.</em>
              </h2>
              <p className="home-showcase-desc">
                Hỏi về thời tiết, mùa hoa hay cung đèo hiểm trở. Mọi giải đáp đều được đối chiếu trực tiếp từ kho tư liệu đã kiểm chứng.
              </p>

              <div className="home-showcase-cta-group home-assistant-desktop-action">
                <Link className="home-cta home-cta-primary home-cta-lavender" href={"/assistant" as Route}>
                  <Sparkles size={17} aria-hidden="true" />
                  <span>Trò chuyện với Trợ lý AI</span>
                  <ArrowRight className="home-cta-arrow" size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="home-showcase-preview" data-home-reveal>
              <HomeAssistantSimulation />

              {/* Nút hành động đặt dưới thẻ chat theo yêu cầu trên mobile */}
              <div className="home-assistant-mobile-action">
                <div className="home-showcase-cta-group">
                  <Link className="home-cta home-cta-primary home-cta-lavender" href={"/assistant" as Route}>
                    <Sparkles size={18} aria-hidden="true" />
                    <span>Trò chuyện với Trợ lý AI</span>
                    <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: SMART TRIP PLANNER SHOWCASE (Peach Cream × Golden Sun × Coral) */}
        <section className="home-planner-section" aria-labelledby="home-planner-title">
          <HomePlannerStory
            intro={
              <>
                <p className="home-eyebrow home-eyebrow-coral">LẬP HÀNH TRÌNH TỐI ƯU</p>
                <h2 id="home-planner-title" className="home-planner-editorial-title">
                  Hành trình riêng biệt.
                  <em>Thiết kế cho từng bước chân.</em>
                </h2>
                <p className="home-showcase-desc">
                  Hệ thống tự động sắp xếp lộ trình vừa vặn với số ngày và phương tiện của bạn.
                </p>
              </>
            }
            action={
              <div className="home-showcase-cta-group">
                <ProtectedLink className="home-cta home-cta-primary home-cta-coral" href="/trips/new" intent="planner">
                  <CalendarDays size={18} aria-hidden="true" />
                  <span>Tự tạo hành trình của bạn</span>
                  <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                </ProtectedLink>
              </div>
            }
          />
        </section>




        {/* SECTION 7: FINAL CTA (Deep Forest × Golden Sun) */}
        <section className="home-final-cta-section" aria-labelledby="home-final-cta-title">
          <div className="home-final-cta" data-home-reveal>
            <div className="home-final-ambient" aria-hidden="true" />
            <svg className="home-final-topo" aria-hidden="true" viewBox="0 0 1200 400" preserveAspectRatio="none">
              <path d="M0,280 Q300,160 600,240 T1200,180 L1200,400 L0,400 Z" fill="rgba(233,185,75,0.06)" />
              <path d="M0,320 Q400,200 800,290 T1200,230 L1200,400 L0,400 Z" fill="rgba(255,255,255,0.04)" />
              <path d="M0,360 Q350,260 700,340 T1200,300 L1200,400 L0,400 Z" fill="rgba(233,185,75,0.08)" />
            </svg>
            <div className="home-final-copy">
              <p className="home-eyebrow home-eyebrow-gold">SẴN SÀNG CHO CHUYẾN ĐI</p>
              <h2 id="home-final-cta-title">
                Chuyến đi Hà Giang của bạn
                <span>bắt đầu từ đây.</span>
              </h2>
              <p>
                Khám phá cảnh sắc núi non hùng vĩ, trải nghiệm văn hóa bản địa độc đáo và xây dựng hành trình đáng nhớ ngay hôm nay.
              </p>
              <div className="home-final-actions">
                <Link className="home-cta home-cta-primary home-cta-gold" href="/explore">
                  <Compass size={18} aria-hidden="true" />
                  <span>Khám phá ngay</span>
                  <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                </Link>
                <ProtectedLink className="home-cta home-cta-secondary home-cta-frosted" href="/trips/new" intent="planner">
                  <PlusCircle size={18} aria-hidden="true" />
                  <span>Lập hành trình</span>
                </ProtectedLink>
              </div>
            </div>
          </div>
        </section>

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
                  <li><Link href="/explore?view=map">Bản đồ số điểm đến</Link></li>
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
