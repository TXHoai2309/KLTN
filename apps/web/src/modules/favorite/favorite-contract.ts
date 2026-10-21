import { z } from "zod";

export const favoriteItemSchema = z.object({
  favoriteId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  targetId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  title: z.string(),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  href: z.string().nullable(),
  image: z.object({ url: z.string(), alt: z.string() }).strict().nullable().optional(),
  area: z.string().optional(),
  category: z.string().optional(),
  trip: z.object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    durationDays: z.number().int().positive(),
    transport: z.enum(["CAR", "MOTORCYCLE"]),
    status: z.enum(["UPCOMING", "ONGOING", "COMPLETED"]),
  }).strict().optional(),
}).strict();
export const favoriteListSchema = z.object({
  destinations: z.array(favoriteItemSchema),
  cultureContents: z.array(favoriteItemSchema),
  trips: z.array(favoriteItemSchema),
}).strict().refine(data => [
  ...data.destinations.map(item => ({ item, path: "destinations" })),
  ...data.cultureContents.map(item => ({ item, path: "culture" })),
  ...data.trips.map(item => ({ item, path: "trips" })),
].every(({item,path}) => item.href === (item.availability === "AVAILABLE" ? `/${path}/${item.targetId}` : null)) && data.trips.every(item => item.trip !== undefined));
export type FavoriteItem = z.infer<typeof favoriteItemSchema>;
export type FavoriteList = z.infer<typeof favoriteListSchema>;
