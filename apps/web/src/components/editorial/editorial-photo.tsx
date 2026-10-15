"use client";
import { useState } from "react";
import type { EditorialBlock, ResolvedEditorial } from "@/modules/destination-editorial/editorial-contract";
function deliveryUrl(url: string) { return url.replace(/^(https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/)(v\d+\/)/, "$1w_1600,c_limit,q_auto,f_auto/$2"); }
export default function EditorialPhoto({ media, block, priority = false }: { media: ResolvedEditorial["media"][number]; block: EditorialBlock; priority?: boolean }) {
  const [failed, setFailed] = useState<string>();
  return <figure className={`emg-photo emg-crop-${block.crop}`} data-resolution={media.width && media.width < 1200 ? "limited" : media.width ? "standard" : "unknown"} style={{ maxWidth: media.width ?? 960 }}>
    {failed === media.url ? <div className="emg-photo-fallback" role="img" aria-label={`Ảnh tạm không khả dụng: ${media.alt}`}>Ảnh tạm không khả dụng</div> :
      <img src={deliveryUrl(media.url)} alt={media.alt} width={media.width ?? 1600} height={media.height ?? 1000} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" style={{ objectPosition: `${block.focalX}% ${block.focalY}%` }} onError={() => setFailed(media.url)} />}
    {(block.caption || media.caption || media.author) && <figcaption>{block.caption || media.caption}{media.author && <span> · Ảnh: {media.author}</span>}{media.sourceUrl && <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer"> · Nguồn ảnh</a>}</figcaption>}
  </figure>;
}
