import React from "react";
import DestinationDetailIframeMap from "@/components/map/destination-detail-iframe-map";
import { cleanDocumentSourceTitle, cleanPlaceDisplayName, cleanTravelerDisplay } from "@/lib/traveler-display-clean";
import { editorialTitlePhrases, normalizeEditorialText, stripMarkdownHeading } from "@/modules/destination-editorial/editorial-content";
import type { EditorialBlock, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import type { EditorialPageData } from "./editorial-renderer";
import { heroDeck } from "@/modules/destination-editorial/editorial-hero";

import { editorialValue, hasEditorialCoordinates, hasEditorialDuration, hasEditorialFacts } from "@/modules/destination-editorial/editorial-display-policy";
import type { EditorialHeadingPresentation } from "@/modules/destination-editorial/editorial-display-transform";

function renderInlineMarkdown(str: string): React.ReactNode {
  const parts = str.split(/(\*\*[^*]+?\*\*|__[^_]+?__)/g);
  if (parts.length === 1) return str;
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__") && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function renderFormattedEditorialText(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const isBulletList = lines.length > 1 && lines.every(l => /^[-*•+]\s+/.test(l));
  if (isBulletList) {
    return (
      <ul className="emg-list">
        {lines.map((line, idx) => (
          <li key={idx}>
            {renderInlineMarkdown(line.replace(/^[-*•+]\s+/, ""))}
          </li>
        ))}
      </ul>
    );
  }
  const cleanLine = cleanTravelerDisplay(text.replace(/^#{1,6}\s+/, "").trim());
  return renderInlineMarkdown(cleanLine);
}

type StoryProps = { block: EditorialBlock; heading?: EditorialHeadingPresentation; children?: React.ReactNode };
export function renderEditorialSectionHeading(
  fallbackTitle: string,
  heading?: EditorialHeadingPresentation,
  extraClassName?: string,
): React.ReactNode {
  if (heading?.kind === "lead") {
    return <p className={`emg-lead-heading${extraClassName ? ` ${extraClassName}` : ""}`}><strong>{heading.text}</strong></p>;
  }
  const text = heading?.kind === "h2" ? heading.text : fallbackTitle;
  if (!text) return null;
  return <h2 id={heading?.anchorId} className={extraClassName}>{text}</h2>;
}

export function EditorialProse({
  block,
  heading,
}: {
  block: Pick<EditorialBlock, "title" | "text" | "emphasis">;
  heading?: EditorialHeadingPresentation;
}) {
  if (!block.title && !block.text.trim() && !heading) return null;
  const cleanTitle = cleanPlaceDisplayName(stripMarkdownHeading(block.title));
  const paragraphs = block.text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return (
    <div className={`emg-prose ${block.emphasis === "FEATURED" ? "emg-prose-featured" : ""}`}>
      {renderEditorialSectionHeading(cleanTitle, heading)}
      {paragraphs.map((p, i) => {
        const lines = p.split("\n").map(l => l.trim()).filter(Boolean);
        const isList = lines.length > 1 && lines.every(l => /^[-*•+]\s+/.test(l));
        return isList ? (
          <React.Fragment key={i}>{renderFormattedEditorialText(p)}</React.Fragment>
        ) : (
          <p key={i}>{renderFormattedEditorialText(p)}</p>
        );
      })}
    </div>
  );
}
export function formatHeroLocation(area: string | null | undefined, destinationName: string): string {
  const val = editorialValue(area);
  if (!val) return "";
  const lowerName = destinationName.toLocaleLowerCase("vi");
  const isDongVan = /đồng văn|dong van|cao nguyên đá/i.test(lowerName);
  if (isDongVan) {
    const lowerArea = val.toLocaleLowerCase("vi");
    if (lowerArea.includes("hà giang") || lowerArea.includes("ha giang")) {
      return "Tuyên Quang · Vùng Hà Giang trước đây";
    }
  }
  return val
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("vi");
      if (i > 0 && ["và", "của", "tại"].includes(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("vi") + lower.slice(1);
    })
    .join(" ");
}

function HeroTitle({ block, data, intro = "" }: { block: EditorialBlock; data: EditorialPageData; intro?: string }) {
  const title = block.title || data.name;
  const deck = heroDeck(block, title, formatHeroLocation(data.area, data.name), data.area, intro);
  const phrases = editorialTitlePhrases(title);
  const locationText = formatHeroLocation(data.area, data.name);
  const normTitle = normalizeEditorialText(title);
  const normDeck = normalizeEditorialText(deck);
  const normLoc = normalizeEditorialText(locationText);
  const normArea = normalizeEditorialText(data.area ?? "");
  const isDeckLocationDuplicate = Boolean(
    normDeck && (
      normDeck === normLoc ||
      normDeck === normArea ||
      normDeck === "khu vuc ha giang" ||
      normDeck === "ha giang" ||
      normDeck === "tuyen quang vung ha giang truoc day"
    )
  );
  const showDeck = Boolean(deck && normDeck !== normTitle && !isDeckLocationDuplicate);
  const displayCategory = cleanTravelerDisplay(editorialValue(data.category));
  return (
    <div className="emg-title" data-title-length={title.length > 32 ? "long" : "short"}>
      <h1>{phrases.map((p, i) => <React.Fragment key={i}><span>{p}</span>{i < phrases.length - 1 ? " " : null}</React.Fragment>)}</h1>
      {displayCategory && <p className="emg-category-sub">{displayCategory}</p>}
      {showDeck && <p className="emg-deck">{deck}</p>}
      {locationText && <span className="emg-location">{locationText}</span>}
    </div>
  );
}
type HeroProps = StoryProps & { data: EditorialPageData; intro?: string; limited?: boolean };
export function HeroPanorama({ block, data, children, intro }: HeroProps) {
  return <header className={`emg-hero emg-hero-panorama ${children ? "has-image" : "typography-first"}`} data-composition="PANORAMA"><div className="emg-hero-visual">{children}</div><HeroTitle block={block} data={data} intro={intro} /></header>;
}
export function HeroSplit({ block, data, children, intro, limited }: HeroProps) {
  return <header className={`emg-hero emg-hero-split ${children ? "has-image" : "typography-first"} ${limited ? "emg-hero-limited" : ""}`} data-composition="SPLIT"><HeroTitle block={block} data={data} intro={intro} />{children && <div className="emg-hero-visual">{children}</div>}</header>;
}
export function HeroCover({ block, data, children, intro, limited }: HeroProps) {
  return <header className={`emg-hero emg-hero-cover ${children ? "has-image" : "typography-first"} ${limited ? "emg-hero-limited" : ""}`} data-composition="EDITORIAL"><HeroTitle block={block} data={data} intro={intro} />{children && <div className="emg-hero-visual">{children}</div>}</header>;
}
export function EditorialIntroduction({ block, heading }: StoryProps) { return block.text.trim() || block.title || heading ? <section className="emg-intro"><EditorialProse block={block} heading={heading} /></section> : null; }
export function TextImageStorySection({ block, heading, children }: StoryProps) {
  if (!block.mediaIds.length) return <section className="emg-text-section"><EditorialProse block={block} heading={heading} /></section>;
  const hasCopy = Boolean(block.text.trim() || block.title || heading);
  return <section className={`emg-split emg-image-${block.placement} ${hasCopy ? "" : "emg-photo-only"}`}><EditorialProse block={block} heading={heading} /><div className="emg-story-image">{children}</div></section>;
}
export function FullBleedImage({ block, heading, children }: StoryProps) { const title = cleanPlaceDisplayName(stripMarkdownHeading(block.title)); return <section className="emg-full-image">{renderEditorialSectionHeading(title, heading)}{children}</section>; }
export function StaggeredImageGallery({ block, heading, children }: StoryProps) { const title = cleanPlaceDisplayName(stripMarkdownHeading(block.title)); return <section className="emg-gallery-section">{renderEditorialSectionHeading(title, heading)}<div className={`emg-gallery emg-gallery-${block.gallery}`} data-images={block.mediaIds.length}>{children}</div></section>; }
export function VisualHighlights({ data, duration }: { data: EditorialPageData; duration: string }) {
  if (!hasEditorialFacts(data)) return null;
  return <section className="emg-facts" aria-label="Điểm nhấn">{editorialValue(data.area) && <div><span>Khu vực</span><strong>{editorialValue(data.area)}</strong></div>}{editorialValue(data.category) && <div><span>Loại hình</span><strong>{editorialValue(data.category)}</strong></div>}{hasEditorialDuration(data.suggestedDurationMinutes) && <div><span>Nhịp tham quan</span><strong>{duration}</strong></div>}</section>;
}
export function MapSection({ block, data }: StoryProps & { data: EditorialPageData }) {
  if (!hasEditorialCoordinates(data)) return null;
  return <section className="emg-map"><h2>{block.title || "Vị trí tham chiếu"}</h2><p className="emg-map-note">Tọa độ tham chiếu của điểm đến; kiểm tra lối vào và đường đi phù hợp trước khi di chuyển.</p><DestinationDetailIframeMap destination={data} label={`Bản đồ tham chiếu ${data.name}`} /></section>;
}
export function SourceAttribution({ block, sources }: StoryProps & { sources: ResolvedEditorial["sources"] }) {
  const allowed = sources.filter(s => block.sourceIds.includes(s.id) && editorialValue(s.title));
  if (!allowed.length) return null;
  return <section className="emg-sources"><h2>Nguồn tham khảo</h2><ul>{allowed.map(source => { const title = cleanDocumentSourceTitle(source.title) || source.title; return <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{title}</a> : title}</li>; })}</ul></section>;
}
