"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Compass,
  Sparkles,
  Route as RouteIcon,
  ArrowRight,
  Check,
  MapPin,
  ShieldCheck,
  CalendarCheck,
} from "lucide-react";
import { ProtectedLink } from "@/components/protected-link";

interface StepItem {
  number: string;
  badge: string;
  title: string;
  desc: string;
  ctaText: string;
  href: string;
  isProtected?: boolean;
  intent?: "planner";
  themeClass: string;
  Icon: typeof Compass;
  pillColor: string;
  highlights: string[];
  graphicTag: string;
}

const STEPS: StepItem[] = [
  {
    number: "01",
    badge: "Bước 1 · Điểm đến",
    title: "Khám phá điểm đến",
    desc: "Tra cứu danh lam thắng cảnh theo khu vực, thời lượng tham quan khuyến nghị và tìm hiểu thông tin cảnh sắc đặc trưng.",
    ctaText: "Khám phá các điểm đến",
    href: "/explore",
    themeClass: "home-step-card-peach",
    Icon: Compass,
    pillColor: "#d45435",
    graphicTag: "Bản đồ & Danh lam",
    highlights: [
      "Hơn 50+ danh lam thắng cảnh & di tích",
      "Giờ mở cửa và thời lượng tham quan chuẩn",
      "Vị trí địa lý và chỉ dẫn đường đèo chi tiết",
    ],
  },
  {
    number: "02",
    badge: "Bước 2 · Trợ lý AI",
    title: "Tìm hiểu thông tin với trợ lý AI",
    desc: "Đặt câu hỏi về văn hóa, mùa hoa, thời tiết và nhận giải đáp có đối chiếu nguồn tài liệu uy tín từ hệ thống RAG.",
    ctaText: "Trò chuyện với Trợ lý AI",
    href: "/assistant",
    themeClass: "home-step-card-lavender",
    Icon: Sparkles,
    pillColor: "#6a4c9c",
    graphicTag: "Tri thức kiểm duyệt",
    highlights: [
      "Tra cứu tri thức địa phương có trích dẫn nguồn",
      "Lưu ý an toàn đường đèo và thời tiết vùng cao",
      "Không suy đoán bừa bãi khi chưa đủ dữ liệu",
    ],
  },
  {
    number: "03",
    badge: "Bước 3 · Lập lịch trình",
    title: "Xây dựng hành trình phù hợp",
    desc: "Cung cấp thời gian, phương tiện và sở thích để nhận đề xuất lộ trình tối ưu đã được kiểm tra tính khả thi.",
    ctaText: "Tự tạo hành trình của bạn",
    href: "/trips/new",
    isProtected: true,
    intent: "planner",
    themeClass: "home-step-card-teal",
    Icon: RouteIcon,
    pillColor: "#176572",
    graphicTag: "Lộ trình thông minh",
    highlights: [
      "Tự động sắp xếp thứ tự điểm đến tối ưu",
      "Tùy biến theo xe máy hoặc ô tô cá nhân",
      "Dự toán thời lượng di chuyển và nghỉ ngơi",
    ],
  },
];

