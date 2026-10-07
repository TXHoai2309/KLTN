import { describe, expect, it, vi } from "vitest";

import type { Database } from "@KLTN/db";

import type { FavoritesDependencies } from "./favorites.service";

const dependenciesRef = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/modules/favorites/favorites-server", () => ({
  get favoritesDependencies() {
    return dependenciesRef.current;
  },
}));

type Role = "TRAVELER" | "ADMIN";
type Visibility = "HIDDEN" | "VISIBLE";
type TargetType = "DESTINATION" | "CULTURE_CONTENT";

type FavoriteRow = {
  id: string;
  userId: string;
  targetType: TargetType;
  destinationId: string | null;
  cultureContentId: string | null;
};

type IdempotencyRow = {
  scope: string;
  key: string;
  requestHash: string;
  responseJson: string;
};

type Fixture = {
  dependencies: FavoritesDependencies;
  favorites: FavoriteRow[];
  idempotency: IdempotencyRow[];
  databaseCalls: {
    userFindUnique: number;
    targetFindFirst: number;
    favoriteCreateMany: number;
    favoriteDeleteMany: number;
    idempotencyFindUnique: number;
    idempotencyCreate: number;
  };
  setSession: (session: { userId: string; role: Role } | null) => void;
  setDestinationVisibility: (id: string, visibility: Visibility) => void;
  failNextFavoriteCreate: () => void;
};

type Where = Record<string, unknown>;

type FakeDatabase = {
  user: {
    findUnique: () => Promise<{ id: string; role: Role } | null>;
  };
  destination: {
    findFirst: (input: { where: { id: string } }) => Promise<{ id: string } | null>;
  };
  cultureContent: {
    findFirst: (input: { where: { id: string } }) => Promise<{ id: string } | null>;
  };
  favorite: {
    createMany: (input: { data: Omit<FavoriteRow, "id">; skipDuplicates?: boolean }) => Promise<{ count: number }>;
    deleteMany: (input: { where: Where }) => Promise<{ count: number }>;
    findFirst: (input: { where: Where }) => Promise<{ id: string } | null>;
  };
  idempotencyRecord: {
    findUnique: (input: { where: { scope_key: { scope: string; key: string } } }) => Promise<IdempotencyRow | null>;
    create: (input: { data: IdempotencyRow }) => Promise<void>;
    update: (input: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => Promise<void>;
  };
  $transaction: <T>(callback: (transaction: FakeDatabase) => Promise<T>) => Promise<T>;
};

function matches(row: FavoriteRow, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => row[key as keyof FavoriteRow] === value);
}

