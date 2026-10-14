"use client";
import { useState } from "react";
export default function PublishedMediaImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState<string>();
  if (failed === url) return <div role="img" aria-label={`Ảnh chưa tải được: ${alt}`} style={{ minHeight: 180, display: "grid", placeItems: "center" }}>Ảnh tạm không khả dụng</div>;
  return <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(url)} />;
}
