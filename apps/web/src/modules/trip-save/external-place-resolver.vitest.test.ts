import { describe, expect, it, vi } from "vitest";
import { createGooglePlaceDetailsResolver, MAX_EXTERNAL_PLACES_PER_SAVE } from "./external-place-resolver";

const ok = (id: string, over: Record<string, unknown> = {}) => new Response(JSON.stringify({ id, displayName: { text: "Quán  Thử\n" }, location: { latitude: 22.8, longitude: 104.98 }, ...over }), { status: 200 });

describe("Google Place Details resolver (fake fetch, never the network)", () => {
  it("resolves by place id with the server key in a header, a field mask, no redirect, cleaned name", async () => {
    const fetcher = vi.fn(async (url: unknown) => ok(decodeURIComponent(String(url).split("/places/")[1]!.split("?")[0]!)));
    const result = await createGooglePlaceDetailsResolver({ apiKey: () => "SERVER-KEY", fetcher: fetcher as never })(["ChIJa", "ChIJb"]);
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.places.get("ChIJa")).toEqual({ placeId: "ChIJa", name: "Quán Thử", latitude: 22.8, longitude: 104.98 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("SERVER-KEY");
    expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { "X-Goog-Api-Key": "SERVER-KEY", "X-Goog-FieldMask": "id,displayName,location" } });
  });

  it("is UNAVAILABLE without calling Google for no key, a bad id, too many ids; and for any failed, mismatched or out-of-area answer", async () => {
    const never = vi.fn();
    expect((await createGooglePlaceDetailsResolver({ apiKey: () => undefined, fetcher: never as never })(["ChIJa"])).status).toBe("UNAVAILABLE");
    expect((await createGooglePlaceDetailsResolver({ apiKey: () => "k", fetcher: never as never })(["../x?y=1"])).status).toBe("UNAVAILABLE");
    const many = Array.from({ length: MAX_EXTERNAL_PLACES_PER_SAVE + 1 }, (_, i) => `id${i}`);
    expect((await createGooglePlaceDetailsResolver({ apiKey: () => "k", fetcher: never as never })(many)).status).toBe("UNAVAILABLE");
    expect(never).not.toHaveBeenCalled();
    const run = (response: () => Response | Promise<Response>) => createGooglePlaceDetailsResolver({ apiKey: () => "k", fetcher: (async () => response()) as never })(["ChIJa"]);
    expect((await run(() => new Response("x", { status: 500 }))).status).toBe("UNAVAILABLE");
    expect((await run(() => ok("OTHER"))).status).toBe("UNAVAILABLE");
    expect((await run(() => ok("ChIJa", { location: { latitude: 10, longitude: 10 } }))).status).toBe("UNAVAILABLE");
    expect((await run(() => { throw new Error("network SERVER-KEY"); })).status).toBe("UNAVAILABLE");
  });
});