function createFixture(): Fixture {
  let session: { userId: string; role: Role } | null = {
    userId: "traveler-a",
    role: "TRAVELER",
  };
  let favoriteSequence = 0;
  let failCreate = false;
  const favorites: FavoriteRow[] = [];
  const idempotency: IdempotencyRow[] = [];
  const destinationVisibility = new Map<string, Visibility>([
    ["destination-public", "VISIBLE"],
    ["destination-hidden", "HIDDEN"],
  ]);
  const cultureVisibility = new Map<string, Visibility>([["culture-public", "VISIBLE"]]);
  const databaseCalls = {
    userFindUnique: 0,
    targetFindFirst: 0,
    favoriteCreateMany: 0,
    favoriteDeleteMany: 0,
    idempotencyFindUnique: 0,
    idempotencyCreate: 0,
  };

  const database: FakeDatabase = {
    user: {
      findUnique: async () => {
        databaseCalls.userFindUnique += 1;
        return session ? { id: session.userId, role: session.role } : null;
      },
    },
    destination: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        databaseCalls.targetFindFirst += 1;
        return destinationVisibility.get(where.id) === "VISIBLE"
          ? { id: where.id }
          : null;
      },
    },
    cultureContent: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        databaseCalls.targetFindFirst += 1;
        return cultureVisibility.get(where.id) === "VISIBLE" ? { id: where.id } : null;
      },
    },
    favorite: {
      createMany: async ({ data }: { data: Omit<FavoriteRow, "id"> }) => {
        databaseCalls.favoriteCreateMany += 1;
        await Promise.resolve();
        if (failCreate) {
          failCreate = false;
          throw new Error("simulated database outage");
        }

        const duplicate = favorites.some(
          (candidate) =>
            candidate.userId === data.userId &&
            candidate.destinationId === data.destinationId &&
            candidate.cultureContentId === data.cultureContentId,
        );
        if (duplicate) return { count: 0 };

        favorites.push({ ...data, id: `favorite-${++favoriteSequence}` });
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        databaseCalls.favoriteDeleteMany += 1;
        const before = favorites.length;
        for (let index = favorites.length - 1; index >= 0; index -= 1) {
          if (matches(favorites[index]!, where)) favorites.splice(index, 1);
        }
        return { count: before - favorites.length };
      },
      findFirst: async ({ where }: { where: Where }) => {
        const found = favorites.find((candidate) => matches(candidate, where));
        return found ? { id: found.id } : null;
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => {
        databaseCalls.idempotencyFindUnique += 1;
        return (
          idempotency.find(
            (record) =>
              record.scope === where.scope_key.scope && record.key === where.scope_key.key,
          ) ?? null
        );
      },
      create: async ({ data }: { data: IdempotencyRow }) => {
        databaseCalls.idempotencyCreate += 1;
        if (idempotency.some((record) => record.scope === data.scope && record.key === data.key)) {
          throw new Error("unique idempotency key");
        }
        idempotency.push({ ...data });
      },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const record = idempotency.find(
          (candidate) =>
            candidate.scope === where.scope_key.scope && candidate.key === where.scope_key.key,
        );
        if (!record) throw new Error("idempotency record missing");
        record.responseJson = data.responseJson;
      },
    },
    $transaction: async <T>(callback: (transaction: FakeDatabase) => Promise<T>) => {
      const favoriteSnapshot = favorites.map((row) => ({ ...row }));
      const idempotencySnapshot = idempotency.map((record) => ({ ...record }));
      try {
        return await callback(database);
      } catch (error) {
        favorites.splice(0, favorites.length, ...favoriteSnapshot);
        idempotency.splice(0, idempotency.length, ...idempotencySnapshot);
        throw error;
      }
    },
  };

  const dependencies: FavoritesDependencies = {
    database: database as unknown as Database,
    authorization: {
      database: database as unknown as FavoritesDependencies["authorization"]["database"],
      resolveSession: async () =>
        session
          ? { user: { id: session.userId, role: session.role } }
          : null,
    },
  };

  return {
    dependencies,
    favorites,
    idempotency,
    databaseCalls,
    setSession: (nextSession) => {
      session = nextSession;
    },
    setDestinationVisibility: (id, visibility) => {
      destinationVisibility.set(id, visibility);
    },
    failNextFavoriteCreate: () => {
      failCreate = true;
    },
  };
}

function request(path: string, method: "PUT" | "DELETE", key?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: key ? { "Idempotency-Key": key } : undefined,
  });
}

function targetParams(targetType: "destinations" | "culture", targetId: string) {
  return { params: Promise.resolve({ targetType, targetId }) };
}

async function favoriteRoutes() {
  const route = await import("@/app/api/favorites/[targetType]/[targetId]/route");
  const statusRoute = await import("@/app/api/favorites/status/route");
  return { route, statusRoute };
}

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

