import { z } from "zod";

import { tripProposalSchema } from "../trip-validation/trip-proposal-contract";
import { acknowledgedUncheckedSchema } from "./unchecked-checks";
import { lenientPinnedItemsSchema } from "./trip-pin-contract";

export const chosenLodgingSaveItemSchema = z.object({
  nightIndex: z.number().int().min(1).max(13),
  placeId: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(120).optional(),
}).strict();
export type ChosenLodgingSaveItem = z.infer<typeof chosenLodgingSaveItemSchema>;

/** ADR-45: unchecked Google Maps places shown near a stop (`dN-visit-K`) or a night (`dN-overnight`); informational only, never validated. */
export const nearbySuggestionSaveItemSchema = z.object({
  slotId: z.string().regex(/^d\d{1,2}-(visit-\d{1,2}|free|overnight)$/),
  kind: z.enum(["ACTIVITY", "EVENING"]),
  placeId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  distanceKm: z.number().min(0).max(50),
}).strict();
export type NearbySuggestionSaveItem = z.infer<typeof nearbySuggestionSaveItemSchema>;
/** Suggestions never block a save: malformed entries are dropped instead of failing the request. */
const lenientNearbySchema = z.array(z.unknown()).max(120).transform(items => items.flatMap(item => {
  const parsed = nearbySuggestionSaveItemSchema.safeParse(item);
  return parsed.success ? [parsed.data] : [];
}));

export const tripSaveRequestSchema = z.object({
  confirm: z.literal(true),
  proposal: tripProposalSchema,
  /** Ticket 09: explicit confirmation of the unchecked items; the server compares it with its own list. */
  acknowledgedUnchecked: acknowledgedUncheckedSchema.optional(),
  /** Ticket 11: optional chosen lodging per night (nightIndex -> Google placeId), resolved server-side via ExternalPlace. */
  chosenLodgings: z.array(chosenLodgingSaveItemSchema).max(13).optional(),
  /** ADR-45: nearby activity suggestions kept with the trip so the traveler can read them again. */
  nearbySuggestions: lenientNearbySchema.optional(),
  /** ADR-47: flights, stays, meals and the cost estimate pinned in the chat before saving. */
  pinnedItems: lenientPinnedItemsSchema.optional(),
}).strict().superRefine((request, context) => {
  if (request.proposal.startDate === null) context.addIssue({ code: "custom", path: ["proposal", "startDate"], message: "Cần ngày bắt đầu trước khi lưu." });
  if (!request.proposal.days.some(day => day.visits.length > 0)) context.addIssue({ code: "custom", path: ["proposal", "days"], message: "Hành trình cần ít nhất một điểm đến." });
  if (request.chosenLodgings?.length) {
    const seen = new Set<number>();
    request.chosenLodgings.forEach((item, index) => {
      if (item.nightIndex >= request.proposal.durationDays) {
        context.addIssue({ code: "custom", path: ["chosenLodgings", index, "nightIndex"], message: "Số thứ tự đêm không khớp số ngày của hành trình." });
      }
      if (seen.has(item.nightIndex)) {
        context.addIssue({ code: "custom", path: ["chosenLodgings", index, "nightIndex"], message: "Mỗi đêm chỉ được chọn tối đa một chỗ nghỉ." });
      }
      seen.add(item.nightIndex);
    });
  }
});

export type TripSaveRequest = z.infer<typeof tripSaveRequestSchema>;
