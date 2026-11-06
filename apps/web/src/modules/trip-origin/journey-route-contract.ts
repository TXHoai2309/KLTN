import { z } from "zod";
import { plannerRouteGeometrySchema } from "../trip-planner/planner-route-geometry";

/** Origin is an endpoint reference, never a fabricated Destination identifier. */
export const journeyEndpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ORIGIN") }).strict(),
  z.object({ kind: z.literal("ATTRACTION"), destinationId: z.string().min(1).max(128) }).strict(),
]);
export const journeyRouteSchema = z.object({
  status: z.enum(["VERIFIED", "INSUFFICIENT_DATA"]),
  reason: z.enum(["NOT_CONFIGURED", "TIMEOUT", "UNAVAILABLE", "UNSUPPORTED_MODE", "NO_ROUTE", "INVALID_RESPONSE"]).nullable(),
  durationSeconds: z.number().finite().nonnegative().max(604800).nullable(),
  distanceMeters: z.number().finite().nonnegative().max(10_000_000).nullable(),
  provider: z.literal("STADIA_MAPS").nullable(),
  geometry: plannerRouteGeometrySchema.optional(),
}).strict().superRefine((route, ctx) => {
  if (route.status === "VERIFIED" ? route.durationSeconds === null || route.distanceMeters === null || route.provider === null || route.reason !== null
    : route.durationSeconds !== null || route.distanceMeters !== null || route.provider !== null || route.geometry !== undefined || route.reason === null)
    ctx.addIssue({ code: "custom", message: "Journey route evidence is inconsistent." });
});
export type JourneyRoute = z.infer<typeof journeyRouteSchema>;
export type JourneyEndpoint = z.infer<typeof journeyEndpointSchema>;
const totals = z.object({ drivingSeconds: z.number().nonnegative().nullable(), restMinutes: z.number().nonnegative().nullable(), distanceMeters: z.number().nonnegative().nullable() }).strict();
export const journeyPlanSchema = z.object({
  policy: z.literal("roadside-rest-v1"),
  legs: z.array(z.object({
    kind: z.enum(["OUTBOUND", "TRANSFER", "RETURN"]), day: z.number().int().min(1).max(14),
    from: journeyEndpointSchema, to: journeyEndpointSchema, route: journeyRouteSchema,
    startMinute: z.number().nonnegative().nullable(), endMinute: z.number().nonnegative().nullable(),
    restMinutes: z.number().nonnegative().nullable(),
  }).strict()).max(29),
  totals,
}).strict();
export type JourneyPlan = z.infer<typeof journeyPlanSchema>;
