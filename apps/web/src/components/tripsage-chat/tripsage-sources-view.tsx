"use client";

import { BookOpen } from "lucide-react";
import { sourcesPartSchema, type ChatSourceItem } from "@/modules/tripsage-chat/tripsage-chat-context";

export type { ChatSourceItem };

/** Parses the streamed `data-sources` payload; anything off-schema or containing internal URLs is dropped, never rendered. */
export function parseSourcesPart(data: unknown): ChatSourceItem[] {
  const parsed = sourcesPartSchema.safeParse(data);
  return parsed.success ? parsed.data.sources : [];
}

/**
 * Displays reviewed local document titles as plain chips (no internal URLs or links) and any web source domains
 * as plain domain names.
 */
export function TripsageSourcesView({ sources }: { sources: readonly ChatSourceItem[] }) {
  if (!sources.length) return null;
  const documents = sources.filter((source): source is Extract<ChatSourceItem, { kind: "DOCUMENT" }> => "kind" in source && source.kind === "DOCUMENT");
  const web = sources.filter((source): source is Extract<ChatSourceItem, { domain: string }> => "domain" in source);
  return (
    <div className="tripsage-sources" lang="vi">
      {documents.length > 0 && (
        <aside className="tripsage-doc-sources" aria-label="Nguồn tài liệu tham khảo">
          <span className="tripsage-sources-label"><BookOpen size={13} aria-hidden="true" />Nguồn tài liệu:</span>
          <ul className="tripsage-source-chips">
            {documents.map(doc => <li key={doc.title} className="tripsage-source-chip">{doc.title}</li>)}
          </ul>
        </aside>
      )}
      {web.length > 0 && (
        <aside className="assistant-muted" aria-label="Nguồn web tham khảo">
          <p style={{ fontSize: 12 }}><strong>Nguồn web tham khảo</strong> (chưa được kiểm tra): {web.map((source, index) => <span key={source.domain} translate="no">{index ? ", " : ""}{source.domain}</span>)}</p>
        </aside>
      )}
    </div>
  );
}
