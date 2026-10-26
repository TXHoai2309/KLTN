import React from "react";
import DestinationDetailIframeMap from "@/components/map/destination-detail-iframe-map";
import { formatSuggestedDuration } from "@/modules/destination/public-destination-contract";
import type { EditorialContext, EditorialLayoutV2, EditorialNodeV2, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
import { isV2Layout } from "@/modules/destination-editorial/editorial-contract";
import { formatHeroLocation, renderFormattedEditorialText } from "./editorial-story";
import EditorialPhoto from "./editorial-photo";
import type { EditorialPageData } from "./editorial-renderer";
import { stripMarkdownHeading, editorialTitlePhrases } from "@/modules/destination-editorial/editorial-content";
import { hasEditorialCoordinates, hasEditorialFacts } from "@/modules/destination-editorial/editorial-display-policy";
import { editorialHeroPlan } from "@/modules/destination-editorial/editorial-hero";

export default function EditorialGenerativeRenderer({
  data,
  editorial,
}: {
  data: EditorialPageData;
  editorial: ResolvedEditorial;
}) {
  if (!isV2Layout(editorial.layout)) return null;

  const layout = editorial.layout as EditorialLayoutV2;
  const design = layout.design ?? {
    typography: "LITERARY",
    palette: "FOREST",
    rhythm: "IMMERSIVE",
    containerWidth: "STANDARD",
  };
  const { media, sources } = editorial;

  const findPhoto = (id: string, node: EditorialNodeV2, priority = false) => {
    const item = media.find(m => m.id === id);
    if (!item) return null;
    return (
      <EditorialPhoto
        key={id}
        media={item}
        block={{
          id: node.id,
          type: "FULL_WIDTH_IMAGE",
          crop: node.crop ?? "wide",
          focalX: node.focalX ?? 50,
          focalY: node.focalY ?? 50,
          caption: node.caption ?? "",
          hidden: false,
          title: "",
          text: "",
          mediaIds: [id],
          sourceIds: [],
          placement: "full",
          gallery: "mosaic",
          entries: [],
        }}
        priority={priority}
      />
    );
  };

  const renderNode = (node: EditorialNodeV2, index: number): React.ReactNode => {
    if (node.hidden) return null;

    const cleanTitle = stripMarkdownHeading(node.title ?? "");
    let cleanText = node.text ?? "";
    if (cleanTitle && cleanText) {
      const normTitle = stripMarkdownHeading(cleanTitle).toLowerCase();
      const normText = stripMarkdownHeading(cleanText).toLowerCase();
      if (normTitle === normText) {
        cleanText = "";
      } else {
        const lines = cleanText.split(/\n/);
        if (lines.length > 1 && stripMarkdownHeading(lines[0]!.trim()).toLowerCase() === normTitle) {
          cleanText = lines.slice(1).join("\n").trim();
        }
      }
    }

    switch (node.type) {
      case "HERO": {
        const heroPhoto = node.mediaIds?.[0] ? findPhoto(node.mediaIds[0], node, true) : null;
        const title = cleanTitle || data.name;
        const phrases = editorialTitlePhrases(title);
        const locationText = formatHeroLocation(data.area, data.name);
        const heroImage = media.find(item => item.id === node.mediaIds?.[0]);
        const plan = editorialHeroPlan(layout, heroImage);
        const composition = plan.composition;

        return (
          <header
            key={node.id}
            className={`emg-hero emg-hero-${composition === "EDITORIAL" ? "cover" : composition.toLowerCase()} ${plan.limited || !plan.known ? "emg-hero-limited" : ""} ${heroPhoto ? "has-image" : "typography-first"}`}
            data-composition={composition}
          >
            {composition === "PANORAMA" && heroPhoto && <div className="emg-hero-visual">{heroPhoto}</div>}
            <div className="emg-title" data-title-length={title.length > 45 ? "long" : "short"}>
              <p className="emg-kicker">Hà Giang · {data.category}</p>
              <h1>
                {phrases.map((p, i) => (
                  <React.Fragment key={i}>
                    <span>{p}</span>
                    {i < phrases.length - 1 ? " " : null}
                  </React.Fragment>
                ))}
              </h1>
              {node.deck && <p className="emg-deck">{node.deck}</p>}
              {locationText && <span className="emg-location">{locationText}</span>}
            </div>
            {composition !== "PANORAMA" && heroPhoto && <div className="emg-hero-visual">{heroPhoto}</div>}
          </header>
        );
      }

      case "LEAD": {
        if (!cleanText && !cleanTitle) return null;
        return (
          <section key={node.id} className="emg-intro">
            <div className="emg-prose">
              {cleanTitle && <h2>{cleanTitle}</h2>}
              {cleanText && <p>{renderFormattedEditorialText(cleanText)}</p>}
            </div>
          </section>
        );
      }

      case "IMAGE_TEXT": {
        const photo = node.mediaIds?.[0] ? findPhoto(node.mediaIds[0], node) : null;
        const placement = node.placement ?? "right";
        return (
          <section key={node.id} className={`emg-split emg-image-${placement} emg-ratio-${(node.columnRatio ?? "EQUAL").toLowerCase()} ${photo ? "" : "no-image"}`}>
            <div className={`emg-prose ${node.emphasis === "FEATURED" ? "emg-prose-featured" : ""}`}>
              {cleanTitle && <h2>{cleanTitle}</h2>}
              {cleanText.split(/\n\s*\n/).map((p, i) => (
                <p key={i}>{renderFormattedEditorialText(p)}</p>
              ))}
              {node.children?.map((child, i) => renderNode(child, i))}
            </div>
            {photo && <div className="emg-story-image">{photo}</div>}
          </section>
        );
      }

      case "GRID":
      case "COLUMNS": {
        const cols = node.columns ?? 2;
        return (
          <section
            key={node.id}
            className={`emg-gen-grid emg-gen-cols-${cols} emg-gen-gap-${(node.gap ?? "medium").toLowerCase()}`}
          >
            {cleanTitle && <h2 className="emg-gen-grid-title">{cleanTitle}</h2>}
            {cleanText && (
              <div className={`emg-gen-grid-lead ${cols > 1 && !node.children?.length ? "emg-columns-text" : ""} emg-prose`}>
                {cleanText.split(/\n\s*\n/).map((p, i) => (
                  <p key={i}>{renderFormattedEditorialText(p)}</p>
                ))}
              </div>
            )}
            {node.children?.map((child, cIdx) => <div className="emg-grid-cell" key={child.id}>{renderNode(child, cIdx)}</div>)}
            {node.mediaIds?.map(id => findPhoto(id, node))}
          </section>
        );
      }

      case "SECTION":
      case "PAGE":
      case "CONTAINER":
      case "STACK": {
        const hasChildren = Boolean(node.children?.length);
        const filteredChildren = node.children?.filter((c, idx) => {
          if (idx === 0 && cleanTitle) {
            const childTitle = stripMarkdownHeading(c.title ?? "");
            const childText = stripMarkdownHeading(c.text ?? "");
            if (c.type === "HEADING" && (childTitle === cleanTitle || childText === cleanTitle)) return false;
            if (c.type === "PARAGRAPH" && !c.children?.length && (!childText || childText === cleanTitle)) return false;
          }
          return true;
        });
        return (
          <section key={node.id} className="emg-gen-section">
            {cleanTitle && <h2>{cleanTitle}</h2>}
            {cleanText && (
              <div className={`emg-prose ${node.emphasis === "FEATURED" ? "emg-prose-featured" : ""}`}>
                {cleanText.split(/\n\s*\n/).map((p, i) => (
                  <p key={i}>{renderFormattedEditorialText(p)}</p>
                ))}
              </div>
            )}
            {node.mediaIds?.map(id => findPhoto(id, node))}
            {hasChildren && <div className="emg-gen-children">{filteredChildren!.map((c, i) => renderNode(c, i))}</div>}
          </section>
        );
      }

      case "HEADING": {
        return cleanTitle || cleanText ? <h2 key={node.id} className="emg-gen-heading">{cleanTitle || cleanText}</h2> : null;
      }

      case "PARAGRAPH": {
        if (!cleanText && !cleanTitle) return null;
        return (
          <div key={node.id} className={`emg-prose ${node.emphasis === "FEATURED" ? "emg-prose-featured" : ""}`}>
            {cleanTitle && <h2>{cleanTitle}</h2>}
            {cleanText.split(/\n\s*\n/).map((p, i) => (
              <p key={i}>{renderFormattedEditorialText(p)}</p>
            ))}
          </div>
        );
      }

      case "IMAGE": {
        if (!node.mediaIds?.[0]) return null;
        return <section key={node.id} className="emg-gen-image">{cleanTitle && <h2>{cleanTitle}</h2>}{cleanText && <div className="emg-prose"><p>{renderFormattedEditorialText(cleanText)}</p></div>}{findPhoto(node.mediaIds[0], node)}</section>;
      }

      case "PANORAMA": {
        if (!node.mediaIds?.[0]) return null;
        return (
          <section key={node.id} className="emg-full-image">
            {cleanTitle && <h2>{cleanTitle}</h2>}
            {cleanText && <div className="emg-prose"><p>{renderFormattedEditorialText(cleanText)}</p></div>}
            {findPhoto(node.mediaIds[0], node)}
          </section>
        );
      }

      case "IMAGE_MOSAIC": {
        if (!node.mediaIds?.length) return null;
        return (
          <section key={node.id} className={`emg-mosaic-section ${node.crop === "original" ? "emg-mosaic-original" : ""}`}>
            {cleanTitle && <h2 className="emg-mosaic-title">{cleanTitle}</h2>}
            {cleanText && <div className="emg-prose"><p>{renderFormattedEditorialText(cleanText)}</p></div>}
            <div className="emg-mosaic-grid" data-images={node.mediaIds.length}>
              {node.mediaIds.map((id, mIdx) => (
                <figure
                  key={id}
                  className={`emg-mosaic-tile emg-mosaic-tile-${mIdx === 0 ? "featured" : "standard"}`}
                >
                  {findPhoto(id, node)}
                </figure>
              ))}
            </div>
          </section>
        );
      }

      case "GALLERY": {
        if (!node.mediaIds?.length) return null;
        const galleryType = node.gallery ?? "grid";
        return (
          <section key={node.id} className="emg-gallery-section">
            {cleanTitle && <h2>{cleanTitle}</h2>}
            {cleanText && <div className="emg-prose"><p>{renderFormattedEditorialText(cleanText)}</p></div>}
            <div className={`emg-gallery emg-gallery-${galleryType}`} data-images={node.mediaIds.length}>
              {node.mediaIds.map(id => findPhoto(id, node))}
            </div>
          </section>
        );
      }

      case "QUOTE": {
        if (!cleanText) return null;
        const sourceTitle = node.sourceIds?.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ") || "Từ hồ sơ điểm đến";
        return (
          <section key={node.id} className="emg-quote">
            <blockquote>{cleanText}</blockquote>
            <p>{sourceTitle}</p>
          </section>
        );
      }

      case "TIMELINE": {
        if (!node.entries?.length) return null;
        return (
          <section key={node.id} className="emg-timeline">
            <h2>{cleanTitle || "Dấu mốc lịch sử"}</h2>
            <ol>
              {node.entries.map((entry, eIdx) => (
                <li key={eIdx}>
                  <strong>{entry.label}</strong>
                  <p>{entry.text}</p>
                  <span>
                    {entry.sourceIds.map(id => sources.find(s => s.id === id)?.title).filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      }

      case "FACTS": {
        if (!hasEditorialFacts(data)) return null;
        return (
          <section key={node.id} className="emg-facts emg-gen-facts" aria-label="Điểm nhấn">
            {data.area && (
              <div className="emg-fact-item">
                <span className="emg-fact-label">Khu vực</span>
                <strong className="emg-fact-value">{data.area}</strong>
              </div>
            )}
            {data.category && (
              <div className="emg-fact-item">
                <span className="emg-fact-label">Loại hình</span>
                <strong className="emg-fact-value">{data.category}</strong>
              </div>
            )}
            {data.suggestedDurationMinutes && (
              <div className="emg-fact-item">
                <span className="emg-fact-label">Nhịp tham quan</span>
                <strong className="emg-fact-value">{formatSuggestedDuration(data.suggestedDurationMinutes)}</strong>
              </div>
            )}
          </section>
        );
      }

      case "VISIT_INFORMATION": return null;

      case "MAP": {
        if (!hasEditorialCoordinates(data)) return null;
        return (
          <section key={node.id} className="emg-map">
            <h2>{cleanTitle || "Vị trí tham chiếu"}</h2>
            <p className="emg-map-note">
              Tọa độ tham chiếu của điểm đến; kiểm tra lối vào và đường đi phù hợp trước khi di chuyển.
            </p>
            <DestinationDetailIframeMap destination={data} label={`Bản đồ tham chiếu ${data.name}`} />
          </section>
        );
      }

      case "SOURCES": {
        const allowed = sources.filter(s => (node.sourceIds?.length ? node.sourceIds.includes(s.id) : true));
        if (!allowed.length) return null;
        return (
          <section key={node.id} className="emg-sources">
            <h2>{cleanTitle || "Nguồn tham khảo"}</h2>
            <ul>
              {allowed.map(source => (
                <li key={source.id}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      }

      default:
        return null;
    }
  };

  return (
    <article
      className={`emg emg-gen emg-type-${design.typography.toLowerCase()} emg-palette-${design.palette.toLowerCase()} emg-rhythm-${design.rhythm.toLowerCase()} emg-width-${(design.containerWidth ?? "standard").toLowerCase()}`}
      lang="vi"
      data-generative-version="2"
      data-typography={design.typography}
    >
      {layout.sections.map((sec, idx) => renderNode(sec, idx))}
    </article>
  );
}
