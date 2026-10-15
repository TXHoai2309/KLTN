import { editorialValue } from "@/modules/destination-editorial/editorial-display-policy";
import { mvpFeatures } from "@/lib/mvp-features";
import PublishedMediaImage from "./published-media-image";
import { resolveCategoryLabel } from "@/modules/culture/culture-categories";
import React from "react";
import type { PublicContentProfile } from "@/modules/content-profile/public-content-profile";
import {
  FileText,
  MapPin,
  Ticket,
  Calendar,
  AlertCircle,
  ExternalLink,
  ImageIcon,
  BookOpen,
  Tag,
  Globe,
  Users,
  Info,
} from "lucide-react";

function getFactIcon(label: string) {
  switch (label) {
    case "Mô tả ngắn":
      return <FileText size={16} aria-hidden="true" />;
    case "Tên gọi khác":
      return <Tag size={16} aria-hidden="true" />;
    case "Địa chỉ":
      return <MapPin size={16} aria-hidden="true" />;
    case "Danh mục":
      return <Tag size={16} aria-hidden="true" />;
    case "Phạm vi địa lý":
      return <Globe size={16} aria-hidden="true" />;
    case "Địa phương / vùng văn hóa":
      return <MapPin size={16} aria-hidden="true" />;
    case "Cộng đồng":
      return <Users size={16} aria-hidden="true" />;
    case "Giá vé":
      return <Ticket size={16} aria-hidden="true" />;
    case "Thời điểm phù hợp":
      return <Calendar size={16} aria-hidden="true" />;
    case "Lưu ý tham quan":
      return <AlertCircle size={16} aria-hidden="true" />;
    default:
      return <Info size={16} aria-hidden="true" />;
  }
}

export default function PublishedContentProfile({
  profile: original,
  hideEmptyValues = false,
}: {
  profile?: PublicContentProfile;
  hideEmptyValues?: boolean;
}) {
  if (!original) return null;
  const p = hideEmptyValues ? { ...original, sources: original.sources.filter(s => editorialValue(s.title)) } : original;
  const facts: [
    [string, string | null | undefined],
    ...Array<[string, string | null | undefined]>
  ] = [
    ["Mô tả ngắn", p.shortDescription],
    ["Tên gọi khác", p.aliases?.join(", ")],
    ["Địa chỉ", p.address],
    ["Danh mục", resolveCategoryLabel(p.category ?? null)],
    ["Phạm vi địa lý", p.geographicScope],
    ["Địa phương / vùng văn hóa", p.areas.map((a) => a.name).join(", ")],
    ["Cộng đồng", p.communities?.map((c) => c.name).join(", ")],
    [
      "Giá vé",
      mvpFeatures.ticketPrice && p.ticketPrice
        ? p.ticketPrice +
          (p.ticketVerification === "VERIFIED"
            ? " (đã xác minh)"
            : p.ticketVerification === "DISPUTED"
            ? " (có mâu thuẫn, cần kiểm tra)"
            : " (chưa xác minh)")
        : null,
    ],
    ["Thời điểm phù hợp", p.bestVisitTime],
    ["Lưu ý tham quan", p.visitNotes],
  ];
  const visible = facts.map(([label, value]): [string, string | null | undefined] => [label, hideEmptyValues ? editorialValue(value) : value]).filter(([, value]) => Boolean(value));
  if (
    !visible.length &&
    !p.media.length &&
    !p.sources.length &&
    !p.googleMapsUrl
  )
    return null;

  return (
    <section className="published-content-profile" aria-label="Thông tin hồ sơ">
      <h2>
        <FileText size={20} aria-hidden="true" />
        Thông tin hồ sơ
      </h2>
      {visible.length > 0 && (
        <dl>
          {visible.map(([label, value]) => {
            const isHighlight = label === "Thời điểm phù hợp";
            const isWarning = label === "Lưu ý tham quan";
            const isTicket = label === "Giá vé";
            return (
              <div
                key={label}
                className={`profile-fact-item ${
                  isHighlight
                    ? "profile-fact-highlight"
                    : isWarning
                    ? "profile-fact-warning"
                    : isTicket
                    ? "profile-fact-ticket"
                    : ""
                }`}
              >
                <dt>
                  {getFactIcon(label)}
                  <span>{label}</span>
                </dt>
                <dd>{value}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {p.googleMapsUrl && (
        <p className="profile-maps-link">
          <a
            href={p.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="profile-maps-btn"
          >
            <MapPin size={16} aria-hidden="true" />
            <span>Xem trên Google Maps</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
          <span
            className={`profile-verify-tag ${
              p.locationVerified ? "is-verified" : "is-unverified"
            }`}
          >
            {p.locationVerified ? "Vị trí đã đối chiếu" : "Vị trí chưa xác minh"}
          </span>
        </p>
      )}
      {p.media.length > 0 && (
        <div className="profile-gallery-section">
          <h3>
            <ImageIcon size={18} aria-hidden="true" />
            Hình ảnh
          </h3>
          <div className="published-content-gallery">
            {[...p.media]
              .sort((a, b) => Number(b.isCover) - Number(a.isCover))
              .map((m, i) => (
                <figure key={i}>
                  <PublishedMediaImage url={m.url} alt={m.alt} />
                  <figcaption>
                    {m.caption}
                    {m.author && <span> · Ảnh: {m.author}</span>}
                    {m.sourceUrl && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          href={m.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Nguồn ảnh
                        </a>
                      </>
                    )}
                  </figcaption>
                </figure>
              ))}
          </div>
        </div>
      )}
      {p.sources.length > 0 && (
        <div className="profile-sources-section">
          <h3>
            <BookOpen size={18} aria-hidden="true" />
            Nguồn tham khảo bổ sung
          </h3>
          <ul className="profile-sources-list">
            {p.sources.map((s, i) => (
              <li key={i}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
                {s.publisher && " · " + s.publisher}
                {s.author && " · " + s.author}
                {s.publishedOn && " · " + s.publishedOn}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
