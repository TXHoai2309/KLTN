import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { favoriteStatusesResponse } from "./favorites-http";
import type { FavoritesDependencies } from "./favorites.service";

function setup(role = "TRAVELER", status = "ACTIVE", authenticated = true) {
  const findMany = vi.fn(async (_input: unknown): Promise<Array<{ destinationId: string | null; cultureContentId: string | null }>> => [{ destinationId: "destination_a", cultureContentId: null }]);
  const user = { findUnique: vi.fn(async () => ({ id: "user_a", role, status })) };
  const database = { user, favorite: { findMany } } as unknown as Database;
  const dependencies: FavoritesDependencies = { database, authorization: {
    database, resolveSession: vi.fn(async () => authenticated ? { user: { id: "user_a" } } : null),
  } };
  return { findMany, dependencies };
}

const request = (query = "targetType=destinations&targetIds=destination_a,destination_b") => new Request(`http://localhost/api/favorites/status/batch?${query}`);

describe("private batched Favorite status", () => {
  it("authorizes once and selects only the actor's requested targets in one query", async () => {
    const t = setup();
    const result = await favoriteStatusesResponse(request(), t.dependencies);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect((await result.json()).data).toEqual([
      { targetType: "destinations", targetId: "destination_a", isFavorite: true, changed: false },
      { targetType: "destinations", targetId: "destination_b", isFavorite: false, changed: false },
    ]);
    expect(t.dependencies.authorization.resolveSession).toHaveBeenCalledTimes(1);
    expect(t.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "user_a", targetType: "DESTINATION", destinationId: { in: ["destination_a", "destination_b"] } },
      select: { destinationId: true, cultureContentId: true },
    });
  });

  it("also scopes Culture reads and allows Admin's own Traveler capability", async () => {
    const t = setup("ADMIN");
    t.findMany.mockResolvedValue([{ destinationId: null, cultureContentId: "culture_a" }]);
    const result = await favoriteStatusesResponse(request("targetType=culture&targetIds=culture_a"), t.dependencies);
    expect(result.status).toBe(200);
    expect(t.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { userId: "user_a", targetType: "CULTURE_CONTENT", cultureContentId: { in: ["culture_a"] } } });
  });

  it.each([
    "targetType=trips&targetIds=trip_a", "targetType=destinations&targetIds=", "targetType=destinations&targetIds=bad/id",
    "targetType=destinations&targetIds=a&targetIds=b", "targetType=destinations&targetIds=a&userId=user_b",
    `targetType=destinations&targetIds=${Array.from({ length: 51 }, (_, i) => `d${i}`).join(",")}`,
  ])("rejects invalid or unbounded inputs before the status query: %s", async query => {
    const t = setup();
    expect((await favoriteStatusesResponse(request(query), t.dependencies)).status).toBe(400);
    expect(t.findMany).not.toHaveBeenCalled();
  });

  it("checks authentication before parsing and rejects locked accounts", async () => {
    const guest = setup("TRAVELER", "ACTIVE", false);
    expect((await favoriteStatusesResponse(request("bad=input"), guest.dependencies)).status).toBe(401);
    const locked = setup("TRAVELER", "LOCKED");
    expect((await favoriteStatusesResponse(request(), locked.dependencies)).status).toBe(403);
    expect(locked.findMany).not.toHaveBeenCalled();
  });
});
