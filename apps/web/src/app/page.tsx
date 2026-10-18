import { mvpFeatures } from "@/lib/mvp-features";
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Map,
  MapPin,
  Mountain,
  PlusCircle,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import HomeScrollReveal from "@/components/home-scroll-reveal";
import { BrandLogo } from "@/components/brand-logo";
import { db } from "@/services";
import {
  listPublicLocations,
  parsePublicListQuery,
  type PublicLocation,
} from "@/modules/destination/public-destination-list";
import HomeExploreMap from "@/components/home-explore-map";
import HomeHeroVideo from "@/components/home-hero-video";
import HomeHeroMetrics from "@/components/home-hero-metrics";
import { ProtectedLink } from "@/components/protected-link";
import "./home.css";

export const metadata: Metadata = {
  title: "Hà Giang Travel Assistant | Khám phá Hà Giang theo cách của bạn",
  description:
    "Khám phá những điểm đến đặc sắc, tìm hiểu câu chuyện văn hóa và xây dựng hành trình phù hợp với sở thích của riêng bạn trên cao nguyên đá Hà Giang.",
};

export default async function Home() {
  // Fetch verified public destinations from DB via existing service
  let destinations: PublicLocation[] = [];
  try {
    const data = await listPublicLocations(
      parsePublicListQuery(new URLSearchParams()),
      db,
    );
    destinations = data.items;
  } catch {
    destinations = [];
  }

  // Pre-fetch concise descriptions for floating map preview & verified highlights
  const descriptions: Record<string, string> = {};
  if (destinations.length > 0) {
    try {
      const details = await db.destination.findMany({
        where: { id: { in: destinations.map((d) => d.id) } },
        select: { id: true, description: true },
      });
      for (const d of details) {
        if (d.description && d.description.trim()) {
          const raw = d.description.trim().replace(/\s+/g, " ");
          descriptions[d.id] = raw.length > 130 ? `${raw.slice(0, 127)}...` : raw;
        }
      }
    } catch {
      // Graceful fallback to default description template
    }
  }

  return (
    <main className="home-page" lang="vi">
      {/* SECTION 1: HERO EXPERIENCE (Cinematic Highland Drone Video & Editorial Storytelling) */}
      <section className="home-hero" aria-labelledby="home-title">
        <HomeHeroVideo
          src="/videos/ha-giang-highland-clouds.mp4"
          poster="/images/ha-giang-highland-poster.png"
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

        {/* SECTION 4: DISCOVER HÀ GIANG — SINGLE INTERACTIVE MAP */}
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
              <h2 id="home-assistant-title">
                Hỏi bất kỳ điều gì về Hà Giang.
                <span>Nhận câu trả lời có dẫn chứng nguồn.</span>
              </h2>
              <p className="home-showcase-desc">
                Tra cứu thời tiết, mùa hoa tam giác mạch hay tình trạng cung đèo hiểm trở. Trợ lý AI đối chiếu trực tiếp từ kho tri thức du lịch địa phương, đồng thời minh bạch chỉ rõ các thông tin chưa đủ cơ sở xác thực.
              </p>

              <ul className="home-feature-list" aria-label="Năng lực nổi bật của Trợ lý AI">
                <li>
                  <div className="home-feature-icon-badge home-badge-lavender" aria-hidden="true">
                    <CheckCircle2 size={18} />
                  </div>
                  <span><strong>Tham khảo có dẫn nguồn:</strong> Mọi câu trả lời đều đối chiếu tài liệu văn hóa &amp; cẩm nang du lịch kiểm định.</span>
                </li>
                <li>
                  <div className="home-feature-icon-badge home-badge-lavender" aria-hidden="true">
                    <CheckCircle2 size={18} />
                  </div>
                  <span><strong>Cảnh báo an toàn đường đèo:</strong> Cập nhật khuyến cáo thực tế khi lái xe qua các cung đường dốc đá.</span>
                </li>
                <li>
                  <div className="home-feature-icon-badge home-badge-lavender" aria-hidden="true">
                    <CheckCircle2 size={18} />
                  </div>
                  <span><strong>Minh bạch độ tin cậy:</strong> Không suy diễn dữ liệu khi tài liệu gốc chưa có đủ thông tin đối chiếu.</span>
                </li>
              </ul>

              <div className="home-showcase-cta-group">
                <Link className="home-cta home-cta-primary home-cta-lavender" href={"/assistant" as Route}>
                  <Sparkles size={18} aria-hidden="true" />
                  <span>Trò chuyện với Trợ lý AI</span>
                  <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="home-showcase-preview" data-home-reveal>
              <div className="home-ai-mockup">
                <div className="home-mockup-header">
                  <div className="home-mockup-brand">
                    <span className="home-mockup-dot-indicator" aria-hidden="true" />
                    <Sparkles size={16} className="home-mockup-sparkle" aria-hidden="true" />
                    <strong>Trợ lý AI Hà Giang</strong>
                  </div>
                  <span className="home-mockup-badge home-mockup-badge-lavender">Hội thoại minh họa</span>
                </div>

                <div className="home-ai-conversation" aria-label="Ví dụ minh họa cuộc hội thoại">
                  {/* User Bubble */}
                  <div className="home-ai-turn home-ai-user-turn">
                    <div className="home-ai-user-bubble">
                      <p>Tháng 10 đi Hà Giang có hoa tam giác mạch chưa và cần chuẩn bị thời tiết thế nào?</p>
                      <small className="home-ai-bubble-meta">09:15 · Du khách</small>
                    </div>
                  </div>

                  {/* Assistant Bubble */}
                  <div className="home-ai-turn home-ai-bot-turn">
                    <div className="home-ai-bot-bubble">
                      <div className="home-ai-speaker">
                        <Sparkles size={14} className="home-ai-speaker-icon" aria-hidden="true" />
                        <span>Trợ lý Hà Giang Travel</span>
                      </div>
                      <p className="home-ai-answer-text">
                        Tháng 10 là thời điểm tam giác mạch bắt đầu nở rộ tại cao nguyên đá Đồng Văn, Lũng Cú và thung lũng Sủng Là. Ban ngày trời khô ráo, se lạnh dễ chịu (18–24°C), ban đêm nhiệt độ có thể xuống 13–15°C. Bạn nên mang thêm áo gió cản sương và găng tay khi đi đèo.
                      </p>

                      <div className="home-ai-citation-box">
                        <div className="home-ai-citation-title">
                          <FileText size={14} aria-hidden="true" />
                          <span>Tài liệu tham khảo đối chiếu:</span>
                          <span className="home-ai-citation-pill">[1]</span>
                        </div>
                        <p className="home-ai-citation-desc">
                          Cẩm nang Du lịch &amp; Khí hậu Hà Giang · Mục 3.2 Chu kỳ mùa hoa &amp; thời tiết cao nguyên.
                        </p>
                      </div>

                      <div className="home-ai-verified-notice">
                        <ShieldCheck size={14} aria-hidden="true" />
                        <span>Trích đoạn minh họa đối chiếu RAG Hà Giang từ tài liệu công khai.</span>
                      </div>
                    </div>
                  </div>

                  {/* Follow-up suggestions */}
                  <div className="home-ai-suggestions">
                    <span className="home-ai-suggestion-chip">Đi xe máy cung Đồng Văn cần chuẩn bị gì?</span>
                    <span className="home-ai-suggestion-chip">Ẩm thực chợ phiên vùng cao có gì đặc sắc?</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: SMART TRIP PLANNER SHOWCASE (Peach Cream × Golden Sun × Coral) */}
        <section className="home-planner-section" aria-labelledby="home-planner-title">
          <div className="home-showcase-grid home-showcase-grid-reversed">
            <div className="home-showcase-copy" data-home-reveal>
              <p className="home-eyebrow home-eyebrow-coral">LẬP HÀNH TRÌNH TỐI ƯU</p>
              <h2 id="home-planner-title">
                Hành trình riêng biệt.
                <span>Thiết kế cho từng bước chân.</span>
              </h2>
              <p className="home-showcase-desc">
                Không cần phải tự mò mẫm sắp xếp từng điểm dừng hay lo lắng lạc đường trên cung đèo núi. Hệ thống sắp xếp lộ trình logic, vừa vặn với số ngày và phương tiện của bạn.
              </p>

              <div className="home-planner-steps" role="list">
                <div className="home-planner-step-item" role="listitem">
                  <span className="home-planner-step-num home-step-coral">1</span>
                  <div>
                    <strong>Tùy chọn thời gian &amp; phương tiện</strong>
                    <p>Hỗ trợ lịch trình 2–5 ngày linh hoạt bằng xe máy hoặc ô tô du lịch.</p>
                  </div>
                </div>
                <div className="home-planner-step-item" role="listitem">
                  <span className="home-planner-step-num home-step-gold">2</span>
                  <div>
                    <strong>Chọn gu trải nghiệm yêu thích</strong>
                    <p>Khám phá thắng cảnh kỳ vĩ, hòa mình vào văn hóa bản làng hay nghỉ dưỡng thong dong.</p>
                  </div>
                </div>
                <div className="home-planner-step-item" role="listitem">
                  <span className="home-planner-step-num home-step-teal">3</span>
                  <div>
                    <strong>Tối ưu hóa cung đường thực tế</strong>
                    <p>Sắp xếp thứ tự các điểm dừng logic theo địa lý, đảm bảo nhịp di chuyển thoải mái và an toàn.</p>
                  </div>
                </div>
              </div>

              <div className="home-showcase-cta-group">
                <ProtectedLink className="home-cta home-cta-primary home-cta-coral" href="/trips/new" intent="planner">
                  <CalendarDays size={18} aria-hidden="true" />
                  <span>Tự tạo hành trình của bạn</span>
                  <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                </ProtectedLink>
              </div>
            </div>

            <div className="home-showcase-preview" data-home-reveal>
              <div className="home-planner-mockup">
                <div className="home-mockup-header">
                  <div className="home-mockup-brand">
                    <RouteIcon size={16} className="home-mockup-icon" aria-hidden="true" />
                    <strong>Lịch trình đề xuất mẫu · 3 Ngày 2 Đêm</strong>
                  </div>
                  <span className="home-mockup-badge home-mockup-badge-peach">Xe máy · Cảnh quan &amp; Bản địa</span>
                </div>

                <div className="home-planner-timeline-preview">
                  <div className="home-planner-preference-pills" aria-label="Thông số hành trình mẫu">
                    <span className="home-planner-pill home-planner-pill-car"><Car size={12} aria-hidden="true" /> Xe máy / Ô tô</span>
                    <span className="home-planner-pill home-planner-pill-pace"><Clock size={12} aria-hidden="true" /> 3 Ngày 2 Đêm</span>
                    <span className="home-planner-pill home-planner-pill-theme"><Mountain size={12} aria-hidden="true" /> Cảnh quan &amp; Văn hóa</span>
                  </div>

                  <div className="home-timeline-list">
                    <div className="home-timeline-stop">
                      <div className="home-timeline-indicator">
                        <span className="home-timeline-dot home-dot-coral" />
                        <span className="home-timeline-line" />
                      </div>
                      <div className="home-timeline-body">
                        <div className="home-timeline-header">
                          <span className="home-timeline-day">Ngày 1</span>
                          <span className="home-timeline-time">Khởi hành · Chạm ngõ Cao nguyên</span>
                        </div>
                        <div className="home-timeline-name">TP. Hà Giang → Quản Bạ → Rừng thông Yên Minh</div>
                        <p className="home-timeline-desc">Chiêm ngưỡng thung lũng Tam Sơn, vượt dốc Bắc Sum và nghỉ chân tại thị trấn vùng cao.</p>
                      </div>
                    </div>

                    <div className="home-timeline-stop">
                      <div className="home-timeline-indicator">
                        <span className="home-timeline-dot home-dot-gold" />
                        <span className="home-timeline-line" />
                      </div>
                      <div className="home-timeline-body">
                        <div className="home-timeline-header">
                          <span className="home-timeline-day">Ngày 2</span>
                          <span className="home-timeline-time">Kỳ vĩ · Trái tim Di sản UNESCO</span>
                        </div>
                        <div className="home-timeline-name">Dinh họ Vương → Cột cờ Lũng Cú → Đèo Mã Pí Lèng</div>
                        <p className="home-timeline-desc">Chạm mốc cực Bắc Tổ quốc, chinh phục hẻm Tu Sản và ngắm hoàng hôn rực rỡ sông Nho Quế.</p>
                      </div>
                    </div>

                    <div className="home-timeline-stop">
                      <div className="home-timeline-indicator">
                        <span className="home-timeline-dot home-dot-teal" />
                      </div>
                      <div className="home-timeline-body">
                        <div className="home-timeline-header">
                          <span className="home-timeline-day">Ngày 3</span>
                          <span className="home-timeline-time">Trải nghiệm · Chợ phiên &amp; Vòng về</span>
                        </div>
                        <div className="home-timeline-name">Mèo Vạc → Cua chữ M → Thác Du Già → TP. Hà Giang</div>
                        <p className="home-timeline-desc">Thưởng thức ẩm thực chợ phiên buổi sớm, thư giãn bên dòng thác và hoàn thành cung đường chữ M.</p>
                      </div>
                    </div>
                  </div>

                  <div className="home-planner-validation-banner">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>Lộ trình đề xuất minh họa theo nhịp di chuyển thực tế và đặc điểm đường đèo Hà Giang</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
          <div className="home-footer-inner">
            <div className="home-footer-brand-col">
              <Link href="/" className="home-footer-brand" aria-label="Hà Giang Travel Assistant - Trang chủ">
                <BrandLogo size={36} />
                <div className="home-footer-brand-text">
                  <strong>Hà Giang</strong>
                  <span>Travel Assistant</span>
                </div>
              </Link>
              <p className="home-footer-desc">
                Nền tảng hỗ trợ thông tin du lịch, tra cứu tri thức địa phương có dẫn nguồn và lập kế hoạch hành trình thông minh tại Hà Giang.
              </p>
            </div>

            <div className="home-footer-nav-group">
              <div className="home-footer-nav-col">
                <h4 className="home-footer-heading">Khám phá</h4>
                <ul className="home-footer-links">
                  <li><Link href="/explore">Điểm đến Hà Giang</Link></li>
                  <li><Link href="/explore?view=map">Bản đồ điểm đến</Link></li>
                  <li><ProtectedLink href="/favorites" intent="favorites">Điểm đến yêu thích</ProtectedLink></li>
                  {mvpFeatures.culture && <li><Link href={"/culture" as Route}>Văn hóa Hà Giang</Link></li>}
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
            </div>
          </div>

          <div className="home-footer-bottom">
            <p>© 2026 Hà Giang Travel Assistant · Đồ án Khóa luận tốt nghiệp</p>
            <p className="home-footer-bottom-meta">Hệ thống hỗ trợ du lịch &amp; tra cứu tri thức đối chiếu</p>
          </div>
        </footer>
      </HomeScrollReveal>
    </main>
  );
}
