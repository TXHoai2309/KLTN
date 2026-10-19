import type { EditorialContext } from "./editorial-contract";
export function editorialImageDimensions(media: Pick<EditorialContext["media"][number], "url" | "storageReference">): { width?: number; height?: number } {
  try {
    const r = JSON.parse(media.storageReference ?? "null");
    if (r?.provider !== "cloudinary" || !r.assetId || !r.publicId || !Number.isSafeInteger(r.version) || !media.url.startsWith(`https://res.cloudinary.com/${r.cloud}/image/upload/v${r.version}/`) || !Number.isInteger(r.width) || !Number.isInteger(r.height) || r.width < 1 || r.height < 1 || r.width * r.height > 25_000_000) return {};
    return { width: r.width, height: r.height };
  } catch { return {}; }
}
export function editorialImageWarnings(media: EditorialContext["media"]) {
  return media.flatMap(m => { const d = editorialImageDimensions(m); return !d.width || d.width < 1200 ? [{ id: m.id, alt: m.alt, width: d.width ?? null, height: d.height ?? null }] : []; });
}
