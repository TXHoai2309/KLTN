import { sendIdempotentMutation } from "../../lib/mutation-client";
import type { MutationOutcome } from "../../lib/mutation-contract";
import { favoriteListSchema, type FavoriteItem } from "./favorite-contract";

export async function loadFavorites(signal?: AbortSignal) {
  const response = await fetch("/api/favorites", { credentials: "same-origin", cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok || body?.success !== true) throw new Error("FAVORITE_LOAD_FAILED");
  return favoriteListSchema.parse(body.data);
}
export async function removeFavoriteRequest(favoriteId: string, key: string): Promise<MutationOutcome<{favoriteId:string}>> {
  const result = await sendIdempotentMutation<{favoriteId:string}>(`/api/favorites/${encodeURIComponent(favoriteId)}`, {
    idempotencyKey: key, init: { method: "DELETE", credentials: "same-origin", cache: "no-store" },
  });
  if (result.status === "SUCCESS" && result.data?.favoriteId !== favoriteId) {
    return { status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa thể xác nhận thao tác." }, retryWithSameKey: true };
  }
  return result;
}
export function confirmedRemoval(items: FavoriteItem[], favoriteId: string, outcome: MutationOutcome<{favoriteId:string}>) {
  return outcome.status === "SUCCESS" && outcome.data.favoriteId === favoriteId ? items.filter(item => item.favoriteId !== favoriteId) : items;
}
