import { z } from "zod";
import { originSelectionSchema } from "./trip-origin-contract";

export const ORIGIN_SEARCH_REVISION = "origin-search-v1" as const;
export const OSM_ATTRIBUTION = { text: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright", license: "ODbL-1.0" } as const;
export const GOOGLE_ORIGIN_ATTRIBUTION = { text: "Google Maps", url: "https://maps.google.com", license: "Google Maps Platform" } as const;
export const STADIA_ORIGIN_ATTRIBUTION = { text: "© Stadia Maps · © OpenMapTiles · © OpenStreetMap", url: "https://stadiamaps.com/attribution/", license: "ODbL-1.0" } as const;
export const originSearchRequestSchema = z.object({
  query: z.string().normalize().trim().min(2).max(160)
    .refine(q => !/[\u0000-\u001f\u007f@]/u.test(q) && !/https?:\/\/|\b(?:\+?\d[\s().-]*){8,}\b/iu.test(q), "Chỉ nhập tên địa điểm công khai; không gửi email, số điện thoại hoặc ghi chú riêng tư."),
}).strict();
export const originSearchResultsSchema = z.array(originSelectionSchema.extend({
  source: z.enum(["NOMINATIM", "STADIA", "GOOGLE_PLACES"]), confirmed: z.literal(false),
}).strict()).max(5);
export type OriginSearchResult = z.infer<typeof originSearchResultsSchema>[number];
export type OriginSearchOutcome =
  | { status: "RESULTS" | "NO_RESULTS"; results: OriginSearchResult[]; cached: boolean }
  | { status: "BUSY"; retryAfterSeconds: number }
  | { status: "UNAVAILABLE" };
