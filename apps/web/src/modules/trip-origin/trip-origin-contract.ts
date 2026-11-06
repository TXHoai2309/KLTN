import { z } from "zod";

/** Client-safe contract. A selected result or camera position is not confirmation. */
export const ORIGIN_CONTRACT_REVISION = "origin-v1" as const;
export const JOURNEY_TIMEZONE = "Asia/Ho_Chi_Minh" as const;
export const originSelectionSchema = z.object({
  label: z.string().normalize().trim().min(1).max(300),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  source: z.enum(["MANUAL", "NOMINATIM"]),
  confirmed: z.boolean(),
}).strict();
const clock = z.number().int().min(0).max(1439).nullable().default(null);
export const tripJourneySchema = z.object({
  origin: originSelectionSchema.nullable().default(null),
  departureMinute: clock,
  returnDeadlineMinute: clock,
  returnDepartureMinute: clock,
}).strict();
export type OriginSelection = z.infer<typeof originSelectionSchema>;
export type TripJourney = z.infer<typeof tripJourneySchema>;
export type JourneyMissingField = "origin" | "originConfirmation" | "departureMinute" | "returnDeadlineMinute" | "returnDepartureMinute";

export function missingJourneyFields(journey: TripJourney | null | undefined, returnOnly = false): JourneyMissingField[] {
  const missing: JourneyMissingField[] = [];
  if (!journey?.origin) missing.push("origin");
  else if (!journey.origin.confirmed) missing.push("originConfirmation");
  if (journey?.departureMinute == null) missing.push("departureMinute");
  if (journey?.returnDeadlineMinute == null) missing.push("returnDeadlineMinute");
  if (returnOnly && journey?.returnDepartureMinute == null) missing.push("returnDepartureMinute");
  return missing;
}

/** Every change to the selection invalidates its previous explicit confirmation. */
export function changeOriginSelection(current: OriginSelection, change: Partial<Pick<OriginSelection, "label" | "latitude" | "longitude" | "source">>): OriginSelection {
  return originSelectionSchema.parse({ ...current, ...change, confirmed: false });
}
