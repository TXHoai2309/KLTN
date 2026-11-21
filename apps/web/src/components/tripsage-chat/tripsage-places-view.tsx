"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import { canPreviewPlace, type PlacePreviewTarget } from "@/lib/place-preview-url";

const placesPartSchema = z.object({ places: z.array(z.object({ placeId: z.string().min(1).max(300), name: z.string().min(1).max(80), status: z.literal("UNCHECKED") })).max(5) });
export type PlaceSuggestion = z.infer<typeof placesPartSchema>["places"][number];

/** Parses the streamed `data-places` payload; anything off-schema is dropped, never rendered. */
export function parsePlacesPart(data: unknown): PlaceSuggestion[] {
  const parsed = placesPartSchema.safeParse(data);
  return parsed.success ? parsed.data.places : [];
}

/** External Google places as suggestions only: labelled outside the catalogue, unchecked, not part of any schedule. */
export function TripsagePlacesView({ places }: { places: readonly PlaceSuggestion[] }) {
  const [preview, setPreview] = useState<{ target: PlacePreviewTarget; trigger: HTMLElement | null } | null>(null);
  if (!places.length) return null;
  return (
    <aside className="assistant-muted tripsage-places-aside" aria-label="Gợi ý địa điểm ngoài danh mục" lang="vi">
      <p><strong>Gợi ý ngoài danh mục</strong> (chưa kiểm tra, chưa nằm trong lịch trình)</p>
      <ul className="tripsage-places-list">
        {places.map(place => {
          const candidate: PlacePreviewTarget = { kind: "GOOGLE_PLACE", name: place.name, placeId: place.placeId };
          const previewable = canPreviewPlace(candidate);
          return (
            <li key={place.placeId} className="tripsage-places-row">
              <span>{place.name} <em>· ngoài danh mục · chưa kiểm tra</em></span>
              {previewable && (
                <button
                  type="button"
                  className="tripsage-preview-btn"
                  aria-label={`Xem nhanh ${place.name}`}
                  onClick={event => setPreview({ target: candidate, trigger: event.currentTarget })}
                >
                  <Eye size={12} aria-hidden="true" />
                  <span>Xem nhanh</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p style={{ fontSize: 12 }}>Nguồn: <span translate="no">Google Maps</span></p>
      <PlacePreviewModal
        target={preview?.target ?? null}
        returnFocusTo={preview?.trigger ?? null}
        onClose={() => setPreview(null)}
      />
    </aside>
  );
}
