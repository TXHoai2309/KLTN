import { afterEach, describe, expect, it, vi } from "vitest";
import { createFavoriteStatusLoader } from "./favorite-status-client";

afterEach(() => vi.useRealTimers());

function response(ids: string[], favorite = false) {
  return Response.json({ success: true, data: ids.map(targetId => ({ targetType: "destinations", targetId, isFavorite: favorite, changed: false })) });
}

describe("Favorite status request batching", () => {
  it("loads nine cards and a duplicate target with one HTTP request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => response(Array.from({ length: 9 }, (_, i) => `destination_${i}`)));
    const load = createFavoriteStatusLoader(fetcher);
    const requests = Array.from({ length: 9 }, (_, i) => load("user_a", "destinations", `destination_${i}`));
    requests.push(load("user_a", "destinations", "destination_0"));
    await vi.runAllTimersAsync();
    expect(await Promise.all(requests)).toHaveLength(10);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not reuse results after a completed load or across identities", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => response(["destination_0"]));
    const load = createFavoriteStatusLoader(fetcher);
    const first = load("user_a", "destinations", "destination_0");
    await vi.runAllTimersAsync(); await first;
    const later = [load("user_a", "destinations", "destination_0"), load("user_b", "destinations", "destination_0")];
    await vi.runAllTimersAsync(); await Promise.all(later);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("one unmounted card cannot abort another card's shared request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => response(["destination_0"]));
    const load = createFavoriteStatusLoader(fetcher);
    const controller = new AbortController();
    const cancelled = load("user_a", "destinations", "destination_0", controller.signal).catch(error => error);
    const active = load("user_a", "destinations", "destination_0");
    controller.abort();
    await vi.runAllTimersAsync();
    expect((await cancelled).name).toBe("AbortError");
    expect((await active).isFavorite).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("skips cancelled batches and aborts a flight after all subscribers leave", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const load = createFavoriteStatusLoader(fetcher);
    const before = new AbortController();
    const skipped = load("user_a", "destinations", "destination_0", before.signal).catch(error => error);
    before.abort(); await vi.runAllTimersAsync(); await skipped;
    expect(fetcher).not.toHaveBeenCalled();
    const during = new AbortController();
    const cancelled = load("user_a", "destinations", "destination_0", during.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    during.abort();
    expect((await cancelled).name).toBe("AbortError");
    expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });

  it("rejects missing statuses instead of interpreting them as not favorited", async () => {
    vi.useFakeTimers();
    const load = createFavoriteStatusLoader(async () => response([]));
    const pending = load("user_a", "destinations", "destination_0").catch(error => error);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(Error);
  });

  it("bounds each database/API batch to fifty distinct targets", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (url: string) => response(new URL(url, "http://localhost").searchParams.get("targetIds")!.split(",")));
    const load = createFavoriteStatusLoader(fetcher);
    const pending = Array.from({ length: 51 }, (_, i) => load("user_a", "destinations", `destination_${i}`));
    await vi.runAllTimersAsync(); await Promise.all(pending);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps Trips on the existing single-target ownership boundary", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_url: string) => Response.json({ success: true, data: {
      targetType: "trips", targetId: "owned_trip", isFavorite: true, changed: false,
    } }));
    const pending = createFavoriteStatusLoader(fetcher)("user_a", "trips", "owned_trip");
    await vi.runAllTimersAsync();
    expect((await pending).isFavorite).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/favorites/status?targetType=trips&targetId=owned_trip");
  });

  it.each([401, 403, 500])("leaves failed status reads unknown on HTTP %i", async status => {
    vi.useFakeTimers();
    const load = createFavoriteStatusLoader(async () => Response.json({ success: false }, { status }));
    const pending = load("user_a", "destinations", "destination_0").catch(error => error);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(Error);
  });
});
