"use client";

import { z } from "zod";

const sourcesPartSchema = z.object({ sources: z.array(z.object({ domain: z.string().min(3).max(253).regex(/^[a-z0-9.-]+$/u) })).max(10) });
export type WebSource = z.infer<typeof sourcesPartSchema>["sources"][number];

/** Parses the streamed `data-sources` payload; anything off-schema is dropped, never rendered. */
export function parseSourcesPart(data: unknown): WebSource[] {
  const parsed = sourcesPartSchema.safeParse(data);
  return parsed.success ? parsed.data.sources : [];
}

/** Web sources as plain domain names only: no link, no HTML and no web text is rendered. */
export function TripsageSourcesView({ sources }: { sources: readonly WebSource[] }) {
  if (!sources.length) return null;
  return (
    <aside className="assistant-muted" aria-label="Nguồn web tham khảo" lang="vi">
      <p style={{ fontSize: 12 }}><strong>Nguồn web tham khảo</strong> (chưa được kiểm tra): {sources.map((source, index) => <span key={source.domain} translate="no">{index ? ", " : ""}{source.domain}</span>)}</p>
    </aside>
  );
}
