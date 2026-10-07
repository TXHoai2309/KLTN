import assert from "node:assert/strict";
import { test } from "node:test";

import type { Database } from "@KLTN/db";

import {
  addFavoriteResponse,
  favoriteStatusResponse,
  removeFavoriteResponse,
} from "./favorites-http";
import type { FavoritesDependencies } from "./favorites.service";

type FavoriteRow = {
  id: string;
  userId: string;
  targetType: "DESTINATION" | "CULTURE_CONTENT";
  destinationId?: string;
  cultureContentId?: string;
};

type Fixture = {
  dependencies: FavoritesDependencies;
  favorites: () => FavoriteRow[];
  idempotencySize: () => number;
  targetReads: () => number;
  setDestinationVisibility: (visibility: "HIDDEN" | "VISIBLE") => void;
};

function fixture(
  role: "TRAVELER" | "ADMIN" = "TRAVELER",
  authenticated = true,
): Fixture {
  let currentRole = role;
  let destinationVisibility: "HIDDEN" | "VISIBLE" = "VISIBLE";
  let targetReadCount = 0;
  let favoriteSequence = 0;
  const favorites: FavoriteRow[] = [];
  const idempotency = new Map<
    string,
    { requestHash: string; responseJson: string }
  >();

  const database = {
    user: {
      findUnique: async () => ({ id: "traveler-1", role: currentRole }),
    },
    destination: {
      findFirst: async ({ where }: { where: { id: string; visibility: string } }) => {
        targetReadCount += 1;
        return where.id === "d-visible" &&
          where.visibility === destinationVisibility
          ? { id: where.id }
          : null;
      },
    },
    cultureContent: {
      findFirst: async ({ where }: { where: { id: string; visibility: string } }) => {
        targetReadCount += 1;
        return where.id === "c-visible" && where.visibility === "VISIBLE"
          ? { id: where.id }
          : null;
      },
    },
    favorite: {
      createMany: async ({ data }: { data: FavoriteRow }) => {
        // Yield so two different keys overlap at the database write point.
        await Promise.resolve();
        const duplicate = favorites.some(
          (row) =>
            row.userId === data.userId &&
            (data.destinationId
              ? row.destinationId === data.destinationId
              : row.cultureContentId === data.cultureContentId),
        );
        if (duplicate) return { count: 0 };
        favorites.push({
          ...data,
          id: `favorite-${++favoriteSequence}`,
        });
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: Partial<FavoriteRow> }) => {
        const before = favorites.length;
        for (let index = favorites.length - 1; index >= 0; index -= 1) {
          const row = favorites[index]!;
          if (
            Object.entries(where).every(
              ([key, value]) => row[key as keyof FavoriteRow] === value,
            )
          ) {
            favorites.splice(index, 1);
          }
        }
        return { count: before - favorites.length };
      },
      findFirst: async ({ where }: { where: Partial<FavoriteRow> }) => {
        const row = favorites.find((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof FavoriteRow] === value,
          ),
        );
        return row ? { id: row.id } : null;
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: object } }) =>
        idempotency.get(JSON.stringify(where.scope_key)) ?? null,
      create: async ({
        data,
      }: {
        data: { scope: string; key: string; requestHash: string; responseJson: string };
      }) => {
        const compoundKey = JSON.stringify({ scope: data.scope, key: data.key });
        if (idempotency.has(compoundKey)) throw new Error("unique");
        idempotency.set(compoundKey, data);
      },
      update: async ({
        where,
        data,
      }: {
        where: { scope_key: object };
        data: { responseJson: string };
      }) => {
        const record = idempotency.get(JSON.stringify(where.scope_key));
        if (!record) throw new Error("missing idempotency record");
        record.responseJson = data.responseJson;
      },
    },
    $transaction: async (execute: (transaction: unknown) => Promise<unknown>) => {
      const favoriteSnapshot = favorites.map((row) => ({ ...row }));
      const idempotencySnapshot = new Map(
        [...idempotency.entries()].map(([key, value]) => [key, { ...value }]),
      );
      try {
        return await execute(database);
      } catch (error) {
        favorites.splice(0, favorites.length, ...favoriteSnapshot);
        idempotency.clear();
        for (const [key, value] of idempotencySnapshot) {
          idempotency.set(key, value);
        }
        throw error;
      }
    },
  };

  const dependencies: FavoritesDependencies = {
    database: database as unknown as Database,
    authorization: {
      database: database as unknown as FavoritesDependencies["authorization"]["database"],
      resolveSession: async () =>
        authenticated
          ? { user: { id: "traveler-1", role: currentRole } }
          : null,
    },
  };

  return {
    dependencies,
    favorites: () => favorites,
    idempotencySize: () => idempotency.size,
    targetReads: () => targetReadCount,
    setDestinationVisibility: (visibility) => {
      destinationVisibility = visibility;
    },
  };
}

function request(path: string, method: string, key?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: key ? { "Idempotency-Key": key } : undefined,
  });
}

async function body(response: Response): Promise<any> {
  return response.json();
}

