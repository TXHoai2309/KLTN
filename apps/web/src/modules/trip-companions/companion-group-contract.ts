import { z } from "zod";
import { companionIdSchema, companionIntroductionSchema } from "./companion-contract";
import { companionSequenceSchema } from "./companion-chat-contract";
import { sharedPinSchema } from "../trip-save/trip-pin-contract";
import { originSelectionSchema } from "../trip-origin/trip-origin-contract";
import { journeyPlanSchema } from "../trip-origin/journey-route-contract";

export const companionConfirmSchema = z.object({ confirm: z.literal(true) }).strict();
export const companionGroupMutationSchema = z.object({ publicationId: companionIdSchema }).strict();
export const companionGroupSchema = z.object({
  publicationId: companionIdSchema,
  relationship: z.enum(["HOST", "MEMBER"]),
  introduction: companionIntroductionSchema,
  memberCount: z.number().int().positive(),
  itineraryRevision: companionSequenceSchema.optional(),
  canSend: z.boolean().optional(), canceledAt: z.iso.datetime().nullable().optional(),
  /** ADR-47: pinned stays, meals and the lodging/food part of the cost. Flights, fares, transport and the total stay with the host. */
  sharedPins: z.array(sharedPinSchema).max(24).optional(),
  /** Chosen lodgings saved per night (separate from ItineraryVisit; never a booking). */
  chosenLodgings: z.array(z.object({
    nightIndex: z.number().int().positive(),
    name: z.string(),
    placeId: z.string().optional(),
  }).strict()).optional(),
  /** ADR-45: unchecked Google Maps places shown near a stop or overnight area; never visits. */
  nearbySuggestions: z.array(z.object({
    dayIndex: z.number().int().positive(),
    slot: z.string(),
    kind: z.enum(["ACTIVITY", "EVENING"]),
    placeId: z.string(),
    name: z.string(),
    distanceKm: z.number(),
  }).strict()).optional(),
  /** Only when the trip starts at a fixed public hub (Hà Nội, TP Hà Giang): the group sees the route from that meeting point. A home address is never shared. */
  meetingPoint: z.object({ origin: originSelectionSchema, plan: journeyPlanSchema.nullable() }).strict().optional(),
  itinerary: z.object({
    days: z.array(z.object({
      dayIndex: z.number().int().positive(), localDate: z.iso.date(),
      visits: z.array(z.object({
        visitId: companionIdSchema, order: z.number().int().nonnegative(),
        startMinute: z.number().int().nonnegative(), plannedDurationMinutes: z.number().int().nonnegative(),
        destination: z.object({
          destinationId: companionIdSchema.nullable(), name: z.string(),
          area: z.string().optional(),
          availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
          latitude: z.number().nullable(), longitude: z.number().nullable(),
          image: z.object({ url: z.string(), alt: z.string() }).strict().optional(),
        }).strict(),
      }).strict()),
    }).strict()),
  }).strict(),
}).strict();
export type CompanionGroup = z.infer<typeof companionGroupSchema>;
