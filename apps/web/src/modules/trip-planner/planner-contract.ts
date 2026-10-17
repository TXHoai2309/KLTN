import { z } from "zod";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";

export const PLANNER_PHASES = ["PRELIMINARY_PROPOSAL", "FINAL_CONFIRMATION", "OFFICIAL_SAVE"] as const;
export const CHECK_KEYS = ["OPENING_HOURS", "MINIMUM_DURATION", "TRAVEL_TIME", "SCHEDULE_CONFLICTS", "MOBILITY"] as const;
export const checkStatusSchema = z.enum(["PASS", "VIOLATION", "INSUFFICIENT_DATA"]);
export type CheckStatus = z.infer<typeof checkStatusSchema>;
const id = z.string().min(1).max(128);
const minute = z.number().int().min(0).max(1440);
export const plannerDestinationSchema = z.object({
  id, name: z.string().min(1).max(200), description: z.string().max(1000), area: z.string().max(100),
  address: z.string().max(1000).nullable(), category: z.string().max(100),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  image: z.object({ url: publicHttpsUrl, alt: z.string().max(300), author: z.string().max(200).nullable(), sourceUrl: publicHttpsUrl.nullable() }).strict().nullable(),
}).strict();
export const travelLegSchema = z.object({
  fromDestinationId: id, toDestinationId: id,
  status: z.enum(["VERIFIED", "INSUFFICIENT_DATA"]),
  reason: z.enum(["NOT_CONFIGURED", "TIMEOUT", "UNAVAILABLE", "UNSUPPORTED_MODE", "NO_ROUTE", "INVALID_RESPONSE"]).nullable(),
  durationSeconds: z.number().finite().nonnegative().max(604800).nullable(),
  distanceMeters: z.number().finite().nonnegative().max(10_000_000).nullable(),
  provider: z.literal("GOOGLE_ROUTES").nullable(),
  // Owner decision: Google Routes geometry is not rendered on MapLibre.
}).strict().superRefine((leg, ctx) => {
  if (leg.status === "VERIFIED" && (leg.durationSeconds === null || leg.distanceMeters === null || leg.provider === null || leg.reason !== null))
    ctx.addIssue({ code: "custom", message: "Verified route requires provider metrics." });
  if (leg.status === "INSUFFICIENT_DATA" && (leg.durationSeconds !== null || leg.distanceMeters !== null || leg.provider !== null || leg.reason === null))
    ctx.addIssue({ code: "custom", message: "Missing route cannot contain factual metrics." });
});
export type TravelLeg = z.infer<typeof travelLegSchema>;
export const plannerStopSchema = z.object({
  order: z.number().int().min(1).max(4), destination: plannerDestinationSchema,
  arrivalMinute: minute.nullable(), departureMinute: minute.nullable(), visitDurationMinutes: z.number().int().min(1).max(10080),
  scheduleState: z.enum(["PLANNED", "TIME_UNKNOWN", "UNSCHEDULED"]), inbound: travelLegSchema.nullable(),
  validationStatus: checkStatusSchema,
}).strict();
export type PlannerStop = z.infer<typeof plannerStopSchema>;
export const plannerDaySchema = z.object({
  day: z.number().int().min(1).max(14), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  stops: z.array(plannerStopSchema).max(4), distanceMeters: z.number().nonnegative().nullable(), travelSeconds: z.number().nonnegative().nullable(),
}).strict();
export type PlannerDay = z.infer<typeof plannerDaySchema>;
const issueSchema = z.object({ code: z.string().max(80), message: z.string().max(500), day: z.number().int().min(1).max(14).nullable(), destinationId: id.nullable() }).strict();
export const plannerCheckSchema = z.object({ key: z.enum(CHECK_KEYS), status: checkStatusSchema, issues: z.array(issueSchema).max(80) }).strict();
export type PlannerCheck = z.infer<typeof plannerCheckSchema>;
export const plannerResultSchema = z.object({
  proposalId: id, phase: z.literal("PRELIMINARY_PROPOSAL"),
  status: z.enum(["PROPOSAL_READY", "INSUFFICIENT_DATA", "NO_FEASIBLE_ITINERARY"]),
  requirement: tripRequirementInputSchema, timezone: z.literal("Asia/Ho_Chi_Minh"),
  days: z.array(plannerDaySchema).min(1).max(14), checks: z.array(plannerCheckSchema).length(CHECK_KEYS.length),
  warnings: z.array(issueSchema).max(80), reasonCodes: z.array(z.string().max(80)).max(30),
  eligibleForFinalConfirmation: z.boolean(),
}).strict().superRefine((proposal, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (proposal.days.length !== proposal.requirement.durationDays || proposal.days.some((day, index) => day.day !== index + 1)) fail("Day sequence mismatch.");
  if (new Set(proposal.checks.map(check => check.key)).size !== CHECK_KEYS.length) fail("Check keys mismatch.");
  const allPass = proposal.checks.every(check => check.status === "PASS");
  if (proposal.status === "PROPOSAL_READY" && !allPass) fail("Missing data is not a pass.");
  if (proposal.eligibleForFinalConfirmation && (!allPass || !proposal.requirement.startDate)) fail("Final confirmation is blocked.");
  const ids = proposal.days.flatMap(day => day.stops.map(stop => stop.destination.id));
  if (new Set(ids).size !== ids.length || ids.length > 28) fail("Duplicate or unbounded stops.");
  for (const day of proposal.days) {
    if ((proposal.requirement.startDate === null) !== (day.date === null)) fail("Relative days cannot invent calendar dates.");
    day.stops.forEach((stop, index) => {
      if (stop.order !== index + 1) fail("Stop order mismatch.");
      if (stop.scheduleState === "PLANNED" && (stop.arrivalMinute === null || stop.departureMinute === null || stop.departureMinute - stop.arrivalMinute !== stop.visitDurationMinutes)) fail("Planned time mismatch.");
      if (stop.scheduleState !== "PLANNED" && (stop.arrivalMinute !== null || stop.departureMinute !== null)) fail("Unknown times cannot be factual.");
    });
  }
});
export type PlannerResult = z.infer<typeof plannerResultSchema>;
export const plannerRequestSchema = z.object({ requirement: tripRequirementInputSchema }).strict();
