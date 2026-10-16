import { z } from "zod";

import { isValidCalendarDate, MAX_DURATION_DAYS, TRANSPORT_VALUES } from "../trip-requirement/trip-requirement-contract";

const visitSchema = z.object({
  destinationId: z.string().min(1).max(128),
  startMinute: z.number().int().min(0).max(1439),
  plannedDurationMinutes: z.number().int().min(1).max(1440),
  order: z.number().int().min(1),
}).strict().refine(visit => visit.startMinute + visit.plannedDurationMinutes <= 1440, "Lượt tham quan phải nằm trong một ngày.");

export const tripProposalSchema = z.object({
  startDate: z.string().refine(isValidCalendarDate, "Ngày bắt đầu không hợp lệ.").nullable(),
  durationDays: z.number().int().min(1).max(MAX_DURATION_DAYS),
  transport: z.enum(TRANSPORT_VALUES),
  days: z.array(z.object({
    dayIndex: z.number().int().min(1),
    visits: z.array(visitSchema),
  }).strict()).min(1).max(MAX_DURATION_DAYS),
}).strict().superRefine((proposal, context) => {
  if (proposal.days.length !== proposal.durationDays || proposal.days.some((day, index) => day.dayIndex !== index + 1)) {
    context.addIssue({ code: "custom", path: ["days"], message: "Các ngày phải liên tiếp từ ngày 1 đến hết chuyến đi." });
  }
  proposal.days.forEach((day, index) => {
    if (day.visits.some((visit, visitIndex) => visit.order !== visitIndex + 1)) {
      context.addIssue({ code: "custom", path: ["days", index, "visits"], message: "Thứ tự lượt tham quan phải liên tiếp từ 1." });
    }
  });
  if (proposal.days.reduce((count, day) => count + day.visits.length, 0) > 50) {
    context.addIssue({ code: "custom", path: ["days"], message: "Phương án có quá nhiều lượt tham quan để kiểm tra trong một lần." });
  }
});

export type TripProposal = z.infer<typeof tripProposalSchema>;

/** UTC arithmetic on a Vietnam-local calendar label, without converting the visit's clock time. */
export function tripDayDate(startDate: string | null, dayIndex: number): string | null {
  if (startDate === null) return null;
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayIndex - 1);
  return date.toISOString().slice(0, 10);
}
