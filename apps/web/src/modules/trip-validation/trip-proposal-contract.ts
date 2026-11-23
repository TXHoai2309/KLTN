import { z } from "zod";
import { tripJourneySchema } from "../trip-origin/trip-origin-contract";

import { dayRhythmSchema, isValidCalendarDate, MAX_DURATION_DAYS, TRANSPORT_VALUES } from "../trip-requirement/trip-requirement-contract";

/** First-cluster fields that an Assumed draft (ADR-44) may pre-fill server-side until the traveler confirms them. */
export const ASSUMABLE_FIELDS = ["origin", "durationDays", "transport", "startDate"] as const;
export type AssumableField = (typeof ASSUMABLE_FIELDS)[number];
export type BlockingAssumedField = "origin" | "startDate";

export function blockingAssumedFields(assumedFields?: readonly string[] | null): BlockingAssumedField[] {
  if (!assumedFields?.length) return [];
  const set = new Set(assumedFields);
  const out: BlockingAssumedField[] = [];
  if (set.has("origin")) out.push("origin");
  if (set.has("startDate")) out.push("startDate");
  return out;
}

export function formatAssumedConfirmationMessage(fields: readonly BlockingAssumedField[]): string {
  const labels = fields.map(field => (field === "origin" ? "nơi xuất phát" : "ngày khởi hành"));
  return `Bản nháp đang dùng giả định — cần xác nhận ${labels.join(" và ")} trước khi lưu hành trình.`;
}

const visitSchema = z.object({
  destinationId: z.string().min(1).max(128),
  startMinute: z.number().int().min(0).max(1439),
  plannedDurationMinutes: z.number().int().min(1).max(1440),
  /** Explicit traveler-chosen duration override (ADR-48/ADR-51); absent means catalog minimum applies strictly. */
  userChosenDuration: z.literal(true).optional(),
  order: z.number().int().min(1),
}).strict().refine(visit => visit.startMinute + visit.plannedDurationMinutes <= 1440, "Lượt tham quan phải nằm trong một ngày.");

export const tripProposalSchema = z.object({
  journey: tripJourneySchema.nullable().optional(),
  startDate: z.string().refine(isValidCalendarDate, "Ngày bắt đầu không hợp lệ.").nullable(),
  durationDays: z.number().int().min(1).max(MAX_DURATION_DAYS),
  transport: z.enum(TRANSPORT_VALUES),
  /** ADR-48: a plan scheduled with 10-minute roadside breaks is re-validated with the same policy at save time. */
  restMode: z.enum(["STANDARD", "COMPACT"]).optional(),
  /** ADR-42/ADR-51: optional per-trip day rhythm carried from chat so save-time validation matches chat scheduling. */
  dayRhythm: dayRhythmSchema.optional(),
  /** Assumed fields carried from an Assumed draft (ADR-44); server blocks Save when `origin` or `startDate` is still assumed. */
  assumedFields: z.array(z.enum(ASSUMABLE_FIELDS)).max(ASSUMABLE_FIELDS.length).optional(),
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
