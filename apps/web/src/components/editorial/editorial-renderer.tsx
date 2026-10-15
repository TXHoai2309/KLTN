import React from "react";
import { formatSuggestedDuration } from "@/modules/destination/public-destination-contract";
import type { EditorialContext, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import { defaultEditorialDesign } from "@/modules/destination-editorial/editorial-contract";
import { editorialVisitData } from "@/modules/destination-editorial/editorial-display-policy";
import EditorialPhoto from "./editorial-photo";
import { HeroPanorama, HeroSplit, EditorialIntroduction, EditorialProse, TextImageStorySection, FullBleedImage, StaggeredImageGallery, VisualHighlights, MapSection, SourceAttribution } from "./editorial-story";
export type EditorialPageData = Pick<EditorialContext, "id" | "name" | "category" | "area" | "latitude" | "longitude" | "suggestedDurationMinutes" | "openingDays">;
export function CompactTravelInformation({ data, includeArea = true }: { data: EditorialPageData; includeArea?: boolean }) {
  const visit = editorialVisitData(data);
  if (!includeArea) visit.area = "";
  if (!visit.area && visit.duration === null && !visit.hours.length) return null;
  return <section className="emg-visit" aria-label="Thông tin tham quan"><h2>Chuẩn bị cho chuyến đi</h2>
    {(visit.area || visit.duration !== null) && <dl>{visit.area && <div><dt>Khu vực</dt><dd>{visit.area}</dd></div>}{visit.duration !== null && <div><dt>Thời lượng gợi ý</dt><dd>{formatSuggestedDuration(visit.duration)}</dd></div>}</dl>}
    {visit.hours.length > 0 && <details><summary>Giờ hoạt động · Giờ địa phương Hà Giang</summary><dl>{visit.hours.map(day => <div key={day.label}><dt>{day.label}</dt><dd>{day.value}</dd></div>)}</dl></details>}
  </section>;
}
export const EditorialVisitInformation = CompactTravelInformation;
export default function EditorialRenderer({ data, editorial }: { data: EditorialPageData; editorial: ResolvedEditorial }) {
  const { layout, media, sources } = editorial;
  const design = layout.design ?? defaultEditorialDesign;
  const photo = (id: string, block: typeof layout.blocks[number], priority = false) => {
    const image = media.find(m => m.id === id); return image ? <EditorialPhoto key={id} media={image} block={block} priority={priority} /> : null;
  };
  return <article className={`emg emg-${layout.family.toLowerCase()} emg-variant-${layout.variant.toLowerCase()} emg-type-${design.typography.toLowerCase()} emg-palette-${design.palette.toLowerCase()} emg-rhythm-${design.rhythm.toLowerCase()}`} lang="vi" data-family={layout.family} data-variant={layout.variant} data-typography={design.typography}>
    {!layout.blocks.some(b => b.type === "HERO") && <header className="emg-title"><p>{data.area}</p><h1>{data.name}</h1></header>}
    {layout.blocks.map(block => {
      switch (block.type) {
        case "HERO": { const Hero = layout.variant === "SPLIT" ? HeroSplit : HeroPanorama; return <React.Fragment key={block.id}><Hero block={block} data={data}>{block.mediaIds[0] && photo(block.mediaIds[0], block, true)}</Hero>{block.text.length > 180 && <EditorialIntroduction block={{ ...block, title: "" }} />}</React.Fragment>; }
        case "INTRO": return <EditorialIntroduction key={block.id} block={block} />;
        case "TEXT_SECTION": return <section key={block.id} className="emg-text-section"><EditorialProse block={block} /></section>;
        case "IMAGE_TEXT_SPLIT": return <TextImageStorySection key={block.id} block={block}>{block.mediaIds.map(id => photo(id, block))}</TextImageStorySection>;
        case "FULL_WIDTH_IMAGE": return <FullBleedImage key={block.id} block={block}>{block.mediaIds.map(id => photo(id, block))}</FullBleedImage>;
        case "IMAGE_GRID": case "IMAGE_GALLERY": return <StaggeredImageGallery key={block.id} block={block}>{block.mediaIds.map(id => photo(id, block))}</StaggeredImageGallery>;
        case "HIGHLIGHT_FACTS": return <VisualHighlights key={block.id} data={data} duration={formatSuggestedDuration(data.suggestedDurationMinutes)} />;
        case "TIMELINE": return <section key={block.id} className="emg-timeline"><h2>{block.title || "Dấu mốc"}</h2><ol>{block.entries.map((entry, i) => <li key={i}><strong>{entry.label}</strong><p>{entry.text}</p><span>{entry.sourceIds.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ")}</span></li>)}</ol></section>;
        case "QUOTE": return <section key={block.id} className="emg-quote"><blockquote>{block.text}</blockquote><p>{block.sourceIds.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ") || "Từ hồ sơ điểm đến"}</p></section>;
        case "VISIT_INFORMATION": return <EditorialVisitInformation key={block.id} data={data} includeArea={!layout.blocks.some(b => b.type === "HIGHLIGHT_FACTS")} />;
        case "MAP": return <MapSection key={block.id} block={block} data={data} />;
        case "SOURCES": return <SourceAttribution key={block.id} block={block} sources={sources} />;
      }
    })}
  </article>;
}
