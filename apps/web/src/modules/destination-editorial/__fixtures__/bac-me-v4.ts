/** Test only. Read-only DOM capture of Owner's Destination; no historical verification claim. */
import captured from "./bac-me-v4-dom.json";
import type { EditorialContext, EditorialLayoutV2, EditorialNodeV2 } from "../editorial-contract";
import { buildCanonicalContentAst } from "../editorial-ast";

export const bacMeContext: EditorialContext = {
  id: "cmv9fcwo1000be89w3yxz3mqu", name: captured.title,
  category: "di tích lịch sử – kiến trúc", area: "khu vực hà giang",
  description: captured.description, latitude: 23, longitude: 105,
  suggestedDurationMinutes: 60, openingDays: [],
  media: captured.images.map((image, index) => ({ ...image, caption: null, author: null, sourceUrl: null,
    isCover: index === 0, websiteRights: "APPROVED",
    storageReference: JSON.stringify({ provider: "cloudinary", width: image.width, height: image.height }),
  })),
  sources: captured.sources.map(source => ({ ...source, websiteRights: "APPROVED" })),
};

/** Layout candidates contain references only; every variant uses the same canonical AST. */
export function bacMeCandidates(context: EditorialContext): EditorialLayoutV2[] {
  const units = buildCanonicalContentAst(context).units.filter(u => u.provenance.sourceField === "description");
  const prose = units.map(unit => ({ id: unit.id, type: unit.type === "CHAPTER_HEADING" ? "HEADING" : unit.type === "INTRO" ? "LEAD" : "PARAGRAPH", contentRef: unit.id, text: "" } as EditorialNodeV2));
  const media = context.media.map(m => m.id);
  const shell = (body: EditorialNodeV2[]): EditorialLayoutV2 => ({
    schemaVersion: 2, mode: "GENERATIVE", family: "HERITAGE_STORY", variant: "EDITORIAL",
    hero: { composition: "EDITORIAL", locked: false },
    design: { typography: "LITERARY", palette: "FOREST", rhythm: "COMPACT", containerWidth: "WIDE" },
    sections: [{ id: "hero", type: "HERO", title: context.name, mediaIds: [media[0]!], crop: "original" },
      ...body, { id: "sources", type: "SOURCES", sourceIds: context.sources.map(s => s.id) }],
  });
  return [
    shell([prose[0]!, { id: "chapters", type: "COLUMNS", columns: 2, children: prose.slice(1, 5) },
      { id: "documentary", type: "IMAGE_TEXT", placement: "right", crop: "original", mediaIds: [media[1]!], children: prose.slice(5, 7) },
      ...prose.slice(7), { id: "gallery", type: "GALLERY", crop: "original", gallery: "grid", mediaIds: media.slice(2) }]),
    shell([prose[0]!, { id: "opening-pair", type: "IMAGE_TEXT", placement: "left", crop: "original", mediaIds: [media[1]!], children: prose.slice(1, 3) },
      { id: "middle-pair", type: "IMAGE_TEXT", placement: "right", crop: "original", mediaIds: [media[2]!], children: prose.slice(3, 6) },
      { id: "closing-group", type: "SECTION", children: prose.slice(6) },
      { id: "closing-photos", type: "IMAGE_MOSAIC", crop: "original", mediaIds: media.slice(3) }]),
    shell([prose[0]!, { id: "reading", type: "SECTION", children: prose.slice(1, 4) },
      { id: "visual-pause", type: "PANORAMA", crop: "original", mediaIds: [media[1]!] },
      { id: "chapter-pairs", type: "GRID", columns: 2, children: prose.slice(4, 8) },
      ...prose.slice(8), { id: "documentation", type: "GALLERY", crop: "original", gallery: "strip", mediaIds: media.slice(2) }]),
    shell([prose[0]!, { id: "photo-essay", type: "IMAGE_TEXT", placement: "right", crop: "original", mediaIds: [media[1]!], children: prose.slice(1, 4) },
      { id: "photo-group", type: "IMAGE_MOSAIC", crop: "original", mediaIds: media.slice(2, 4) },
      { id: "closing-columns", type: "COLUMNS", columns: 2, children: prose.slice(4) },
      { id: "closing-photo", type: "IMAGE", crop: "original", mediaIds: media.slice(4) }]),
  ];
}
