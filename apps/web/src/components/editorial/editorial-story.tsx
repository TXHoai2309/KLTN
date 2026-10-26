import React from "react";
import DestinationDetailIframeMap from "@/components/map/destination-detail-iframe-map";
import { editorialTitlePhrases, normalizeEditorialText, stripMarkdownHeading } from "@/modules/destination-editorial/editorial-content";
import type { EditorialBlock, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import type { EditorialPageData } from "./editorial-renderer";
import { heroDeck } from "@/modules/destination-editorial/editorial-hero";

import { editorialValue, hasEditorialCoordinates, hasEditorialDuration, hasEditorialFacts } from "@/modules/destination-editorial/editorial-display-policy";

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
  const cleanLine = text.replace(/^#{1,6}\s+/, "").trim();
  return renderInlineMarkdown(cleanLine);
}

type StoryProps = { block: EditorialBlock; children?: React.ReactNode };
export function EditorialProse({ block }: { block: Pick<EditorialBlock, "title" | "text" | "emphasis"> }) {
  if (!block.title && !block.text.trim()) return null;
  const cleanTitle = stripMarkdownHeading(block.title);
  const paragraphs = block.text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return (
    <div className={`emg-prose ${block.emphasis === "FEATURED" ? "emg-prose-featured" : ""}`}>
      {cleanTitle && <h2>{cleanTitle}</h2>}
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
  return (
    <div className="emg-title" data-title-length={title.length > 32 ? "long" : "short"}>
      <p className="emg-kicker">Hà Giang{editorialValue(data.category) && ` · ${editorialValue(data.category)}`}</p>
      <h1>{phrases.map((p, i) => <React.Fragment key={i}><span>{p}</span>{i < phrases.length - 1 ? " " : null}</React.Fragment>)}</h1>
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
export function EditorialIntroduction({ block }: StoryProps) { return block.text.trim() || block.title ? <section className="emg-intro"><EditorialProse block={block} /></section> : null; }
export function TextImageStorySection({ block, children }: StoryProps) {
  if (!block.mediaIds.length) return <section className="emg-text-section"><EditorialProse block={block} /></section>;
  const hasCopy = Boolean(block.text.trim() || block.title);
  return <section className={`emg-split emg-image-${block.placement} ${hasCopy ? "" : "emg-photo-only"}`}><EditorialProse block={block} /><div className="emg-story-image">{children}</div></section>;
}
export function FullBleedImage({ block, children }: StoryProps) { const title = stripMarkdownHeading(block.title); return <section className="emg-full-image">{title && <h2>{title}</h2>}{children}</section>; }
export function StaggeredImageGallery({ block, children }: StoryProps) { const title = stripMarkdownHeading(block.title); return <section className="emg-gallery-section">{title && <h2>{title}</h2>}<div className={`emg-gallery emg-gallery-${block.gallery}`} data-images={block.mediaIds.length}>{children}</div></section>; }
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
  return <section className="emg-sources"><h2>Nguồn tham khảo</h2><ul>{allowed.map(source => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</li>)}</ul></section>;
}
