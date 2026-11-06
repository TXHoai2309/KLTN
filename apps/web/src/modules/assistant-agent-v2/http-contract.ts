import { z } from "zod";
import { inTripLocationSchema } from "../in-trip/in-trip-location";
import { qaContextSchema } from "../ai/qa-contract";
import { tripJourneySchema } from "../trip-origin/trip-origin-contract";

const sessionId = z.string().uuid();
const stateToken = z.string().min(1).max(800_000).optional();
/** Additive messages on the existing planning endpoint. V1 requests are unchanged. */
export const assistantV2RequestSchema = z.discriminatedUnion("operation", [
  z.object({ action: z.literal("ASSISTANT_V2"), operation: z.literal("START"), tripId: z.string().min(1).max(128).optional(), context: qaContextSchema.optional() }).strict(),
  z.object({ action: z.literal("ASSISTANT_V2"), operation: z.literal("TURN"), sessionId, stateToken, text: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ action: z.literal("ASSISTANT_V2"), operation: z.literal("LOCATION"), sessionId, stateToken, location: inTripLocationSchema }).strict(),
  z.object({ action: z.literal("ASSISTANT_V2"), operation: z.literal("ORIGIN"), sessionId, stateToken, journey: tripJourneySchema.nullable() }).strict(),
  z.object({ action: z.literal("ASSISTANT_V2"), operation: z.literal("RECONCILE"), sessionId, stateToken }).strict(),
  z.object({ action: z.literal("ASSISTANT_V2"), operation: z.literal("SAVE"), sessionId, stateToken, confirmed: z.literal(true) }).strict(),
]);
export type AssistantV2Request = z.infer<typeof assistantV2RequestSchema>;
