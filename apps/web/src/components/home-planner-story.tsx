"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Clock, MapPin } from "lucide-react";

const DAYS = [
  {
    day: "Ngày 1",
    index: "01",
    shortTitle: "Quản Bạ & Yên Minh",
    theme: "Khởi hành · Chạm ngõ Cao nguyên",
    route: "TP. Hà Giang → Quản Bạ → Rừng thông Yên Minh",
    distance: "105 km · ~3.5h lái xe",
    note: "Chiêm ngưỡng thung lũng Tam Sơn, vượt dốc Bắc Sum quanh co và nghỉ chân tại thị trấn vùng cao rợp bóng thông.",
    src: "/images/gallery/ha-giang-day1-lg.webp",
    alt: "Ruộng bậc thang vàng xanh trên sườn núi Hà Giang",
    waypoints: ["Dốc Bắc Sum", "Núi Đôi Quản Bạ", "Cổng trời", "Rừng thông Yên Minh"],
  },
  {
    day: "Ngày 2",
    index: "02",
    shortTitle: "Lũng Cú & Mã Pí Lèng",
    theme: "Kỳ vĩ · Trái tim Di sản UNESCO",
    route: "Dinh họ Vương → Cột cờ Lũng Cú → Đèo Mã Pí Lèng",
    distance: "120 km · ~4.5h lái xe",
    note: "Chạm mốc cực Bắc Tổ quốc, chinh phục hẻm Tu Sản kỳ vĩ và đón hoàng hôn rực rỡ bên dòng sông Nho Quế.",
    src: "/images/gallery/ha-giang-day2-lg.webp",
    alt: "Cánh đồng hoa tam giác mạch hồng dưới bầu trời hoàng hôn",
    waypoints: ["Dinh Vua Mèo", "Cột cờ Lũng Cú", "Đèo Mã Pí Lèng", "Hẻm Tu Sản"],
  },
  {
    day: "Ngày 3",
    index: "03",
    shortTitle: "Mèo Vạc & Du Già",
    theme: "Trải nghiệm · Chợ phiên & Vòng về",
    route: "Mèo Vạc → Cua chữ M → Thác Du Già → TP. Hà Giang",
    distance: "140 km · ~5.0h lái xe",
    note: "Thưởng thức ẩm thực chợ phiên sớm, thư giãn bên dòng thác Du Già trong vắt và hoàn thành trọn vẹn cung đường chữ M.",
    src: "/images/gallery/ha-giang-day3-lg.webp",
    alt: "Mái nhà ngói và cây mận nở hoa trong sương sớm",
    waypoints: ["Chợ phiên Mèo Vạc", "Cua chữ M", "Bản Du Già", "Về TP. Hà Giang"],
  },
] as const;

const AUTO_PLAY_INTERVAL = 4500;

export default function HomePlannerStory({
  intro,
  action,
}: {
  intro: ReactNode;
  action: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % DAYS.length);
    }, AUTO_PLAY_INTERVAL);

    return () => clearInterval(timer);
  }, [isPaused, active]);

  const activeDay = DAYS[active];

  return (
    <div
      className="home-planner-dossier"
      aria-label="Minh họa lịch trình mẫu Hà Giang"
    >
      <div className="home-planner-dossier-grid">
        {/* Cột trái: Khung hình ảnh lộ trình trực quan & Bộ chọn ngày */}
        <div className="home-planner-visual-column">
          <div className="home-planner-image-frame">
            {DAYS.map((item, index) => (
              <figure
                key={item.day}
                className={`home-planner-photo-slide ${index === active ? "is-visible" : "is-hidden"}`}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 620px"
                  priority={index === 0}
                  className="home-planner-photo"
                />
              </figure>
            ))}

            {/* Lớp phủ điện ảnh */}
            <div className="home-planner-photo-vignette" aria-hidden="true" />

            {/* Thông số chặng đang chọn góc dưới ảnh */}
            <div className="home-planner-floating-bottom" key={`badge-${active}`}>
              <div className="home-planner-day-pill">
                <span className="home-planner-day-num">{activeDay.index}</span>
                <span className="home-planner-day-name">{activeDay.day}</span>
              </div>
              <div className="home-planner-distance-badge">
                <Clock size={13} />
                <span>{activeDay.distance}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cột phải: Tiêu đề Editorial & Thẻ ngày duy nhất đang kích hoạt */}
        <div className="home-planner-journal-column">
          <div className="home-planner-journal-intro">
            {intro}
          </div>

          {/* Thẻ chi tiết chặng duy nhất đang chọn kèm hiệu ứng chuyển cảnh */}
          <div
            key={`planner-active-day-${active}`}
            className="home-planner-active-card"
            role="region"
            aria-label={`Chi tiết ${activeDay.day}`}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <div className="home-planner-card-header">
              <div className="home-planner-card-badge">
                <span className="home-planner-card-num">{activeDay.index}</span>
                <span className="home-planner-card-day">{activeDay.day}</span>
              </div>
              <h3 className="home-planner-card-theme">{activeDay.theme}</h3>
            </div>

            <p className="home-planner-card-note">{activeDay.note}</p>

            {/* Chuỗi Waypoints liên kết */}
            <div className="home-planner-waypoints-row">
              <MapPin size={14} className="home-timeline-pin-icon" aria-hidden="true" />
              <div className="home-planner-waypoints-list">
                {activeDay.waypoints.map((point, pIdx) => (
                  <span key={point} className="home-timeline-waypoint-item">
                    <span className="home-waypoint-name">{point}</span>
                    {pIdx < activeDay.waypoints.length - 1 && (
                      <span className="home-waypoint-arrow" aria-hidden="true">→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Nút hành động chính */}
          <div className="home-planner-action-wrap">
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}
