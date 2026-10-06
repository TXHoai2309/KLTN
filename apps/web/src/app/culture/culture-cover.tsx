"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";

export default function CultureCover({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="culture-cover">
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="culture-cover-fallback" role="img" aria-label="Chưa có ảnh bìa">
          <BookOpen aria-hidden="true" />
          <span>Chưa có ảnh bìa</span>
        </div>
      )}
    </div>
  );
}
