import { z } from "zod";
import { AppError } from "@/server/http/app-error";

export const publicLocationSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), name: z.string().min(1), area: z.string(), category: z.string(),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
}).strict();
export type PublicLocation = z.infer<typeof publicLocationSchema>;
export const publicLocationListSchema = z.object({
  items: z.array(publicLocationSchema),
  filters: z.object({ categories: z.array(z.string()), regions: z.array(z.string()) }).strict(),
}).strict();
export type PublicLocationList = z.infer<typeof publicLocationListSchema>;
export type DestinationSearch = { q?: string; category?: string; region?: string };
export const destinationFilterKeys = ["q", "category", "region"] as const;

export function parsePublicListQuery(params: URLSearchParams): DestinationSearch {
  const allowed = [...destinationFilterKeys, "view"];
  if ([...params.keys()].some(key => !allowed.includes(key)) || allowed.some(key => params.getAll(key).length > 1)
    || (params.has("view") && !["list", "map"].includes(params.get("view")!))) {
    throw invalidQuery();
  }
  const result: DestinationSearch = {};
  for (const key of destinationFilterKeys) {
    let value = (params.get(key) ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
    if (key !== "q") value = value.toLocaleLowerCase("vi-VN");
    if (value.length > (key === "q" ? 200 : 100)) throw invalidQuery();
    if (value) result[key] = value;
  }
  return result;
}
function invalidQuery() {
  return new AppError("INVALID_EXPLORE_QUERY", "Tham số tìm kiếm không hợp lệ. Hãy xóa bộ lọc và thử lại.", 400);
}

/** Extract only destination inputs; view and Culture paging remain separate URL state. */
export function destinationQueryParams(params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of destinationFilterKeys) params.getAll(key).forEach(value => result.append(key, value));
  return result;
}
export function destinationRequestKey(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete("culturePage");
  // A valid view does not affect the dataset. Retain invalid inputs for request
  // validation rather than silently changing a failed SSR read into success.
  try { parsePublicListQuery(next); next.delete("view"); } catch { /* validated by the request lifecycle */ }
  return next.toString();
}
export function destinationSearchHref(params: URLSearchParams, values: DestinationSearch): string {
  const next = new URLSearchParams(params);
  for (const key of [...next.keys()]) {
    if (![...destinationFilterKeys, "view", "culturePage"].includes(key)) next.delete(key);
  }
  if (next.getAll("view").length > 1 || (next.has("view") && !["list", "map"].includes(next.get("view")!))) next.delete("view");
  for (const key of destinationFilterKeys) {
    next.delete(key);
    if (values[key]) next.set(key, values[key]!);
  }
  const query = next.toString();
  return `/explore${query ? `?${query}` : ""}`;
}