export default function HomeStepsScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    function handleScroll() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollableDist = el.offsetHeight - window.innerHeight;
      if (scrollableDist <= 0) return;

      const currentScroll = -rect.top;
      const rawProgress = Math.max(0, Math.min(1, currentScroll / scrollableDist));
      setProgress(rawProgress);

      if (rawProgress >= 0.62) {
        setActiveStep(2);
      } else if (rawProgress >= 0.28) {
        setActiveStep(1);
      } else {
        setActiveStep(0);
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToStep(index: number) {
    const el = containerRef.current;
    if (!el) return;
    const scrollableDist = el.offsetHeight - window.innerHeight;
    const targetRatio = index === 0 ? 0.05 : index === 1 ? 0.45 : 0.85;
    const targetScroll = el.offsetTop + scrollableDist * targetRatio;
    window.scrollTo({ top: targetScroll, behavior: "smooth" });
  }

  // Tính toán vị trí và hiệu ứng xếp chồng GPU cho từng thẻ
  function getCardStyle(idx: number): React.CSSProperties {
    if (!mounted) {
      return {};
    }

    if (idx === 0) {
      if (progress < 0.28) {
        return {
          transform: "translate3d(0, 0, 0) scale(1)",
          opacity: 1,
          zIndex: 1,
        };
      } else if (progress < 0.62) {
        return {
          transform: "translate3d(0, -20px, 0) scale(0.96)",
          opacity: 0.72,
          zIndex: 1,
        };
      } else {
        return {
          transform: "translate3d(0, -40px, 0) scale(0.92)",
          opacity: 0.42,
          zIndex: 1,
        };
      }
    }

    if (idx === 1) {
      if (progress < 0.28) {
        return {
          transform: "translate3d(0, calc(100% + 50px), 0) scale(0.96)",
          opacity: 0,
          zIndex: 2,
          pointerEvents: "none",
        };
      } else if (progress < 0.62) {
        return {
          transform: "translate3d(0, 0, 0) scale(1)",
          opacity: 1,
          zIndex: 2,
          pointerEvents: "auto",
        };
      } else {
        return {
          transform: "translate3d(0, -20px, 0) scale(0.96)",
          opacity: 0.75,
          zIndex: 2,
        };
      }
    }

    // idx === 2
    if (progress < 0.62) {
      return {
        transform: "translate3d(0, calc(100% + 50px), 0) scale(0.96)",
        opacity: 0,
        zIndex: 3,
        pointerEvents: "none",
      };
    } else {
      return {
        transform: "translate3d(0, 0, 0) scale(1)",
        opacity: 1,
        zIndex: 3,
        pointerEvents: "auto",
      };
    }
  }

  return (
    <section
      ref={containerRef}
      className="home-steps-scroll-section"
      aria-labelledby="home-steps-title"
    >
      {/* Khung dính cố định toàn màn hình, luôn căn giữa tuyệt đối */}
      <div className="home-steps-sticky-center">
        <div className="home-steps-center-inner">
          {/* Tiêu đề section */}
          <div className="home-section-heading home-steps-scroll-heading">
            <p className="home-eyebrow">QUY TRÌNH ĐƠN GIẢN</p>
            <h2 id="home-steps-title">Bắt đầu chuyến đi của bạn chỉ với vài bước</h2>
            <p>Ba bước liền mạch để chuẩn bị chu đáo cho hành trình chinh phục vùng đất địa đầu Tổ quốc.</p>
          </div>

          {/* Thanh điều hướng 3 bước (Pills) */}
          <div className="home-steps-nav" role="tablist" aria-label="Các bước thực hiện">
            <div className="home-steps-nav-track">
              {STEPS.map((step, idx) => {
                const isActive = activeStep === idx;
                return (
                  <button
                    key={step.number}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className="home-steps-pill"
                    data-state={isActive ? "active" : "idle"}
                    data-step={step.number}
                    onClick={() => scrollToStep(idx)}
                    aria-label={`Xem bước ${step.number}: ${step.title}`}
                  >
                    <span className="home-steps-pill-num">{step.number}</span>
                    <span className="home-steps-pill-label">{step.title}</span>
                    {isActive && <span className="home-steps-pill-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Khung thẻ xếp chồng khổ lớn (Grand Showcase) ở giữa màn hình */}
          <div className="home-steps-cards-stage">
            {STEPS.map((step, idx) => {
              const isActive = activeStep === idx;
              return (
                <article
                  key={step.number}
                  className={`home-step-card ${step.themeClass} home-step-scroll-card`}
                  data-card-index={idx}
                  data-active={isActive}
                  style={getCardStyle(idx)}
                >
                  <div className="home-step-card-grid">
                    {/* Cột trái: Số bước to, tiêu đề, mô tả và nút CTA */}
                    <div className="home-step-card-main">
                      <div className="home-step-header">
                        <span className="home-step-index">{step.number}</span>
                        <span className="home-step-badge-tag">{step.badge}</span>
                      </div>

                      <h3 className="home-step-title">{step.title}</h3>
                      <p className="home-step-desc">{step.desc}</p>

                      <div className="home-step-footer-row">
                        {step.isProtected ? (
                          <ProtectedLink
                            href={step.href}
                            intent={step.intent}
                            className="home-step-cta-btn"
                          >
                            <span>{step.ctaText}</span>
                            <ArrowRight size={16} aria-hidden="true" />
                          </ProtectedLink>
                        ) : (
                          <Link
                            href={step.href as Route}
                            className="home-step-cta-btn"
                          >
                            <span>{step.ctaText}</span>
                            <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        )}

                        <span className="home-step-counter-hint">
                          Bước 0{idx + 1} / 03
                        </span>
                      </div>
                    </div>

                    {/* Cột phải: Khung đồ họa điểm nhấn visual cho từng bước */}
                    <div className="home-step-card-visual" aria-hidden="true">
                      <div className="home-step-visual-panel">
                        <div className="home-step-visual-badge">
                          <step.Icon size={14} />
                          <span>{step.graphicTag}</span>
                        </div>

                        <div className="home-step-visual-icon-glow">
                          <step.Icon size={44} strokeWidth={1.85} />
                        </div>

                        <ul className="home-step-visual-list">
                          {step.highlights.map((item) => (
                            <li key={item}>
                              <span className="home-step-check-dot">
                                <Check size={12} strokeWidth={3} />
                              </span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Gợi ý cuộn bước nhẹ nhàng phía dưới */}
          <div className="home-steps-scroll-indicator" aria-hidden="true">
            <span className="home-steps-scroll-dot" data-active={activeStep === 0} />
            <span className="home-steps-scroll-dot" data-active={activeStep === 1} />
            <span className="home-steps-scroll-dot" data-active={activeStep === 2} />
          </div>
        </div>
      </div>
    </section>
  );
}
