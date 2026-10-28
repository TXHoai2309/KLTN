import { z } from "zod";
import { companionDraftSchema, companionIdSchema, companionImageSchema, companionTripContextSchema } from "./companion-contract";
export const companionManageInputSchema = companionDraftSchema.extend({
  confirm: z.literal(true), baseRevision: z.number().int().nonnegative(),
  visibility: z.enum(["PUBLIC", "WITHDRAWN"]), recruitmentOpen: z.boolean(),
}).strict();
export const companionManageResultSchema = z.object({ publicationId: companionIdSchema, managementRevision: z.number().int().nonnegative() }).strict();
export const companionManageSchema = z.object({
  publicationId: companionIdSchema, tripId: companionIdSchema, draft: companionDraftSchema,
  visibility: z.enum(["PUBLIC", "WITHDRAWN"]), recruitmentOpen: z.boolean(),
  managementRevision: z.number().int().nonnegative(), activeMemberCount: z.number().int().nonnegative(),
  canReopen: z.boolean(), trip: companionTripContextSchema,
  canceledAt: z.iso.datetime().nullable().optional(),
  imageOptions: z.array(companionImageSchema.extend({ mediaId: companionIdSchema }).strict()),
}).strict();
export type CompanionManage = z.infer<typeof companionManageSchema>;
export type CompanionManageResult = z.infer<typeof companionManageResultSchema>;
