import {
  FAVORITE_STATUS_BATCH_LIMIT,
  favoriteResultSchema,
  type FavoriteResult,
  type FavoriteUrlTargetType,
} from "@/modules/favorites/favorites.schema";

type Subscriber = {
  targetId: string;
  signal?: AbortSignal;
  resolve: (result: FavoriteResult) => void;
  reject: (error: unknown) => void;
  detach: () => void;
  onAbortFlight?: () => void;
};
type Group = { targetType: FavoriteUrlTargetType; subscribers: Subscriber[] };
type FetchStatus = (url: string, init?: RequestInit) => Promise<Response>;

export function createFavoriteStatusLoader(fetcher: FetchStatus = (url, init) => fetch(url, init)) {
  const queued = new Map<string, Group>();

  async function dispatch(targetType: FavoriteUrlTargetType, subscribers: Subscriber[]) {
    const active = subscribers.filter(subscriber => !subscriber.signal?.aborted);
    if (!active.length) return;
    const controller = new AbortController();
    const abortIfUnused = () => {
      if (active.every(subscriber => subscriber.signal?.aborted)) controller.abort();
    };
    for (const subscriber of active) subscriber.onAbortFlight = abortIfUnused;
    try {
      const targetIds = [...new Set(active.map(subscriber => subscriber.targetId))];
      const single = targetType === "trips";
      const query = new URLSearchParams({ targetType, [single ? "targetId" : "targetIds"]: targetIds.join(",") });
      const response = await fetcher(`/api/favorites/status${single ? "" : "/batch"}?${query}`, {
        method: "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" }, signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || body?.success !== true) throw Error("favorite-status-failed");
      const parsed = favoriteResultSchema.array().safeParse(single ? [body.data] : body.data);
      if (!parsed.success || parsed.data.length !== targetIds.length) throw Error("favorite-status-mismatch");
      const results = new Map(parsed.data.map(result => [result.targetId, result]));
      if (results.size !== targetIds.length || parsed.data.some(result => result.targetType !== targetType || !targetIds.includes(result.targetId))) {
        throw Error("favorite-status-mismatch");
      }
      for (const subscriber of active) {
        if (!subscriber.signal?.aborted) subscriber.resolve(results.get(subscriber.targetId)!);
      }
    } catch (error) {
      for (const subscriber of active) if (!subscriber.signal?.aborted) subscriber.reject(error);
    } finally {
      for (const subscriber of active) subscriber.detach();
    }
  }

  return (userId: string, targetType: FavoriteUrlTargetType, targetId: string, signal?: AbortSignal): Promise<FavoriteResult> => {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    // This is a one-tick request queue, not a result cache. Keys include identity;
    // every later navigation reads the database again after confirmed mutations.
    const key = JSON.stringify([userId, targetType]);
    return new Promise((resolve, reject) => {
      const subscriber: Subscriber = { targetId, signal, resolve, reject, detach: () => signal?.removeEventListener("abort", abort) };
      function abort() {
        subscriber.detach();
        reject(new DOMException("Aborted", "AbortError"));
        subscriber.onAbortFlight?.();
      }
      signal?.addEventListener("abort", abort, { once: true });
      const existing = queued.get(key);
      if (existing) { existing.subscribers.push(subscriber); return; }
      const group: Group = { targetType, subscribers: [subscriber] };
      queued.set(key, group);
      setTimeout(() => {
        queued.delete(key);
        const ids = [...new Set(group.subscribers.filter(item => !item.signal?.aborted).map(item => item.targetId))];
        const limit = targetType === "trips" ? 1 : FAVORITE_STATUS_BATCH_LIMIT;
        for (let i = 0; i < ids.length; i += limit) {
          const batch = new Set(ids.slice(i, i + limit));
          void dispatch(group.targetType, group.subscribers.filter(item => batch.has(item.targetId)));
        }
      }, 0);
    });
  };
}

export const loadFavoriteStatus = createFavoriteStatusLoader();
