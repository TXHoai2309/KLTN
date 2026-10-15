import React from "react";
import DestinationMap from "@/components/map/destination-map";
import { formatSuggestedDuration } from "@/modules/destination/public-destination-contract";
import type { EditorialContext, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import EditorialPhoto from "./editorial-photo";
export type EditorialPageData = Pick<EditorialContext, "id" | "name" | "category" | "area" | "latitude" | "longitude" | "suggestedDurationMinutes" | "openingDays">;
export function EditorialVisitInformation({ data }: { data: EditorialPageData }) {
  const days = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
  return <section className="emg-visit" aria-label="Thông tin tham quan"><h2>Chuẩn bị cho chuyến đi</h2><dl><div><dt>Khu vực</dt><dd>{data.area}</dd></div><div><dt>Thời lượng gợi ý</dt><dd>{formatSuggestedDuration(data.suggestedDurationMinutes)}</dd></div></dl>
    <details><summary>Giờ hoạt động · Giờ địa phương Hà Giang</summary><dl>{data.openingDays.map((day, i) => <div key={day.dayOfWeek}><dt>{days[i]}</dt><dd>{day.status === "CLOSED" ? "Đóng cửa" : day.status === "UNKNOWN" ? "Chưa có dữ liệu" : day.intervals.map(v => `${v.opensAt}–${v.closesAt}`).join(", ")}</dd></div>)}</dl></details>
  </section>;
}
export default function EditorialRenderer({ data, editorial }: { data: EditorialPageData; editorial: ResolvedEditorial }) {
  const { layout, media, sources } = editorial;
  const photo = (id: string, block: typeof layout.blocks[number], priority = false) => {
    const image = media.find(m => m.id === id); return image ? <EditorialPhoto key={id} media={image} block={block} priority={priority} /> : null;
  };
  return <article className={`emg emg-${layout.family.toLowerCase()} emg-variant-${layout.variant.toLowerCase()}`} lang="vi" data-family={layout.family} data-variant={layout.variant}>
    {!layout.blocks.some(b => b.type === "HERO") && <header className="emg-title"><p>{data.area}</p><h1>{data.name}</h1></header>}
    {layout.blocks.map(block => {
      const text = <div className="emg-prose">{block.title && <h2>{block.title}</h2>}{block.text && <p>{block.text}</p>}</div>;
      switch (block.type) {
        case "HERO": return <header key={block.id} className={`emg-hero ${block.mediaIds.length ? "has-image" : "typography-first"}`}><div className="emg-title"><p className="emg-kicker">Hà Giang · {data.category}</p><h1>{block.title || data.name}</h1>{block.text && <p className="emg-deck">{block.text}</p>}<span className="emg-location">{data.area}</span></div>{block.mediaIds[0] && photo(block.mediaIds[0], block, true)}</header>;
        case "INTRO": return <section key={block.id} className="emg-intro">{text}</section>;
        case "TEXT_SECTION": return <section key={block.id} className="emg-text-section">{text}</section>;
        case "IMAGE_TEXT_SPLIT": return <section key={block.id} className={`emg-split emg-image-${block.placement} ${!block.mediaIds.length ? "no-image" : ""}`}>{text}<div>{block.mediaIds.map(id => photo(id, block))}</div></section>;
        case "FULL_WIDTH_IMAGE": return <section key={block.id} className="emg-full-image">{block.title && <h2>{block.title}</h2>}{block.mediaIds.map(id => photo(id, block))}</section>;
        case "IMAGE_GRID": case "IMAGE_GALLERY": return <section key={block.id} className="emg-gallery-section">{block.title && <h2>{block.title}</h2>}<div className={`emg-gallery emg-gallery-${block.gallery}`} data-images={block.mediaIds.length}>{block.mediaIds.map(id => photo(id, block))}</div></section>;
        case "HIGHLIGHT_FACTS": return <section key={block.id} className="emg-facts" aria-label="Điểm nhấn"><div><span>Khu vực</span><strong>{data.area}</strong></div><div><span>Loại hình</span><strong>{data.category}</strong></div>{data.suggestedDurationMinutes !== null && <div><span>Nhịp tham quan</span><strong>{formatSuggestedDuration(data.suggestedDurationMinutes)}</strong></div>}</section>;
        case "TIMELINE": return <section key={block.id} className="emg-timeline"><h2>{block.title || "Dấu mốc"}</h2><ol>{block.entries.map((entry, i) => <li key={i}><strong>{entry.label}</strong><p>{entry.text}</p><span>{entry.sourceIds.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ")}</span></li>)}</ol></section>;
        case "QUOTE": return <section key={block.id} className="emg-quote"><blockquote>{block.text}</blockquote><p>{block.sourceIds.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ") || "Từ hồ sơ điểm đến"}</p></section>;
        case "VISIT_INFORMATION": return <EditorialVisitInformation key={block.id} data={data} />;
        case "MAP": return <section key={block.id} className="emg-map"><h2>{block.title || "Tìm đến nơi này"}</h2><DestinationMap destinations={[data]} detail label={`Bản đồ ${data.name}`} /></section>;
        case "SOURCES": return <section key={block.id} className="emg-sources"><h2>Nguồn tham khảo</h2><ul>{block.sourceIds.map(id => { const source = sources.find(s => s.id === id); return source ? <li key={id}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</li> : null; })}</ul></section>;
      }
    })}
    {!layout.blocks.some(b => b.type === "VISIT_INFORMATION") && <EditorialVisitInformation data={data} />}
  </article>;
}
