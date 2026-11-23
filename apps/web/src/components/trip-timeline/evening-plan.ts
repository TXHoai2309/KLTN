import { cleanPlaceDisplayName, resolveOvernightAreaLabel } from "@/lib/traveler-display-clean";
import type { PlacePreviewTarget } from "@/lib/place-preview-url";
import type { DayTimelineEveningPlan, DayTimelineNearbyItem } from "./day-timeline";

export const MAX_EVENING_PLACES = 3;

export interface BuildDayEveningPlanInput {
  dayIndex: number;
  totalDays: number;
  lastStopArea?: string | null;
  lastStopName?: string | null;
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
  const overnightArea = resolveOvernightAreaLabel(input.lastStopArea, input.lastStopName);
  return {
    nightIndex: input.dayIndex,
    overnightArea,
    chosenLodging: input.chosenLodging
      ? {
          name: cleanPlaceDisplayName(input.chosenLodging.name) || input.chosenLodging.name,
          previewTarget: input.chosenLodging.previewTarget ?? null,
        }
      : null,
    lodgingSuggestions: input.lodgingSuggestions?.slice(0, 3),
    eveningPlaces: input.eveningPlaces.slice(0, MAX_EVENING_PLACES).map((place) => ({
      ...place,
      name: cleanPlaceDisplayName(place.name) || place.name,
    })),
  };
}
