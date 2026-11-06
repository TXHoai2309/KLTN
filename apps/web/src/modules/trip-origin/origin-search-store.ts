import "server-only";
import type { Database } from "@KLTN/db";

export const SEARCH_IO_BUDGET_MS = 3000;
export const SEARCH_WINDOW_MS = SEARCH_IO_BUDGET_MS + 1000;
export const SEARCH_CACHE_TTL_MS = 86_400_000;
export type SearchClaim = { databaseNow: Date; expiresAt: Date };
export type OriginSearchStore = {
  read: (key: string) => Promise<unknown | null>;
  claim: () => Promise<SearchClaim | null>;
  write: (key: string, payload: unknown) => Promise<void>;
};

/** Atomic committed reservation. No network I/O or provider work in a transaction. */
export function createOriginSearchStore(database: Pick<Database, "$queryRaw" | "$executeRaw">): OriginSearchStore {
  return {
    async read(key) {
      const rows = await database.$queryRaw<{ payload: unknown }[]>`SELECT "payload" FROM "origin_search_cache" WHERE "key" = ${key} AND "expiresAt" > clock_timestamp() LIMIT 1`;
      return rows[0]?.payload ?? null;
    },
    async claim() {
      const rows = await database.$queryRaw<SearchClaim[]>`UPDATE "origin_search_admission"
        SET "nextAllowedAt" = clock_timestamp() + ${SEARCH_WINDOW_MS} * interval '1 millisecond'
        WHERE "id" = 'nominatim' AND "nextAllowedAt" <= clock_timestamp()
        RETURNING clock_timestamp() AS "databaseNow", "nextAllowedAt" - interval '1 second' AS "expiresAt"`;
      return rows[0] ?? null;
    },
    async write(key, payload) {
      const serialized = JSON.stringify(payload);
      await database.$executeRaw`INSERT INTO "origin_search_cache" ("key", "payload", "expiresAt")
        VALUES (${key}, ${serialized}::jsonb, clock_timestamp() + ${SEARCH_CACHE_TTL_MS} * interval '1 millisecond')
        ON CONFLICT ("key") DO UPDATE SET "payload" = EXCLUDED."payload", "expiresAt" = EXCLUDED."expiresAt"`;
      await database.$executeRaw`DELETE FROM "origin_search_cache" WHERE "key" IN
        (SELECT "key" FROM "origin_search_cache" WHERE "expiresAt" <= clock_timestamp() AND "key" <> ${key} LIMIT 100)`;
    },
  };
}
