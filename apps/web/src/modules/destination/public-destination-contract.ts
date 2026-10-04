import { z } from "zod";
import { destinationInputSchema } from "./destination-contract";

/** Deliberate public allowlist. No visibility, timestamps or validator minimum. */
export const publicDestinationDetailSchema = destinationInputSchema.omit({ minimumDurationMinutes: true }).extend({
  id: z.string().min(1),
  // US-09 has not landed: never fabricate Culture items or competing relations.
  relatedCulture: z.array(z.never()).max(0),
}).strict();
export type PublicDestinationDetail = z.infer<typeof publicDestinationDetailSchema>;

export function formatSuggestedDuration(minutes: number | null): string {
  if (minutes === null) return "Chưa có dữ liệu";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} giờ` : "", remainder ? `${remainder} phút` : ""].filter(Boolean).join(" ");
}
