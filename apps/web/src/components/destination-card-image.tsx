"use client";
import { useState } from "react";
import { destinationThumbnail } from "@/modules/destination/destination-image-url";
export default function DestinationCardImage({ image }: { image?: { url: string; alt: string } | null }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return image && failedUrl !== image.url ? (
    <img
      src={destinationThumbnail(image.url)}
      alt={image.alt}
      width={640}
      height={400}
      loading="lazy"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setFailedUrl(image.url)}
    />
  ) : (
    <span
      className="destination-card-image-fallback"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: "16px",
        textAlign: "center",
        fontSize: "13px",
        color: "var(--tv-ink-2, #5c6660)",
        background: "var(--tv-sunken, #edf1ee)",
      }}
    >
      Chưa có ảnh
    </span>
  );
}
