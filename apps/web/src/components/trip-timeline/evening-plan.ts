import { cleanPlaceDisplayName, resolveOvernightAreaLabel } from "@/lib/traveler-display-clean";
import { foldSuggestionKey } from "@/modules/tripsage-chat/tripsage-timeline";
import type { PlacePreviewTarget } from "@/lib/place-preview-url";
import type { DayTimelineEveningPlan, DayTimelineNearbyItem } from "./day-timeline";

export const MAX_EVENING_PLACES = 3;

function dedupeNearbyByName<T extends { name: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = foldSuggestionKey(cleanPlaceDisplayName(item.name) || item.name);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(item);
  }
  return out;
}

export interface BuildDayEveningPlanInput {
  dayIndex: number;
  totalDays: number;
  /** Canonical overnight area from `journeyPlan.overnightStays` (D3 / B3), taking priority over last-stop fallback. */
  overnightAreaOverride?: string | null;
  lastStopArea?: string | null;
  lastStopName?: string | null;
  lastStopAddress?: string | null;
  lastStopLatitude?: number | null;
  lastStopLongitude?: number | null;
  chosenLodging?: { name: string; previewTarget?: PlacePreviewTarget | null } | null;
  lodgingSuggestions?: DayTimelineEveningPlan["lodgingSuggestions"];
  eveningPlaces: readonly DayTimelineNearbyItem[];
}

/**
 * Builds the "Tối nay" evening plan block for Days 1..N-1 (PARITY BR-7..BR-9).
 * Returns `null` on the final day (`dayIndex >= totalDays`).
 * Always renders for Days 1..N-1 even when `eveningPlaces` is empty so the traveler
 * still sees the overnight area, lodging, and the fallback message "Chưa tìm được gợi ý buổi tối".
 */
export function buildDayEveningPlan(input: BuildDayEveningPlanInput): DayTimelineEveningPlan | null {
  if (input.dayIndex >= input.totalDays) return null;
  const overrideArea = input.overnightAreaOverride?.trim();
  const overnightArea =
    overrideArea ||
    resolveOvernightAreaLabel(input.lastStopArea, input.lastStopName, {
      chosenLodgingName: input.chosenLodging?.name ?? null,
      address: input.lastStopAddress ?? null,
      latitude: input.lastStopLatitude ?? null,
      longitude: input.lastStopLongitude ?? null,
    });
  return {
    nightIndex: input.dayIndex,
    overnightArea,
    chosenLodging: input.chosenLodging
      ? {
          name: cleanPlaceDisplayName(input.chosenLodging.name) || input.chosenLodging.name,
          previewTarget: input.chosenLodging.previewTarget ?? null,
        }
      : null,
    lodgingSuggestions: input.lodgingSuggestions
      ? dedupeNearbyByName(input.lodgingSuggestions).slice(0, 3)
      : undefined,
    eveningPlaces: dedupeNearbyByName(input.eveningPlaces)
      .slice(0, MAX_EVENING_PLACES)
      .map((place) => ({
        ...place,
        name: cleanPlaceDisplayName(place.name) || place.name,
      })),
  };
}
