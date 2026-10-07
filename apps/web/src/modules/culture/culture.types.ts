import type { z } from "zod";

import {
  publicCultureDetailSchema,
  publicCultureDestinationSchema,
  publicCultureListResponseSchema,
  publicCultureListItemSchema,
  publicCulturePageInfoSchema,
  publicCultureQueryObjectSchema,
  publicCultureSourceSchema,
} from "./culture.schema";

export type PublicCultureQuery = z.infer<typeof publicCultureQueryObjectSchema>;
export type PublicCultureSource = z.infer<typeof publicCultureSourceSchema>;
export type PublicCultureDestination = z.infer<
  typeof publicCultureDestinationSchema
>;
export type PublicCultureListItem = z.infer<typeof publicCultureListItemSchema>;
export type PublicCulturePageInfo = z.infer<typeof publicCulturePageInfoSchema>;
export type PublicCultureListResponse = z.infer<
  typeof publicCultureListResponseSchema
>;
export type PublicCultureDetail = z.infer<typeof publicCultureDetailSchema>;
