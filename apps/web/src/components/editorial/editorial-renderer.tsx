import React from "react";
import type { PublicContentProfile } from "@/modules/content-profile/public-content-profile";
import { formatSuggestedDuration } from "@/modules/destination/public-destination-contract";
import type { EditorialContext, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import { defaultEditorialDesign, isV2Layout } from "@/modules/destination-editorial/editorial-contract";
import EditorialPhoto from "./editorial-photo";
import { EditorialTocNav } from "./editorial-toc";
import { HeroPanorama, HeroSplit, HeroCover, formatHeroLocation, EditorialIntroduction, EditorialProse, TextImageStorySection, FullBleedImage, StaggeredImageGallery, VisualHighlights, MapSection, SourceAttribution } from "./editorial-story";
import { cleanCategoryDisplayLabel, cleanDocumentSourceTitle, cleanPlaceDisplayName, cleanTravelerDisplay } from "@/lib/traveler-display-clean";
import { editorialHeroPlan, heroDeck } from "@/modules/destination-editorial/editorial-hero";
import { normalizeEditorialText } from "@/modules/destination-editorial/editorial-content";
import { editorialValue } from "@/modules/destination-editorial/editorial-display-policy";
import { projectPublicEditorialV1 } from "@/modules/destination-editorial/editorial-display-transform";
import EditorialGenerativeRenderer from "./editorial-generative-renderer";
export type EditorialPageData = Pick<EditorialContext, "id" | "name" | "category" | "area" | "latitude" | "longitude" | "suggestedDurationMinutes" | "openingDays"> & { profile?: Pick<PublicContentProfile, "address" | "googleMapsUrl" | "locationVerified"> };
export default function EditorialRenderer({
  data,
  editorial,
  summarySlot,
  sanitizeForReader = true,
}: {
  data: EditorialPageData;
  editorial: ResolvedEditorial;
  summarySlot?: React.ReactNode;
  sanitizeForReader?: boolean;
}) {
  if (isV2Layout(editorial.layout)) {
    return (
      <EditorialGenerativeRenderer
        data={data}
        editorial={editorial}
        summarySlot={summarySlot}
        sanitizeForReader={sanitizeForReader}
      />
    );
  }
  const { layout, media, sources } = editorial;
  const design = layout.design ?? defaultEditorialDesign;
  const projection = sanitizeForReader
    ? projectPublicEditorialV1(layout.blocks)
    : { blocks: layout.blocks.filter(b => !b.hidden), headings: new Map(), toc: [] };
  const heroBlock = projection.blocks.find(b => b.type === "HERO");
  const bodyBlocks = projection.blocks.filter(b => b.type !== "HERO");
  const photo = (id: string, block: typeof layout.blocks[number], priority = false) => {
    const image = media.find(m => m.id === id); return image ? <EditorialPhoto key={id} media={image} block={block} priority={priority} /> : null;
  };
  const renderBlock = (block: typeof layout.blocks[number]) => {
    const heading = projection.headings.get(block.id);
    switch (block.type) {
      case "INTRO": return <EditorialIntroduction key={block.id} block={block} heading={heading} />;
      case "TEXT_SECTION": return <section key={block.id} className="emg-text-section"><EditorialProse block={block} heading={heading} /></section>;
      case "IMAGE_TEXT_SPLIT": return <TextImageStorySection key={block.id} block={block} heading={heading}>{block.mediaIds.map(id => photo(id, block))}</TextImageStorySection>;
      case "FULL_WIDTH_IMAGE": return <FullBleedImage key={block.id} block={block} heading={heading}>{block.mediaIds.map(id => photo(id, block))}</FullBleedImage>;
      case "IMAGE_GRID": case "IMAGE_GALLERY": return <StaggeredImageGallery key={block.id} block={block} heading={heading}>{block.mediaIds.map(id => photo(id, block))}</StaggeredImageGallery>;
      case "HIGHLIGHT_FACTS": return <VisualHighlights key={block.id} data={data} duration={formatSuggestedDuration(data.suggestedDurationMinutes)} />;
      case "TIMELINE": return <section key={block.id} className="emg-timeline"><h2 id={heading?.anchorId}>{heading?.kind === "h2" ? heading.text : cleanPlaceDisplayName(block.title) || "Dấu mốc"}</h2><ol>{block.entries.map((entry, i) => <li key={i}><strong>{cleanTravelerDisplay(entry.label)}</strong><p>{cleanTravelerDisplay(entry.text)}</p><span>{entry.sourceIds.map(id => { const t = sources.find(s => s.id === id)?.title; return t ? (cleanDocumentSourceTitle(t) || t) : ""; }).filter(Boolean).join(" · ")}</span></li>)}</ol></section>;
      case "QUOTE": return <section key={block.id} className="emg-quote"><blockquote>{cleanTravelerDisplay(block.text)}</blockquote><p>{block.sourceIds.map(id => { const t = sources.find(s => s.id === id)?.title; return t ? (cleanDocumentSourceTitle(t) || t) : ""; }).filter(Boolean).join(" · ") || "Từ hồ sơ điểm đến"}</p></section>;
      case "VISIT_INFORMATION": return null; // Retired display block; stored legacy layouts remain readable.
      case "MAP": return <MapSection key={block.id} block={block} data={data} />;
      case "SOURCES": return <SourceAttribution key={block.id} block={block} sources={sources} />;
      default: return null;
    }
  };
  const renderHero = () => {
    if (!heroBlock) {
      const cat = cleanCategoryDisplayLabel(editorialValue(data.category));
      return (
        <header className="emg-title">
          <h1>{cleanPlaceDisplayName(data.name) || data.name}</h1>
          {cat && <p className="emg-category-sub">{cat}</p>}
        </header>
      );
    }
    const image = media.find(m => m.id === heroBlock.mediaIds[0]);
    const plan = editorialHeroPlan(layout, image);
    const Hero = plan.composition === "PANORAMA" ? HeroPanorama : plan.composition === "SPLIT" ? HeroSplit : HeroCover;
    const intro = layout.blocks.find(b => b.type === "INTRO")?.text ?? "";
    const deck = heroDeck(heroBlock, heroBlock.title || data.name, formatHeroLocation(data.area, data.name), data.area, intro);
    const body = normalizeEditorialText(heroBlock.text);
    const showBody = body && ![deck, heroBlock.title || data.name, data.area].some(v => normalizeEditorialText(v) === body) && !normalizeEditorialText(intro).includes(body);
    return <React.Fragment key={heroBlock.id}><Hero block={heroBlock} data={data} limited={plan.limited} intro={intro}>{image && photo(image.id, heroBlock, true)}</Hero>{showBody && <EditorialIntroduction block={{ ...heroBlock, title: "" }} />}</React.Fragment>;
  };
  return <article className={`emg emg-${layout.family.toLowerCase()} emg-variant-${layout.variant.toLowerCase()} emg-type-${design.typography.toLowerCase()} emg-palette-${design.palette.toLowerCase()} emg-rhythm-${design.rhythm.toLowerCase()}`} lang="vi" data-family={layout.family} data-variant={layout.variant} data-typography={design.typography}>
    {renderHero()}
    {summarySlot && <div className="emg-summary-wrap">{summarySlot}</div>}
    {bodyBlocks.length > 0 && (
      <div className="emg-body-shell">
        <EditorialTocNav items={projection.toc} variant="mobile" />
        <div className={projection.toc.length >= 2 ? "emg-article-with-toc" : "emg-article-single"}>
          <div className="emg-article-flow">
            {bodyBlocks.map(renderBlock)}
          </div>
          {projection.toc.length >= 2 && <EditorialTocNav items={projection.toc} variant="aside" />}
        </div>
      </div>
    )}
  </article>;
}
