import { resolveCategoryLabel } from "@/modules/culture/culture-categories";
import React from "react";
import type { PublicContentProfile } from "@/modules/content-profile/public-content-profile";
export default function PublishedContentProfile({ profile: p }: {
    profile?: PublicContentProfile;
}) {
    if (!p)
        return null;
    const facts: [
        [
            string,
            string | null | undefined
        ],
        ...Array<[
            string,
            string | null | undefined
        ]>
    ] = [["Mô tả ngắn", p.shortDescription], ["Tên gọi khác", p.aliases?.join(", ")], ["Địa chỉ", p.address], ["Danh mục", resolveCategoryLabel(p.category ?? null)], ["Phạm vi địa lý", p.geographicScope], ["Địa phương / vùng văn hóa", p.areas.map(a => a.name).join(", ")], ["Cộng đồng", p.communities?.map(c => c.name).join(", ")], ["Giá vé", p.ticketPrice ? p.ticketPrice + (p.ticketVerification === "VERIFIED" ? " (đã xác minh)" : p.ticketVerification === "DISPUTED" ? " (có mâu thuẫn, cần kiểm tra)" : " (chưa xác minh)") : null], ["Thời điểm phù hợp", p.bestVisitTime], ["Lưu ý tham quan", p.visitNotes]];
    const visible = facts.filter(([, value]) => Boolean(value));
    if (!visible.length && !p.media.length && !p.sources.length && !p.googleMapsUrl)
        return null;
    return <section className="published-content-profile" aria-label="Thông tin hồ sơ"><h2>Thông tin hồ sơ</h2>{visible.length > 0 && <dl>{visible.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{p.googleMapsUrl && <p><a href={p.googleMapsUrl} target="_blank" rel="noopener noreferrer">Xem trên Google Maps</a> · {p.locationVerified ? "Vị trí đã đối chiếu" : "Vị trí chưa xác minh"}</p>}{p.media.length > 0 && <><h3>Hình ảnh</h3><div className="published-content-gallery">{[...p.media].sort((a, b) => Number(b.isCover) - Number(a.isCover)).map((m, i) => <figure key={i}><img src={m.url} alt={m.alt} loading="lazy" referrerPolicy="no-referrer"/><figcaption>{m.caption}{m.author && <span> · Ảnh: {m.author}</span>}{m.sourceUrl && <> · <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer">Nguồn ảnh</a></>}</figcaption></figure>)}</div></>}{p.sources.length > 0 && <><h3>Nguồn tham khảo bổ sung</h3><ul>{p.sources.map((s, i) => <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}{s.publisher && " · " + s.publisher}{s.author && " · " + s.author}{s.publishedOn && " · " + s.publishedOn}</li>)}</ul></>}</section>;
}
