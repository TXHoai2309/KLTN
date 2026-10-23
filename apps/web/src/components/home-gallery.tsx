import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import "./home-gallery.css";

// Ảnh minh họa của trang chủ. Chỉnh tên địa điểm, mô tả và thứ tự ngay tại đây.
// Lưu ý: ảnh được sưu tầm cho đồ án học tập, cần thay bằng ảnh có giấy phép
// (hoặc ghi rõ nguồn) trước khi công bố rộng rãi.
type Tile = {
  key: string; src: string; alt: string; place: string; title: string; note: string;
  size: "feature" | "wide" | "small";
  /** Tên tác giả ghi trên ảnh gốc (nếu có); hiển thị để giữ ghi công. */
  credit?: string;
  /** Giữ phần ảnh có chữ ký gốc khi khung bị cắt. */
  position?: string;
};

const TILES: Tile[] = [
  {
    key: "terraces",
    src: "/images/gallery/ha-giang-terraces-golden.webp",
    alt: "Ruộng bậc thang vàng óng ôm lấy những mái nhà của bản làng, sương mù trắng len qua sườn núi",
    place: "Hoàng Su Phì",
    title: "Ruộng bậc thang mùa lúa chín",
    note: "Sườn núi nhuộm vàng, làng bản nép giữa mây.",
    size: "feature",
  },
  {
    key: "buckwheat-harvest",
    src: "/images/gallery/ha-giang-buckwheat-harvest.webp",
    alt: "Phụ nữ người dân tộc gùi giỏ đi giữa cánh đồng hoa tam giác mạch hồng, núi đá phía xa",
    place: "Cao nguyên đá Đồng Văn",
    title: "Hoa tam giác mạch",
    note: "Mùa hoa hồng – trắng giữa núi đá.",
    size: "wide",
    credit: "Chu Việt Bắc",
  },
  {
    key: "twin-mountain",
    src: "/images/gallery/ha-giang-twin-mountain.webp",
    alt: "Hai ngọn núi tròn xanh song song giữa thung lũng lúa vàng lúc hoàng hôn",
    place: "Quản Bạ",
    title: "Núi Đôi",
    note: "Hoàng hôn trên thung lũng.",
    size: "small",
  },
  {
    key: "stone-village",
    src: "/images/gallery/ha-giang-stone-village-plum.webp",
    alt: "Ngôi nhà tường đá mái ngói âm dương và cây mận nở hoa trắng bên cổng làng",
    place: "Cao nguyên đá Đồng Văn",
    title: "Nhà đá mùa hoa mận",
    note: "Tường đá, mái ngói, hoa trắng.",
    size: "small",
  },
  {
    key: "mist-huts",
    src: "/images/gallery/ha-giang-terraces-mist-huts.webp",
    alt: "Dãy nhà lá nhỏ trên sườn ruộng bậc thang xanh trong sương sớm",
    place: "Hoàng Su Phì",
    title: "Bản làng trong sương",
    note: "Nhà nghỉ giữa ruộng bậc thang.",
    size: "wide",
    position: "center bottom",
  },
  {
    key: "buckwheat-slope",
    src: "/images/gallery/ha-giang-buckwheat-slope.webp",
    alt: "Triền đồi phủ kín hoa tam giác mạch hồng nhạt dưới vách đá",
    place: "Cao nguyên đá Đồng Văn",
    title: "Triền hoa dưới vách đá",
    note: "Sắc hồng trải dài theo sườn đồi.",
    size: "wide",
  },
];

export default function HomeGallery() {
  return (
    <section className="home-gallery-section" aria-labelledby="home-gallery-title">
      <div className="home-section-heading" data-home-reveal>
        <p className="home-eyebrow home-eyebrow-coral">NHỮNG KHUNG HÌNH HÀ GIANG</p>
        <h2 id="home-gallery-title">Vùng đất của đá, mây và sắc hoa</h2>
        <p>Từ ruộng bậc thang Hoàng Su Phì đến cao nguyên đá Đồng Văn, mỗi mùa Hà Giang lại khoác một màu áo khác.</p>
      </div>

      <div className="home-gallery-grid">
        {TILES.map(tile => (
          <figure key={tile.key} className={`home-gallery-tile home-gallery-${tile.size}`} data-home-reveal>
            <Image
              className="home-gallery-image"
              src={tile.src}
              alt={tile.alt}
              fill
              style={tile.position ? { objectPosition: tile.position } : undefined}
              sizes={tile.size === "feature" ? "(max-width: 640px) 100vw, 50vw" : tile.size === "wide" ? "(max-width: 640px) 100vw, 50vw" : "(max-width: 640px) 100vw, 25vw"}
            />
            <figcaption className="home-gallery-caption">
              <span className="home-gallery-place">
                <MapPin size={13} aria-hidden="true" />
                {tile.place}
              </span>
              <strong>{tile.title}</strong>
              <span className="home-gallery-note">{tile.note}</span>
            </figcaption>
            {tile.credit ? <span className="home-gallery-credit-tag">Ảnh: {tile.credit}</span> : null}
          </figure>
        ))}
      </div>

      <div className="home-gallery-footer" data-home-reveal>
        <Link href="/explore" className="home-link-pill">
          <span>Xem tất cả điểm đến</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <p className="home-gallery-credit">Ảnh minh họa sưu tầm cho đồ án học tập; bản quyền thuộc tác giả.</p>
      </div>
    </section>
  );
}
