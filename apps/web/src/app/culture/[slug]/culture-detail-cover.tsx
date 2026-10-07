"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";

export default function CultureDetailCover({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="culture-detail-cover">
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={alt}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="culture-detail-cover-fallback"
          role="img"
          aria-label="Chưa có ảnh bìa"
        >
          <BookOpen aria-hidden="true" />
          <span>Chưa có ảnh bìa</span>
        </div>
      )}
    </div>
  );
}