test("auth is checked before idempotency and target persistence", async () => {
  const guest = fixture("TRAVELER", false);
  const guestResponse = await addFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "PUT"),
    { targetType: "destinations", targetId: "d-visible" },
    guest.dependencies,
  );
  assert.equal(guestResponse.status, 401);
  assert.equal(guest.idempotencySize(), 0);
  assert.equal(guest.targetReads(), 0);

  const admin = fixture("ADMIN");
  const adminResponse = await removeFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "DELETE"),
    { targetType: "destinations", targetId: "d-visible" },
    admin.dependencies,
  );
  assert.equal(adminResponse.status, 403);
  assert.equal(admin.idempotencySize(), 0);
  assert.equal(admin.targetReads(), 0);
});

test("add is SUCCESS-only, public-only, duplicate-safe and replayable", async () => {
  const f = fixture();
  const target = { targetType: "destinations", targetId: "d-visible" } as const;

  const first = await addFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "PUT", "add-1"),
    target,
    f.dependencies,
  );
  assert.equal(first.status, 200);
  assert.deepEqual((await body(first)).data, {
    targetType: "destinations",
    targetId: "d-visible",
    isFavorite: true,
    changed: true,
  });

  const duplicate = await addFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "PUT", "add-2"),
    target,
    f.dependencies,
  );
  assert.equal(duplicate.status, 200);
  assert.equal((await body(duplicate)).data.changed, false);
  assert.equal(f.favorites().length, 1);

  const replay = await addFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "PUT", "add-1"),
    target,
    f.dependencies,
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("Idempotency-Replayed"), "true");

  const conflict = await addFavoriteResponse(
    request("/api/favorites/culture/c-visible", "PUT", "add-1"),
    { targetType: "culture", targetId: "c-visible" },
    f.dependencies,
  );
  assert.equal(conflict.status, 409);
  assert.equal((await body(conflict)).error.code, "IDEMPOTENCY_KEY_REUSED");

  const missingKey = await addFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "PUT"),
    target,
    f.dependencies,
  );
  assert.equal(missingKey.status, 400);
  assert.equal((await body(missingKey)).error.code, "IDEMPOTENCY_KEY_REQUIRED");

  for (const targetId of ["d-hidden", "missing"]) {
    const unavailable = await addFavoriteResponse(
      request(`/api/favorites/destinations/${targetId}`, "PUT", targetId),
      { targetType: "destinations", targetId },
      f.dependencies,
    );
    assert.equal(unavailable.status, 404);
    assert.equal(
      (await body(unavailable)).error.code,
      "FAVORITE_TARGET_UNAVAILABLE",
    );
  }
});

test("remove is target-scoped, idempotent and does not require public target", async () => {
  const f = fixture();
  const target = { targetType: "destinations", targetId: "d-visible" } as const;
  await addFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "PUT", "seed"),
    target,
    f.dependencies,
  );
  f.setDestinationVisibility("HIDDEN");

  const removed = await removeFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "DELETE", "remove-1"),
    target,
    f.dependencies,
  );
  assert.equal(removed.status, 200);
  assert.deepEqual((await body(removed)).data, {
    targetType: "destinations",
    targetId: "d-visible",
    isFavorite: false,
    changed: true,
  });

  const repeated = await removeFavoriteResponse(
    request("/api/favorites/destinations/d-visible", "DELETE", "remove-2"),
    target,
    f.dependencies,
  );
  assert.equal(repeated.status, 200);
  assert.equal((await body(repeated)).data.changed, false);
  assert.equal(f.favorites().length, 0);
});

test("status is private, validates the URL contract and denies Guest/Admin", async () => {
  const f = fixture();
  await addFavoriteResponse(
    request("/api/favorites/culture/c-visible", "PUT", "status-seed"),
    { targetType: "culture", targetId: "c-visible" },
    f.dependencies,
  );

  const status = await favoriteStatusResponse(
    request("/api/favorites/status?targetType=culture&targetId=c-visible", "GET"),
    f.dependencies,
  );
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual((await body(status)).data, {
    targetType: "culture",
    targetId: "c-visible",
    isFavorite: true,
    changed: false,
  });

  const invalid = await favoriteStatusResponse(
    request("/api/favorites/status?targetType=DESTINATION&targetId=d-visible", "GET"),
    f.dependencies,
  );
  assert.equal(invalid.status, 400);

  const guest = fixture("TRAVELER", false);
  assert.equal(
    (
      await favoriteStatusResponse(
        request("/api/favorites/status?targetType=culture&targetId=c-visible", "GET"),
        guest.dependencies,
      )
    ).status,
    401,
  );
  const admin = fixture("ADMIN");
  assert.equal(
    (
      await favoriteStatusResponse(
        request("/api/favorites/status?targetType=culture&targetId=c-visible", "GET"),
        admin.dependencies,
      )
    ).status,
    403,
  );
});

test("concurrent add requests still create one Favorite", async () => {
  const f = fixture();
  const target = { targetType: "destinations", targetId: "d-visible" } as const;
  const responses = await Promise.all([
    addFavoriteResponse(
      request("/api/favorites/destinations/d-visible", "PUT", "race-1"),
      target,
      f.dependencies,
    ),
    addFavoriteResponse(
      request("/api/favorites/destinations/d-visible", "PUT", "race-2"),
      target,
      f.dependencies,
    ),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  );
  assert.equal(f.favorites().length, 1);
  assert.deepEqual(
    (await Promise.all(responses.map(body)))
      .map((value) => value.data.changed)
      .sort(),
    [false, true],
  );
});
