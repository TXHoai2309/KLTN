import { publicContentProfileSchema } from "@/modules/content-profile/public-content-profile";
import { publicCultureSummarySchema } from "../culture/culture-contract";
import { z } from "zod";
import { destinationInputSchema } from "./destination-contract";

/** Deliberate public allowlist. No visibility, timestamps or validator minimum. */
export const publicDestinationDetailSchema = destinationInputSchema.omit({ minimumDurationMinutes: true, profile: true }).extend({
  id: z.string().min(1),
  profile: publicContentProfileSchema.optional(),
  relatedCulture: z.array(publicCultureSummarySchema).max(20),
}).strict();
export type PublicDestinationDetail = z.infer<typeof publicDestinationDetailSchema>;

export function formatSuggestedDuration(minutes: number | null): string {
  if (minutes === null) return "Chưa có dữ liệu";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} giờ` : "", remainder ? `${remainder} phút` : ""].filter(Boolean).join(" ");
}

function formatHourRangeValue(minutes: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(minutes / 60);
}

/**
 * Formats destination duration from planner fields (`minimumDurationMinutes` and `suggestedDurationMinutes`).
 * Returns `null` only when both fields are empty or non-positive.
 */
export function formatPlannerDurationSummary(input: {
  suggestedDurationMinutes?: number | null;
  minimumDurationMinutes?: number | null;
}): string | null {
  const min =
    typeof input.minimumDurationMinutes === "number" &&
    Number.isFinite(input.minimumDurationMinutes) &&
    input.minimumDurationMinutes > 0
      ? Math.round(input.minimumDurationMinutes)
      : null;
  const sug =
    typeof input.suggestedDurationMinutes === "number" &&
    Number.isFinite(input.suggestedDurationMinutes) &&
    input.suggestedDurationMinutes > 0
      ? Math.round(input.suggestedDurationMinutes)
      : null;

  if (min === null && sug === null) return null;
  if (min !== null && sug !== null && min < sug) {
    if (min < 60 && sug < 60) {
      return `Khoảng ${min}–${sug} phút`;
    }
    if (min >= 60 && min % 30 === 0 && sug % 30 === 0) {
      return `Khoảng ${formatHourRangeValue(min)}–${formatHourRangeValue(sug)} giờ`;
    }
    return `Khoảng ${formatSuggestedDuration(min)} – ${formatSuggestedDuration(sug)}`;
  }
  return formatSuggestedDuration(sug ?? min);
}
