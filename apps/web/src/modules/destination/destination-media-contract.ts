import { z } from "zod";
import { publicHttpsUrl, referenceId } from "../content-profile/content-profile-contract";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const IMAGE_FORMATS = ["jpeg", "png", "webp", "avif"] as const;
const nullableText = (max: number) => z.string().trim().max(max).nullable();
export const initialImageSelectionSchema = z.object({
  caption: nullableText(1000),
  isCover: z.boolean(),
  position: z.number().int().min(0).max(19),
}).strict();
export type InitialImageSelection = z.infer<typeof initialImageSelectionSchema>;
export const imageIntentInput = z.object({
  name: z.string().trim().min(1).max(300),
  size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  mime: z.enum(IMAGE_TYPES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  initialSelection: initialImageSelectionSchema.optional(),
}).strict();
export const imageIntentSchema = imageIntentInput.extend({
  actorId: referenceId, destinationId: referenceId, intentKey: referenceId,
  cloud: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  folder: z.string(), mode: z.enum(["dynamic", "fixed"]), publicId: z.string(),
  expiresAt: z.number().int(),
}).strict();
export type ImageIntent = z.infer<typeof imageIntentSchema>;
export const mediaPatchSchema = z.object({
  id: referenceId,
  url: publicHttpsUrl.optional(),
  alt: z.string().trim().min(1, "Nhập mô tả ảnh.").max(300).optional(),
  caption: nullableText(1000).optional(), author: nullableText(200).optional(),
  sourceUrl: publicHttpsUrl.nullable().optional(),
}).strict();
export const mediaFields = {
  media: z.array(mediaPatchSchema).max(20).optional(),
  removedMediaIds: z.array(referenceId).max(20).optional(),
  mediaOrder: z.array(referenceId).max(20).optional(),
  coverMediaId: referenceId.nullable().optional(),
};
export const mediaReviewSchema = z.object({
  id: referenceId, expectedUpdatedAt: z.iso.datetime(),
  decision: z.enum(["APPROVED", "REJECTED", "UNKNOWN"]),
  evidence: z.string().trim().min(1).max(2000),
}).strict();
