import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CalendarDays, Clock, MapPin, Sparkles } from "lucide-react";
import HomeAssistantSimulation from "@/components/home-assistant-simulation";
import { ProtectedLink } from "@/components/protected-link";

const topics = [
  "Mùa hoa và thời tiết theo từng tháng",
  "Cung đèo, đường đi và lưu ý an toàn",
  "Chợ phiên, ẩm thực và văn hóa bản địa",
];

export function HomeAssistantSection() {
  return (
    <section className="hx-assistant" aria-labelledby="home-assistant-title">
      <div className="hx-assistant-copy" data-home-reveal>
        <h2 id="home-assistant-title">Hỏi bất kỳ điều gì về Hà Giang.</h2>
        <p className="hx-lead">Mọi câu trả lời đều được đối chiếu với kho tư liệu đã kiểm chứng và có dẫn nguồn.</p>
        <ul className="hx-topics">
          {topics.map((topic) => (
            <li key={topic}>
              <Sparkles size={16} aria-hidden="true" />
              <span>{topic}</span>
            </li>
          ))}
        </ul>
        <Link className="home-cta home-cta-primary" href={"/assistant" as Route}>
          <Sparkles size={18} aria-hidden="true" />
          <span>Trò chuyện với Trợ lý AI</span>
          <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
        </Link>
      </div>
      <div className="hx-assistant-stage" data-home-reveal>
        <div className="hx-assistant-chat">
          <HomeAssistantSimulation />
        </div>
      </div>
    </section>
  );
}

const days = [
  {
    day: "Ngày 1",
    title: "Quản Bạ và Yên Minh",
    route: "TP. Hà Giang → Quản Bạ → Rừng thông Yên Minh",
    distance: "105 km · khoảng 3,5 giờ lái xe",
    src: "/images/gallery/ha-giang-day1-lg.webp",
    alt: "Ruộng bậc thang vàng xanh trên sườn núi Hà Giang",
    note: "Chiêm ngưỡng thung lũng Tam Sơn, vượt dốc Bắc Sum quanh co và nghỉ chân tại thị trấn vùng cao rợp bóng thông.",
  },
  {
    day: "Ngày 2",
    title: "Lũng Cú và Mã Pí Lèng",
    route: "Dinh họ Vương → Cột cờ Lũng Cú → Đèo Mã Pí Lèng",
    distance: "120 km · khoảng 4,5 giờ lái xe",
    src: "/images/gallery/ha-giang-day2-lg.webp",
    alt: "Cánh đồng hoa tam giác mạch hồng dưới bầu trời hoàng hôn",
    note: "Chạm mốc cực Bắc Tổ quốc, chinh phục hẻm Tu Sản kỳ vĩ và đón hoàng hôn bên dòng sông Nho Quế.",
  },
  {
    day: "Ngày 3",
    title: "Mèo Vạc và Du Già",
    route: "Mèo Vạc → Cua chữ M → Thác Du Già → TP. Hà Giang",
    distance: "140 km · khoảng 5 giờ lái xe",
    src: "/images/gallery/ha-giang-day3-lg.webp",
    alt: "Mái nhà ngói và cây mận nở hoa trong sương sớm",
    note: "Thưởng thức ẩm thực chợ phiên sớm, thư giãn bên dòng thác Du Già trong vắt rồi trở về thành phố.",
  },
];

export function HomeItinerarySection() {
  return (
    <section className="hx-trip" aria-labelledby="home-planner-title">
      <div className="hx-trip-head" data-home-reveal>
        <h2 id="home-planner-title">Hành trình mẫu 3 ngày.</h2>
        <p className="hx-lead">Khi lập hành trình, hệ thống sắp xếp lại theo số ngày và phương tiện của bạn.</p>
      </div>
      <ol className="hx-timeline">
        {days.map((item, index) => (
          <li key={item.day} className="hx-step" data-home-reveal>
            <div className="hx-step-photo">
              <Image src={item.src} alt={item.alt} fill sizes="(max-width: 820px) 90vw, 45vw" />
            </div>
            <span className="hx-step-dot" aria-hidden="true">{index + 1}</span>
            <div className="hx-step-text">
              <span className="hx-day-tag">{item.day}</span>
              <h3>{item.title}</h3>
              <p className="hx-step-note">{item.note}</p>
              <p className="hx-day-route">
                <MapPin size={15} aria-hidden="true" />
                <span>{item.route}</span>
              </p>
              <p className="hx-day-meta">
                <Clock size={15} aria-hidden="true" />
                <span>{item.distance}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="hx-trip-action" data-home-reveal>
        <ProtectedLink className="home-cta home-cta-coral" href="/trips/new" intent="planner">
          <CalendarDays size={18} aria-hidden="true" />
          <span>Tự tạo hành trình của bạn</span>
          <ArrowRight className="home-cta-arrow" size={17} aria-hidden="true" />
        </ProtectedLink>
      </div>
    </section>
  );
}
