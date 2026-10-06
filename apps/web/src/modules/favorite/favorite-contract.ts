import { z } from "zod";

export const favoriteItemSchema = z.object({
  favoriteId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  targetId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  title: z.string(),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  href: z.string().nullable(),
}).strict();
export const favoriteListSchema = z.object({
  destinations: z.array(favoriteItemSchema),
  cultureContents: z.array(favoriteItemSchema),
}).strict().refine(data => [
  ...data.destinations.map(item => ({ item, path: "destinations" })),
  ...data.cultureContents.map(item => ({ item, path: "culture" })),
].every(({item,path}) => item.href === (item.availability === "AVAILABLE" ? `/${path}/${item.targetId}` : null)));
export type FavoriteItem = z.infer<typeof favoriteItemSchema>;
export type FavoriteList = z.infer<typeof favoriteListSchema>;
