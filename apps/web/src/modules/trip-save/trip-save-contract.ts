import { z } from "zod";

import { tripProposalSchema } from "../trip-validation/trip-proposal-contract";

export const tripSaveRequestSchema = z.object({
  confirm: z.literal(true),
  proposal: tripProposalSchema,
}).strict().superRefine((request, context) => {
  if (request.proposal.startDate === null) context.addIssue({ code: "custom", path: ["proposal", "startDate"], message: "Cần ngày bắt đầu trước khi lưu." });
  if (!request.proposal.days.some(day => day.visits.length > 0)) context.addIssue({ code: "custom", path: ["proposal", "days"], message: "Hành trình cần ít nhất một điểm đến." });
});

export type TripSaveRequest = z.infer<typeof tripSaveRequestSchema>;