describe("US15 favorites service and Route Handlers", () => {
  it("rejects Guest/Admin before target, idempotency, or favorite DB work", async () => {
    const fixture = createFixture();
    dependenciesRef.current = fixture.dependencies;
    const { route } = await favoriteRoutes();

    fixture.setSession(null);
    const guest = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "guest-key"),
      targetParams("destinations", "destination-public"),
    );
    expect(guest.status).toBe(401);
    expect((await json(guest)).error.code).toBe("UNAUTHENTICATED");

    fixture.setSession({ userId: "admin-1", role: "ADMIN" });
    const admin = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "admin-key"),
      targetParams("destinations", "destination-public"),
    );
    expect(admin.status).toBe(403);
    expect((await json(admin)).error.code).toBe("FORBIDDEN");
    expect(fixture.favorites).toHaveLength(0);
    expect(fixture.idempotency).toHaveLength(0);
    expect(fixture.databaseCalls.targetFindFirst).toBe(0);
    expect(fixture.databaseCalls.favoriteCreateMany).toBe(0);
    expect(fixture.databaseCalls.idempotencyCreate).toBe(0);
  });

  it("adds only public targets and keeps duplicate additions idempotent", async () => {
    const fixture = createFixture();
    dependenciesRef.current = fixture.dependencies;
    const { route } = await favoriteRoutes();

    const first = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "add-1"),
      targetParams("destinations", "destination-public"),
    );
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      success: true,
      operationStatus: "SUCCESS",
      data: { isFavorite: true, changed: true },
    });

    const duplicate = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "add-2"),
      targetParams("destinations", "destination-public"),
    );
    expect(duplicate.status).toBe(200);
    expect(await json(duplicate)).toMatchObject({
      success: true,
      data: { isFavorite: true, changed: false },
    });
    expect(fixture.favorites).toHaveLength(1);

    for (const targetId of ["destination-hidden", "does-not-exist"]) {
      const unavailable = await route.PUT(
        request(`/api/favorites/destinations/${targetId}`, "PUT", `key-${targetId}`),
        targetParams("destinations", targetId),
      );
      expect(unavailable.status).toBe(404);
      expect((await json(unavailable)).error.code).toBe("FAVORITE_TARGET_UNAVAILABLE");
    }
    expect(fixture.favorites).toHaveLength(1);
  });

  it("replays the same key, rejects key reuse, and requires the header", async () => {
    const fixture = createFixture();
    dependenciesRef.current = fixture.dependencies;
    const { route } = await favoriteRoutes();
    const first = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "same-key"),
      targetParams("destinations", "destination-public"),
    );
    expect(first.status).toBe(200);
    const createCount = fixture.databaseCalls.favoriteCreateMany;

    const replay = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "same-key"),
      targetParams("destinations", "destination-public"),
    );
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(fixture.databaseCalls.favoriteCreateMany).toBe(createCount);

    const reused = await route.PUT(
      request("/api/favorites/culture/culture-public", "PUT", "same-key"),
      targetParams("culture", "culture-public"),
    );
    expect(reused.status).toBe(409);
    expect((await json(reused)).error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const missing = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT"),
      targetParams("destinations", "destination-public"),
    );
    expect(missing.status).toBe(400);
    expect((await json(missing)).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("keeps a remove scoped to the session user and allows remove after hiding", async () => {
    const fixture = createFixture();
    dependenciesRef.current = fixture.dependencies;
    const { route, statusRoute } = await favoriteRoutes();
    const target = targetParams("destinations", "destination-public");

    const addA = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "user-a-add"),
      target,
    );
    expect(addA.status).toBe(200);
    fixture.setSession({ userId: "traveler-b", role: "TRAVELER" });
    const addB = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "user-b-add"),
      target,
    );
    expect(addB.status).toBe(200);
    expect(fixture.favorites).toHaveLength(2);

    fixture.setSession({ userId: "traveler-a", role: "TRAVELER" });
    fixture.setDestinationVisibility("destination-public", "HIDDEN");
    const removeA = await route.DELETE(
      request("/api/favorites/destinations/destination-public", "DELETE", "user-a-remove"),
      target,
    );
    expect(removeA.status).toBe(200);
    expect(await json(removeA)).toMatchObject({ data: { isFavorite: false, changed: true } });
    expect(fixture.favorites).toHaveLength(1);
    expect(fixture.favorites[0]?.userId).toBe("traveler-b");

    const removeAgain = await route.DELETE(
      request("/api/favorites/destinations/destination-public", "DELETE", "user-a-remove-2"),
      target,
    );
    expect(removeAgain.status).toBe(200);
    expect(await json(removeAgain)).toMatchObject({ data: { isFavorite: false, changed: false } });
    expect(fixture.favorites).toHaveLength(1);

    const status = await statusRoute.GET(
      request("/api/favorites/status?targetType=destinations&targetId=destination-public", "DELETE"),
    );
    expect(status.status).toBe(200);
    expect(await json(status)).toMatchObject({ data: { isFavorite: false } });
  });

  it("keeps one row under concurrent adds with different keys", async () => {
    const fixture = createFixture();
    dependenciesRef.current = fixture.dependencies;
    const { route } = await favoriteRoutes();
    const target = targetParams("destinations", "destination-public");
    const responses = await Promise.all([
      route.PUT(
        request("/api/favorites/destinations/destination-public", "PUT", "race-a"),
        target,
      ),
      route.PUT(
        request("/api/favorites/destinations/destination-public", "PUT", "race-b"),
        target,
      ),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(fixture.favorites).toHaveLength(1);
    expect(
      (await Promise.all(responses.map(json))).map((body) => body.data.changed).sort(),
    ).toEqual([false, true]);
  });

  it("returns UNKNOWN without changing UI-side data and succeeds on same-key retry", async () => {
    const fixture = createFixture();
    dependenciesRef.current = fixture.dependencies;
    const { route } = await favoriteRoutes();
    const target = targetParams("destinations", "destination-public");
    fixture.failNextFavoriteCreate();

    const unknown = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "unknown-key"),
      target,
    );
    expect(unknown.status).toBe(503);
    expect(await json(unknown)).toMatchObject({
      success: false,
      operationStatus: "UNKNOWN",
      retryWithSameKey: true,
    });
    expect(fixture.favorites).toHaveLength(0);

    const retry = await route.PUT(
      request("/api/favorites/destinations/destination-public", "PUT", "unknown-key"),
      target,
    );
    expect(retry.status).toBe(200);
    expect(await json(retry)).toMatchObject({ data: { isFavorite: true, changed: true } });
    expect(fixture.favorites).toHaveLength(1);
  });
});
