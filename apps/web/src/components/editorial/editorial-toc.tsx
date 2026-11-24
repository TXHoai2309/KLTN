import React from "react";
import type { EditorialTocItem } from "@/modules/destination-editorial/editorial-display-transform";

export function EditorialTocNav({ items, variant }: { items: readonly EditorialTocItem[]; variant: "aside" | "mobile" }) {
  if (items.length < 2) return null;

  const list = (
    <ol className="emg-toc-list">
      {items.map(item => (
        <li key={item.id}>
          <a href={`#${item.id}`}>{item.title}</a>
        </li>
      ))}
    </ol>
  );

  if (variant === "mobile") {
    return (
      <details className="emg-toc-mobile">
        <summary>Mục lục ({items.length} mục)</summary>
        {list}
      </details>
    );
  }

  return (
    <aside className="emg-toc-aside" aria-label="Mục lục bài viết">
      <nav aria-label="Mục lục trong bài" className="emg-toc-card">
        <p className="emg-toc-title">Mục lục</p>
        {list}
      </nav>
    </aside>
  );
}
