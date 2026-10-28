import { z } from "zod";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";

export const companionIdSchema = z.string().trim().min(1).max(128);
const capacitySchema = z.number().int().positive().max(2_147_483_647);

/** Client-safe shared input. Never accept host/user IDs or copied Trip fields. */
export const companionDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  introduction: z.string().trim().min(1).max(4000),
  additionalCapacity: capacitySchema,
  imageMediaId: companionIdSchema.nullable(),
}).strict();
export const publishCompanionSchema = companionDraftSchema.extend({ confirm: z.literal(true) }).strict();

export const companionImageSchema = z.object({ url: publicHttpsUrl, alt: z.string() }).strict();
export const companionTripContextSchema = z.object({
  host: z.object({ displayName: z.string(), avatarUrl: publicHttpsUrl.nullable() }).strict(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  durationDays: z.number().int().positive(),
  transport: z.enum(["CAR", "MOTORCYCLE"]),
  routeSummary: z.array(z.object({ destinationId: companionIdSchema, name: z.string() }).strict()),
}).strict();

/** Deliberately separate from the owner-only Trip DTO; plain text, no hourly data. */
export const companionIntroductionSchema = companionTripContextSchema.extend({
  title: z.string(),
  introduction: z.string(),
  additionalCapacity: capacitySchema,
  availablePlaces: z.number().int().nonnegative(),
  image: companionImageSchema.nullable(),
}).strict();
export const publicCompanionSchema = z.object({
  publicationId: companionIdSchema,
  introduction: companionIntroductionSchema,
  recruitmentStatus: z.enum(["OPEN", "FULL", "CLOSED", "DEPARTED", "COMPLETED", "WITHDRAWN", "CANCELED"]).optional(),
}).strict();
/** Private context, fetched separately from the session-independent public DTO. */
export const companionViewerContextSchema = z.discriminatedUnion("relationship", [
  z.object({ relationship: z.literal("HOST"), tripId: companionIdSchema }).strict(),
  z.object({ relationship: z.literal("VISITOR") }).strict(),
]);
export const companionFormContextSchema = z.object({
  trip: companionTripContextSchema,
  imageOptions: z.array(companionImageSchema.extend({ mediaId: companionIdSchema }).strict()),
  publication: z.object({ publicationId: companionIdSchema, draft: companionDraftSchema }).strict().nullable(),
}).strict();
export const companionPreviewSchema = z.object({ introduction: companionIntroductionSchema }).strict();
export const publishCompanionResultSchema = z.object({
  publicationId: companionIdSchema,
  tripId: companionIdSchema,
}).strict();

/** Raw URL parameter values, shared by server and FE URL/client adapters. */
export const companionListQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  departureFrom: z.iso.date().optional(),
  departureTo: z.iso.date().optional(),
  transport: z.enum(["CAR", "MOTORCYCLE"]).optional(),
  availableOnly: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  limit: z.string().regex(/^[1-9]\d?$/).default("12").transform(Number).pipe(z.number().int().min(1).max(50)),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict().refine(value => !value.departureFrom || !value.departureTo || value.departureFrom <= value.departureTo, {
  message: "Ngày bắt đầu phải không sau ngày kết thúc.", path: ["departureTo"],
});
export const companionListSchema = z.object({
  items: z.array(publicCompanionSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().min(1).max(2048).nullable(),
}).strict();

export type CompanionDraft = z.infer<typeof companionDraftSchema>;
export type PublishCompanionInput = z.infer<typeof publishCompanionSchema>;
export type CompanionIntroduction = z.infer<typeof companionIntroductionSchema>;
export type PublicCompanion = z.infer<typeof publicCompanionSchema>;
export type CompanionViewerContext = z.infer<typeof companionViewerContextSchema>;
export type CompanionFormContext = z.infer<typeof companionFormContextSchema>;
export type PublishCompanionResult = z.infer<typeof publishCompanionResultSchema>;
export type CompanionListQuery = z.infer<typeof companionListQuerySchema>;
export type CompanionList = z.infer<typeof companionListSchema>;
