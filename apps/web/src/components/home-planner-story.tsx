"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Route as RouteIcon } from "lucide-react";
import "./home-polish.css";

// Lịch trình mẫu. Sửa nội dung, ảnh và chú thích ngay tại đây.
const DAYS = [
  {
    day: "Ngày 1",
    theme: "Khởi hành · Chạm ngõ Cao nguyên",
    route: "TP. Hà Giang → Quản Bạ → Rừng thông Yên Minh",
    note: "Chiêm ngưỡng thung lũng Tam Sơn, vượt dốc Bắc Sum và nghỉ chân tại thị trấn vùng cao.",
    src: "/images/gallery/ha-giang-day1-lg.webp",
    alt: "Ruộng bậc thang vàng xanh trên sườn núi Hà Giang",
  },
  {
    day: "Ngày 2",
    theme: "Kỳ vĩ · Trái tim Di sản UNESCO",
    route: "Dinh họ Vương → Cột cờ Lũng Cú → Đèo Mã Pí Lèng",
    note: "Chạm mốc cực Bắc Tổ quốc, chinh phục hẻm Tu Sản và ngắm hoàng hôn rực rỡ trên sông Nho Quế.",
    src: "/images/gallery/ha-giang-day2-lg.webp",
    alt: "Cánh đồng hoa tam giác mạch hồng dưới bầu trời hoàng hôn",
  },
  {
    day: "Ngày 3",
    theme: "Trải nghiệm · Chợ phiên & Vòng về",
    route: "Mèo Vạc → Cua chữ M → Thác Du Già → TP. Hà Giang",
    note: "Thưởng thức ẩm thực chợ phiên buổi sớm, thư giãn bên dòng thác và hoàn thành cung đường chữ M.",
    src: "/images/gallery/ha-giang-day3-lg.webp",
    alt: "Mái nhà ngói và cây mận nở hoa trong sương sớm",
  },
] as const;

const AUTO_PLAY_INTERVAL = 1500; // Tự động chuyển ngày mỗi 2.5 giây

/** Khung hiển thị lịch trình mẫu tự động chuyển đổi giữa các ngày và cho phép chọn nhanh qua các thẻ. */
export default function HomePlannerStory({ intro, action }: { intro: ReactNode; action: ReactNode }) {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % DAYS.length);
    }, AUTO_PLAY_INTERVAL);

    return () => clearInterval(timer);
  }, [isPaused, active]);

  function handleSelect(index: number) {
    setActive(index);
  }

  const activeDay = DAYS[active];

  return (
    <div
      className="home-showcase-grid home-showcase-grid-reversed home-planner-story-grid"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="home-showcase-copy">
        {intro}
        <ol className="home-story-detail" aria-label="Chi tiết từng ngày">
          {DAYS.map((item, index) => (
            <li key={item.day} className="home-story-row" data-state={index === active ? "active" : "idle"}>
              <button
                type="button"
                className="home-story-row-head"
                onClick={() => handleSelect(index)}
                aria-current={index === active ? "step" : undefined}
                aria-label={`Xem chi tiết ${item.day}: ${item.theme}`}
              >
                <span className="home-story-row-num">{index + 1}</span>
                <span className="home-story-row-title">
                  <small>{item.day}</small>
                  {item.theme}
                </span>
              </button>
              <div className="home-story-more">
                <div className="home-story-more-inner">
                  <p>{item.note}</p>
                  <ul className="home-story-stops" aria-label={`Điểm dừng ${item.day}`}>
                    {item.route.split(" → ").map((stop) => (
                      <li key={stop}>{stop}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="home-planner-desktop-action">
          {action}
        </div>
      </div>

      <div className="home-showcase-preview">
        <div className="home-planner-mockup home-story">
          <div className="home-mockup-header">
            <div className="home-mockup-brand">
              <RouteIcon size={16} className="home-mockup-icon" aria-hidden="true" />
              <strong>Lịch trình đề xuất mẫu · 3 Ngày 2 Đêm</strong>
            </div>
            <span className="home-mockup-badge home-mockup-badge-peach">Xe máy · Cảnh quan &amp; Bản địa</span>
          </div>

          <div className="home-story-days">
            {DAYS.map((item, index) => (
              <figure key={item.day} className="home-story-day" data-state={index === active ? "active" : "idle"}>
                <Image
                  className="home-story-photo"
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 1020px) 100vw, 700px"
                  priority={index === 0}
                />
              </figure>
            ))}
          </div>

          <div className="home-story-tabs" role="tablist" aria-label="Chọn ngày xem trước">
            {DAYS.map((item, index) => (
              <button
                key={item.day}
                type="button"
                role="tab"
                aria-selected={index === active}
                className="home-story-tab"
                onClick={() => handleSelect(index)}
              >
                {item.day}
              </button>
            ))}
          </div>

          {/* Chi tiết ngày đang chọn trên mobile: hiển thị ngày nào hiện ngày đó, thu gọn trong 1 khung màn */}
          <div className="home-story-mobile-active-day" aria-live="polite">
            <div className="home-story-mobile-day-head">
              <span className="home-story-mobile-day-num">{active + 1}</span>
              <div className="home-story-mobile-day-meta">
                <small>{activeDay.day}</small>
                <strong>{activeDay.theme}</strong>
              </div>
            </div>
            <p className="home-story-mobile-day-note">{activeDay.note}</p>
            <ul className="home-story-stops" aria-label={`Điểm dừng ${activeDay.day}`}>
              {activeDay.route.split(" → ").map((stop) => (
                <li key={stop}>{stop}</li>
              ))}
            </ul>
          </div>

          <p className="home-planner-credit">Ảnh minh họa sưu tầm; bản quyền thuộc tác giả.</p>
        </div>

        {/* Nút hành động đặt dưới ảnh và thẻ theo yêu cầu trên mobile */}
        <div className="home-planner-mobile-action">
          {action}
        </div>
      </div>
    </div>
  );
}
