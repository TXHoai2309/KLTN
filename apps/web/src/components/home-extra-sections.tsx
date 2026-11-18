import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

// Hai section tĩnh, không JavaScript: ảnh dùng lại từ thư viện gallery,
// FAQ dùng <details> gốc của trình duyệt.

const routes = [
  {
    name: "Quản Bạ và Núi Đôi",
    text: "Cổng vào cao nguyên đá: hai ngọn núi song sinh, những thung lũng xanh và làng nhỏ ven đường.",
    src: "/images/gallery/ha-giang-twin-mountain.webp",
    alt: "Núi Đôi Quản Bạ giữa thung lũng xanh",
  },
  {
    name: "Đồng Văn và làng đá",
    text: "Những mái nhà đá, vườn mận và nếp sống của người vùng cao giữa cao nguyên đá.",
    src: "/images/gallery/ha-giang-stone-village-plum.webp",
    alt: "Làng đá và hoa mận ở Đồng Văn",
  },
  {
    name: "Hoàng Su Phì",
    text: "Ruộng bậc thang uốn quanh sườn núi, đẹp nhất vào mùa lúa chín và những buổi sáng có mây.",
    src: "/images/gallery/ha-giang-terraces-mist-huts.webp",
    alt: "Ruộng bậc thang và nhà gỗ trong sương sớm Hoàng Su Phì",
  },
  {
    name: "Mùa hoa tam giác mạch",
    text: "Sườn núi phủ hoa hồng – trắng vào cuối thu. Thời điểm nở rộ thay đổi theo thời tiết từng năm.",
    src: "/images/gallery/ha-giang-buckwheat-slope.webp",
    alt: "Sườn núi phủ hoa tam giác mạch",
  },
];

const questions = [
  {
    q: "Nên đi Hà Giang vào mùa nào?",
    a: "Mỗi mùa một vẻ: hoa tam giác mạch thường nở khoảng tháng 10 đến tháng 11, lúa chín ở Hoàng Su Phì vào cuối hè đầu thu, hoa đào và hoa mận vào đầu xuân. Hỏi trợ lý AI để có gợi ý theo thời điểm bạn định đi.",
  },
  {
    q: "Hành trình nên kéo dài mấy ngày?",
    a: "Tuỳ bạn muốn đi sâu đến đâu. Khi lập hành trình, bạn chọn số ngày và phương tiện, hệ thống sẽ đề xuất lộ trình và kiểm tra tính khả thi trước khi bạn lưu.",
  },
  {
    q: "Thông tin trên trợ lý AI lấy từ đâu?",
    a: "Câu trả lời được đối chiếu với kho tài liệu của hệ thống và có dẫn nguồn. Với thông tin dễ thay đổi như thời tiết hay giờ mở cửa, bạn nên kiểm tra lại trước chuyến đi.",
  },
  {
    q: "Tôi có cần tài khoản để dùng không?",
    a: "Bạn có thể xem điểm đến và bản đồ mà không cần đăng nhập. Lập hành trình, lưu điểm yêu thích và trò chuyện lâu dài với trợ lý cần có tài khoản.",
  },
];

export function HomeRoutesSection() {
  return (
    <section className="home-routes-section" aria-labelledby="home-routes-title">
      <div className="home-section-heading" data-home-reveal>
        <h2 id="home-routes-title">Bốn miền đất nên đi.</h2>
        <p>Rê chuột vào từng ô để xem, chọn một điểm để bắt đầu.</p>
      </div>
      <ul className="home-routes-rail">
        {routes.map((route) => (
          <li key={route.name} className="home-route-card" data-home-reveal>
            <Link href="/explore" aria-label={route.name}>
              <Image src={route.src} alt={route.alt} fill sizes="(max-width: 820px) 100vw, 50vw" />
              <span className="home-route-title-v" aria-hidden="true">{route.name}</span>
              <span className="home-route-body">
                <strong>{route.name}</strong>
                <span>{route.text}</span>
                <span className="home-route-go">
                  Khám phá <ArrowRight size={14} aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeFaqSection() {
  return (
    <section className="home-faq-section" aria-labelledby="home-faq-title">
      <div className="home-section-heading" data-home-reveal>
        <p className="home-eyebrow">CÂU HỎI THƯỜNG GẶP</p>
        <h2 id="home-faq-title">Trước khi lên đường</h2>
      </div>
      <div className="home-faq-list" data-home-reveal>
        {questions.map((item) => (
          <details key={item.q} className="home-faq-item">
            <summary>
              <span>{item.q}</span>
              <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
