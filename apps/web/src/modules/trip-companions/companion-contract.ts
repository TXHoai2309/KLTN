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
}).strict();
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

export type CompanionDraft = z.infer<typeof companionDraftSchema>;
export type PublishCompanionInput = z.infer<typeof publishCompanionSchema>;
export type CompanionIntroduction = z.infer<typeof companionIntroductionSchema>;
export type PublicCompanion = z.infer<typeof publicCompanionSchema>;
export type CompanionFormContext = z.infer<typeof companionFormContextSchema>;
export type PublishCompanionResult = z.infer<typeof publishCompanionResultSchema>;
