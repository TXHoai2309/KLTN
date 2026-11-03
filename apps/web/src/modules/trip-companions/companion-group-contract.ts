import { z } from "zod";
import { companionIdSchema, companionIntroductionSchema } from "./companion-contract";
import { companionSequenceSchema } from "./companion-chat-contract";

export const companionConfirmSchema = z.object({ confirm: z.literal(true) }).strict();
export const companionGroupMutationSchema = z.object({ publicationId: companionIdSchema }).strict();
export const companionGroupSchema = z.object({
  publicationId: companionIdSchema,
  relationship: z.enum(["HOST", "MEMBER"]),
  introduction: companionIntroductionSchema,
  memberCount: z.number().int().positive(),
  itineraryRevision: companionSequenceSchema.optional(),
  canSend: z.boolean().optional(), canceledAt: z.iso.datetime().nullable().optional(),
  itinerary: z.object({
    days: z.array(z.object({
      dayIndex: z.number().int().positive(), localDate: z.iso.date(),
      visits: z.array(z.object({
        visitId: companionIdSchema, order: z.number().int().nonnegative(),
        startMinute: z.number().int().nonnegative(), plannedDurationMinutes: z.number().int().nonnegative(),
        destination: z.object({
          destinationId: companionIdSchema.nullable(), name: z.string(),
          availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
          latitude: z.number().nullable(), longitude: z.number().nullable(),
        }).strict(),
      }).strict()),
    }).strict()),
  }).strict(),
}).strict();
export type CompanionGroup = z.infer<typeof companionGroupSchema>;
