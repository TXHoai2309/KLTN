import React from "react";
import { formatSuggestedDuration } from "@/modules/destination/public-destination-contract";
import type { EditorialContext, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import { defaultEditorialDesign, isV2Layout } from "@/modules/destination-editorial/editorial-contract";
import EditorialPhoto from "./editorial-photo";
import { HeroPanorama, HeroSplit, HeroCover, formatHeroLocation, EditorialIntroduction, EditorialProse, TextImageStorySection, FullBleedImage, StaggeredImageGallery, VisualHighlights, MapSection, SourceAttribution } from "./editorial-story";
import { editorialHeroPlan, heroDeck } from "@/modules/destination-editorial/editorial-hero";
import { normalizeEditorialText } from "@/modules/destination-editorial/editorial-content";
import EditorialGenerativeRenderer from "./editorial-generative-renderer";
export type EditorialPageData = Pick<EditorialContext, "id" | "name" | "category" | "area" | "latitude" | "longitude" | "suggestedDurationMinutes" | "openingDays">;
export default function EditorialRenderer({ data, editorial }: { data: EditorialPageData; editorial: ResolvedEditorial }) {
  if (isV2Layout(editorial.layout)) {
    return <EditorialGenerativeRenderer data={data} editorial={editorial} />;
  }
  const { layout, media, sources } = editorial;
  const design = layout.design ?? defaultEditorialDesign;
  const photo = (id: string, block: typeof layout.blocks[number], priority = false) => {
    const image = media.find(m => m.id === id); return image ? <EditorialPhoto key={id} media={image} block={block} priority={priority} /> : null;
  };
  return <article className={`emg emg-${layout.family.toLowerCase()} emg-variant-${layout.variant.toLowerCase()} emg-type-${design.typography.toLowerCase()} emg-palette-${design.palette.toLowerCase()} emg-rhythm-${design.rhythm.toLowerCase()}`} lang="vi" data-family={layout.family} data-variant={layout.variant} data-typography={design.typography}>
    {!layout.blocks.some(b => b.type === "HERO") && <header className="emg-title"><p>{data.area}</p><h1>{data.name}</h1></header>}
    {layout.blocks.map(block => {
      switch (block.type) {
        case "HERO": {
          const image = media.find(m => m.id === block.mediaIds[0]);
          const plan = editorialHeroPlan(layout, image);
          const Hero = plan.composition === "PANORAMA" ? HeroPanorama : plan.composition === "SPLIT" ? HeroSplit : HeroCover;
          const intro = layout.blocks.find(b => b.type === "INTRO")?.text ?? "";
          const deck = heroDeck(block, block.title || data.name, formatHeroLocation(data.area, data.name), data.area, intro);
          const body = normalizeEditorialText(block.text);
          const showBody = body && ![deck, block.title || data.name, data.area].some(v => normalizeEditorialText(v) === body) && !normalizeEditorialText(intro).includes(body);
          return <React.Fragment key={block.id}><Hero block={block} data={data} limited={plan.limited} intro={intro}>{image && photo(image.id, block, true)}</Hero>{showBody && <EditorialIntroduction block={{ ...block, title: "" }} />}</React.Fragment>;
        }
        case "INTRO": return <EditorialIntroduction key={block.id} block={block} />;
        case "TEXT_SECTION": return <section key={block.id} className="emg-text-section"><EditorialProse block={block} /></section>;
        case "IMAGE_TEXT_SPLIT": return <TextImageStorySection key={block.id} block={block}>{block.mediaIds.map(id => photo(id, block))}</TextImageStorySection>;
        case "FULL_WIDTH_IMAGE": return <FullBleedImage key={block.id} block={block}>{block.mediaIds.map(id => photo(id, block))}</FullBleedImage>;
        case "IMAGE_GRID": case "IMAGE_GALLERY": return <StaggeredImageGallery key={block.id} block={block}>{block.mediaIds.map(id => photo(id, block))}</StaggeredImageGallery>;
        case "HIGHLIGHT_FACTS": return <VisualHighlights key={block.id} data={data} duration={formatSuggestedDuration(data.suggestedDurationMinutes)} />;
        case "TIMELINE": return <section key={block.id} className="emg-timeline"><h2>{block.title || "Dấu mốc"}</h2><ol>{block.entries.map((entry, i) => <li key={i}><strong>{entry.label}</strong><p>{entry.text}</p><span>{entry.sourceIds.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ")}</span></li>)}</ol></section>;
        case "QUOTE": return <section key={block.id} className="emg-quote"><blockquote>{block.text}</blockquote><p>{block.sourceIds.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ") || "Từ hồ sơ điểm đến"}</p></section>;
        case "VISIT_INFORMATION": return null; // Retired display block; stored legacy layouts remain readable.
        case "MAP": return <MapSection key={block.id} block={block} data={data} />;
        case "SOURCES": return <SourceAttribution key={block.id} block={block} sources={sources} />;
      }
    })}
  </article>;
}
