import { mvpFeatures } from "@/lib/mvp-features";
import type { Metadata } from "next";
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
import { destinationThumbnail } from "@/modules/destination/destination-image-url";
import { destinationDetailHref } from "@/modules/map/map-model";
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

  const featured = destinations[0] ?? null;
  const secondary = destinations.slice(1, 3);

  return (
    <main className="home-page" lang="vi">
      {/* SECTION 1: HERO EXPERIENCE */}
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-visual" aria-hidden="true">
          <Image
            className="home-hero-image"
            src="/images/ha-giang-hero.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 640px) 100vw, (max-width: 1352px) calc(100vw - 32px), 1520px"
          />
          <div className="home-scene-label">
            <span aria-hidden="true" />
            Cao nguyên đá · Hà Giang
          </div>
        </div>

        <div className="home-hero-copy">
          <p className="home-eyebrow home-hero-enter home-delay-0">
            HÀ GIANG <span>·</span> TRAVEL ASSISTANT
          </p>
          <h1 id="home-title" className="home-hero-title home-hero-enter home-delay-1">
            Khám phá Hà Giang
            <span>theo cách của bạn</span>
          </h1>
          <p className="home-hero-description home-hero-enter home-delay-2">
            Khám phá những điểm đến đặc sắc, tìm hiểu câu chuyện văn hóa và xây dựng hành trình phù hợp với sở thích của riêng bạn.
          </p>

          <div className="home-hero-actions home-hero-enter home-delay-3">
            <Link className="home-cta home-cta-primary" href="/explore">
              <Compass size={19} aria-hidden="true" />
              <span>Khám phá điểm đến</span>
              <ArrowRight className="home-cta-arrow" size={18} aria-hidden="true" />
            </Link>
            <Link className="home-cta home-cta-secondary" href={"/trips/new" as Route}>
              <CalendarDays size={18} aria-hidden="true" />
              <span>Lập hành trình</span>
            </Link>
          </div>

          <ul className="home-quick-info home-hero-enter home-delay-4" aria-label="Điều bạn có thể khám phá">
            <li>
              <MapPin aria-hidden="true" />
              <span>
                <small>Điểm đến</small>
                <strong>Đã kiểm chứng</strong>
              </span>
            </li>
            <li>
              <Sparkles aria-hidden="true" />
              <span>
                <small>Trợ lý AI</small>
                <strong>Có dẫn nguồn</strong>
              </span>
            </li>
            <li>
              <RouteIcon aria-hidden="true" />
              <span>
                <small>Hành trình</small>
                <strong>Cá nhân hóa</strong>
              </span>
            </li>
          </ul>
        </div>
      </section>

      <HomeScrollReveal>
        {/* SECTION 2: DISCOVER HÀ GIANG */}
        <section className="home-explore" aria-labelledby="home-explore-title">
          <div className="home-section-heading" data-home-reveal>
            <p className="home-eyebrow">BẮT ĐẦU HÀNH TRÌNH</p>
            <h2 id="home-explore-title">Những nơi đáng để khám phá</h2>
            <p>
              Khám phá cảnh quan kỳ vĩ, danh thắng lịch sử và những nét đẹp đặc trưng của vùng cao nguyên đá địa đầu Tổ quốc.
            </p>
          </div>

          <div className="home-destinations-bento">
            {featured ? (
              <>
                {/* Featured Large Card */}
                <article className="home-dest-card home-dest-card-featured" data-home-reveal>
                  <Link
                    href={destinationDetailHref(featured.id) as Route}
                    className="home-dest-card-link"
                    aria-label={`Xem chi tiết ${featured.name}`}
                  >
                    <div className="home-dest-media">
                      {featured.image?.url ? (
                        <Image
                          src={destinationThumbnail(featured.image.url)}
                          alt={featured.image.alt || featured.name}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 60vw, 800px"
                          className="home-dest-img"
                        />
                      ) : (
                        <div className="home-dest-placeholder">
                          <Mountain size={44} aria-hidden="true" />
                        </div>
                      )}
                      <div className="home-dest-overlay" />
                      <div className="home-dest-badges">
                        <span className="home-dest-badge home-dest-badge-area">{featured.area}</span>
                        <span className="home-dest-badge home-dest-badge-category">{featured.category}</span>
                      </div>
                    </div>
                    <div className="home-dest-content">
                      <p className="home-dest-meta-kicker">Điểm đến tiêu biểu</p>
                      <h3 className="home-dest-title">{featured.name}</h3>
                      <p className="home-dest-desc">
                        Không gian cảnh quan đặc trưng của vùng cao nguyên đá Hà Giang với giá trị địa chất và lịch sử độc đáo.
                      </p>
                      <span className="home-dest-action">
                        Khám phá địa danh <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </article>

                {/* Secondary Cards Column */}
                <div className="home-dest-secondary-col">
                  {secondary.map((dest) => (
                    <article key={dest.id} className="home-dest-card home-dest-card-secondary" data-home-reveal>
                      <Link
                        href={destinationDetailHref(dest.id) as Route}
                        className="home-dest-card-link"
                        aria-label={`Xem chi tiết ${dest.name}`}
                      >
                        <div className="home-dest-media">
                          {dest.image?.url ? (
                            <Image
                              src={destinationThumbnail(dest.image.url)}
                              alt={dest.image.alt || dest.name}
                              fill
                              sizes="(max-width: 768px) 100vw, 420px"
                              className="home-dest-img"
                            />
                          ) : (
                            <div className="home-dest-placeholder">
                              <MapPin size={32} aria-hidden="true" />
                            </div>
                          )}
                          <div className="home-dest-overlay" />
                          <div className="home-dest-badges">
                            <span className="home-dest-badge home-dest-badge-area">{dest.area}</span>
                            <span className="home-dest-badge home-dest-badge-category">{dest.category}</span>
                          </div>
                        </div>
                        <div className="home-dest-content">
                          <h3 className="home-dest-title">{dest.name}</h3>
                          <span className="home-dest-action">
                            Xem chi tiết <ArrowRight size={15} aria-hidden="true" />
                          </span>
                        </div>
                      </Link>
                    </article>
                  ))}

                  {/* Culture Card (Feature Flag Controlled) */}
                  {mvpFeatures.culture && (
                    <article className="home-dest-card home-dest-card-secondary" data-home-reveal>
                      <Link href="/explore" className="home-dest-card-link">
                        <div className="home-dest-media">
                          <Image
                            src="/images/ha-giang-culture-card.webp"
                            alt=""
                            fill
                            sizes="(max-width: 768px) 100vw, 420px"
                            className="home-dest-img"
                          />
                          <div className="home-dest-overlay" />
                          <div className="home-dest-badges">
                            <span className="home-dest-badge home-dest-badge-category">Văn hóa</span>
                          </div>
                        </div>
                        <div className="home-dest-content">
                          <h3 className="home-dest-title">Tìm hiểu văn hóa</h3>
                          <span className="home-dest-action">
                            Khám phá văn hóa <ArrowRight size={15} aria-hidden="true" />
                          </span>
                        </div>
                      </Link>
                    </article>
                  )}
                </div>
              </>
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
          </div>

          <div className="home-dest-footer" data-home-reveal>
            <Link href="/explore" className="home-link-pill">
              <span>Xem tất cả điểm đến</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* SECTION 3: AI TRAVEL ASSISTANT SHOWCASE */}
        <section className="home-assistant-section" aria-labelledby="home-assistant-title">
          <div className="home-showcase-grid">
            <div className="home-showcase-copy" data-home-reveal>
              <p className="home-eyebrow">TRỢ LÝ DU LỊCH THÔNG MINH</p>
              <h2 id="home-assistant-title">
                Bạn hỏi về Hà Giang.
                <span>Trợ lý AI giúp bạn tìm hiểu.</span>
              </h2>
              <p className="home-showcase-desc">
                Hỏi về điểm đến, tìm hiểu văn hóa hay tra cứu cẩm nang đường đèo. Trợ lý AI tổng hợp câu trả lời kèm nguồn tài liệu rõ ràng, đồng thời minh bạch chỉ rõ những thông tin chưa đủ cơ sở xác minh.
              </p>

              <ul className="home-feature-list" aria-label="Năng lực nổi bật của Trợ lý AI">
                <li>
                  <CheckCircle2 size={18} className="home-feature-icon" aria-hidden="true" />
                  <span><strong>Tham khảo có dẫn nguồn:</strong> Mỗi câu trả lời đối chiếu tài liệu giới thiệu địa danh và du lịch đã kiểm định.</span>
                </li>
                <li>
                  <CheckCircle2 size={18} className="home-feature-icon" aria-hidden="true" />
                  <span><strong>Nhận diện giới hạn dữ liệu:</strong> Tự động chỉ rõ những điểm chưa đủ cơ sở xác thực thay vì suy diễn.</span>
                </li>
                <li>
                  <CheckCircle2 size={18} className="home-feature-icon" aria-hidden="true" />
                  <span><strong>Gợi ý ngữ cảnh linh hoạt:</strong> Chủ động đưa ra các câu hỏi tiếp nối giúp bạn hiểu sâu về văn hóa bản địa.</span>
                </li>
              </ul>

              <div className="home-showcase-cta-group">
                <Link className="home-cta home-cta-primary" href={"/assistant" as Route}>
                  <Sparkles size={18} aria-hidden="true" />
                  <span>Trò chuyện với AI</span>
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
                  <span className="home-mockup-badge">Ví dụ minh họa</span>
                </div>

                <div className="home-ai-conversation" aria-label="Ví dụ minh họa cuộc hội thoại">
                  {/* User Bubble */}
                  <div className="home-ai-turn home-ai-user-turn">
                    <div className="home-ai-user-bubble">
                      <p>Thời điểm lý tưởng nhất để ngắm hoa tam giác mạch ở Đồng Văn là khi nào?</p>
                      <small className="home-ai-bubble-meta">Đã xác nhận lượt hỏi</small>
                    </div>
                  </div>

                  {/* Assistant Bubble */}
                  <div className="home-ai-turn home-ai-bot-turn">
                    <div className="home-ai-bot-bubble">
                      <div className="home-ai-speaker">
                        <Sparkles size={14} className="home-ai-speaker-icon" aria-hidden="true" />
                        <span>Trợ lý AI</span>
                      </div>
                      <p className="home-ai-answer-text">
                        Hoa tam giác mạch tại Cao nguyên đá Đồng Văn nở đẹp nhất từ <strong>tháng 10 đến tháng 12 hàng năm</strong>, rực rỡ nhất vào khoảng giữa tháng 11 khi các sườn đồi quanh Lũng Cú, Sủng Là và Phố Cáo đồng loạt chuyển từ sắc hồng phớt sang tím thẫm.
                      </p>

                      <div className="home-ai-citation-box">
                        <div className="home-ai-citation-title">
                          <FileText size={14} aria-hidden="true" />
                          <span>Xem nguồn (2 tài liệu đã kiểm chứng)</span>
                          <span className="home-ai-citation-pill">[1]</span>
                          <span className="home-ai-citation-pill">[2]</span>
                        </div>
                        <p className="home-ai-citation-desc">
                          Trích xuất từ tài liệu Cẩm nang du lịch Hà Giang và Địa chí Cao nguyên đá.
                        </p>
                      </div>

                      <div className="home-ai-verified-notice">
                        <ShieldCheck size={14} aria-hidden="true" />
                        <span>Thông tin trích dẫn nguyên văn từ tài liệu đã được đánh giá cho câu hỏi này.</span>
                      </div>
                    </div>
                  </div>

                  {/* Follow-up suggestions */}
                  <div className="home-ai-suggestions">
                    <span className="home-ai-suggestion-chip">Đường đi từ TP Hà Giang lên Đồng Văn?</span>
                    <span className="home-ai-suggestion-chip">Các cung đèo ngắm cảnh đẹp nhất?</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: SMART TRIP PLANNER SHOWCASE */}
        <section className="home-planner-section" aria-labelledby="home-planner-title">
          <div className="home-showcase-grid home-showcase-grid-reversed">
            <div className="home-showcase-copy" data-home-reveal>
              <p className="home-eyebrow">LẬP HÀNH TRÌNH TỰ ĐỘNG</p>
              <h2 id="home-planner-title">
                Một hành trình.
                <span>Theo đúng cách bạn muốn.</span>
              </h2>
              <p className="home-showcase-desc">
                Không còn phải tự tổng hợp từng điểm đến rời rạc hay băn khoăn về thời gian di chuyển trên đường đèo dốc. Hệ thống hỗ trợ xây dựng lộ trình thực tế, phù hợp với thời gian và phương tiện của riêng bạn.
              </p>

              <div className="home-planner-steps" role="list">
                <div className="home-planner-step-item" role="listitem">
                  <span className="home-planner-step-num">1</span>
                  <div>
                    <strong>Chọn thời gian &amp; phương tiện</strong>
                    <p>Lựa chọn số ngày trải nghiệm cùng phương tiện xe máy hoặc ô tô để tính toán an toàn.</p>
                  </div>
                </div>
                <div className="home-planner-step-item" role="listitem">
                  <span className="home-planner-step-num">2</span>
                  <div>
                    <strong>Chọn sở thích du lịch</strong>
                    <p>Cảnh quan thiên nhiên hùng vĩ, trải nghiệm văn hóa bản địa, chụp ảnh hay nghỉ dưỡng nhẹ nhàng.</p>
                  </div>
                </div>
                <div className="home-planner-step-item" role="listitem">
                  <span className="home-planner-step-num">3</span>
                  <div>
                    <strong>Xem lại và kiểm tra ràng buộc</strong>
                    <p>Hệ thống đối chiếu giờ mở cửa, khoảng cách giữa các thị trấn và thời lượng dừng chân hợp lý.</p>
                  </div>
                </div>
              </div>

              <div className="home-showcase-cta-group">
                <Link className="home-cta home-cta-primary" href={"/trips/new" as Route}>
                  <CalendarDays size={18} aria-hidden="true" />
                  <span>Lập hành trình</span>
                  <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="home-showcase-preview" data-home-reveal>
              <div className="home-planner-mockup">
                <div className="home-mockup-header">
                  <div className="home-mockup-brand">
                    <RouteIcon size={16} className="home-mockup-icon" aria-hidden="true" />
                    <strong>Lịch trình đề xuất mẫu · 3 Ngày 2 Đêm</strong>
                  </div>
                  <span className="home-mockup-badge">Xe máy · Cảnh quan</span>
                </div>

                <div className="home-planner-timeline-preview">
                  <div className="home-planner-tabs" role="tablist" aria-label="Các ngày trong lịch trình">
                    <span className="home-planner-tab home-planner-tab-active">Ngày 1 · Khởi hành</span>
                    <span className="home-planner-tab">Ngày 2 · Kỳ vĩ</span>
                    <span className="home-planner-tab">Ngày 3 · Trải nghiệm</span>
                  </div>

                  <div className="home-timeline-list">
                    <div className="home-timeline-stop">
                      <div className="home-timeline-indicator">
                        <span className="home-timeline-dot" />
                        <span className="home-timeline-line" />
                      </div>
                      <div className="home-timeline-body">
                        <div className="home-timeline-time">08:00 · Khởi hành</div>
                        <div className="home-timeline-name">Cột mốc số 0 — Thành phố Hà Giang</div>
                        <div className="home-timeline-meta">Điểm xuất phát hành trình khám phá cao nguyên đá</div>
                      </div>
                    </div>

                    <div className="home-timeline-stop">
                      <div className="home-timeline-indicator">
                        <span className="home-timeline-dot" />
                        <span className="home-timeline-line" />
                      </div>
                      <div className="home-timeline-body">
                        <div className="home-timeline-time">11:00 · Dừng chân 60 phút</div>
                        <div className="home-timeline-name">Cổng trời Quản Bạ &amp; Núi Đôi Cô Tiên</div>
                        <div className="home-timeline-meta">Ngắm toàn cảnh thung lũng Tam Sơn và hít thở không khí núi cao</div>
                      </div>
                    </div>

                    <div className="home-timeline-stop">
                      <div className="home-timeline-indicator">
                        <span className="home-timeline-dot" />
                      </div>
                      <div className="home-timeline-body">
                        <div className="home-timeline-time">15:30 · Tham quan 90 phút</div>
                        <div className="home-timeline-name">Dốc Thẩm Mã — Thung lũng Sủng Là</div>
                        <div className="home-timeline-meta">Chinh phục 9 khúc cua huyền thoại và ghé thăm Làng văn hóa Lũng Cẩm</div>
                      </div>
                    </div>
                  </div>

                  <div className="home-planner-validation-banner">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>Đã kiểm tra ràng buộc: Cung đường an toàn trong khung giờ ban ngày</span>
                  </div>
                  <p className="home-mockup-disclaimer">Minh họa cấu trúc lịch trình do hệ thống tạo lập</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: EXPLORE MAP SHOWCASE */}
        <section className="home-map-section" aria-labelledby="home-map-title">
          <div className="home-map-card" data-home-reveal>
            <div className="home-map-art" aria-hidden="true">
              <Image
                src="/images/ha-giang-map-card.webp"
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 1280px"
                className="home-map-card-bg"
              />
              <div className="home-map-ambient-glow" />
              {/* Landmark pins representation */}
              <div className="home-map-pin-pill home-map-pin-1">
                <MapPin size={13} aria-hidden="true" />
                <span>Cột cờ Lũng Cú</span>
              </div>
              <div className="home-map-pin-pill home-map-pin-2">
                <MapPin size={13} aria-hidden="true" />
                <span>Đèo Mã Pí Lèng</span>
              </div>
              <div className="home-map-pin-pill home-map-pin-3">
                <MapPin size={13} aria-hidden="true" />
                <span>Phố cổ Đồng Văn</span>
              </div>
            </div>

            <div className="home-map-card-copy">
              <p className="home-eyebrow">BẢN ĐỒ ĐỊA LÝ TRỰC QUAN</p>
              <h2 id="home-map-title">Khám phá từng điểm đến trên bản đồ.</h2>
              <p>
                Định vị toàn bộ các danh lam thắng cảnh, cung đèo hiểm trở và khoảng cách giữa các huyện trên bản đồ số Hà Giang để chủ động lập kế hoạch di chuyển.
              </p>
              <div className="home-map-actions">
                <Link href="/explore?view=map" className="home-cta home-cta-primary">
                  <Map size={18} aria-hidden="true" />
                  <span>Mở bản đồ</span>
                  <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                </Link>
                <Link href="/explore?view=map" className="home-card-link home-map-link-subtle">
                  Xem vị trí trên bản đồ <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: HOW IT WORKS */}
        <section className="home-steps-section" aria-labelledby="home-steps-title">
          <div className="home-section-heading" data-home-reveal>
            <p className="home-eyebrow">QUY TRÌNH ĐƠN GIẢN</p>
            <h2 id="home-steps-title">Bắt đầu chuyến đi của bạn chỉ với vài bước</h2>
            <p>Ba bước liền mạch để chuẩn bị chu đáo cho hành trình chinh phục vùng đất địa đầu Tổ quốc.</p>
          </div>

          <div className="home-steps-grid">
            <article className="home-step-card" data-home-reveal>
              <div className="home-step-header">
                <span className="home-step-index">01</span>
                <span className="home-step-icon"><Compass size={22} aria-hidden="true" /></span>
              </div>
              <h3>Khám phá điểm đến</h3>
              <p>
                Tìm kiếm địa danh theo khu vực, thời lượng tham quan khuyến nghị và tìm hiểu thông tin cảnh quan đặc sắc.
              </p>
            </article>

            <article className="home-step-card" data-home-reveal>
              <div className="home-step-header">
                <span className="home-step-index">02</span>
                <span className="home-step-icon"><Sparkles size={22} aria-hidden="true" /></span>
              </div>
              <h3>Tìm hiểu thông tin với trợ lý AI</h3>
              <p>
                Đặt câu hỏi về văn hóa, mùa hoa, thời tiết và nhận giải đáp có đối chiếu nguồn tài liệu uy tín từ hệ thống RAG.
              </p>
            </article>

            <article className="home-step-card" data-home-reveal>
              <div className="home-step-header">
                <span className="home-step-index">03</span>
                <span className="home-step-icon"><RouteIcon size={22} aria-hidden="true" /></span>
              </div>
              <h3>Xây dựng hành trình phù hợp</h3>
              <p>
                Cung cấp thời gian, phương tiện và sở thích để nhận đề xuất lộ trình tối ưu đã được kiểm tra tính khả thi.
              </p>
            </article>
          </div>
        </section>

        {/* SECTION 7: FINAL CTA & FOOTER */}
        <section className="home-final-cta-section" aria-labelledby="home-final-cta-title">
          <div className="home-final-cta" data-home-reveal>
            <div className="home-final-ambient" aria-hidden="true" />
            <div className="home-final-copy">
              <p className="home-eyebrow">SẴN SÀNG CHO CHUYẾN ĐI</p>
              <h2 id="home-final-cta-title">
                Chuyến đi Hà Giang của bạn
                <span>bắt đầu từ đây.</span>
              </h2>
              <p>
                Khám phá cảnh sắc núi non hùng vĩ, trải nghiệm văn hóa bản địa độc đáo và xây dựng hành trình đáng nhớ ngay hôm nay.
              </p>
              <div className="home-final-actions">
                <Link className="home-cta home-cta-primary" href="/explore">
                  <Compass size={18} aria-hidden="true" />
                  <span>Khám phá ngay</span>
                  <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
                </Link>
                <Link className="home-cta home-cta-secondary" href={"/trips/new" as Route}>
                  <PlusCircle size={18} aria-hidden="true" />
                  <span>Lập hành trình</span>
                </Link>
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
                  <li><Link href={"/favorites" as Route}>Điểm đến yêu thích</Link></li>
                  {mvpFeatures.culture && <li><Link href={"/culture" as Route}>Văn hóa Hà Giang</Link></li>}
                </ul>
              </div>

              <div className="home-footer-nav-col">
                <h4 className="home-footer-heading">Tính năng</h4>
                <ul className="home-footer-links">
                  <li><Link href={"/assistant" as Route}>Trợ lý AI Hà Giang</Link></li>
                  <li><Link href={"/trips/new" as Route}>Lập hành trình mới</Link></li>
                  <li><Link href={"/trips" as Route}>Chuyến đi của tôi</Link></li>
                  <li><Link href={"/dashboard" as Route}>Bảng điều khiển</Link></li>
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
