import { z } from "zod";

import { tripProposalSchema } from "../trip-validation/trip-proposal-contract";
import { acknowledgedUncheckedSchema } from "./unchecked-checks";

export const chosenLodgingSaveItemSchema = z.object({
  nightIndex: z.number().int().min(1).max(13),
  placeId: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(120).optional(),
}).strict();
export type ChosenLodgingSaveItem = z.infer<typeof chosenLodgingSaveItemSchema>;

export const tripSaveRequestSchema = z.object({
  confirm: z.literal(true),
  proposal: tripProposalSchema,
  /** Ticket 09: explicit confirmation of the unchecked items; the server compares it with its own list. */
  acknowledgedUnchecked: acknowledgedUncheckedSchema.optional(),
  /** Ticket 11: optional chosen lodging per night (nightIndex -> Google placeId), resolved server-side via ExternalPlace. */
  chosenLodgings: z.array(chosenLodgingSaveItemSchema).max(13).optional(),
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
