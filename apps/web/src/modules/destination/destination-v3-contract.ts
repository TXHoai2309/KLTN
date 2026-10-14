import { z } from "zod";
import { destinationInputSchema } from "./destination-contract";
import {
  publicHttpsUrl,
  referenceId,
} from "../content-profile/content-profile-contract";

const source = z
  .object({
    id: referenceId.optional(),
    title: z.string().trim().min(1, "Nhập tên nguồn.").max(300),
    url: z.string().trim().pipe(publicHttpsUrl),
  })
  .strict();
const fields = {
  name: destinationInputSchema.shape.name,
  description: destinationInputSchema.shape.description,
  category: destinationInputSchema.shape.category,
  googleMapsUrl: z
    .string()
    .trim()
    .max(2000)
    .min(1, "Dán liên kết Google Maps chứa tọa độ điểm."),
  address: z.string().trim().max(1000).nullable(),
  suggestedDurationMinutes:
    destinationInputSchema.shape.suggestedDurationMinutes,
  minimumDurationMinutes: destinationInputSchema.shape.minimumDurationMinutes,
  openingDays: destinationInputSchema.shape.openingDays,
  sources: z
    .array(source)
    .max(30)
    .superRefine((sources, ctx) => {
      const ids = sources.flatMap((s) => (s.id ? [s.id] : []));
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: "custom", message: "Nguồn bị lặp ID." });
    }),
  removedSourceIds: z.array(referenceId).max(30),
};
export const destinationV3CreateSchema = z
  .object(fields)
  .partial()
  .required({
    name: true,
    description: true,
    category: true,
    googleMapsUrl: true,
  })
  .extend({ formVersion: z.literal("V3") })
  .strict();
export const destinationV3PatchSchema = z
  .object(fields)
  .partial()
  .extend({
    formVersion: z.literal("V3"),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export type DestinationV3Input = z.infer<typeof destinationV3PatchSchema>;
