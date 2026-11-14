"use client";

import { z } from "zod";

const placesPartSchema = z.object({ places: z.array(z.object({ placeId: z.string().min(1).max(300), name: z.string().min(1).max(80), status: z.literal("UNCHECKED") })).max(5) });
export type PlaceSuggestion = z.infer<typeof placesPartSchema>["places"][number];

/** Parses the streamed `data-places` payload; anything off-schema is dropped, never rendered. */
export function parsePlacesPart(data: unknown): PlaceSuggestion[] {
  const parsed = placesPartSchema.safeParse(data);
  return parsed.success ? parsed.data.places : [];
}

/** External Google places as suggestions only: labelled outside the catalogue, unchecked, not part of any schedule. No link is shown (Google link terms not verified). */
export function TripsagePlacesView({ places }: { places: readonly PlaceSuggestion[] }) {
  if (!places.length) return null;
  return (
    <aside className="assistant-muted" aria-label="Gợi ý địa điểm ngoài danh mục" lang="vi">
      <p><strong>Gợi ý ngoài danh mục</strong> (chưa kiểm tra, chưa nằm trong lịch trình)</p>
      <ul>{places.map(place => <li key={place.placeId}>{place.name} <em>· ngoài danh mục · chưa kiểm tra</em></li>)}</ul>
      <p style={{ fontSize: 12 }}>Nguồn: <span translate="no">Google Maps</span></p>
    </aside>
  );
}
