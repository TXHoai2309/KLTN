import { z } from "zod";
import { tripJourneySchema } from "./trip-origin-contract";
import { journeyPlanSchema } from "./journey-route-contract";

export const savedJourneySchema = z.object({ revision: z.literal("journey-save-v1"), journey: tripJourneySchema, plan: journeyPlanSchema.nullable(), visitFingerprint: z.string().optional() }).strict();
export type SavedJourney = z.infer<typeof savedJourneySchema>;

/** Canonical visit clock/order content only; never used as authorization. */
export function journeyVisitFingerprint(days: readonly { dayIndex: number; visits: readonly { destinationId: string; order: number; startMinute: number; plannedDurationMinutes: number }[] }[]): string {
  return JSON.stringify(days.map(day => [day.dayIndex, day.visits.map(visit => [visit.destinationId, visit.order, visit.startMinute, visit.plannedDurationMinutes])]));
}
