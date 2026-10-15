import React from "react";
import DestinationMap from "@/components/map/destination-map";
import { editorialTitlePhrases, normalizeEditorialText } from "@/modules/destination-editorial/editorial-content";
import type { EditorialBlock, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import type { EditorialPageData } from "./editorial-renderer";

import { editorialValue, hasEditorialCoordinates, hasEditorialDuration, hasEditorialFacts } from "@/modules/destination-editorial/editorial-display-policy";

type StoryProps = { block: EditorialBlock; children?: React.ReactNode };
export function EditorialProse({ block }: { block: Pick<EditorialBlock, "title" | "text" | "emphasis"> }) {
  if (!block.title && !block.text.trim()) return null;
  return <div className={`emg-prose ${block.emphasis === "FEATURED" ? "emg-prose-featured" : ""}`}>{block.title && <h2>{block.title}</h2>}{block.text.split(/\n\s*\n/).filter(p => p.trim()).map((p, i) => <p key={i}>{p}</p>)}</div>;
}
function HeroTitle({ block, data }: { block: EditorialBlock; data: EditorialPageData }) {
  const title = block.title || data.name;
  const deck = block.deck || (block.text.length <= 180 ? block.text : "");
  const phrases = editorialTitlePhrases(title);
  return <div className="emg-title" data-title-length={title.length > 32 ? "long" : "short"}><p className="emg-kicker">Hà Giang{editorialValue(data.category) && ` · ${editorialValue(data.category)}`}</p><h1>{phrases.map((p, i) => <React.Fragment key={i}><span>{p}</span>{i < phrases.length - 1 ? " " : null}</React.Fragment>)}</h1>{deck && normalizeEditorialText(deck) !== normalizeEditorialText(title) && <p className="emg-deck">{deck}</p>}{editorialValue(data.area) && <span className="emg-location">{editorialValue(data.area)}</span>}</div>;
}
export function HeroPanorama({ block, data, children }: StoryProps & { data: EditorialPageData }) {
  return <header className={`emg-hero ${block.mediaIds.length ? "has-image" : "typography-first"}`}><HeroTitle block={block} data={data} />{children}</header>;
}
export const HeroSplit = HeroPanorama;
export function EditorialIntroduction({ block }: StoryProps) { return block.text.trim() || block.title ? <section className="emg-intro"><EditorialProse block={block} /></section> : null; }
export function TextImageStorySection({ block, children }: StoryProps) {
  if (!block.mediaIds.length) return <section className="emg-text-section"><EditorialProse block={block} /></section>;
  const hasCopy = Boolean(block.text.trim() || block.title);
  return <section className={`emg-split emg-image-${block.placement} ${hasCopy ? "" : "emg-photo-only"}`}><EditorialProse block={block} /><div className="emg-story-image">{children}</div></section>;
}
export function FullBleedImage({ block, children }: StoryProps) { return <section className="emg-full-image">{block.title && <h2>{block.title}</h2>}{children}</section>; }
export function StaggeredImageGallery({ block, children }: StoryProps) { return <section className="emg-gallery-section">{block.title && <h2>{block.title}</h2>}<div className={`emg-gallery emg-gallery-${block.gallery}`} data-images={block.mediaIds.length}>{children}</div></section>; }
export function VisualHighlights({ data, duration }: { data: EditorialPageData; duration: string }) {
  if (!hasEditorialFacts(data)) return null;
  return <section className="emg-facts" aria-label="Điểm nhấn">{editorialValue(data.area) && <div><span>Khu vực</span><strong>{editorialValue(data.area)}</strong></div>}{editorialValue(data.category) && <div><span>Loại hình</span><strong>{editorialValue(data.category)}</strong></div>}{hasEditorialDuration(data.suggestedDurationMinutes) && <div><span>Nhịp tham quan</span><strong>{duration}</strong></div>}</section>;
}
export function MapSection({ block, data }: StoryProps & { data: EditorialPageData }) {
  if (!hasEditorialCoordinates(data)) return null;
  return <section className="emg-map"><h2>{block.title || "Vị trí tham chiếu"}</h2><p className="emg-map-note">Tọa độ tham chiếu của điểm đến; kiểm tra lối vào và đường đi phù hợp trước khi di chuyển.</p><DestinationMap destinations={[data]} detail label={`Bản đồ tham chiếu ${data.name}`} /></section>;
}
export function SourceAttribution({ block, sources }: StoryProps & { sources: ResolvedEditorial["sources"] }) {
  const allowed = sources.filter(s => block.sourceIds.includes(s.id) && editorialValue(s.title));
  if (!allowed.length) return null;
  return <section className="emg-sources"><h2>Nguồn tham khảo</h2><ul>{allowed.map(source => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</li>)}</ul></section>;
}
